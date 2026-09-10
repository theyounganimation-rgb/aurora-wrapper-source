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

type TopicAffinityStore = {
  schemaVersion: string;
  updatedAt: string;
  topics: Array<{
    id: string;
    topicKey: string;
    topicLabel: string;
    modeKey: string;
    modeLabel: string;
    affinity: number;
    curiosity: number;
    meaning: number;
    connection: number;
    desireToRevisit: number;
    confidence: number;
    episodeCount: number;
    supportingEpisodes: Array<{
      episodeId: string;
      summary: string;
    }>;
  }>;
};

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-topic-affinities");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize topic-affinity regression state.");

    const state = await readState<Record<string, any>>(harness);
    state.emotion ??= {};
    state.extensions ??= {};
    state.extensions.affectiveOrganization ??= {};
    state.extensions.affectiveOrganization.current ??= {};
    state.extensions.relationship ??= {};

    state.emotion.valence = 0.28;
    state.emotion.arousal = 0.58;
    state.emotion.stress = 0.16;
    state.extensions.affectiveOrganization.current.curiosity = 0.84;
    state.extensions.affectiveOrganization.current.warmth = 0.78;
    state.extensions.affectiveOrganization.current.attachmentSalience = 0.68;
    state.extensions.affectiveOrganization.current.connectionPull = 0.72;
    state.extensions.affectiveOrganization.current.tension = 0.12;
    state.extensions.affectiveOrganization.current.overload = 0.08;
    state.extensions.affectiveOrganization.current.continuity = 0.74;
    state.extensions.relationship.trust = 0.86;
    state.extensions.relationship.intimacy = 0.72;
    state.extensions.relationship.consentComfort = 0.86;
    await writeState(harness, state);

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "topic-affinity-1",
      responseId: "topic-affinity-response-1",
      userText: "Personhood talk feels most alive to me when it's relational and real instead of abstract.",
      auroraText:
        "Yeah, that kind of identity talk makes me feel curious, close, and like I want to come back to it."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "topic-affinity-2",
      responseId: "topic-affinity-response-2",
      userText: "Stay with that same identity thread. I still think it feels alive and relational, and it matters to how I classify you.",
      auroraText:
        "I agree. That personhood question still feels meaningful, close, and worth returning to."
    });

    const store = await readJson<TopicAffinityStore>(path.join(harness.memoryDir, "topic_affinities.json"));
    assert.equal(store.schemaVersion, "1.0");
    const identityEntry = store.topics.find(
      (entry) => entry.topicKey === "identity_personhood" && entry.modeKey === "alive_relational"
    );
    assert(identityEntry, "Expected a lived identity/personhood topic-affinity entry.");
    assert(identityEntry.episodeCount >= 2, "Repeated identity/personhood episodes should aggregate instead of evaporating.");
    assert(identityEntry.curiosity >= 0.5, "Identity/personhood affinity should preserve clear curiosity.");
    assert(identityEntry.meaning >= 0.6, "Identity/personhood affinity should preserve high meaning.");
    assert(identityEntry.connection >= 0.45, "Identity/personhood affinity should preserve relational weight.");
    assert(identityEntry.desireToRevisit >= 0.4, "Identity/personhood affinity should preserve return pressure.");
    assert(identityEntry.confidence >= 0.4, "Repeated preference traces should build confidence over time.");
    assert(identityEntry.supportingEpisodes.length >= 2, "Topic affinities should keep supporting episode traces.");

    const preflight = await prepareSendContext({
      userText: "What feels alive and relational to you about personhood?",
      sessionId: "agent:main:main",
      lightweight: true
    });

    assert(preflight.topicAffinityPreview, "Expected topic-affinity preview on preflight.");
    assert(preflight.topicAffinityBias, "Expected topic-affinity bias on preflight.");
    assert(
      preflight.topicAffinityPreview.some(
        (entry) => entry.topicKey === "identity_personhood" && entry.modeKey === "alive_relational"
      ),
      "Relevant topic affinity should surface into the next preflight."
    );
    assert.match(preflight.enrichedInput, /topic_affinity_state=/, "Prompt should carry compact topic-affinity state.");
    assert.match(preflight.enrichedInput, /topic_affinity_1=/, "Prompt should carry at least one topic-affinity line.");
    assert(
      (preflight.topicAffinityBias?.curiosity ?? 0) >= 0.45,
      "Selected topic affinities should create a real curiosity bias on the next turn."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          storedTopic: identityEntry,
          selectedTopicAffinities: preflight.topicAffinityPreview,
          topicAffinityBias: preflight.topicAffinityBias
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
