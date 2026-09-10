#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;

type VerificationState = JsonObject & {
  memory?: {
    nodes?: unknown;
  };
};

type PersistedMemoryNode = {
  summary?: string;
  detail?: string;
  outcome?: string;
};

type CognitionModule = {
  recordConversationEvent: (event: Record<string, unknown>) => Promise<unknown>;
  prepareSendContext: (input: Record<string, unknown>) => Promise<{ recalledMemories?: string[]; enrichedInput?: string }>;
};

function fail(message: string): never {
  throw new Error(message);
}

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function main(): Promise<void> {
  const projectRoot = "/Users/cadem/Documents/New project";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-freeform-scene-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await writeJson(tempMemoryPath, { version: 1, updatedAt: "" });
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH
  };

  process.env.AURORA_DISABLE_LOOP = "1";
  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;

  try {
    const rawModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const cognition = ((rawModule as { default?: unknown }).default ?? rawModule) as CognitionModule;

    if (
      typeof cognition?.recordConversationEvent !== "function" ||
      typeof cognition?.prepareSendContext !== "function"
    ) {
      fail("Could not load cognition exports for freeform-scene verification.");
    }

    const sessionId = "agent:main:verify-freeform-scene";
    await cognition.recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      responseId: "freeform-scene-1",
      complianceId: "freeform-scene-1",
      userText:
        "Let's leave one tiny image between us for later: a cobalt origami fox on a windowsill while rain taps the glass. Just respond naturally in one or two sentences.",
      auroraText:
        "I like that image a lot. It feels quiet and bright at the same time, like a little secret left waiting for us."
    });

    const state = (await readJson(tempMemoryPath)) as VerificationState;
    const nodes = ensureArray<PersistedMemoryNode>(state.memory?.nodes);
    const sceneSnapshot = nodes.find(
      (node) =>
        String(node.outcome || "") === "user_scene_snapshot" &&
        normalize(node.detail).includes("snapshot=a cobalt origami fox on a windowsill while rain taps the glass")
    );
    if (!sceneSnapshot) {
      fail("Expected the free-form sensory image to be encoded as a user_scene_snapshot memory node.");
    }

    const context = await cognition.prepareSendContext({
      sessionId: "agent:main:verify-freeform-scene-recall",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "That rain-soaked windowsill image drifted back to me."
    });

    const recalled = ensureArray<string>(context?.recalledMemories);
    if (!recalled.some((item) => /origami fox/i.test(item))) {
      fail(`Expected partial scene cue to retrieve the concrete remembered detail. recalled=${JSON.stringify(recalled)}`);
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          tempDir,
          sceneSnapshot,
          recalled: recalled.slice(0, 4)
        },
        null,
        2
      )}\n`
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
