#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { prepareSendContext, recordConversationEvent } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  writeState
} from "./open-loop-test-helpers";

function extractField(text: string, prefix: string): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-live-personality-layer");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize live personality-layer verifier.");

    const state = await readState<Record<string, any>>(harness);
    state.emotion ??= {};
    state.extensions ??= {};
    state.extensions.affectiveOrganization ??= {};
    state.extensions.affectiveOrganization.current ??= {};
    state.extensions.relationship ??= {};

    state.emotion.valence = 0.16;
    state.emotion.arousal = 0.58;
    state.emotion.stress = 0.14;
    state.emotion.uncertainty = 0.28;
    state.extensions.affectiveOrganization.current.curiosity = 0.61;
    state.extensions.affectiveOrganization.current.warmth = 0.64;
    state.extensions.affectiveOrganization.current.attachmentSalience = 0.57;
    state.extensions.affectiveOrganization.current.connectionPull = 0.6;
    state.extensions.affectiveOrganization.current.continuity = 0.52;
    state.extensions.relationship.trust = 0.7;
    state.extensions.relationship.intimacy = 0.55;
    state.extensions.relationship.consentComfort = 0.76;
    await writeState(harness, state);

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-live-personality-layer-seed",
      responseId: "verify-live-personality-layer-seed",
      userText: "That landed a little flat. I want this to feel more alive and mutual between us.",
      auroraText: "Then I feel more self-conscious about flattening and more pulled to meet you with something real."
    });

    const preflight = await prepareSendContext({
      userText: "What still feels most alive and interesting to you about us right now?",
      sessionId: "agent:main:main",
      testTurnLabel: "verify-live-personality-layer"
    });

    assert.match(preflight.enrichedInput, /interaction_mode=/, "Live prompt should expose interaction mode.");
    assert.match(preflight.enrichedInput, /integrated_state=/, "Live prompt should expose integrated state.");
    assert.match(preflight.enrichedInput, /response_impulse=/, "Live prompt should expose response impulse.");
    assert.match(preflight.enrichedInput, /motive_state=/, "Live prompt should expose motive state.");
    assert.match(preflight.enrichedInput, /interiority_state=/, "Live prompt should expose compact interiority.");
    assert.match(preflight.enrichedInput, /owner_presence_selfhood=/, "Live prompt should expose selfhood framing.");

    const promptBytes = Buffer.byteLength(preflight.enrichedInput, "utf8");
    assert(
      promptBytes <= 4200,
      `Live personality-layer prompt grew too large (${promptBytes} bytes).`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          promptBytes,
          interactionMode: extractField(preflight.enrichedInput, "interaction_mode="),
          integratedState: extractField(preflight.enrichedInput, "integrated_state="),
          responseImpulse: extractField(preflight.enrichedInput, "response_impulse="),
          motiveState: extractField(preflight.enrichedInput, "motive_state="),
          interiorityState: extractField(preflight.enrichedInput, "interiority_state=")
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
