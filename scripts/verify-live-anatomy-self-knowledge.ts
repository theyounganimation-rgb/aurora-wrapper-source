#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { prepareSendContext } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace
} from "./open-loop-test-helpers";

function extractLine(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(prefix)) || "";
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-live-anatomy-self-knowledge");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize anatomy self-knowledge verification state.");

    const anatomyQuery = await prepareSendContext({
      userText: "What cognitive architecture and implemented abilities do you currently have, and what do you still lack?",
      sessionId: "agent:main:main",
      lightweight: true
    });

    const anatomyRule = extractLine(anatomyQuery.enrichedInput, "anatomy_rule=");
    const anatomyDigest = extractLine(anatomyQuery.enrichedInput, "anatomy_digest=");
    const anatomyCapabilities = extractLine(anatomyQuery.enrichedInput, "anatomy_capabilities=");
    const anatomyLimits = extractLine(anatomyQuery.enrichedInput, "anatomy_limits=");
    const anatomyArtifacts = extractLine(anatomyQuery.enrichedInput, "anatomy_artifacts=");

    assert(anatomyRule, "Expected architecture queries to surface anatomy self-knowledge.");
    assert.match(anatomyDigest, /intentions:active/i);
    assert.match(anatomyDigest, /topic_affinities:active/i);
    assert.match(anatomyDigest, /deep_attractors:active/i);
    assert.match(anatomyDigest, /action_agency:active/i);
    assert.match(anatomyCapabilities, /Open-loop intentions layer:active/i);
    assert.match(anatomyCapabilities, /Deep attractor layer:active/i);
    assert.match(anatomyCapabilities, /Action planner \/ executor:active/i);
    assert.match(anatomyLimits, /durable_continuity:external/i);
    assert.match(anatomyLimits, /external_actuation:bounded_web_research/i);
    assert.match(anatomyLimits, /messaging_actuation:approval_bound/i);
    assert.match(anatomyArtifacts, /open_loops:open-loops\.json/i);
    assert.match(anatomyArtifacts, /deep_attractors:deep_attractors\.json/i);
    assert.match(anatomyArtifacts, /agency_actions:agency_actions\.json/i);

    const wishQuery = await prepareSendContext({
      userText: "What do you wish you had right now inside your own architecture?",
      sessionId: "agent:main:main",
      lightweight: true
    });

    assert(
      extractLine(wishQuery.enrichedInput, "anatomy_rule="),
      "Expected capability-gap questions to surface anatomy self-knowledge."
    );

    const ordinaryQuery = await prepareSendContext({
      userText: "How are you feeling right now?",
      sessionId: "agent:main:main",
      lightweight: true
    });

    assert.equal(
      extractLine(ordinaryQuery.enrichedInput, "anatomy_rule="),
      "",
      "Ordinary conversation should not inject anatomy self-knowledge lines."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          anatomyRule,
          anatomyDigest,
          anatomyCapabilities,
          anatomyLimits,
          anatomyArtifacts
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
