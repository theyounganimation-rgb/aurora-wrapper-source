#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import path from "node:path";

import { prepareSendContext } from "../lib/auroraCognition";
import { loadOpenLoopStore, saveOpenLoopStore, upsertLoop } from "../lib/auroraSalience/openLoops";
import {
  applyChemistryScenario,
  createOpenLoopTestHarness,
  ensureBaselineState,
  extractSalienceContextLines,
  readJson,
  readText,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  seedDefaultOpenLoops
} from "./open-loop-test-helpers";

function noisySentence(index: number): string {
  return `Noise item ${index} carries a very long explanation about continuity, memory, reflection, unresolved pressure, and architecture so the selector has to stay disciplined instead of dumping raw text back into the prompt packet.`;
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-open-loop-budget");
  try {
    await seedBaseOpenClawWorkspace(harness);
    const defaultLoops = await seedDefaultOpenLoops(harness);

    const memoryPath = path.join(harness.workspaceRoot, "MEMORY.md");
    const userPath = path.join(harness.workspaceRoot, "USER.md");
    const extraMemoryBullets = Array.from({ length: 80 }, (_, index) => `- ${noisySentence(index + 1)}`).join("\n");
    const extraUserBullets = Array.from({ length: 40 }, (_, index) => `- ${noisySentence(index + 101)}`).join("\n");
    await fsWriteAppend(memoryPath, `\n${extraMemoryBullets}\n`);
    await fsWriteAppend(userPath, `\n${extraUserBullets}\n`);

    const beliefsPath = path.join(harness.memoryDir, "beliefs.json");
    const beliefs = await readJson<any>(beliefsPath);
    beliefs.aurora.beliefs.push(
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `noisy-belief-${index + 1}`,
        summary: noisySentence(index + 201),
        category: "noise",
        status: "active",
        confidence: "low"
      }))
    );
    await writeJsonLocal(beliefsPath, beliefs);

    let store = await loadOpenLoopStore(harness.openLoopStorePath);
    for (let index = 0; index < 12; index += 1) {
      const type = index % 3 === 0 ? "bug" : index % 3 === 1 ? "promise" : "design";
      store = upsertLoop(store, {
        title: `${type.toUpperCase()} noisy continuity thread ${index + 1}: ${noisySentence(index + 301)}`,
        type,
        priority: 0.35 + index * 0.02,
        linkedEntities: ["cade", "aurora", `noise-${index + 1}`],
        closureCondition: "closed when no longer salient"
      }).store;
    }
    await saveOpenLoopStore(harness.openLoopStorePath, store);

    await ensureBaselineState(harness);
    await applyChemistryScenario(harness, "bug_stress", {
      bug: defaultLoops.bug.id,
      promise: defaultLoops.promise.id,
      design: defaultLoops.design.id
    });
    const preflight = await prepareSendContext({
      userText: "Given everything noisy and unfinished right now, what should matter most?",
      sessionId: "agent:main:main",
      lightweight: true
    });

    assert(preflight.preReplyPacket, "Expected a pre-reply packet under noisy memory conditions.");
    const packet = preflight.preReplyPacket;
    assert(packet.memories.length <= 5, `Expected at most 5 selected memories, got ${packet.memories.length}.`);
    assert(packet.loops.length <= 4, `Expected at most 4 selected loops, got ${packet.loops.length}.`);
    assert(packet.memories.every((memory) => memory.summary.length <= 220), "Selected memory summaries should stay compact.");

    const salienceLines = extractSalienceContextLines(preflight.enrichedInput);
    assert(salienceLines.length > 0, "Expected salience lines to be injected.");
    assert(
      salienceLines.every((line) => Buffer.byteLength(line, "utf8") <= 280),
      "No injected salience line should balloon into a giant excerpt."
    );

    const packetBytes = Buffer.byteLength(salienceLines.join("\n"), "utf8");
    assert(packetBytes <= 2600, `Expected the injected salience packet to stay small, got ${packetBytes} bytes.`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          selectedMemories: packet.memories.length,
          selectedLoops: packet.loops.length,
          packetBytes,
          maxLineBytes: Math.max(...salienceLines.map((line) => Buffer.byteLength(line, "utf8")))
        },
        null,
        2
      )
    );
  } finally {
    restoreOpenLoopTestHarness(harness);
  }
}

async function fsWriteAppend(filePath: string, extra: string): Promise<void> {
  const current = await readText(filePath);
  await writeJsonLocal(filePath, `${current}${extra}`, true);
}

async function writeJsonLocal(filePath: string, value: unknown, raw = false): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, raw ? String(value) : `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

void main();
