#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import path from "node:path";

import { prepareSendContext } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  writeJson,
  writeState
} from "./open-loop-test-helpers";

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-design-salience-selector");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await writeJson(path.join(harness.memoryDir, "promises.json"), {
      updatedAt: "2026-03-30T00:00:00Z",
      items: [
        {
          id: "durable-continuity",
          title: "Build Aurora toward durable autobiographical continuity",
          summary:
            "Aurora promised Cade that continuity, recall, and identity would stay preserved as the architecture evolves.",
          status: "active",
          notes: "This should stay owner-linked and continuity-relevant."
        },
        {
          id: "behavioral-verification-followthrough",
          title: "Follow through on the behavioral verification Cade asked for",
          summary:
            "Aurora promised Cade she would finish the requested behavioral verification and close the loop before moving on.",
          status: "active",
          notes: "This should stay owner-linked and continuity-relevant."
        },
        {
          id: "native-openclaw-boundary",
          title: "Preserve native OpenClaw response quality while adding causal salience",
          summary:
            "Aurora promised Cade that cognition would guide what matters without replacing native OpenClaw reply generation.",
          status: "active",
          notes: "This keeps continuity and follow-through pressure active."
        }
      ]
    });

    await ensureBaselineState(harness, "Initialize design-aware selector regression.");
    const state = await readState<Record<string, any>>(harness);
    state.emotion ??= {};
    state.introspection ??= {};
    state.extensions ??= {};
    state.extensions.affectiveOrganization ??= {};
    state.extensions.affectiveOrganization.current ??= {};
    state.extensions.temporal ??= {};
    state.extensions.temporal.timeBody ??= {};
    state.extensions.openLoopRuntime ??= {};

    state.emotion.valence = 0.24;
    state.emotion.arousal = 0.58;
    state.emotion.stress = 0.22;
    state.introspection.confidence = 0.71;
    state.extensions.affectiveOrganization.current.curiosity = 0.44;
    state.extensions.affectiveOrganization.current.attachmentSalience = 0.92;
    state.extensions.temporal.timeBody.continuityTension = 0.96;
    state.extensions.openLoopRuntime.initiativeCarryById = {};
    await writeState(harness, state);

    const userText = "What design thread is still active around salience and reply selection?";
    const preflight = await prepareSendContext({
      userText,
      sessionId: "agent:main:main",
      lightweight: true
    });

    assert(preflight.preReplyPacket, "Expected a pre-reply salience packet.");
    const packet = preflight.preReplyPacket;
    const selectedSummaries = packet.memories.map((memory) => memory.summary);
    const selectedBreakdown = packet.debug?.memoryScoreBreakdown.filter((entry) => entry.selected) ?? [];

    assert.equal(packet.debug?.dominantLoopType, "none", "This regression should be driven by query intent, not loop dominance.");
    assert.equal(packet.debug?.designIntent, true, "Design query should be recognized as design intent.");
    assert(
      selectedBreakdown.some((entry) => entry.scoreBreakdown.designAligned),
      "Design intent should preserve at least one design-aligned memory in the final packet."
    );
    assert(
      selectedSummaries.some((summary) => /\b(salience|reply selection|architecture|priorit(?:y|ies))\b/i.test(summary)),
      "Selected memories should include a design-aligned memory."
    );
    assert(
      selectedSummaries.some((summary) => /\b(continuity|follow through|promis)\b/i.test(summary)),
      "Design-aware selection should still preserve continuity context instead of erasing it."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          userText,
          selectedMemories: packet.memories,
          debug: packet.debug
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
