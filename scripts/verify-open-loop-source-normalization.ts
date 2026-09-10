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
  rawEventSource: string | null;
  eventSource: string;
  eventTrigger: string | null;
  sourceNormalizationAnomaly: string | null;
  loopCreationSuppressedReason: string | null;
  inferredCandidates: Array<{
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

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-source-normalization");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize source normalization verification state.");

    await recordConversationEvent({
      type: "conversation_turn",
      source: "heartbeat",
      rawSource: "heartbeat",
      trigger: "user",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      userText:
        "I think the remaining gap is how design context should persist without collapsing into generic continuity.",
      auroraText:
        "Yeah — that still feels like an unresolved design thread to me, and I think we should stay with it.",
      complianceId: "verify-open-loop-source-normalization",
      responseId: "response-open-loop-source-normalization"
    });

    const complianceEvents = await readComplianceEvents(harness.complianceLogPath);
    const loopUpdate = [...complianceEvents]
      .reverse()
      .find(
        (event) =>
          event.type === "conversation_open_loop_update" &&
          event.complianceId === "verify-open-loop-source-normalization"
      );
    assert(loopUpdate, "Expected a loop update compliance event for the source normalization scenario.");
    assert.equal(loopUpdate.loopDiagnostics.rawEventSource, "heartbeat");
    assert.equal(loopUpdate.loopDiagnostics.eventSource, "conversation");
    assert.equal(loopUpdate.loopDiagnostics.eventTrigger, "user");
    assert.equal(
      loopUpdate.loopDiagnostics.sourceNormalizationAnomaly,
      "trigger_user_overrode_raw_heartbeat"
    );
    assert.equal(loopUpdate.loopDiagnostics.loopCreationSuppressedReason, null);
    assert(
      loopUpdate.loopDiagnostics.inferredCandidates.some((candidate) => candidate.type === "design"),
      "The unresolved design turn should still infer a design loop."
    );
    assert(
      loopUpdate.loopDiagnostics.actions.some((action) => action.action === "created" && action.type === "design"),
      "The normalized conversation turn should be allowed to create a design loop."
    );

    const store = await loadOpenLoopStore(harness.openLoopStorePath);
    const activeDesignLoops = store.loops.filter((loop) => loop.type === "design" && loop.status === "open");
    assert.equal(activeDesignLoops.length, 1, "Expected exactly one active design loop after the normalized turn.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          loopDiagnostics: loopUpdate.loopDiagnostics,
          activeLoops: activeDesignLoops
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
