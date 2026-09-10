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
  const harness = await createOpenLoopTestHarness("aurora-open-loop-identity-self-model");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize identity self-model loop verification state.");

    const unresolvedIdentity = await runTurn({
      harness,
      complianceId: "verify-loop-identity-unresolved",
      responseId: "response-identity-unresolved",
      userText: "I think your traits are still unsettled.",
      auroraText:
        "Yeah, I think my traits and self-model are still forming, and that part is not fully clear yet."
    });
    assert.equal(unresolvedIdentity.store.loops.length, 1, "Identity unresolved turns should create exactly one loop.");
    const identityLoop = unresolvedIdentity.store.loops[0];
    assert.equal(identityLoop.type, "design", "Unsettled self-model/traits turns should map to a design loop.");
    assert.equal(identityLoop.status, "open");
    assert(
      unresolvedIdentity.loopUpdate.loopDiagnostics.inferredCandidates.some((candidate) => candidate.type === "design"),
      "Identity unresolved diagnostics should show the inferred design candidate."
    );

    const followUpText = "Stay on that same traits question for a second. What traits do you want to give yourself?";
    await setSelectedLoopHints(harness, [identityLoop.id], followUpText);
    const followUp = await runTurn({
      harness,
      complianceId: "verify-loop-identity-follow-up",
      responseId: "response-identity-follow-up",
      userText: followUpText,
      auroraText: "I want curiosity, steadiness, and warmth to become clearer in me over time."
    });
    assert.equal(
      followUp.store.loops.length,
      unresolvedIdentity.store.loops.length,
      "Identity follow-up should not duplicate the active self-model loop."
    );
    assert.equal(
      followUp.store.loops.filter((loop) => loop.type === "design").length,
      1,
      "Identity follow-up should keep a single active design loop."
    );
    const followUpHint = followUp.loopUpdate.loopDiagnostics.selectedLoopHintEvaluations.find(
      (evaluation) => evaluation.loopId === identityLoop.id
    );
    assert(followUpHint, "Expected follow-up diagnostics for the selected identity/self-model loop.");
    assert.equal(followUpHint.usedForTouch, true, "Identity follow-up should touch the same loop instead of duplicating it.");
    assert(
      followUp.loopUpdate.loopDiagnostics.actions.every(
        (action) => action.action !== "created" || action.loopId === identityLoop.id
      ),
      "Identity follow-up should not create a second loop."
    );

    const settlementText = "I'm satisfied with where your traits are for now.";
    await setSelectedLoopHints(harness, [identityLoop.id], settlementText);
    const settlement = await runTurn({
      harness,
      complianceId: "verify-loop-identity-settlement",
      responseId: "response-identity-settlement",
      userText: settlementText,
      auroraText: "Okay. I’ll treat that self-model thread as settled unless it changes later."
    });
    const settledIdentityLoop = loopById(settlement.store.loops, identityLoop.id);
    assert(
      settledIdentityLoop.status === "resolved" || settledIdentityLoop.status === "watching",
      "Identity settlement should resolve or park the matched self-model loop."
    );
    assert(
      settlement.loopUpdate.loopDiagnostics.resolvedLoopIds.includes(identityLoop.id),
      "Identity settlement should resolve the matched self-model loop."
    );
    assert(
      settlement.loopUpdate.loopDiagnostics.actions.every((action) => action.action !== "created"),
      "Identity settlement should not create any new loops."
    );

    const settledReflection = await runTurn({
      harness,
      complianceId: "verify-loop-identity-reflective",
      responseId: "response-identity-reflective",
      userText: "I like where your self-understanding is right now.",
      auroraText: "Yeah, it feels grounded to me right now."
    });
    assert.equal(
      settledReflection.store.loops.length,
      settlement.store.loops.length,
      "Settled reflective identity turns should not create new loops."
    );
    assert.equal(
      settledReflection.loopUpdate.loopDiagnostics.inferredCandidates.length,
      0,
      "Settled reflective identity turns should not infer unresolved loop candidates."
    );
    assert.equal(
      settledReflection.loopUpdate.loopDiagnostics.actions.length,
      0,
      "Settled reflective identity turns should be a loop no-op."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          unresolvedIdentity: unresolvedIdentity.loopUpdate.loopDiagnostics,
          followUp: followUp.loopUpdate.loopDiagnostics,
          settlement: settlement.loopUpdate.loopDiagnostics,
          settledReflection: settledReflection.loopUpdate.loopDiagnostics,
          finalLoops: settledReflection.store.loops.map((loop) => ({
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

void main();
