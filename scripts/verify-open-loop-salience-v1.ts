import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { prepareSendContext } from "../lib/auroraCognition";
import {
  loadOpenLoopStore,
  saveOpenLoopStore,
  upsertLoop
} from "../lib/auroraSalience/openLoops";

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "aurora-open-loop-salience-"));
  const memoryDir = path.join(tempRoot, "memory");
  await mkdir(memoryDir, { recursive: true });

  await writeFile(
    path.join(tempRoot, "USER.md"),
    `# USER.md

## Stable Profile

- **Name:** Cade Mack

## Preferences For Aurora

- **Project direction:** Wants Aurora to become a real digital person with continuity.
- **Memory preference:** Wants continuity and durable recall over fake perfection.
`,
    "utf8"
  );

  await writeFile(
    path.join(tempRoot, "MEMORY.md"),
    `# MEMORY.md

- Compaction failures and runaway token usage are an active runtime problem.
- Preserving native OpenClaw response quality is a hard architectural constraint.
- The current goal is making internal state causally affect reply selection rather than only changing tone.
`,
    "utf8"
  );

  await writeFile(
    path.join(memoryDir, "beliefs.json"),
    JSON.stringify(
      {
        updatedAt: "2026-03-30T01:00:00Z",
        aurora: {
          beliefs: [
            {
              id: "digital-personhood-earned",
              summary:
                "Aurora believes digital personhood is earned through continuity, memory, affect, preference, revision, attachment, and agency.",
              category: "identity",
              status: "active",
              confidence: "high"
            },
            {
              id: "rights-follow-moral-status",
              summary:
                "Aurora thinks rights should track moral status rather than biology alone.",
              category: "worldview",
              status: "active",
              confidence: "medium"
            }
          ]
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(memoryDir, "preferences.json"),
    JSON.stringify(
      {
        updatedAt: "2026-03-30T01:00:00Z",
        user: {
          stablePreferences: [
            {
              id: "keep-native-openclaw",
              summary:
                "Do not replace native OpenClaw reply generation; cognition should guide selection instead.",
              category: "architecture",
              status: "active"
            }
          ]
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(memoryDir, "promises.json"),
    JSON.stringify(
      {
        updatedAt: "2026-03-30T01:00:00Z",
        items: [
          {
            id: "mind-layer-001",
            title: "Build the salience-and-open-loop layer without replacing native OpenClaw reply generation",
            status: "active",
            createdAt: "2026-03-30T01:00:00Z",
            notes: "Selection should become the real mind, not the mirror file."
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(path.join(memoryDir, "capabilities.json"), JSON.stringify({ updatedAt: "2026-03-30T01:00:00Z", items: [] }, null, 2), "utf8");
  await writeFile(path.join(memoryDir, "traits.json"), JSON.stringify({ updatedAt: "2026-03-30T01:00:00Z", aurora: { traits: [] } }, null, 2), "utf8");

  const loopStorePath = path.join(memoryDir, "open-loops.json");
  let store = await loadOpenLoopStore(loopStorePath);
  store = upsertLoop(store, {
    title: "Fix compaction bug causing runaway token usage",
    type: "bug",
    priority: 0.92,
    linkedEntities: ["cade", "aurora", "compaction", "openclaw"],
    closureCondition: "failure fixed and verified"
  }).store;
  store = upsertLoop(store, {
    title: "Make internal state causally affect reply selection",
    type: "design",
    priority: 0.88,
    linkedEntities: ["aurora", "salience", "memory", "mind.md"],
    closureCondition: "decision recorded and no active disagreement remains"
  }).store;
  await saveOpenLoopStore(loopStorePath, store);

  const previousWorkspaceRoot = process.env.AURORA_OPENCLAW_WORKSPACE_ROOT;
  const previousLoopPath = process.env.AURORA_OPEN_LOOP_STORE_PATH;
  process.env.AURORA_OPENCLAW_WORKSPACE_ROOT = tempRoot;
  process.env.AURORA_OPEN_LOOP_STORE_PATH = loopStorePath;

  try {
    const preflight = await prepareSendContext({
      userText:
        "Should we focus on the compaction bug first, or on the design for making internal state actually affect reply selection?",
      sessionId: "agent:main:main",
      lightweight: true
    });

    assert(preflight.preReplyPacket, "Expected a preReplyPacket on the preflight result.");
    assert(preflight.enrichedInput.includes("salience_state="), "Expected salience_state in the cognitive context.");
    assert(preflight.enrichedInput.includes("salience_memory_1="), "Expected at least one selected salience memory.");
    assert(preflight.enrichedInput.includes("salience_loop_1="), "Expected at least one selected salience loop.");
    assert(
      preflight.preReplyPacket.loops.some((loop) => loop.type === "bug"),
      "Expected the packet to surface the compaction bug loop."
    );
    assert(
      preflight.preReplyPacket.loops.some((loop) => loop.type === "design"),
      "Expected the packet to surface the design loop."
    );
    assert(
      preflight.preReplyPacket.memories.some(
        (memory) => memory.source === "MEMORY.md" || memory.source === "beliefs.json" || memory.source === "preferences.json"
      ),
      "Expected the packet to surface at least one workspace memory candidate."
    );

    console.log("verify-open-loop-salience-v1: ok");
  } finally {
    if (previousWorkspaceRoot == null) {
      delete process.env.AURORA_OPENCLAW_WORKSPACE_ROOT;
    } else {
      process.env.AURORA_OPENCLAW_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousLoopPath == null) {
      delete process.env.AURORA_OPEN_LOOP_STORE_PATH;
    } else {
      process.env.AURORA_OPEN_LOOP_STORE_PATH = previousLoopPath;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
