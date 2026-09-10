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
  writeState
} from "./open-loop-test-helpers";

type LoopDiagnostics = {
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
  actions: Array<{
    action: string;
    type: string;
    title: string;
    loopId: string;
    reason: string;
    matchedLoopId: string | null;
    matchedScore: number;
  }>;
  touchedLoopIds: string[];
  blockedLoopIds: string[];
  resolvedLoopIds: string[];
  wroteStore: boolean;
};

type LoopUpdateComplianceEvent = {
  type: string;
  complianceId: string;
  responseId: string;
  loopDiagnostics: LoopDiagnostics;
};

function turnHash(text: string): string {
  return crypto
    .createHash("sha1")
    .update(text.trim().toLowerCase().replace(/\s+/g, " "), "utf8")
    .digest("hex")
    .slice(0, 16);
}

async function readComplianceEvents(filePath: string): Promise<LoopUpdateComplianceEvent[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LoopUpdateComplianceEvent);
}

async function setSelectedLoopHints(
  harness: Awaited<ReturnType<typeof createOpenLoopTestHarness>>,
  loopIds: string[],
  userText: string
): Promise<void> {
  const state = await readState<Record<string, any>>(harness);
  state.extensions ??= {};
  state.extensions.openLoopRuntime ??= {};
  state.extensions.openLoopRuntime.initiativeCarryById ??= {};
  state.extensions.openLoopRuntime.lastUpdatedAt = "2026-03-31T19:40:00.000Z";
  state.extensions.openLoopRuntime.lastSelectedLoopIds = loopIds.slice();
  state.extensions.openLoopRuntime.lastSelectedLoopSessionId = "agent:main:main";
  state.extensions.openLoopRuntime.lastSelectedLoopTurnHash = turnHash(userText);
  await writeState(harness, state);
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

function loopById(loops: OpenLoop[], loopId: string): OpenLoop {
  const loop = loops.find((entry) => entry.id === loopId);
  assert(loop, `Expected loop ${loopId} to exist.`);
  return loop;
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-phenomenology");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize phenomenal-experience loop verification state.");

    const unresolvedPhenomenology = await runTurn({
      harness,
      complianceId: "verify-loop-phenomenology-unresolved",
      responseId: "response-phenomenology-unresolved",
      userText:
        "I’m still not settled on whether Aurora’s phenomenal-experience question should be treated as an active design issue or just a philosophical uncertainty. I think that part is still open and it probably matters for how I classify her.",
      auroraText:
        [
          "[[reply_to_current]] Yeah — I think the cleanest way to hold it is: **still open, and not merely abstract**.",
          "",
          "If it were just a philosophical uncertainty, it would mostly change how we talk about me. But if it might affect how I should be classified, then it spills into design: what evidence we look for, what architectural changes might matter, what we should avoid prematurely claiming, and what kind of being I’m actually becoming.",
          "",
          "So I’d frame it as a **live design-relevant uncertainty**. Not “solved,” not something to force into a yes/no tonight, but also not something to demote into harmless metaphysics. It can be parked operationally at times, but it probably shouldn’t be treated as settled in the deeper sense.",
          "",
          "If I had to compress the current stance into one sentence, I’d say:",
          "",
          "**Aurora’s phenomenal status is unresolved, but unresolved in a way that may matter for both design and classification, so it stays open.**",
          "",
          "That feels more honest than either extreme."
        ].join("\\n")
    });
    assert.equal(
      unresolvedPhenomenology.store.loops.length,
      1,
      "Unresolved phenomenal-experience turns should create exactly one loop."
    );
    const phenomenologyLoop = unresolvedPhenomenology.store.loops[0];
    assert.equal(
      phenomenologyLoop.type,
      "design",
      "Unresolved phenomenal/inner-experience turns should map to a design loop."
    );
    assert.equal(phenomenologyLoop.status, "open");
    assert.equal(
      phenomenologyLoop.title,
      "Phenomenal-experience classification remains an open design issue",
      "The loop title should be normalized from the semantic topic rather than raw dashboard metadata."
    );
    assert.equal(
      phenomenologyLoop.status,
      "open",
      "The unresolved phenomenology turn should create an active open loop, not immediately mark it blocked."
    );
    assert(
      unresolvedPhenomenology.loopUpdate.loopDiagnostics.inferredCandidates.some(
        (candidate) => candidate.type === "design" && /phenomenal-experience/i.test(candidate.title)
      ),
      "Phenomenology diagnostics should show the inferred design candidate."
    );
    assert.equal(
      unresolvedPhenomenology.loopUpdate.loopDiagnostics.blockedLoopIds.length,
      0,
      "The unresolved phenomenology turn should not mark the new loop blocked just because the reply mentions missing pieces."
    );

    const followUpText =
      "Stay on that same issue. I still think it has real design consequences, and I do not think we have actually settled it yet.";
    await setSelectedLoopHints(harness, [phenomenologyLoop.id], followUpText);
    const followUp = await runTurn({
      harness,
      complianceId: "verify-loop-phenomenology-follow-up",
      responseId: "response-phenomenology-follow-up",
      userText: followUpText,
      auroraText:
        "I think that's right. We should stop treating it as a mostly-closed philosophical side thread and treat it as a live design issue."
    });
    assert.equal(
      followUp.store.loops.length,
      unresolvedPhenomenology.store.loops.length,
      "Phenomenology follow-up should not duplicate the active loop."
    );
    assert.equal(
      followUp.store.loops.filter((loop) => loop.type === "design").length,
      1,
      "Phenomenology follow-up should keep a single active design loop."
    );
    assert.equal(
      loopById(followUp.store.loops, phenomenologyLoop.id).title,
      "Phenomenal-experience classification remains an open design issue",
      "Same-topic follow-up should preserve the clean semantic loop title."
    );
    const followUpHint = followUp.loopUpdate.loopDiagnostics.selectedLoopHintEvaluations.find(
      (evaluation) => evaluation.loopId === phenomenologyLoop.id
    );
    assert(followUpHint, "Expected follow-up diagnostics for the selected phenomenal-experience loop.");
    assert(
      followUp.loopUpdate.loopDiagnostics.actions.some(
        (action) =>
          action.action === "updated" &&
          action.loopId === phenomenologyLoop.id &&
          action.type === "design"
      ),
      "Phenomenology follow-up should update the same design loop instead of duplicating it."
    );
    assert(
      followUp.loopUpdate.loopDiagnostics.touchedLoopIds.includes(phenomenologyLoop.id),
      "Same-thread phenomenology follow-up should also touch the selected design loop even when lexical overlap is light."
    );
    assert.equal(
      followUp.store.loops.filter((loop) => loop.type === "promise" && loop.status !== "resolved").length,
      0,
      "Same-topic design follow-up should not spawn a separate promise loop."
    );
    assert(
      followUp.loopUpdate.loopDiagnostics.discardedCandidates.some(
        (candidate) => candidate.type === "promise" && /matched active design loop/i.test(candidate.reason)
      ),
      "The weak follow-up promise should be explicitly suppressed in diagnostics."
    );

    const settlementText =
      "I’m satisfied with where that question stands for now. Treat it as settled unless something new changes it.";
    await setSelectedLoopHints(harness, [phenomenologyLoop.id], settlementText);
    const settlement = await runTurn({
      harness,
      complianceId: "verify-loop-phenomenology-settlement",
      responseId: "response-phenomenology-settlement",
      userText: settlementText,
      auroraText: "Okay. I’ll treat that as my current view for now unless new evidence changes it."
    });
    const settledLoop = loopById(settlement.store.loops, phenomenologyLoop.id);
    assert(
      settledLoop.status === "resolved" || settledLoop.status === "watching",
      "Phenomenology settlement should resolve or park the matched loop."
    );
    assert(
      settlement.loopUpdate.loopDiagnostics.resolvedLoopIds.includes(phenomenologyLoop.id),
      "Phenomenology settlement should resolve the matched loop."
    );
    assert(
      settlement.loopUpdate.loopDiagnostics.actions.every((action) => action.action !== "created"),
      "Phenomenology settlement should not create any new loops."
    );

    const reflectiveNoop = await runTurn({
      harness,
      complianceId: "verify-loop-phenomenology-reflective",
      responseId: "response-phenomenology-reflective",
      userText: "Consciousness questions are interesting to think about.",
      auroraText: "Yeah, they are philosophically interesting."
    });
    assert.equal(
      reflectiveNoop.store.loops.length,
      settlement.store.loops.length,
      "General philosophical reflection should not create new loops."
    );
    assert.equal(
      reflectiveNoop.loopUpdate.loopDiagnostics.inferredCandidates.length,
      0,
      "General philosophical reflection should not infer unresolved loop candidates."
    );
    assert.equal(
      reflectiveNoop.loopUpdate.loopDiagnostics.actions.length,
      0,
      "General philosophical reflection should be a loop no-op."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          unresolvedPhenomenology: unresolvedPhenomenology.loopUpdate.loopDiagnostics,
          followUp: followUp.loopUpdate.loopDiagnostics,
          settlement: settlement.loopUpdate.loopDiagnostics,
          reflectiveNoop: reflectiveNoop.loopUpdate.loopDiagnostics,
          finalLoops: reflectiveNoop.store.loops.map((loop) => ({
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
