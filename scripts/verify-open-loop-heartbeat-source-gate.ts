#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { recordConversationEvent } from "../lib/auroraCognition";
import { loadOpenLoopStore, saveOpenLoopStore } from "../lib/auroraSalience/openLoops";
import type { OpenLoopStore } from "../lib/auroraSalience/schema";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace
} from "./open-loop-test-helpers";

type LoopDiagnostics = {
  eventSource: string;
  eventTrigger: string | null;
  loopCreationSuppressedReason: string | null;
  storeCountBefore: number;
  storeCountAfter: number;
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

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-heartbeat-source-gate");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize heartbeat source gate verification state.");

    await recordConversationEvent({
      type: "conversation_turn",
      source: "heartbeat",
      trigger: "heartbeat",
      sessionId: "agent:main:main",
      userText: "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. If nothing needs attention, reply HEARTBEAT_OK.",
      auroraText: "HEARTBEAT_OK",
      complianceId: "verify-heartbeat-source-gate",
      responseId: "response-heartbeat-source-gate"
    });

    const complianceEvents = await readComplianceEvents(harness.complianceLogPath);
    const loopUpdate = [...complianceEvents]
      .reverse()
      .find(
        (event) =>
          event.type === "conversation_open_loop_update" && event.complianceId === "verify-heartbeat-source-gate"
      );
    assert(loopUpdate, "Expected a loop update compliance event for the heartbeat source gate scenario.");

    const afterHeartbeatRecord = await loadOpenLoopStore(harness.openLoopStorePath);
    assert.equal(afterHeartbeatRecord.loops.length, 0, "Heartbeat/status turns should not create any loops.");
    assert.equal(loopUpdate.loopDiagnostics.eventSource, "heartbeat");
    assert.equal(loopUpdate.loopDiagnostics.eventTrigger, "heartbeat");
    assert.equal(loopUpdate.loopDiagnostics.loopCreationSuppressedReason, "heartbeat_source");
    assert.equal(loopUpdate.loopDiagnostics.inferredCandidates.length, 0);
    assert.equal(loopUpdate.loopDiagnostics.actions.length, 0);
    assert.equal(loopUpdate.loopDiagnostics.wroteStore, false);

    const contaminatedStore: OpenLoopStore = {
      version: 1,
      loops: [
        {
          id: "heartbeat-ok-loop",
          title: "Resolve design thread: HEARTBEAT_OK",
          type: "design",
          status: "open",
          priority: 0.86,
          linkedEntities: ["aurora"],
          lastTouchedAt: "2026-03-31T22:31:20.374Z",
          closureCondition: "decision recorded and no active disagreement remains",
          whyItMatters: "it should never exist because heartbeat status is not a real design thread",
          nextStep: "scrub the contaminated heartbeat loop from the registry",
          ownership: "shared",
          aliveness: 0.22,
          intentStrength: 0.18,
          lastAdvancedAt: null
        }
      ]
    };
    await saveOpenLoopStore(harness.openLoopStorePath, contaminatedStore);

    await recordConversationEvent({
      type: "conversation_turn",
      source: "heartbeat",
      trigger: "heartbeat",
      sessionId: "agent:main:main",
      userText: "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. If nothing needs attention, reply HEARTBEAT_OK.",
      auroraText: "HEARTBEAT_OK",
      complianceId: "verify-heartbeat-source-cleanup",
      responseId: "response-heartbeat-source-cleanup"
    });

    const afterHeartbeatMaintenance = await loadOpenLoopStore(harness.openLoopStorePath);
    assert.equal(
      afterHeartbeatMaintenance.loops.length,
      0,
      "Heartbeat maintenance should scrub previously contaminated HEARTBEAT_OK loops from the registry."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          heartbeatUpdate: loopUpdate.loopDiagnostics,
          loopsAfterHeartbeatRecord: afterHeartbeatRecord.loops,
          loopsAfterHeartbeatMaintenance: afterHeartbeatMaintenance.loops
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
