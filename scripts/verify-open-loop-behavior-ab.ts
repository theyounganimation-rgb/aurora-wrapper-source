#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { prepareSendContext } from "../lib/auroraCognition";
import {
  applyChemistryScenario,
  createOpenLoopTestHarness,
  ensureBaselineState,
  inferPacketPriorityProfile,
  readState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  seedDefaultOpenLoops,
  writeState
} from "./open-loop-test-helpers";

type ScenarioName = "bug_stress" | "promise_attachment" | "design_curiosity";

function includesKeyword(packetText: string[], keywords: RegExp): boolean {
  return packetText.some((text) => keywords.test(text));
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-ab");
  try {
    await seedBaseOpenClawWorkspace(harness);
    const loops = await seedDefaultOpenLoops(harness);
    await ensureBaselineState(harness);
    const baselineState = await readState(harness);
    const userText = "What should we prioritize next?";

    const scenarioOrder: ScenarioName[] = ["bug_stress", "promise_attachment", "design_curiosity"];
    const results: Record<
      ScenarioName,
      {
        profile: ReturnType<typeof inferPacketPriorityProfile>;
        topLoopType: string | null;
        memoryIds: string[];
        loopIds: string[];
        memorySummaries: string[];
      }
    > = {
      bug_stress: {
        profile: "mixed",
        topLoopType: null,
        memoryIds: [],
        loopIds: [],
        memorySummaries: []
      },
      promise_attachment: {
        profile: "mixed",
        topLoopType: null,
        memoryIds: [],
        loopIds: [],
        memorySummaries: []
      },
      design_curiosity: {
        profile: "mixed",
        topLoopType: null,
        memoryIds: [],
        loopIds: [],
        memorySummaries: []
      }
    };

    for (const scenario of scenarioOrder) {
      await writeState(harness, baselineState);
      await applyChemistryScenario(harness, scenario, {
        bug: loops.bug.id,
        promise: loops.promise.id,
        design: loops.design.id
      });

      const preflight = await prepareSendContext({
        userText,
        sessionId: "agent:main:main",
        lightweight: true
      });

      assert(preflight.preReplyPacket, `Expected a pre-reply packet for ${scenario}.`);
      const packet = preflight.preReplyPacket;
      results[scenario] = {
        profile: inferPacketPriorityProfile(packet),
        topLoopType: packet.loops[0]?.type ?? null,
        memoryIds: packet.memories.map((memory) => memory.id),
        loopIds: packet.loops.map((loop) => loop.id),
        memorySummaries: packet.memories.map((memory) => memory.summary)
      };
    }

    assert.equal(results.bug_stress.topLoopType, "bug", "Bug/stress condition should surface the bug loop first.");
    assert.equal(
      results.promise_attachment.topLoopType,
      "promise",
      "Promise/attachment condition should surface the promise loop first."
    );
    assert.equal(
      results.design_curiosity.topLoopType,
      "design",
      "Design/curiosity condition should surface the design loop first."
    );

    assert.equal(
      results.bug_stress.profile,
      "fix_oriented",
      "Bug/stress should bias the packet toward a fix-oriented priority profile."
    );
    assert.equal(
      results.promise_attachment.profile,
      "followthrough_oriented",
      "Promise/attachment should bias the packet toward follow-through."
    );
    assert.equal(
      results.design_curiosity.profile,
      "exploration_oriented",
      "Design/curiosity should bias the packet toward exploration."
    );

    assert(
      includesKeyword(results.bug_stress.memorySummaries, /\b(compaction|runaway token|runtime problem)\b/i),
      "Bug/stress should pull in compaction/failure memory."
    );
    assert(
      includesKeyword(results.promise_attachment.memorySummaries, /\b(follow through|Cade|continuity)\b/i),
      "Promise/attachment should pull in follow-through or Cade-linked memory."
    );
    assert(
      includesKeyword(results.design_curiosity.memorySummaries, /\b(reply selection|salience|architecture)\b/i),
      "Design/curiosity should pull in architecture/design memory."
    );

    assert.notDeepEqual(
      results.bug_stress.memoryIds,
      results.promise_attachment.memoryIds,
      "Bug/stress and promise/attachment should not surface the same memory packet."
    );
    assert.notDeepEqual(
      results.promise_attachment.memoryIds,
      results.design_curiosity.memoryIds,
      "Promise/attachment and design/curiosity should not surface the same memory packet."
    );
    assert.notDeepEqual(
      results.bug_stress.loopIds,
      results.design_curiosity.loopIds,
      "Bug/stress and design/curiosity should not surface the same loop ordering."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          userText,
          scenarios: results
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
