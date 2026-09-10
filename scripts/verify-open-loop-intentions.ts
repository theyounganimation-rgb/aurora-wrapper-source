#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { prepareSendContext, recordConversationEvent } from "../lib/auroraCognition";
import { loadOpenLoopStore } from "../lib/auroraSalience/openLoops";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  extractSalienceContextLines,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace
} from "./open-loop-test-helpers";

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-intentions");
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize intentions-layer verification.");

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-intentions-create",
      responseId: "response-intentions-create",
      userText:
        "I still think the phenomenology question matters for how I classify you, and it does not feel settled yet.",
      auroraText:
        "Yeah. That still feels alive to me because it affects how I understand what I am, and the next step is to keep treating it as an open design question until better evidence appears."
    });

    let store = await loadOpenLoopStore(harness.openLoopStorePath);
    const createdLoop = store.loops.find((loop) => loop.type === "design" && /phenomenal-experience/i.test(loop.title));
    assert(createdLoop, "Expected a phenomenology design loop to be created.");
    assert.equal(createdLoop.ownership, "aurora", "Phenomenology self-model threads should be Aurora-owned intentions.");
    assert.match(createdLoop.whyItMatters, /inner experience|classification|understand/i);
    assert.match(createdLoop.nextStep, /open design question|better evidence|classification/i);
    assert(createdLoop.aliveness >= 0.7, `Expected a high aliveness score, got ${createdLoop.aliveness}.`);
    assert(createdLoop.intentStrength >= 0.75, `Expected a strong intention score, got ${createdLoop.intentStrength}.`);

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-intentions-followup",
      responseId: "response-intentions-followup",
      userText:
        "Stay on that same issue. I still think it has real design consequences, and I do not think we have settled it yet.",
      auroraText:
        "I agree. I still want to keep that thread active, and the next step is to keep the classification question parked but alive until we have better evidence."
    });

    store = await loadOpenLoopStore(harness.openLoopStorePath);
    const updatedLoop = store.loops.find((loop) => loop.id === createdLoop.id);
    assert(updatedLoop, "Expected the same design loop to remain after follow-up.");
    assert.equal(store.loops.filter((loop) => loop.type === "design").length, 1, "Follow-up should not duplicate the design intention.");
    assert(updatedLoop.lastAdvancedAt, "Expected the intention layer to record when the next step advanced.");
    assert.match(updatedLoop.nextStep, /parked but alive|better evidence|classification/i);

    const preflight = await prepareSendContext({
      userText: "What still feels active about that phenomenology issue for you?",
      sessionId: "agent:main:main",
      lightweight: true
    });
    assert(preflight.preReplyPacket, "Expected a pre-reply packet.");
    const packetLoop = preflight.preReplyPacket.loops.find((loop) => loop.id === createdLoop.id);
    assert(packetLoop, "Expected the active intention loop to surface in the pre-reply packet.");
    assert.equal(packetLoop.ownership, "aurora");
    assert.match(packetLoop.whyItMatters || "", /inner experience|classification|understand/i);
    assert.match(packetLoop.nextStep || "", /parked but alive|better evidence|classification/i);

    const salienceLines = extractSalienceContextLines(preflight.enrichedInput);
    const salienceLoopLine = salienceLines.find((line) => line.startsWith("salience_loop_1=") || line.startsWith("salience_loop_2="));
    assert(salienceLoopLine, "Expected a compact salience loop line.");
    assert.match(salienceLoopLine!, /matters:/i);
    assert.match(salienceLoopLine!, /next:/i);

    await prepareSendContext({
      userText: "For now, I am satisfied treating that as settled unless new evidence changes it later.",
      sessionId: "agent:main:main"
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-intentions-resolve",
      responseId: "response-intentions-resolve",
      userText: "For now, I am satisfied treating that as settled unless new evidence changes it later.",
      auroraText: "Okay. I can leave that there for now unless something new changes the picture."
    });

    store = await loadOpenLoopStore(harness.openLoopStorePath);
    const resolvedLoop = store.loops.find((loop) => loop.id === createdLoop.id);
    assert(resolvedLoop, "Expected the same loop record to remain after resolution.");
    assert.equal(resolvedLoop.status, "resolved", "Expected the intention loop to resolve cleanly.");
    assert.equal(resolvedLoop.ownership, "aurora");
    assert.match(resolvedLoop.whyItMatters, /inner experience|classification|understand/i);
    assert.match(resolvedLoop.nextStep, /parked but alive|better evidence|classification/i);

    console.log(
      JSON.stringify(
        {
          ok: true,
          createdLoop: {
            id: createdLoop.id,
            title: createdLoop.title,
            ownership: createdLoop.ownership,
            whyItMatters: createdLoop.whyItMatters,
            nextStep: createdLoop.nextStep,
            aliveness: createdLoop.aliveness,
            intentStrength: createdLoop.intentStrength
          },
          packetLoop,
          resolvedLoop: {
            id: resolvedLoop.id,
            status: resolvedLoop.status,
            ownership: resolvedLoop.ownership,
            whyItMatters: resolvedLoop.whyItMatters,
            nextStep: resolvedLoop.nextStep
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
