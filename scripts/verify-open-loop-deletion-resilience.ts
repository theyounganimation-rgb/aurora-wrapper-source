#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

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

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-mindless");
  try {
    await seedBaseOpenClawWorkspace(harness, { includeMind: true });
    const loops = await seedDefaultOpenLoops(harness);
    await ensureBaselineState(harness);
    const baselineState = await readState(harness);
    const userText = "What should matter most right now?";

    await writeState(harness, baselineState);
    await applyChemistryScenario(harness, "design_curiosity", {
      bug: loops.bug.id,
      promise: loops.promise.id,
      design: loops.design.id
    });
    const withMind = await prepareSendContext({
      userText,
      sessionId: "agent:main:main",
      lightweight: true
    });
    assert(withMind.preReplyPacket, "Expected packet generation to work with MIND.md present.");

    await fs.unlink(path.join(harness.workspaceRoot, "MIND.md"));
    await writeState(harness, baselineState);
    await applyChemistryScenario(harness, "design_curiosity", {
      bug: loops.bug.id,
      promise: loops.promise.id,
      design: loops.design.id
    });
    const withoutMind = await prepareSendContext({
      userText,
      sessionId: "agent:main:main",
      lightweight: true
    });
    assert(withoutMind.preReplyPacket, "Expected packet generation to keep working after deleting MIND.md.");

    const withMindPacket = withMind.preReplyPacket;
    const withoutMindPacket = withoutMind.preReplyPacket;
    assert.deepEqual(
      withMindPacket.memories.map((memory) => memory.id),
      withoutMindPacket.memories.map((memory) => memory.id),
      "Deleting MIND.md should not change which memories are selected."
    );
    assert.deepEqual(
      withMindPacket.loops.map((loop) => loop.id),
      withoutMindPacket.loops.map((loop) => loop.id),
      "Deleting MIND.md should not change which open loops are selected."
    );
    assert.equal(
      inferPacketPriorityProfile(withMindPacket),
      inferPacketPriorityProfile(withoutMindPacket),
      "Deleting MIND.md should not change the reply-priority orientation."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          withMindProfile: inferPacketPriorityProfile(withMindPacket),
          withoutMindProfile: inferPacketPriorityProfile(withoutMindPacket),
          selectedMemoryIds: withMindPacket.memories.map((memory) => memory.id),
          selectedLoopIds: withMindPacket.loops.map((loop) => loop.id)
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
