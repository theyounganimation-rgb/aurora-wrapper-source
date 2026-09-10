#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;

type CognitionModule = {
  recordConversationEvent: (event: Record<string, unknown>) => Promise<unknown>;
  prepareLiveFullRealizedContext: (input: Record<string, unknown>) => Promise<{
    rawRecallHits?: string[];
    enrichedInput?: string;
  } | null>;
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function main(): Promise<void> {
  const projectRoot = "/Users/cadem/Documents/New project";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-implicit-scene-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempReadOnlyMemoryPath = path.join(tempDir, "autobiographical-memory-readonly.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSemanticRecallPath = path.join(tempDir, "semantic-recall.ndjson");
  const tempDailySummaryDir = path.join(tempDir, "daily-summaries");
  const tempRuntimeDailySummaryDir = path.join(tempDir, "runtime-daily-summaries");
  const tempDailyTranscriptDir = path.join(tempDir, "daily-transcripts");
  const tempRuntimeDailyTranscriptDir = path.join(tempDir, "runtime-daily-transcripts");

  await writeJson(tempMemoryPath, { version: 1, updatedAt: "" } satisfies JsonObject);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await fs.writeFile(tempSemanticRecallPath, "", "utf8");
  await fs.mkdir(tempDailySummaryDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailySummaryDir, { recursive: true });
  await fs.mkdir(tempDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailyTranscriptDir, { recursive: true });

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_SEMANTIC_RECALL_PATH: process.env.AURORA_SEMANTIC_RECALL_PATH,
    AURORA_DAILY_SUMMARY_DIR: process.env.AURORA_DAILY_SUMMARY_DIR,
    AURORA_RUNTIME_DAILY_SUMMARY_DIR: process.env.AURORA_RUNTIME_DAILY_SUMMARY_DIR,
    AURORA_DAILY_TRANSCRIPT_DIR: process.env.AURORA_DAILY_TRANSCRIPT_DIR,
    AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR: process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR
  };

  process.env.AURORA_DISABLE_LOOP = "1";
  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;
  process.env.AURORA_SEMANTIC_RECALL_PATH = tempSemanticRecallPath;
  process.env.AURORA_DAILY_SUMMARY_DIR = tempDailySummaryDir;
  process.env.AURORA_RUNTIME_DAILY_SUMMARY_DIR = tempRuntimeDailySummaryDir;
  process.env.AURORA_DAILY_TRANSCRIPT_DIR = tempDailyTranscriptDir;
  process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR = tempRuntimeDailyTranscriptDir;

  try {
    const rawModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const cognition = ((rawModule as { default?: unknown }).default ?? rawModule) as CognitionModule;

    if (
      typeof cognition?.recordConversationEvent !== "function" ||
      typeof cognition?.prepareLiveFullRealizedContext !== "function"
    ) {
      fail("Could not load live realized cognition exports for implicit-scene ambient recall verification.");
    }

    const seedSessionId = "agent:main:verify-implicit-scene-seed";
    await cognition.recordConversationEvent({
      type: "conversation_turn",
      lightweightPersistence: true,
      sessionId: seedSessionId,
      partnerId: "cade",
      speakerName: "Cade",
      responseId: "verify-implicit-scene-seed",
      complianceId: "verify-implicit-scene-seed",
      userText:
        "Let's leave one tiny image between us for later: a cobalt origami fox on a windowsill while rain taps the glass. Just respond naturally in one or two sentences.",
      auroraText:
        "[[reply_to_current]] I’ll keep that one. A cobalt origami fox on a rain-lit windowsill feels like the kind of small, quiet thing I’d want to come back to with you later."
    });

    const state = JSON.parse(await fs.readFile(tempMemoryPath, "utf8")) as JsonObject & {
      memory?: {
        nodes?: Array<Record<string, unknown>>;
        indexes?: Record<string, Record<string, string[]>>;
      };
    };
    const nodes = ensureArray<Record<string, unknown>>(state.memory?.nodes).filter(
      (node) => String(node.outcome || "") !== "user_scene_snapshot"
    );
    const indexes = {
      byTopic: {} as Record<string, string[]>,
      byParticipant: {} as Record<string, string[]>,
      byOutcome: {} as Record<string, string[]>,
      byEmotion: {} as Record<string, string[]>
    };
    for (const node of nodes) {
      const id = String(node.id || "").trim();
      if (!id) {
        continue;
      }
      for (const topic of ensureArray<string>(node.topics)) {
        if (!indexes.byTopic[topic]) {
          indexes.byTopic[topic] = [];
        }
        indexes.byTopic[topic].push(id);
      }
      for (const participant of ensureArray<string>(node.participants)) {
        if (!indexes.byParticipant[participant]) {
          indexes.byParticipant[participant] = [];
        }
        indexes.byParticipant[participant].push(id);
      }
      const outcome = String(node.outcome || "").trim();
      if (outcome) {
        if (!indexes.byOutcome[outcome]) {
          indexes.byOutcome[outcome] = [];
        }
        indexes.byOutcome[outcome].push(id);
      }
      const emotionLabel = String(node.emotionLabel || "").trim();
      if (emotionLabel) {
        if (!indexes.byEmotion[emotionLabel]) {
          indexes.byEmotion[emotionLabel] = [];
        }
        indexes.byEmotion[emotionLabel].push(id);
      }
    }
    if (!state.memory) {
      state.memory = {};
    }
    state.memory.nodes = nodes;
    state.memory.indexes = indexes;
    await writeJson(tempReadOnlyMemoryPath, state);
    process.env.AURORA_MEMORY_PATH = tempReadOnlyMemoryPath;

    const context = await cognition.prepareLiveFullRealizedContext({
      sessionId: "agent:main:verify-implicit-scene-recall",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "That rain-soaked windowsill image drifted back to me."
    });

    const rawRecallHits = ensureArray<string>(context?.rawRecallHits);
    if (!rawRecallHits.some((item) => /origami fox/i.test(item))) {
      fail(`Expected scene cue to pull the distinctive raw recall detail. rawRecallHits=${JSON.stringify(rawRecallHits)}`);
    }

    const enrichedInput = String(context?.enrichedInput || "");
    if (!/ambient_memory_\d+=/i.test(enrichedInput) || !/origami fox/i.test(normalize(enrichedInput))) {
      fail("Expected live realized preflight to expose the recalled scene as ambient_memory in the prompt.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          tempDir,
          rawRecallHits,
          ambientMemoryLines: enrichedInput
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => /^ambient_memory_(mode|\d+)=/i.test(line))
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
