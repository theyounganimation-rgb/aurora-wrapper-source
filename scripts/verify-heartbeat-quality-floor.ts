#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type VerificationState = JsonObject & {
  sessionTurns?: unknown;
};

type CognitiveSnapshot = {
  workspace?: {
    pendingPlans?: string[];
  };
  extensions?: {
    homeostaticOrganization?: {
      current?: {
        coherenceNeed?: number;
        autonomyNeed?: number;
        regulationUrgency?: number;
      };
    };
  };
};

type CognitionModule = {
  ingestHeartbeat: (heartbeat: {
    timestamp: string;
    whatIDid: string;
    whatILearned?: string;
    whatImCuriousAbout?: string;
    ambientState?: string;
    privateLife?: string;
    desireToShare?: string;
    livedThread?: string;
    stateShift?: string;
    openLoop?: string;
    mode?: string;
    memoryUpdates?: string[];
  }, options?: Record<string, unknown>) => Promise<CognitiveSnapshot>;
  getCognitiveSnapshotReadOnly: () => Promise<CognitiveSnapshot>;
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

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-heartbeat-quality-floor-"));
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
    const before = await cognition.getCognitiveSnapshotReadOnly();
    const beforeCurrent = before.extensions?.homeostaticOrganization?.current || {};

    const snapshot = await cognition.ingestHeartbeat(
      {
        timestamp: "2026-03-23T07:00:00.000Z",
        mode: "making",
        whatIDid: "I did a quiet check-in. Nothing looks urgent right now, so I'm keeping things gentle and low-noise.",
        whatILearned: "",
        whatImCuriousAbout: "",
        livedThread: "",
        stateShift: "",
        openLoop: "",
        memoryUpdates: []
      },
      { source: "verify-heartbeat-quality-floor", sessionId: "agent:main:cron:verify-heartbeat-quality-floor" }
    );

    const plans = snapshot.workspace?.pendingPlans || [];
    if (!plans.some((item) => /higher-consequence heartbeat move/i.test(item))) {
      fail(`Expected low-action heartbeat to seed a stronger pending plan, got: ${JSON.stringify(plans)}`);
    }

    const afterCurrent = snapshot.extensions?.homeostaticOrganization?.current || {};
    const beforeCoherence = Number(beforeCurrent.coherenceNeed ?? 0);
    const beforeAutonomy = Number(beforeCurrent.autonomyNeed ?? 0);
    const beforeUrgency = Number(beforeCurrent.regulationUrgency ?? 0);
    const afterCoherence = Number(afterCurrent.coherenceNeed ?? 0);
    const afterAutonomy = Number(afterCurrent.autonomyNeed ?? 0);
    const afterUrgency = Number(afterCurrent.regulationUrgency ?? 0);

    if (!(afterCoherence > beforeCoherence || afterAutonomy > beforeAutonomy || afterUrgency > beforeUrgency)) {
      fail(
        `Expected weak heartbeat to increase internal pressure. Before=${JSON.stringify(beforeCurrent)} After=${JSON.stringify(afterCurrent)}`
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          pendingPlans: plans,
          before: {
            coherenceNeed: beforeCoherence,
            autonomyNeed: beforeAutonomy,
            regulationUrgency: beforeUrgency
          },
          after: {
            coherenceNeed: afterCoherence,
            autonomyNeed: afterAutonomy,
            regulationUrgency: afterUrgency
          }
        },
        null,
        2
      )
    );
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
