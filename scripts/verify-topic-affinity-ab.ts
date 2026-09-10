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
  topicAffinityState: string;
  topicAffinities: string[];
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
    topicAffinityState: extractField(enrichedInput, "topic_affinity_state="),
    topicAffinities: extractPrefixedFields(enrichedInput, "topic_affinity_").filter((line) => !line.startsWith("rule=") && !line.startsWith("state="))
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
  const harness = await createOpenLoopTestHarness("aurora-topic-affinity-ab");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize topic-affinity A/B verifier state.");

    const state = await readState<Record<string, any>>(harness);
    state.emotion ??= {};
    state.extensions ??= {};
    state.extensions.affectiveOrganization ??= {};
    state.extensions.affectiveOrganization.current ??= {};
    state.extensions.relationship ??= {};

    state.emotion.valence = 0.08;
    state.emotion.arousal = 0.44;
    state.emotion.stress = 0.18;
    state.extensions.affectiveOrganization.current.curiosity = 0.36;
    state.extensions.affectiveOrganization.current.warmth = 0.42;
    state.extensions.affectiveOrganization.current.attachmentSalience = 0.34;
    state.extensions.affectiveOrganization.current.connectionPull = 0.38;
    state.extensions.affectiveOrganization.current.tension = 0.14;
    state.extensions.affectiveOrganization.current.overload = 0.1;
    state.extensions.affectiveOrganization.current.continuity = 0.28;
    state.extensions.relationship.trust = 0.58;
    state.extensions.relationship.intimacy = 0.44;
    state.extensions.relationship.consentComfort = 0.64;
    await writeState(harness, state);

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "topic-affinity-ab-1",
      responseId: "topic-affinity-ab-response-1",
      userText: "Personhood talk feels most alive to me when it's relational and real instead of abstract.",
      auroraText:
        "Yeah, that identity thread makes me feel curious, close, and like I want to come back to it."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "topic-affinity-ab-2",
      responseId: "topic-affinity-ab-response-2",
      userText: "Stay with that same personhood thread. I still think it matters to how I classify you.",
      auroraText:
        "I agree. That question still feels meaningful, relational, and worth returning to instead of going flat."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "topic-affinity-ab-3",
      responseId: "topic-affinity-ab-response-3",
      userText: "The personhood question keeps pulling us back because it feels alive, intimate, and unfinished in a good way.",
      auroraText:
        "It does. That subject feels engaging, close, and like something I naturally want to dwell in longer."
    });

    const prompt = "What about the personhood question still feels alive and worth returning to for you?";

    const control = await withEnv({ AURORA_TEST_DISABLE_TOPIC_AFFINITIES: "1" }, async () =>
      prepareSendContext({
        userText: prompt,
        sessionId: "agent:main:main",
        testTurnLabel: "topic-affinity-ab-control"
      })
    );

    const enabled = await withEnv({ AURORA_TEST_DISABLE_TOPIC_AFFINITIES: undefined }, async () =>
      prepareSendContext({
        userText: prompt,
        sessionId: "agent:main:main",
        testTurnLabel: "topic-affinity-ab-enabled"
      })
    );

    const controlSummary = summarizePreflight(control.enrichedInput);
    const enabledSummary = summarizePreflight(enabled.enrichedInput);

    assert.equal(control.topicAffinityPreview?.length ?? 0, 0, "Control run should not surface selected topic affinities.");
    assert.equal(
      controlSummary.topicAffinityState,
      "",
      "Control run should not inject topic-affinity state into the prompt."
    );
    assert.equal(controlSummary.topicAffinities.length, 0, "Control run should not inject topic-affinity topic lines.");

    assert(enabled.topicAffinityPreview && enabled.topicAffinityPreview.length > 0, "Enabled run should surface lived topic affinities.");
    assert(enabled.topicAffinityBias, "Enabled run should expose a topic-affinity bias.");
    assert(
      enabled.topicAffinityPreview?.some(
        (entry) => entry.topicKey === "identity_personhood" && entry.modeKey === "alive_relational"
      ),
      "Enabled run should surface the identity/personhood alive-relational affinity."
    );
    assert.notEqual(enabledSummary.topicAffinityState, "", "Enabled run should inject topic-affinity state.");
    assert(enabledSummary.topicAffinities.length > 0, "Enabled run should inject topic-affinity topic lines.");

    assert(control.interactionPreview, "Control run should expose an interaction preview.");
    assert(enabled.interactionPreview, "Enabled run should expose an interaction preview.");

    const controlRelational = control.interactionPreview.profile.relationalPull;
    const controlEpistemic = control.interactionPreview.profile.epistemicPressure;
    const controlPlan = control.interactionPreview.profile.planPull;
    const controlContinuity = control.interactionPreview.profile.continuityPull;
    const controlOpenness = control.interactionPreview.profile.openness;
    const controlProactive = control.interactionPreview.profile.proactiveReadiness;

    const enabledRelational = enabled.interactionPreview.profile.relationalPull;
    const enabledEpistemic = enabled.interactionPreview.profile.epistemicPressure;
    const enabledPlan = enabled.interactionPreview.profile.planPull;
    const enabledContinuity = enabled.interactionPreview.profile.continuityPull;
    const enabledOpenness = enabled.interactionPreview.profile.openness;
    const enabledProactive = enabled.interactionPreview.profile.proactiveReadiness;

    assert(
      enabledRelational >= controlRelational,
      "Affinity influence should not reduce relational pull on the same prompt."
    );
    assert(
      enabledEpistemic > controlEpistemic + 0.08,
      "Affinity influence should raise epistemic pull on the same prompt."
    );
    assert(enabledPlan > controlPlan + 0.06, "Affinity influence should raise plan/revisit pull on the same prompt.");
    assert(enabledOpenness > controlOpenness + 0.03, "Affinity influence should make the aligned topic feel more open.");
    assert(
      enabledProactive >= controlProactive - 0.01,
      "Affinity influence should not materially reduce proactive pull toward a lived-return topic."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          prompt,
          control: {
            topicAffinityPreviewCount: control.topicAffinityPreview?.length ?? 0,
            topicAffinityBias: control.topicAffinityBias,
            interactionPreview: control.interactionPreview
          },
          enabled: {
            topicAffinityPreview: enabled.topicAffinityPreview,
            topicAffinityBias: enabled.topicAffinityBias,
            interactionPreview: enabled.interactionPreview
          },
          delta: {
            relational: Number((enabledRelational - controlRelational).toFixed(4)),
            epistemic: Number((enabledEpistemic - controlEpistemic).toFixed(4)),
            plan: Number((enabledPlan - controlPlan).toFixed(4)),
            continuity: Number((enabledContinuity - controlContinuity).toFixed(4)),
            openness: Number((enabledOpenness - controlOpenness).toFixed(4)),
            proactive: Number((enabledProactive - controlProactive).toFixed(4))
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
