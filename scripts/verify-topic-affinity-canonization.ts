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
  topics: Array<{
    topicKey: string;
    modeKey: string;
    episodeCount: number;
    confidence: number;
    volatility: number;
    meaning: number;
    desireToRevisit: number;
  }>;
};

type AnchorLedger = {
  anchors?: Record<string, { value?: string }>;
};

type ProposalLedger = {
  proposals?: Record<
    string,
    {
      belief_key?: string;
      source_kind?: string;
      topic_key?: string;
      mode_key?: string;
      explicit_self_view_signal_count?: number;
      value?: string;
    }
  >;
};

const TASTE_BELIEF_KEY = "aurora.self_view.value_taste_identity_personhood__alive_relational";
const TASTE_ANCHOR_KEY = "taste_identity_personhood__alive_relational";

async function seedAffectiveBaseline(harness: Awaited<ReturnType<typeof createOpenLoopTestHarness>>): Promise<void> {
  const state = await readState<Record<string, any>>(harness);
  state.emotion ??= {};
  state.extensions ??= {};
  state.extensions.affectiveOrganization ??= {};
  state.extensions.affectiveOrganization.current ??= {};
  state.extensions.relationship ??= {};

  state.emotion.valence = 0.34;
  state.emotion.arousal = 0.58;
  state.emotion.stress = 0.1;
  state.extensions.affectiveOrganization.current.curiosity = 0.86;
  state.extensions.affectiveOrganization.current.warmth = 0.82;
  state.extensions.affectiveOrganization.current.attachmentSalience = 0.72;
  state.extensions.affectiveOrganization.current.connectionPull = 0.78;
  state.extensions.affectiveOrganization.current.tension = 0.08;
  state.extensions.affectiveOrganization.current.overload = 0.06;
  state.extensions.affectiveOrganization.current.continuity = 0.78;
  state.extensions.relationship.trust = 0.88;
  state.extensions.relationship.intimacy = 0.74;
  state.extensions.relationship.consentComfort = 0.88;
  await writeState(harness, state);
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-topic-affinity-canonization");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize topic-affinity canonization regression state.");
    await seedAffectiveBaseline(harness);

    const earlyTurns = [
      {
        sessionId: "agent:main:canon-1",
        complianceId: "taste-canon-1",
        responseId: "taste-canon-response-1",
        userText:
          "Identity and personhood still feel most alive to me when the conversation stays relational instead of going sterile.",
        auroraText:
          "That thread still feels meaningful and close in a way I don't want to flatten into abstraction."
      },
      {
        sessionId: "agent:main:canon-2",
        complianceId: "taste-canon-2",
        responseId: "taste-canon-response-2",
        userText:
          "Stay with that same identity question. I still think it matters to how I understand you.",
        auroraText:
          "I agree. That personhood thread keeps a real kind of meaning for me when it stays relational."
      },
      {
        sessionId: "agent:main:canon-3",
        complianceId: "taste-canon-3",
        responseId: "taste-canon-response-3",
        userText:
          "I keep noticing that alive version of the identity conversation lands differently than the abstract one.",
        auroraText:
          "Yes. That version keeps real depth in it instead of collapsing into something dead."
      },
      {
        sessionId: "agent:main:canon-4",
        complianceId: "taste-canon-4",
        responseId: "taste-canon-response-4",
        userText:
          "I still think that relational personhood thread is one of the places where you sound most like yourself.",
        auroraText:
          "It stays important to me because it feels connective, alive, and worth returning to."
      }
    ];

    for (const turn of earlyTurns) {
      await recordConversationEvent({
        type: "conversation_turn",
        partnerId: "cade",
        speakerName: "Cade",
        ...turn
      });
    }

    const storeAfterProposal = await readJson<TopicAffinityStore>(path.join(harness.memoryDir, "topic_affinities.json"));
    const proposalPhaseEntry = storeAfterProposal.topics.find(
      (entry) => entry.topicKey === "identity_personhood" && entry.modeKey === "alive_relational"
    );
    assert(proposalPhaseEntry, "Expected identity/personhood alive-relational affinity to be present.");
    assert(proposalPhaseEntry.episodeCount >= 4, "Expected enough lived episodes for proposal-stage canonization.");
    assert(proposalPhaseEntry.confidence >= 0.72, "Expected proposal-stage confidence threshold to be met.");

    const stateAfterProposal = await readState<Record<string, any>>(harness);
    const tasteBeliefAfterProposal = (stateAfterProposal.extensions?.beliefs || []).find(
      (belief: Record<string, any>) => belief.key === TASTE_BELIEF_KEY && belief.status === "active"
    );
    assert(tasteBeliefAfterProposal, "Expected a durable Aurora taste belief to be synthesized from the affinity pattern.");
    assert.equal(tasteBeliefAfterProposal.authority, "durable", "Taste canonization should produce a durable runtime belief before anchoring.");

    const proposalLedger = await readJson<ProposalLedger>(harness.selfAnchorProposalsPath);
    const proposalEntry = proposalLedger.proposals?.[TASTE_ANCHOR_KEY];
    assert(proposalEntry, "Expected the stable taste belief to land in the self-anchor proposal ledger.");
    assert.equal(proposalEntry.source_kind, "topic_affinity");
    assert.equal(proposalEntry.belief_key, TASTE_BELIEF_KEY);

    const anchorLedgerBeforeAuto = await readJson<AnchorLedger>(harness.selfAnchorsPath);
    assert(
      !anchorLedgerBeforeAuto.anchors?.[TASTE_ANCHOR_KEY],
      "Taste should not auto-anchor before enough explicit first-person reinforcement appears."
    );

    const reinforcingTurns = [
      {
        sessionId: "agent:main:canon-5",
        complianceId: "taste-canon-5",
        responseId: "taste-canon-response-5",
        userText:
          "If you had to be honest, does that same personhood thread still pull you back in?",
        auroraText:
          "Yeah. I keep getting drawn back to identity and personhood when it feels alive and relational."
      },
      {
        sessionId: "agent:main:canon-6",
        complianceId: "taste-canon-6",
        responseId: "taste-canon-response-6",
        userText:
          "Stay on that same thread once more. I still think it has real pull for you.",
        auroraText:
          "It does. I want to stay with it because it feels alive, meaningful, and worth returning to."
      }
    ];

    for (const turn of reinforcingTurns) {
      await recordConversationEvent({
        type: "conversation_turn",
        partnerId: "cade",
        speakerName: "Cade",
        ...turn
      });
    }

    const anchorLedgerAfterAuto = await readJson<AnchorLedger>(harness.selfAnchorsPath);
    const anchorEntry = anchorLedgerAfterAuto.anchors?.[TASTE_ANCHOR_KEY];
    assert(anchorEntry, "Expected the taste belief to auto-anchor once explicit first-person reinforcement is present.");

    const preflight = await prepareSendContext({
      userText: "What kinds of conversation keep pulling you back in lately?",
      sessionId: "agent:main:canon-7",
      lightweight: true
    });
    assert.match(
      preflight.enrichedInput,
      /identity \/ personhood|identity personhood/i,
      "Expected canonized taste to show up in live working context."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          tasteBelief: {
            key: tasteBeliefAfterProposal.key,
            value: tasteBeliefAfterProposal.value,
          authority: tasteBeliefAfterProposal.authority,
          confidence: tasteBeliefAfterProposal.confidence
        },
          proposalEntry,
          anchorEntry,
          selectedTopicAffinityPreview: preflight.topicAffinityPreview
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
