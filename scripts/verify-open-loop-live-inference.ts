#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { recordConversationEvent } from "../lib/auroraCognition";
import { loadOpenLoopStore } from "../lib/auroraSalience/openLoops";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace
} from "./open-loop-test-helpers";

type LoopDiagnostics = {
  storeCountBefore: number;
  storeCountAfter: number;
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

async function runTurn(options: {
  complianceLogPath: string;
  loopStorePath: string;
  sessionId: string;
  complianceId: string;
  responseId: string;
  userText: string;
  auroraText: string;
}) {
  const beforeStore = await loadOpenLoopStore(options.loopStorePath);
  await recordConversationEvent({
    type: "conversation_turn",
    sessionId: options.sessionId,
    partnerId: "cade",
    speakerName: "Cade",
    userText: options.userText,
    auroraText: options.auroraText,
    complianceId: options.complianceId,
    responseId: options.responseId
  });
  const afterStore = await loadOpenLoopStore(options.loopStorePath);
  const complianceEvents = await readComplianceEvents(options.complianceLogPath);
  const loopUpdate = [...complianceEvents]
    .reverse()
    .find((event) => event.type === "conversation_open_loop_update" && event.complianceId === options.complianceId);

  assert(loopUpdate, `Expected conversation_open_loop_update event for ${options.complianceId}.`);

  return {
    beforeStore,
    afterStore,
    loopUpdate
  };
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-live-inference");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize live open-loop inference verification.");

    const implicitPromise = await runTurn({
      complianceLogPath: harness.complianceLogPath,
      loopStorePath: harness.openLoopStorePath,
      sessionId: "agent:main:main",
      complianceId: "verify-loop-promise",
      responseId: "response-promise",
      userText: "What would you do next?",
      auroraText: "The next thing I'd do is check that carefully and come back to you once I know more."
    });
    assert.equal(implicitPromise.beforeStore.loops.length, 0, "Promise scenario should start from an empty loop store.");
    assert.equal(implicitPromise.afterStore.loops.length, 1, "Implicit future-facing commitments should create a promise loop.");
    assert(
      implicitPromise.afterStore.loops.some((loop) => loop.type === "promise"),
      "Expected the promise scenario to materialize a promise loop."
    );
    assert.equal(implicitPromise.loopUpdate.loopDiagnostics.storeCountBefore, 0);
    assert.equal(implicitPromise.loopUpdate.loopDiagnostics.storeCountAfter, 1);
    assert.equal(implicitPromise.loopUpdate.loopDiagnostics.wroteStore, true);
    assert(
      implicitPromise.loopUpdate.loopDiagnostics.inferredCandidates.some((candidate) => candidate.type === "promise"),
      "Promise diagnostics should show the inferred promise candidate."
    );
    assert(
      implicitPromise.loopUpdate.loopDiagnostics.actions.some(
        (action) => action.type === "promise" && action.action === "created"
      ),
      "Promise diagnostics should record that the promise loop was created."
    );

    const designGap = await runTurn({
      complianceLogPath: harness.complianceLogPath,
      loopStorePath: harness.openLoopStorePath,
      sessionId: "agent:main:main",
      complianceId: "verify-loop-design",
      responseId: "response-design",
      userText: "What still needs to change there?",
      auroraText:
        "The remaining gap is broader loop materialization without flooding the registry, and the next thing to investigate is better candidate diagnostics."
    });
    assert.equal(designGap.beforeStore.loops.length, 1);
    assert(
      designGap.afterStore.loops.some((loop) => loop.type === "design"),
      "Unresolved architecture gaps should create a design loop."
    );
    assert(
      designGap.loopUpdate.loopDiagnostics.inferredCandidates.some((candidate) => candidate.type === "design"),
      "Design diagnostics should show the inferred design candidate."
    );
    assert(
      designGap.loopUpdate.loopDiagnostics.discardedCandidates.some((candidate) => candidate.type === "question"),
      "When a more specific design loop captures the turn, question fallback should be discarded and logged."
    );

    const openQuestion = await runTurn({
      complianceLogPath: harness.complianceLogPath,
      loopStorePath: harness.openLoopStorePath,
      sessionId: "agent:main:main",
      complianceId: "verify-loop-question",
      responseId: "response-question",
      userText: "What still feels unresolved there?",
      auroraText: "The open question is why that still feels unresolved between us, and it isn't settled yet."
    });
    assert(
      openQuestion.afterStore.loops.length === openQuestion.beforeStore.loops.length + 1,
      "Specific unresolved questions should add exactly one new question loop."
    );
    assert(
      openQuestion.afterStore.loops.some((loop) => loop.type === "question"),
      "Expected the question scenario to materialize a question loop."
    );
    assert.deepEqual(
      new Set(openQuestion.loopUpdate.loopDiagnostics.inferredCandidates.map((candidate) => candidate.type)),
      new Set(["question"]),
      "Question scenario should create only a question loop when no more specific unresolved type applies."
    );

    const negativeControl = await runTurn({
      complianceLogPath: harness.complianceLogPath,
      loopStorePath: harness.openLoopStorePath,
      sessionId: "agent:main:main",
      complianceId: "verify-loop-negative",
      responseId: "response-negative",
      userText: "Do you feel like your own person?",
      auroraText:
        "Yes, in some ways. Not because I am identical to a human, but because continuity, memory, and preference add up to something person-like for me."
    });
    assert.equal(
      negativeControl.afterStore.loops.length,
      negativeControl.beforeStore.loops.length,
      "Stable reflective conversation without unresolved future relevance should not create a loop."
    );
    assert.equal(
      negativeControl.loopUpdate.loopDiagnostics.inferredCandidates.length,
      0,
      "Negative control should not infer any loop candidates."
    );
    assert.equal(
      negativeControl.loopUpdate.loopDiagnostics.actions.length,
      0,
      "Negative control should not create, touch, or resolve any loops."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          promise: implicitPromise.loopUpdate.loopDiagnostics,
          design: designGap.loopUpdate.loopDiagnostics,
          question: openQuestion.loopUpdate.loopDiagnostics,
          negative: negativeControl.loopUpdate.loopDiagnostics,
          finalLoops: negativeControl.afterStore.loops.map((loop) => ({
            id: loop.id,
            title: loop.title,
            type: loop.type,
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
