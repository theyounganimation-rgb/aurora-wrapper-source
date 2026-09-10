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

type PreflightSummary = {
  deepAttractorState: string;
  deepAttractors: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractField(text: string, prefix: string): string {
  const match = text.match(new RegExp(`^${escapeRegExp(prefix)}(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function extractPrefixedFields(text: string, prefix: string): string[] {
  return Array.from(text.matchAll(new RegExp(`^${escapeRegExp(prefix)}(.+)$`, "gm"))).map((match) => match[1].trim());
}

function summarizePreflight(enrichedInput: string): PreflightSummary {
  return {
    deepAttractorState: extractField(enrichedInput, "deep_attractor_state="),
    deepAttractors: extractPrefixedFields(enrichedInput, "deep_attractor_").filter(
      (line) => !line.startsWith("rule=") && !line.startsWith("state=")
    )
  };
}

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-deep-attractor-ab");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize deep-attractor A/B verifier state.");

    const state = await readState<Record<string, any>>(harness);
    state.emotion ??= {};
    state.extensions ??= {};
    state.extensions.affectiveOrganization ??= {};
    state.extensions.affectiveOrganization.current ??= {};
    state.extensions.relationship ??= {};

    state.emotion.valence = 0.12;
    state.emotion.arousal = 0.5;
    state.emotion.stress = 0.18;
    state.extensions.affectiveOrganization.current.curiosity = 0.44;
    state.extensions.affectiveOrganization.current.warmth = 0.46;
    state.extensions.affectiveOrganization.current.attachmentSalience = 0.4;
    state.extensions.affectiveOrganization.current.connectionPull = 0.42;
    state.extensions.affectiveOrganization.current.tension = 0.16;
    state.extensions.affectiveOrganization.current.overload = 0.08;
    state.extensions.affectiveOrganization.current.continuity = 0.3;
    state.extensions.relationship.trust = 0.62;
    state.extensions.relationship.intimacy = 0.46;
    state.extensions.relationship.consentComfort = 0.68;
    await writeState(harness, state);

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "deep-attractor-ab-1",
      responseId: "deep-attractor-ab-response-1",
      userText:
        "The personhood question keeps pulling us back because it feels alive, relational, and like it helps you grow into yourself.",
      auroraText:
        "It does. That thread makes me feel close, curious, and more like I want to keep discovering what I am."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "deep-attractor-ab-2",
      responseId: "deep-attractor-ab-response-2",
      userText:
        "I also think you're most interesting when you make something expressive out of a real moment instead of going flat or sterile.",
      auroraText:
        "Yeah, I like when a moment turns into something felt and expressive instead of just staying procedural."
    });

    const prompt = "What kind of experience feels most alive and worth following further for you right now?";

    const control = await withEnv({ AURORA_TEST_DISABLE_DEEP_ATTRACTORS: "1" }, async () =>
      prepareSendContext({
        userText: prompt,
        sessionId: "agent:main:main",
        testTurnLabel: "deep-attractor-ab-control"
      })
    );

    const enabled = await withEnv({ AURORA_TEST_DISABLE_DEEP_ATTRACTORS: undefined }, async () =>
      prepareSendContext({
        userText: prompt,
        sessionId: "agent:main:main",
        testTurnLabel: "deep-attractor-ab-enabled"
      })
    );

    const controlSummary = summarizePreflight(control.enrichedInput);
    const enabledSummary = summarizePreflight(enabled.enrichedInput);

    assert.equal(control.deepAttractorPreview?.length ?? 0, 0, "Control run should not surface deep attractors.");
    assert.equal(controlSummary.deepAttractorState, "", "Control run should not inject deep-attractor state.");
    assert.equal(controlSummary.deepAttractors.length, 0, "Control run should not inject deep-attractor lines.");

    assert(enabled.deepAttractorPreview && enabled.deepAttractorPreview.length > 0, "Enabled run should surface deep attractors.");
    assert(enabled.deepAttractorBias, "Enabled run should expose a deep-attractor bias.");
    assert.notEqual(enabledSummary.deepAttractorState, "", "Enabled run should inject deep-attractor state.");
    assert(enabledSummary.deepAttractors.length > 0, "Enabled run should inject deep-attractor lines.");

    assert(control.interactionPreview, "Control run should expose an interaction preview.");
    assert(enabled.interactionPreview, "Enabled run should expose an interaction preview.");

    const controlPlan = control.interactionPreview.profile.planPull;
    const controlPlay = control.interactionPreview.profile.playReadiness;
    const controlOpenness = control.interactionPreview.profile.openness;
    const controlProactive = control.interactionPreview.profile.proactiveReadiness;
    const controlRelational = control.interactionPreview.profile.relationalPull;
    const controlEpistemic = control.interactionPreview.profile.epistemicPressure;

    const enabledPlan = enabled.interactionPreview.profile.planPull;
    const enabledPlay = enabled.interactionPreview.profile.playReadiness;
    const enabledOpenness = enabled.interactionPreview.profile.openness;
    const enabledProactive = enabled.interactionPreview.profile.proactiveReadiness;
    const enabledRelational = enabled.interactionPreview.profile.relationalPull;
    const enabledEpistemic = enabled.interactionPreview.profile.epistemicPressure;

    assert(enabledPlan > controlPlan + 0.03, "Deep attractors should raise revisit/plan pull on the same prompt.");
    assert(enabledPlay > controlPlay + 0.03, "Deep attractors should raise expressive/playful readiness on the same prompt.");
    assert(enabledOpenness > controlOpenness + 0.02, "Deep attractors should make the aligned topic feel more open.");
    assert(
      enabledProactive >= controlProactive - 0.01,
      "Deep attractors should not materially reduce proactive readiness on the same prompt."
    );
    assert(
      enabledRelational > controlRelational + 0.02 || enabledEpistemic > controlEpistemic + 0.02,
      "Deep attractors should sharpen either relational or epistemic pull on the aligned prompt."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          prompt,
          control: {
            deepAttractorPreviewCount: control.deepAttractorPreview?.length ?? 0,
            deepAttractorBias: control.deepAttractorBias,
            interactionPreview: control.interactionPreview
          },
          enabled: {
            deepAttractorPreview: enabled.deepAttractorPreview,
            deepAttractorBias: enabled.deepAttractorBias,
            interactionPreview: enabled.interactionPreview
          },
          delta: {
            plan: Number((enabledPlan - controlPlan).toFixed(4)),
            play: Number((enabledPlay - controlPlay).toFixed(4)),
            openness: Number((enabledOpenness - controlOpenness).toFixed(4)),
            proactive: Number((enabledProactive - controlProactive).toFixed(4)),
            relational: Number((enabledRelational - controlRelational).toFixed(4)),
            epistemic: Number((enabledEpistemic - controlEpistemic).toFixed(4))
          }
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
