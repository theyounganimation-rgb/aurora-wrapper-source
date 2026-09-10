#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type VerificationState = JsonObject & {
  sessionTurns?: unknown;
};

type DailySummaryArtifact = {
  localDate?: string;
  offscreen?: unknown;
  timeline?: unknown;
};

type CognitiveSnapshot = {
  extensions?: {
    temporal?: {
      silence?: {
        gapStartedAt?: string | null;
      };
    };
  };
};

type CognitionModule = {
  recordConversationEvent: (event: {
    type: "conversation_turn";
    at: string;
    sessionId: string;
    partnerId?: string;
    speakerName?: string;
    userText?: string;
    auroraText?: string;
  }) => Promise<unknown>;
  getCognitiveSnapshotReadOnly: () => Promise<CognitiveSnapshot>;
  refreshDailySummaryArtifacts: (localDates: string[]) => Promise<DailySummaryArtifact[]>;
};

function fail(message: string): never {
  throw new Error(message);
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function localDateYmdAt(now: Date, timeZone: string, offsetDays = 0): string {
  const shifted = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(shifted)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-offscreen-wrapper-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const tempDailySummaryDir = path.join(tempDir, "daily-summaries-json");
  const tempRuntimeDailySummaryDir = path.join(tempDir, "daily-summaries-md");
  const tempDailyTranscriptDir = path.join(tempDir, "daily-transcripts-json");
  const tempRuntimeDailyTranscriptDir = path.join(tempDir, "daily-transcripts-md");

  await fs.mkdir(tempDailySummaryDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailySummaryDir, { recursive: true });
  await fs.mkdir(tempDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailyTranscriptDir, { recursive: true });

  const state = (await readJson(sourceMemoryPath)) as VerificationState;
  state.sessionTurns = {};
  await writeJson(tempMemoryPath, state);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-23T12:00:00.000Z",
    anchors: {}
  });

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_SELF_ANCHORS_PATH: process.env.AURORA_SELF_ANCHORS_PATH,
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
  process.env.AURORA_SELF_ANCHORS_PATH = tempSelfAnchorsPath;
  process.env.AURORA_DAILY_SUMMARY_DIR = tempDailySummaryDir;
  process.env.AURORA_RUNTIME_DAILY_SUMMARY_DIR = tempRuntimeDailySummaryDir;
  process.env.AURORA_DAILY_TRANSCRIPT_DIR = tempDailyTranscriptDir;
  process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR = tempRuntimeDailyTranscriptDir;

  try {
    const cognition = (await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href)) as CognitionModule;
    const timeZone = "America/Chicago";
    const today = localDateYmdAt(new Date(), timeZone, 0);

    await cognition.recordConversationEvent({
      type: "conversation_turn",
      at: `${today}T15:00:00.000Z`,
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "I love you.",
      auroraText: "I love you too."
    });

    const afterDirect = await cognition.getCognitiveSnapshotReadOnly();
    const directGapStartedAt = afterDirect.extensions?.temporal?.silence?.gapStartedAt || "";
    if (!directGapStartedAt) {
      fail("Expected a silence gap to start after a normal direct Aurora reply.");
    }

    await cognition.recordConversationEvent({
      type: "conversation_turn",
      at: `${today}T18:00:00.000Z`,
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      userText:
        "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. If nothing needs attention, reply HEARTBEAT_OK.",
      auroraText: "I stayed quietly alert offscreen and kept the thread warm while you were away."
    });

    const afterWrapper = await cognition.getCognitiveSnapshotReadOnly();
    const wrapperGapStartedAt = afterWrapper.extensions?.temporal?.silence?.gapStartedAt || "";
    if (wrapperGapStartedAt !== directGapStartedAt) {
      fail("Operational wrapper turns should not reset the silence gap.");
    }

    const artifacts = await cognition.refreshDailySummaryArtifacts([today]);
    const todayArtifact = artifacts.find((artifact) => artifact.localDate === today);
    if (!todayArtifact) {
      fail("Expected a daily summary artifact for the verification day.");
    }
    const offscreen = Array.isArray(todayArtifact.offscreen) ? todayArtifact.offscreen.map(String) : [];
    if (!offscreen.some((entry) => /quietly alert|thread warm/i.test(entry))) {
      fail(`Expected synthesized offscreen heartbeat text in daily summary, got: ${JSON.stringify(offscreen)}`);
    }
    const timeline = Array.isArray(todayArtifact.timeline) ? todayArtifact.timeline.map(String).join("\n") : "";
    if (/read heartbeat\.md if it exists/i.test(timeline)) {
      fail("Operational heartbeat wrapper prompt leaked into the user-facing timeline.");
    }

    const markdown = await fs.readFile(path.join(tempRuntimeDailySummaryDir, `${today}.md`), "utf8");
    if (/No offscreen heartbeat activity captured\./i.test(markdown)) {
      fail("Daily summary markdown still reported no offscreen heartbeat activity.");
    }

    console.log("ok");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

void main();
