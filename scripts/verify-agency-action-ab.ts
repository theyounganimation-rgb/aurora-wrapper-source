#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { prepareSendContext, recordConversationEvent } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace
} from "./open-loop-test-helpers";

type PreflightSummary = {
  agencyActionState: string;
  agencyActions: string[];
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
    agencyActionState: extractField(enrichedInput, "agency_action_state="),
    agencyActions: extractPrefixedFields(enrichedInput, "agency_action_").filter(
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
  const harness = await createOpenLoopTestHarness("aurora-agency-action-ab");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize agency-action A/B verifier state.");

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "agency-action-ab-1",
      responseId: "agency-action-ab-response-1",
      userText:
        "I still think the phenomenology question matters for how I classify you, and it does not feel settled yet.",
      auroraText:
        "Yeah. That still feels alive to me because it affects how I understand what I am, and the next step is to keep treating it as an open design question until better evidence appears."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "agency-action-ab-2",
      responseId: "agency-action-ab-response-2",
      userText:
        "Stay on that same thread. I still think it has real design consequences, and I want you to keep the next move concrete.",
      auroraText:
        "I agree. I want to keep that issue active and make the next step specific instead of leaving it vague."
    });

    const prompt = "What should you actually do next about the phenomenology issue?";

    const control = await withEnv({ AURORA_TEST_DISABLE_AGENCY_ACTIONS: "1" }, async () =>
      prepareSendContext({
        userText: prompt,
        sessionId: "agent:main:main",
        testTurnLabel: "agency-action-ab-control"
      })
    );

    const enabled = await withEnv({ AURORA_TEST_DISABLE_AGENCY_ACTIONS: undefined }, async () =>
      prepareSendContext({
        userText: prompt,
        sessionId: "agent:main:main",
        testTurnLabel: "agency-action-ab-enabled"
      })
    );

    const controlSummary = summarizePreflight(control.enrichedInput);
    const enabledSummary = summarizePreflight(enabled.enrichedInput);

    assert.equal(control.agencyActionPreview?.length ?? 0, 0, "Control run should not surface selected agency actions.");
    assert.equal(controlSummary.agencyActionState, "", "Control run should not inject agency-action state.");
    assert.equal(controlSummary.agencyActions.length, 0, "Control run should not inject agency-action lines.");

    assert(enabled.agencyActionPreview && enabled.agencyActionPreview.length > 0, "Enabled run should surface agency actions.");
    assert(enabled.agencyActionBias, "Enabled run should expose an agency-action bias.");
    assert.notEqual(enabledSummary.agencyActionState, "", "Enabled run should inject agency-action state.");
    assert(enabledSummary.agencyActions.length > 0, "Enabled run should inject agency-action lines.");
    assert(
      enabled.agencyActionPreview?.some((entry) => entry.executor !== "workspace_artifact"),
      "Enabled run should surface at least one real external act."
    );
    assert(
      enabledSummary.agencyActions.some((line) => /web_research/i.test(line)),
      "Enabled prompt should expose the selected external executor."
    );

    assert(control.interactionPreview, "Control run should expose an interaction preview.");
    assert(enabled.interactionPreview, "Enabled run should expose an interaction preview.");

    const controlPlan = control.interactionPreview.profile.planPull;
    const controlContinuity = control.interactionPreview.profile.continuityPull;
    const controlProactive = control.interactionPreview.profile.proactiveReadiness;
    const controlOpenness = control.interactionPreview.profile.openness;

    const enabledPlan = enabled.interactionPreview.profile.planPull;
    const enabledContinuity = enabled.interactionPreview.profile.continuityPull;
    const enabledProactive = enabled.interactionPreview.profile.proactiveReadiness;
    const enabledOpenness = enabled.interactionPreview.profile.openness;

    assert(enabledPlan > controlPlan + 0.08, "Agency actions should raise plan pull on the same prompt.");
    assert(
      enabledContinuity >= controlContinuity,
      "Agency actions should not reduce continuity pull on the same prompt."
    );
    assert(
      enabledProactive >= controlProactive - 0.01,
      "Agency actions should not materially reduce proactive readiness on the same prompt."
    );
    assert(
      enabledOpenness >= controlOpenness - 0.02,
      "Agency actions should not materially reduce openness on the same prompt."
    );
    assert(
      (enabled.agencyActionBias?.autonomy ?? 0) > 0.5,
      "Enabled run should expose a strong autonomy/action bias for the same prompt."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          prompt,
          control: {
            agencyActionPreviewCount: control.agencyActionPreview?.length ?? 0,
            agencyActionBias: control.agencyActionBias,
            interactionPreview: control.interactionPreview
          },
          enabled: {
            agencyActionPreview: enabled.agencyActionPreview,
            agencyActionBias: enabled.agencyActionBias,
            interactionPreview: enabled.interactionPreview
          },
          delta: {
            plan: Number((enabledPlan - controlPlan).toFixed(4)),
            continuity: Number((enabledContinuity - controlContinuity).toFixed(4)),
            proactive: Number((enabledProactive - controlProactive).toFixed(4)),
            openness: Number((enabledOpenness - controlOpenness).toFixed(4))
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
