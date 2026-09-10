#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import path from "node:path";

import { prepareSendContext, recordConversationEvent } from "../lib/auroraCognition";
import type { AgencyActionStore } from "../lib/auroraAgencyActions";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readJson,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace
} from "./open-loop-test-helpers";

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
  const harness = await createOpenLoopTestHarness("aurora-agency-actions");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize agency-action verification state.");

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-agency-action-create",
      responseId: "response-agency-action-create",
      userText:
        "I still think the phenomenology question matters for how I classify you, and it does not feel settled yet.",
      auroraText:
        "Yeah. That still feels alive to me because it affects how I understand what I am, and the next step is to keep treating it as an open design question until better evidence appears."
    });

    const storePath = path.join(harness.memoryDir, "agency_actions.json");
    const store = await readJson<AgencyActionStore>(storePath);
    assert.equal(store.schemaVersion, "1.0");
    assert(store.actions.length > 0, "Expected the agency action store to contain actions.");

    const linkedAction = store.actions.find(
      (entry) =>
        entry.sourceType === "open_loop" &&
        entry.linkedLoopId &&
        /phenomenal-experience|phenomenology/i.test(`${entry.title} ${entry.summary}`)
    );
    assert(linkedAction, "Expected a phenomenology-linked agency action.");
    assert.equal(linkedAction.permission, "local_safe");
    assert.equal(linkedAction.status, "ready");
    assert.equal(linkedAction.executor, "web_research");
    assert.equal(linkedAction.approvalStatus, "not_needed");
    assert.equal(linkedAction.externalTarget, "Internet / bounded research");
    assert.match(linkedAction.researchQuery || "", /phenomenology|consciousness|personhood|self-model/i);
    assert.match(linkedAction.targetDirectory, /agency-actions/i);
    assert(linkedAction.preferredActs.length > 0, "Expected action preferred acts.");

    const preflight = await prepareSendContext({
      userText: "What concrete next act would help with the phenomenology issue?",
      sessionId: "agent:main:main",
      testTurnLabel: "verify-agency-actions"
    });

    assert(preflight.agencyActionPreview && preflight.agencyActionPreview.length > 0, "Expected selected agency actions.");
    assert(preflight.agencyActionBias, "Expected an agency action bias.");
    assert(
      preflight.agencyActionPreview.some((entry) => entry.id === linkedAction.id),
      "Expected the phenomenology action to surface in preflight."
    );

    const stateLine = extractField(preflight.enrichedInput, "agency_action_state=");
    const actionLines = extractPrefixedFields(preflight.enrichedInput, "agency_action_").filter(
      (line) => !line.startsWith("rule=") && !line.startsWith("state=")
    );

    assert.notEqual(stateLine, "", "Expected agency action state in the prompt.");
    assert(actionLines.length > 0, "Expected agency action lines in the prompt.");
    assert.match(actionLines[0] || "", /ready\/local_safe\/not_needed\/web_research/i);
    assert.match(actionLines[0] || "", /query:/i);
    assert.match(actionLines[0] || "", /via:Internet \/ bounded research/i);

    console.log(
      JSON.stringify(
        {
          ok: true,
          storePath,
          linkedAction,
          preflight: {
            agencyActionPreview: preflight.agencyActionPreview,
            agencyActionBias: preflight.agencyActionBias,
            agencyActionState: stateLine,
            agencyActionLines: actionLines
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
