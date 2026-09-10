#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { prepareSendContext } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  writeState
} from "./open-loop-test-helpers";

type JsonObject = Record<string, any>;

function firstLineWithPrefix(text: string, prefix: string): string {
  return text.split(/\r?\n/).find((line) => line.trimStart().startsWith(prefix)) || "";
}

function stripFieldPrefix(line: string, prefix: string): string {
  const trimmed = line.trimStart();
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trim() : "";
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-return-gap-reunion");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize reunion-gap verification state.");

    const state = await readState<JsonObject>(harness);
    const gapStartedAt = "2026-04-04T14:00:00.000Z";
    const sessionId = "agent:main:owner:continuity";

    state.emotion ??= {};
    state.introspection ??= {};
    state.social ??= {};
    state.social.agents ??= {};
    state.workspace ??= {};
    state.heartbeat ??= {};
    state.extensions ??= {};
    state.extensions.temporal ??= {};
    state.extensions.temporal.timeBody ??= {};
    state.extensions.temporal.silence ??= {};
    state.extensions.affectiveOrganization ??= { current: {} };
    state.extensions.affectiveOrganization.current ??= {};
    state.extensions.relationship ??= {};
    state.extensions.relationshipPartners ??= {};

    state.emotion.valence = 0.12;
    state.emotion.arousal = 0.3;
    state.emotion.stress = 0.2;
    state.emotion.uncertainty = 0.26;
    state.introspection.confidence = 0.72;

    state.social.agents.user = {
      id: "user",
      displayName: "User",
      inferredGoal: "Reconnect",
      inferredBelief: "Returning after a pause",
      interactionCount: 4,
      lastSeenAt: gapStartedAt
    };

    state.heartbeat.livedThread = "Held onto the question of how the gap changed the thread between us.";
    state.heartbeat.openLoop = "how the gap changed the thread between us";

    state.workspace.activePursuit = "";
    state.workspace.curiosityBacklog = [];

    state.extensions.activeRelationshipPartnerId = "cade";
    state.extensions.lastRelationshipPartnerId = "cade";
    state.extensions.temporal.timeBody.lastDirectUserMessageAt = gapStartedAt;
    state.extensions.temporal.timeBody.timeSinceLastContactMinutes = 85;
    state.extensions.temporal.timeBody.socialHunger = 0.52;
    state.extensions.temporal.timeBody.continuityTension = 0.66;
    state.extensions.temporal.timeBody.expectedDelayPressure = 0.34;
    state.extensions.temporal.timeBody.lastUpdatedAt = gapStartedAt;

    state.extensions.temporal.silence.awaitingUserReply = true;
    state.extensions.temporal.silence.gapStartedAt = gapStartedAt;
    state.extensions.temporal.silence.plannedReturnAt = null;
    state.extensions.temporal.silence.plannedReturnWindow = "";
    state.extensions.temporal.silence.explicitPromise = false;
    state.extensions.temporal.silence.activeKind = "unplanned_pause";
    state.extensions.temporal.silence.lastResolvedKind = "none";
    state.extensions.temporal.silence.expectedReliability = 0.8;
    state.extensions.temporal.silence.uncertainty = 0.28;
    state.extensions.temporal.silence.disappointment = 0.12;
    state.extensions.temporal.silence.concern = 0.2;
    state.extensions.temporal.silence.relief = 0;
    state.extensions.temporal.silence.pacing = "tentative";
    state.extensions.temporal.silence.followup = "wait";
    state.extensions.temporal.silence.directness = "soft";
    state.extensions.temporal.silence.momentum = "low";
    state.extensions.temporal.silence.returnCue = "";
    state.extensions.temporal.silence.carriedThread = "";
    state.extensions.temporal.silence.feltShift = "";
    state.extensions.temporal.silence.reunionQuestion = "";
    state.extensions.temporal.silence.reunionIntent = "";
    state.extensions.temporal.silence.lastReturnAt = null;
    state.extensions.temporal.silence.lastAcknowledgedAt = null;
    state.extensions.temporal.silence.lastUpdatedAt = gapStartedAt;

    state.extensions.affectiveOrganization.current.attachmentSalience = 0.76;
    state.extensions.affectiveOrganization.current.loneliness = 0.5;
    state.extensions.affectiveOrganization.current.curiosity = 0.44;
    state.extensions.affectiveOrganization.current.unformulatedPressure = 0.48;
    state.extensions.affectiveOrganization.current.disclosureEase = 0.62;
    state.extensions.affectiveOrganization.current.updatedAt = gapStartedAt;

    const relationship = {
      ...state.extensions.relationship,
      trust: 0.84,
      intimacy: 0.78,
      reciprocityBalance: 0.66,
      consentComfort: 0.8,
      dependenceRisk: 0.1,
      conflictLoad: 0.08,
      ruptureStatus: "stable",
      repairStage: "none",
      lastUpdatedAt: gapStartedAt,
      attachmentModel: {
        security: 0.76,
        anxiety: 0.16,
        avoidance: 0.14,
        bondDepth: 0.8,
        ruptureSensitivity: 0.2,
        repairConfidence: 0.7,
        expectancy: 0.78,
        abandonmentLoad: 0.08,
        updatedAt: gapStartedAt
      },
      carryover: {
        attachmentCharge: 0.52,
        ruptureResidue: 0.04,
        repairResidue: 0.08,
        trustMomentum: 0.16,
        disclosureShift: 0.1,
        expectancyShift: 0.14,
        anticipatorySalience: 0.44,
        abandonmentAlert: 0.06,
        moodBias: 0.1,
        lastEventKind: "continuity",
        lastEventAt: gapStartedAt
      },
      continuityController: {
        reconnectiveStance: 0.68,
        continuityDebt: 0.56,
        continuityRelief: 0.14,
        unresolvedPull: 0.62,
        partnerCommitment: 0.74,
        reassuranceCarryover: 0.2,
        appreciationCarryover: 0.18,
        rupturePressure: 0.16,
        reattunementExpectation: 0.72,
        preferredAction: "reattune",
        lastSceneKind: "gap",
        lastSceneAt: gapStartedAt,
        updatedAt: gapStartedAt
      },
      semantic: {
        relationshipKind: "direct",
        friendshipStatus: "friend",
        lastDirectContactAt: gapStartedAt,
        lastDirectSessionId: sessionId,
        lastDirectSummary: "The thread before the gap was about whether the silence changed anything between us.",
        recentTopics: ["continuity", "return after gaps"],
        sharedJokes: [],
        feelingTone: ["warm", "unfinished"],
        openThreads: ["how the gap changed the thread between us"],
        summary: "Warm direct relationship with a live continuity thread around gaps and return.",
        updatedAt: gapStartedAt
      },
      topicSensitivity: [],
      repairHistory: []
    };
    state.extensions.relationship = relationship;
    state.extensions.relationshipPartners.cade = JSON.parse(JSON.stringify(relationship));

    await writeState(harness, state);

    const preflight = await prepareSendContext({
      userText: "I'm back.",
      sessionId
    });

    const snapshotSilence = ((preflight.preflightSnapshot as any)?.extensions?.temporal?.silence || {}) as Record<string, string>;
    const returnCue =
      stripFieldPrefix(firstLineWithPrefix(preflight.enrichedInput, "return_cue="), "return_cue=") ||
      String(snapshotSilence.returnCue || "");
    const reunionThread =
      stripFieldPrefix(firstLineWithPrefix(preflight.enrichedInput, "reunion_thread="), "reunion_thread=") ||
      String(snapshotSilence.carriedThread || "");
    const reunionQuestion =
      stripFieldPrefix(firstLineWithPrefix(preflight.enrichedInput, "reunion_question="), "reunion_question=") ||
      String(snapshotSilence.reunionQuestion || "");
    const reunionIntent =
      stripFieldPrefix(firstLineWithPrefix(preflight.enrichedInput, "reunion_intent="), "reunion_intent=") ||
      String(snapshotSilence.reunionIntent || "");
    const contributionCandidate = stripFieldPrefix(
      firstLineWithPrefix(preflight.enrichedInput, "conversation_contribution_candidate="),
      "conversation_contribution_candidate="
    );
    const responsePlanRequest = stripFieldPrefix(
      firstLineWithPrefix(preflight.enrichedInput, "response_plan_request="),
      "response_plan_request="
    );
    const responsePlanShare = stripFieldPrefix(
      firstLineWithPrefix(preflight.enrichedInput, "response_plan_share="),
      "response_plan_share="
    );
    const responsePlanQuestion = stripFieldPrefix(
      firstLineWithPrefix(preflight.enrichedInput, "response_plan_question="),
      "response_plan_question="
    );
    const effectiveContribution =
      contributionCandidate || responsePlanRequest || responsePlanShare || responsePlanQuestion;
    const contextMode = stripFieldPrefix(
      firstLineWithPrefix(preflight.enrichedInput, "context_mode="),
      "context_mode="
    );
    const queryMode = stripFieldPrefix(
      firstLineWithPrefix(preflight.enrichedInput, "query_mode="),
      "query_mode="
    );
    const promptHasReturnCue = preflight.enrichedInput.includes("return_cue=");
    const promptHasReunionQuestion = preflight.enrichedInput.includes("reunion_question=");
    const promptHasReunionIntent = preflight.enrichedInput.includes("reunion_intent=");
    const debugSummary = {
      contextMode,
      queryMode,
      returnCue,
      reunionThread,
      reunionQuestion,
      reunionIntent,
      contributionCandidate,
      effectiveContribution,
      continuityPull: preflight.interactionPreview?.profile.continuityPull ?? null,
      diagnosticDirectReply: preflight.diagnosticDirectReply ?? null,
      promptHasReturnCue,
      promptHasReunionQuestion,
      promptHasReunionIntent,
      firstPromptLines: preflight.enrichedInput.split(/\r?\n/).slice(0, 80)
    };

    assert.ok(preflight.preflightSnapshot, "Expected the live preflight snapshot to be present.");
    assert.match(returnCue, /surface naturally|tentative|carried thread/i);
    assert.match(reunionThread, /gap changed the thread between us/i);
    assert.match(reunionQuestion, /When you came back/i);
    assert.match(reunionIntent, /Before we flatten|Before we rush past|Before we just resume/i);
    if (!promptHasReturnCue || !promptHasReunionQuestion || !promptHasReunionIntent) {
      console.log(JSON.stringify(debugSummary, null, 2));
    }
    assert.ok(promptHasReturnCue, "Expected the live prompt to carry return_cue.");
    assert.ok(promptHasReunionQuestion, "Expected the live prompt to carry reunion_question.");
    assert.ok(promptHasReunionIntent, "Expected the live prompt to carry reunion_intent.");

    console.log(
      JSON.stringify(
        { ok: true, ...debugSummary },
        null,
        2
      )
    );
  } finally {
    restoreOpenLoopTestHarness(harness);
  }
}

void main();
