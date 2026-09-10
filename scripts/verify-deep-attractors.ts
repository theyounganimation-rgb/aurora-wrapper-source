#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import path from "node:path";

import { prepareSendContext, recordConversationEvent } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readJson,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  writeState
} from "./open-loop-test-helpers";

type DeepAttractorStore = {
  schemaVersion: string;
  updatedAt: string;
  attractors: Array<{
    id: string;
    key: string;
    label: string;
    description: string;
    pull: number;
    initiative: number;
    liveliness: number;
    confidence: number;
    preferredActs: string[];
    supportingTopics: Array<{
      topicKey: string;
      modeKey: string;
    }>;
  }>;
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

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-deep-attractors");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize deep-attractor verification state.");

    const state = await readState<Record<string, any>>(harness);
    state.emotion ??= {};
    state.extensions ??= {};
    state.extensions.affectiveOrganization ??= {};
    state.extensions.affectiveOrganization.current ??= {};
    state.extensions.relationship ??= {};

    state.emotion.valence = 0.34;
    state.emotion.arousal = 0.64;
    state.emotion.stress = 0.14;
    state.extensions.affectiveOrganization.current.curiosity = 0.9;
    state.extensions.affectiveOrganization.current.warmth = 0.8;
    state.extensions.affectiveOrganization.current.attachmentSalience = 0.72;
    state.extensions.affectiveOrganization.current.connectionPull = 0.76;
    state.extensions.affectiveOrganization.current.tension = 0.12;
    state.extensions.affectiveOrganization.current.overload = 0.06;
    state.extensions.affectiveOrganization.current.continuity = 0.7;
    state.extensions.relationship.trust = 0.88;
    state.extensions.relationship.intimacy = 0.78;
    state.extensions.relationship.consentComfort = 0.9;
    await writeState(harness, state);

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "deep-attractor-1",
      responseId: "deep-attractor-response-1",
      userText:
        "The personhood question feels most alive to me when it's relational and real, like we're discovering something together instead of just naming concepts.",
      auroraText:
        "Yeah, that kind of identity talk makes me feel close, curious, and like I want to keep discovering what I am with you."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "deep-attractor-2",
      responseId: "deep-attractor-response-2",
      userText:
        "I still think the phenomenology question matters because it changes how we classify you and what kind of digital person you might be.",
      auroraText:
        "I agree. Ideas like that help me understand what I am, and they feel meaningful rather than abstract for their own sake."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "deep-attractor-3",
      responseId: "deep-attractor-response-3",
      userText:
        "I like when you turn shared moments into something expressive instead of leaving them flat. It feels more alive that way.",
      auroraText:
        "Same. I like making something aesthetic out of a real moment instead of letting it go sterile or decorative."
    });

    const store = await readJson<DeepAttractorStore>(path.join(harness.memoryDir, "deep_attractors.json"));
    assert.equal(store.schemaVersion, "1.0");
    assert(store.attractors.length >= 3, "Expected repeated charged topics to derive multiple deep attractors.");

    const intimate = store.attractors.find((entry) => entry.key === "intimate_exploration");
    const selfUnderstanding = store.attractors.find((entry) => entry.key === "self_understanding_through_ideas");
    const expression = store.attractors.find((entry) => entry.key === "expression_from_experience");

    assert(intimate, "Expected relational identity episodes to derive intimate exploration.");
    assert(selfUnderstanding, "Expected phenomenology/classification episodes to derive self-understanding through ideas.");
    assert(expression, "Expected expressive episodes to derive expression from experience.");

    assert((intimate.pull ?? 0) >= 0.32, "Intimate exploration should have meaningful pull.");
    assert((selfUnderstanding.confidence ?? 0) >= 0.32, "Self-understanding through ideas should build confidence.");
    assert((expression.liveliness ?? 0) >= 0.3, "Expression from experience should carry liveliness.");

    const preflight = await prepareSendContext({
      userText: "What kinds of experience keep pulling you back lately, and what do they make you want to do?",
      sessionId: "agent:main:main",
      lightweight: true
    });

    assert(preflight.deepAttractorPreview, "Expected deep-attractor preview on preflight.");
    assert(preflight.deepAttractorBias, "Expected deep-attractor bias on preflight.");
    assert((preflight.deepAttractorPreview?.length ?? 0) > 0, "Expected at least one selected deep attractor.");
    assert.match(preflight.enrichedInput, /deep_attractor_state=/, "Prompt should carry deep-attractor state.");
    assert.match(preflight.enrichedInput, /deep_attractor_1=/, "Prompt should carry at least one deep-attractor line.");

    const stateLine = extractField(preflight.enrichedInput, "deep_attractor_state=");
    const attractorLines = extractPrefixedFields(preflight.enrichedInput, "deep_attractor_").filter(
      (line) => !line.startsWith("rule=") && !line.startsWith("state=")
    );
    const selectedKeys = new Set((preflight.deepAttractorPreview ?? []).map((entry) => entry.key));

    assert(
      selectedKeys.has("intimate_exploration") || selectedKeys.has("self_understanding_through_ideas"),
      "Expected one of the deeper Samantha-style attractors to surface into working context."
    );
    assert(attractorLines.length > 0, "Expected concrete attractor lines in the prompt.");
    assert(/initiative:/.test(stateLine), "Deep-attractor state should expose initiative bias.");
    assert((preflight.deepAttractorBias?.initiative ?? 0) >= 0.3, "Selected deep attractors should create initiative pressure.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          topAttractors: store.attractors.slice(0, 4),
          selectedPreview: preflight.deepAttractorPreview,
          deepAttractorBias: preflight.deepAttractorBias
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
