#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { ingestHeartbeat, prepareSendContext, recordConversationEvent } from "../lib/auroraCognition";
import {
  loadOpenLoopStore,
  runHeartbeatLoopMaintenance,
  saveOpenLoopStore,
  touchLoopById,
  upsertLoop
} from "../lib/auroraSalience/openLoops";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  seedDefaultOpenLoops,
  writeState
} from "./open-loop-test-helpers";

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-lifecycle");
  try {
    await seedBaseOpenClawWorkspace(harness);
    const defaultLoops = await seedDefaultOpenLoops(harness);
    await ensureBaselineState(harness);

    let store = await loadOpenLoopStore(harness.openLoopStorePath);
    const duplicateStartCount = store.loops.length;
    const duplicateResult = upsertLoop(store, {
      title: "Fix compaction bug causing runaway token usage",
      type: "bug",
      priority: 0.9,
      linkedEntities: ["cade", "aurora", "compaction", "openclaw"],
      closureCondition: "failure fixed and verified"
    });
    store = duplicateResult.store;
    assert.equal(duplicateResult.created, false, "Duplicate creation should upsert instead of creating a second bug loop.");
    assert.equal(store.loops.length, duplicateStartCount, "Duplicate bug creation should not increase loop count.");
    await saveOpenLoopStore(harness.openLoopStorePath, store);

    const baselineState = await readState<any>(harness);
    baselineState.extensions.openLoopRuntime.initiativeCarryById = {};
    await writeState(harness, baselineState);

    const designPrompt = "We still need to decide how salience should change reply priorities.";
    await prepareSendContext({
      userText: designPrompt,
      sessionId: "",
      lightweight: false
    });
    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "",
      partnerId: "cade",
      speakerName: "Cade",
      userText: designPrompt,
      auroraText: "That design thread is still active, and I want to keep it alive until we close it cleanly."
    });

    let state = await readState<any>(harness);
    const carryAfterTouch = Number(state.extensions?.openLoopRuntime?.initiativeCarryById?.[defaultLoops.design.id] ?? 0);
    assert(carryAfterTouch > 0.07, `Expected resurfacing to increase carry, got ${carryAfterTouch}.`);

    await ingestHeartbeat(
      {
        timestamp: "2026-03-30T19:00:00.000Z",
        whatIDid: "Quiet maintenance pass.",
        whatILearned: "",
        whatImCuriousAbout: "",
        livedThread: "",
        stateShift: "",
        openLoop: "",
        memoryUpdates: []
      },
      {
        source: "verify-open-loop-lifecycle",
        sessionId: "agent:main:cron:verify-open-loop-lifecycle"
      }
    );

    state = await readState<any>(harness);
    const carryAfterHeartbeat = Number(state.extensions?.openLoopRuntime?.initiativeCarryById?.[defaultLoops.design.id] ?? 0);
    assert(
      carryAfterHeartbeat < carryAfterTouch,
      `Expected untouched carry to decay on heartbeat. Before=${carryAfterTouch} After=${carryAfterHeartbeat}`
    );

    store = await loadOpenLoopStore(harness.openLoopStorePath);
    store = upsertLoop(store, {
      title: "Keep an eye on low-priority mirror drift",
      type: "design",
      priority: 0.2,
      linkedEntities: ["aurora", "mind.md"],
      closureCondition: "no active drift remains"
    }).store;
    const staleLoop = store.loops.find((loop) => loop.title === "Keep an eye on low-priority mirror drift");
    assert(staleLoop, "Expected stale low-priority loop to exist.");
    store = {
      ...store,
      loops: store.loops.map((loop) =>
        loop.id === staleLoop!.id
          ? {
              ...loop,
              status: "open",
              lastTouchedAt: "2026-03-24T00:00:00.000Z"
            }
          : loop
      )
    };
    store = runHeartbeatLoopMaintenance(store, new Date("2026-03-30T12:00:00.000Z"));
    const demotedLoop = store.loops.find((loop) => loop.id === staleLoop!.id);
    assert.equal(demotedLoop?.status, "watching", "Stale low-priority open loops should drift toward watching.");

    store = touchLoopById(store, defaultLoops.bug.id, new Date("2026-03-30T12:05:00.000Z"));
    await saveOpenLoopStore(harness.openLoopStorePath, store);
    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "The compaction bug is fixed and verified now.",
      auroraText: "Good. That bug can close."
    });

    store = await loadOpenLoopStore(harness.openLoopStorePath);
    const resolvedBugLoop = store.loops.find((loop) => loop.id === defaultLoops.bug.id);
    assert.equal(resolvedBugLoop?.status, "resolved", "Clearly completed loops should move to resolved.");

    store = {
      ...store,
      loops: store.loops.map((loop) =>
        loop.id === defaultLoops.bug.id
          ? {
              ...loop,
              status: "resolved",
              lastTouchedAt: "2026-03-20T00:00:00.000Z"
            }
          : loop
      )
    };
    store = runHeartbeatLoopMaintenance(store, new Date("2026-03-30T12:00:00.000Z"));
    assert(
      !store.loops.some((loop) => loop.id === defaultLoops.bug.id),
      "Resolved loops older than the prune threshold should age out."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          carryAfterTouch,
          carryAfterHeartbeat,
          remainingLoops: store.loops.map((loop) => ({
            id: loop.id,
            title: loop.title,
            status: loop.status,
            priority: loop.priority
          }))
        },
        null,
        2
      )
    );
  } finally {
    restoreOpenLoopTestHarness(harness);
  }
}

void main();
