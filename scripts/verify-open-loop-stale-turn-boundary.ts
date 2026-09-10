#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";

import { recordConversationEvent } from "../lib/auroraCognition";
import { loadOpenLoopStore, resolveLoopById, saveOpenLoopStore } from "../lib/auroraSalience/openLoops";
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
  selectedLoopHintIds: string[];
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
  staleSelectedLoopHintsIgnored: boolean;
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
  state.extensions.openLoopRuntime.lastSelectedLoopTurnHash = turnHash(options.userText);
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

function findCreatedDesignLoop(loops: OpenLoop[], excludedIds: string[]): OpenLoop | undefined {
  return loops.find((loop) => loop.type === "design" && !excludedIds.includes(loop.id));
}

async function verifyStaleSelectedLoopContamination(): Promise<{
  diagnostics: LoopDiagnostics;
  finalLoops: Array<{ id: string; title: string; type: string; status: string }>;
}> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-stale-selected");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize stale selected loop verification state.");
    const loops = await seedDefaultOpenLoops(harness);

    await setSelectedLoopHints(harness, [loops.design.id], {
      sessionId: "agent:main:main",
      userText: "This version feels clean to me. The response path worked, memory landed correctly."
    });

    const result = await runTurn({
      harness,
      complianceId: "verify-stale-selected-loop",
      responseId: "response-stale-selected-loop",
      userText:
        "I think the ontology question is still unresolved, and that is the next design gap we should stay with.",
      auroraText:
        "Yeah — the ontology/mechanism question still feels unresolved to me too, and I think that design thread should stay active."
    });

    const selectedHint = result.loopUpdate.loopDiagnostics.selectedLoopHintEvaluations.find(
      (evaluation) => evaluation.loopId === loops.design.id
    );
    assert(selectedHint, "Expected selected-loop hint diagnostics for the stale design hint.");
    assert.equal(selectedHint.stampMatched, false, "Stale selected-loop hints should fail the turn-stamp check.");
    assert.equal(selectedHint.usedForTouch, false, "Stale selected-loop hints must not touch the active loop store.");
    assert.equal(
      result.loopUpdate.loopDiagnostics.staleSelectedLoopHintsIgnored,
      true,
      "The updater should explicitly report stale selected-loop context being ignored."
    );
    assert(
      !result.loopUpdate.loopDiagnostics.actions.some((action) => action.loopId === loops.design.id),
      "Stale selected-loop hints must not touch, update, or resolve the old design loop."
    );
    const createdDesign = findCreatedDesignLoop(result.store.loops, [loops.design.id]);
    assert(createdDesign, "A new unresolved design topic should create its own design loop.");
    assert.equal(createdDesign?.status, "open");

    return {
      diagnostics: result.loopUpdate.loopDiagnostics,
      finalLoops: result.store.loops.map((loop) => ({
        id: loop.id,
        title: loop.title,
        type: loop.type,
        status: loop.status
      }))
    };
  } finally {
    restoreOpenLoopTestHarness(harness);
  }
}

async function verifyStaleSettlementContamination(): Promise<{
  diagnostics: LoopDiagnostics;
  finalLoops: Array<{ id: string; title: string; type: string; status: string }>;
}> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-stale-settlement");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize stale settlement verification state.");
    const loops = await seedDefaultOpenLoops(harness);

    let store = await loadOpenLoopStore(harness.openLoopStorePath);
    store = resolveLoopById(store, loops.design.id);
    await saveOpenLoopStore(harness.openLoopStorePath, store);

    await setSelectedLoopHints(harness, [loops.design.id], {
      sessionId: "agent:main:main",
      userText: "I am satisfied with the design-memory issue for now. Treat it as settled unless a new regression appears later."
    });

    const result = await runTurn({
      harness,
      complianceId: "verify-stale-settlement-loop",
      responseId: "response-stale-settlement-loop",
      userText:
        "The ontology layer still needs a cleaner mechanism; that part is not settled yet.",
      auroraText:
        "Yeah — that ontology mechanism still feels unresolved to me, and I think it should remain an active design thread."
    });

    const selectedHint = result.loopUpdate.loopDiagnostics.selectedLoopHintEvaluations.find(
      (evaluation) => evaluation.loopId === loops.design.id
    );
    assert(selectedHint, "Expected selected-loop hint diagnostics for the stale settled loop.");
    assert.equal(selectedHint.stampMatched, false, "Previously settled loop hints should not carry into a new turn.");
    assert.equal(
      result.loopUpdate.loopDiagnostics.resolvedLoopIds.length,
      0,
      "A new unresolved topic must not be resolved into the previously settled loop set."
    );
    assert(
      !result.loopUpdate.loopDiagnostics.actions.some((action) => action.loopId === loops.design.id),
      "The updater must not act on the stale previously settled design loop."
    );
    const createdDesign = findCreatedDesignLoop(result.store.loops, [loops.design.id]);
    assert(createdDesign, "A fresh unresolved design topic should create a new active design loop.");
    assert.equal(createdDesign?.status, "open");

    return {
      diagnostics: result.loopUpdate.loopDiagnostics,
      finalLoops: result.store.loops.map((loop) => ({
        id: loop.id,
        title: loop.title,
        type: loop.type,
        status: loop.status
      }))
    };
  } finally {
    restoreOpenLoopTestHarness(harness);
  }
}

async function main(): Promise<void> {
  const staleSelected = await verifyStaleSelectedLoopContamination();
  const staleSettlement = await verifyStaleSettlementContamination();

  console.log(
    JSON.stringify(
      {
        ok: true,
        staleSelected,
        staleSettlement
      },
      null,
      2
    )
  );
}

void main();
