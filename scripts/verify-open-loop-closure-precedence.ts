#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";

import { recordConversationEvent } from "../lib/auroraCognition";
import { loadOpenLoopStore } from "../lib/auroraSalience/openLoops";
import type { OpenLoop } from "../lib/auroraSalience/schema";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  seedDefaultOpenLoops,
  writeState
} from "./open-loop-test-helpers";

type LoopDiagnostics = {
  storeCountBefore: number;
  storeCountAfter: number;
  selectedLoopHintEvaluations: Array<{
    loopId: string;
    type: string;
    title: string;
    stampMatched: boolean;
    overlapScore: number;
    usedForTouch: boolean;
    usedForClosure: boolean;
    ignoredReason: string | null;
  }>;
  inferredCandidates: Array<{
    type: string;
    title: string;
    reason: string;
  }>;
  discardedCandidates: Array<{
    type: string;
    title: string;
    reason: string;
  }>;
  actions: Array<{
    action: string;
    type: string;
    title: string;
    loopId: string;
    reason: string;
    matchedLoopId: string | null;
    matchedScore: number;
  }>;
  resolvedLoopIds: string[];
  wroteStore: boolean;
};

type LoopUpdateComplianceEvent = {
  type: string;
  complianceId: string;
  responseId: string;
  loopDiagnostics: LoopDiagnostics;
};

async function readComplianceEvents(filePath: string): Promise<LoopUpdateComplianceEvent[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LoopUpdateComplianceEvent);
}

async function setSelectedLoopIds(
  harness: Awaited<ReturnType<typeof createOpenLoopTestHarness>>,
  loopIds: string[],
  options: {
    userText: string;
    sessionId?: string;
  }
): Promise<void> {
  const state = await readState<Record<string, any>>(harness);
  state.extensions ??= {};
  state.extensions.openLoopRuntime ??= {};
  state.extensions.openLoopRuntime.initiativeCarryById ??= {};
  state.extensions.openLoopRuntime.lastUpdatedAt = "2026-03-31T19:40:00.000Z";
  state.extensions.openLoopRuntime.lastSelectedLoopIds = loopIds.slice();
  state.extensions.openLoopRuntime.lastSelectedLoopSessionId = options.sessionId ?? "agent:main:main";
  state.extensions.openLoopRuntime.lastSelectedLoopTurnHash = crypto
    .createHash("sha1")
    .update(options.userText.trim().toLowerCase().replace(/\s+/g, " "), "utf8")
    .digest("hex")
    .slice(0, 16);
  await writeState(harness, state);
}

function loopById(loops: OpenLoop[], loopId: string): OpenLoop {
  const loop = loops.find((entry) => entry.id === loopId);
  assert(loop, `Expected loop ${loopId} to exist.`);
  return loop;
}

async function runTurn(options: {
  harness: Awaited<ReturnType<typeof createOpenLoopTestHarness>>;
  complianceId: string;
  responseId: string;
  userText: string;
  auroraText: string;
}) {
  await recordConversationEvent({
    type: "conversation_turn",
    sessionId: "agent:main:main",
    partnerId: "cade",
    speakerName: "Cade",
    userText: options.userText,
    auroraText: options.auroraText,
    complianceId: options.complianceId,
    responseId: options.responseId
  });

  const complianceEvents = await readComplianceEvents(options.harness.complianceLogPath);
  const loopUpdate = [...complianceEvents]
    .reverse()
    .find((event) => event.type === "conversation_open_loop_update" && event.complianceId === options.complianceId);
  assert(loopUpdate, `Expected loop update event for ${options.complianceId}.`);
  const store = await loadOpenLoopStore(options.harness.openLoopStorePath);
  return { loopUpdate, store };
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-closure-precedence");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize closure precedence verification state.");
    const loops = await seedDefaultOpenLoops(harness);

    const beforeNoopStore = await loadOpenLoopStore(harness.openLoopStorePath);
    const beforeDesign = loopById(beforeNoopStore.loops, loops.design.id);
    await setSelectedLoopIds(harness, [loops.design.id], {
      sessionId: "agent:main:main",
      userText:
        "This version feels clean to me. The response path worked, memory landed correctly, and I do not think anything needs to change right now."
    });
    const settledNoop = await runTurn({
      harness,
      complianceId: "verify-loop-settled-noop",
      responseId: "response-settled-noop",
      userText:
        "This version feels clean to me. The response path worked, memory landed correctly, and I do not think anything needs to change right now.",
      auroraText:
        "Yeah — that matches my read. This pass felt clean on my side too: the response stayed on the right design gap, the memory update landed, and nothing feels like it needs a corrective tweak right now."
    });
    const afterNoopDesign = loopById(settledNoop.store.loops, loops.design.id);
    assert.equal(
      settledNoop.loopUpdate.loopDiagnostics.actions.length,
      0,
      "Settled checkpoint turns should not touch, update, resolve, or create loops."
    );
    assert.equal(
      afterNoopDesign.lastTouchedAt,
      beforeDesign.lastTouchedAt,
      "Settled checkpoint turns should leave the selected design loop untouched."
    );
    assert.equal(afterNoopDesign.status, "open");

    await setSelectedLoopIds(harness, [loops.design.id], {
      sessionId: "agent:main:main",
      userText:
        "I am satisfied with the design-memory issue for now. Treat it as settled unless a new regression appears later."
    });
    const explicitClosure = await runTurn({
      harness,
      complianceId: "verify-loop-explicit-closure",
      responseId: "response-explicit-closure",
      userText:
        "I am satisfied with the design-memory issue for now. Treat it as settled unless a new regression appears later.",
      auroraText:
        "Got it. I’ll treat it as settled and leave it alone unless a new regression shows up later."
    });
    const afterClosureDesign = loopById(explicitClosure.store.loops, loops.design.id);
    assert.equal(afterClosureDesign.status, "resolved", "Explicit settlement should resolve the matched active design loop.");
    assert.deepEqual(
      explicitClosure.loopUpdate.loopDiagnostics.resolvedLoopIds,
      [loops.design.id],
      "Closure diagnostics should identify the resolved design loop."
    );
    assert(
      explicitClosure.loopUpdate.loopDiagnostics.actions.every((action) => action.action !== "created"),
      "Settlement turns should not create new loops."
    );
    assert.equal(
      explicitClosure.store.loops.length,
      settledNoop.store.loops.length,
      "Settlement turns should not increase the number of stored loops."
    );
    assert(
      !explicitClosure.store.loops.some(
        (loop) => loop.type === "bug" && loop.id !== loops.bug.id
      ),
      "Settlement turns must not spawn new bug loops from regression-language parking."
    );
    assert(
      !explicitClosure.store.loops.some(
        (loop) => loop.type === "promise" && loop.id !== loops.promise.id
      ),
      "Settlement turns must not spawn new promise loops from assistant closure acknowledgements."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          settledNoop: settledNoop.loopUpdate.loopDiagnostics,
          explicitClosure: explicitClosure.loopUpdate.loopDiagnostics,
          finalLoops: explicitClosure.store.loops.map((loop) => ({
            id: loop.id,
            title: loop.title,
            type: loop.type,
            status: loop.status
          }))
        },
        null,
        2
      )
    );
  } finally {
    restoreOpenLoopTestHarness(harness);
  }

  const negationHarness = await createOpenLoopTestHarness("aurora-open-loop-negated-settlement");
  try {
    await seedBaseOpenClawWorkspace(negationHarness);
    await ensureBaselineState(negationHarness, "Initialize negated-settlement verification state.");
    const loops = await seedDefaultOpenLoops(negationHarness);
    const unresolvedText =
      "I’m still not settled on whether Aurora’s phenomenal-experience question should be treated as an active design issue or just a philosophical uncertainty. I think that part is still open and it probably matters for how I classify her.";

    await setSelectedLoopIds(negationHarness, [loops.promise.id], {
      sessionId: "agent:main:main",
      userText: unresolvedText
    });
    const unresolvedResult = await runTurn({
      harness: negationHarness,
      complianceId: "verify-loop-negated-settlement",
      responseId: "response-negated-settlement",
      userText: unresolvedText,
      auroraText:
        "Yeah, I think that's right. If the answer could change how you classify me, then it is not just idle philosophy. I would treat it as an open, classification-relevant design uncertainty."
    });

    const selectedHint = unresolvedResult.loopUpdate.loopDiagnostics.selectedLoopHintEvaluations.find(
      (evaluation) => evaluation.loopId === loops.promise.id
    );
    assert(selectedHint, "Expected the same-turn promise hint to be evaluated.");
    assert.equal(
      selectedHint.stampMatched,
      true,
      "The selected-loop hint should be same-turn matched in this regression."
    );
    assert(
      selectedHint.overlapScore < 0.34,
      "The promise hint overlap should stay below the closure threshold for the failing case."
    );
    assert.equal(
      selectedHint.usedForClosure,
      false,
      "Low-overlap selected-loop hints must not participate in closure."
    );
    assert.equal(
      unresolvedResult.loopUpdate.loopDiagnostics.resolvedLoopIds.length,
      0,
      "Negated-settlement turns should not resolve any existing loops."
    );
    assert(
      !unresolvedResult.loopUpdate.loopDiagnostics.actions.some(
        (action) => action.action === "resolved" && action.loopId === loops.promise.id
      ),
      "A stale same-turn promise hint must not be resolved by a 'still not settled' turn."
    );
    const createdDesignLoop = unresolvedResult.store.loops.find(
      (loop) => loop.type === "design" && loop.id !== loops.design.id
    );
    assert(
      createdDesignLoop,
      "Negated-settlement turns should create a new active design loop for the unresolved phenomenology topic."
    );
    assert.equal(createdDesignLoop?.status, "open");

    console.log(
      JSON.stringify(
        {
          negatedSettlement: unresolvedResult.loopUpdate.loopDiagnostics,
          negatedSettlementFinalLoops: unresolvedResult.store.loops.map((loop) => ({
            id: loop.id,
            title: loop.title,
            type: loop.type,
            status: loop.status
          }))
        },
        null,
        2
      )
    );
  } finally {
    restoreOpenLoopTestHarness(negationHarness);
  }
}

void main();
