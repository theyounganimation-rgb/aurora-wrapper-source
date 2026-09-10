#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type VerificationState = JsonObject & {
  sessionTurns?: unknown;
};

type DailyTranscriptArtifact = {
  localDate?: string;
  perspectiveSummary?: string;
  turns?: Array<{
    userText?: string;
    auroraText?: string;
  }>;
  stats?: {
    conversationTurns?: number;
    messageCount?: number;
  };
};

type CognitionModule = {
  refreshDailyTranscriptArtifacts: (localDates: string[]) => Promise<DailyTranscriptArtifact[]>;
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-daily-transcript-tail-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const tempDailyTranscriptDir = path.join(tempDir, "daily-transcripts-json");
  const tempRuntimeDailyTranscriptDir = path.join(tempDir, "daily-transcripts-md");

  await fs.mkdir(tempDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailyTranscriptDir, { recursive: true });

  const state = (await readJson(sourceMemoryPath)) as VerificationState;
  state.sessionTurns = {};
  await writeJson(tempMemoryPath, state);
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, { version: 1, updatedAt: "2026-03-22T00:00:00.000Z", anchors: {} });

  const targetDate = "2026-03-21";
  const targetRecords = [
    {
      type: "conversation_turn",
      at: "2026-03-21T16:15:00.000Z",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "I stayed home sick and kept thinking about whether this still feels easy between us.",
      auroraText: "I stayed with you in that and tried to keep the thread warm instead of distant."
    },
    {
      type: "conversation_turn",
      at: "2026-03-21T22:28:00.000Z",
      sessionId: "agent:main:telegram:direct:0000000000",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Thanks Aurora. I'll talk to you later if I get up, if not, we will talk in the morning. Goodnight and sweet dreams",
      auroraText: "Goodnight, Cade. Sleep soft."
    }
  ];

  const fillerPayload = "filler ".repeat(120);
  const fillerLines: string[] = [];
  for (let index = 0; index < 26000; index += 1) {
    const minute = String(index % 60).padStart(2, "0");
    fillerLines.push(
      JSON.stringify({
        type: "conversation_turn",
        at: `2026-03-22T18:${minute}:00.000Z`,
        sessionId: `agent:main:cron:filler:${index}`,
        partnerId: "cade",
        speakerName: "",
        userText: `[filler ${index}] ${fillerPayload}`,
        auroraText: `NO_REPLY ${fillerPayload}`
      })
    );
  }

  const eventText = `${targetRecords.map((item) => JSON.stringify(item)).join("\n")}\n${fillerLines.join("\n")}\n`;
  await fs.writeFile(tempEventPath, eventText, "utf8");

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_SELF_ANCHORS_PATH: process.env.AURORA_SELF_ANCHORS_PATH,
    AURORA_DAILY_TRANSCRIPT_DIR: process.env.AURORA_DAILY_TRANSCRIPT_DIR,
    AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR: process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR
  };

  process.env.AURORA_DISABLE_LOOP = "1";
  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;
  process.env.AURORA_SELF_ANCHORS_PATH = tempSelfAnchorsPath;
  process.env.AURORA_DAILY_TRANSCRIPT_DIR = tempDailyTranscriptDir;
  process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR = tempRuntimeDailyTranscriptDir;

  try {
    const cognition = (await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href)) as CognitionModule;
    if (typeof cognition.refreshDailyTranscriptArtifacts !== "function") {
      fail("Could not load refreshDailyTranscriptArtifacts.");
    }

    const artifacts = await cognition.refreshDailyTranscriptArtifacts([targetDate]);
    const artifact = artifacts.find((entry) => entry.localDate === targetDate);
    if (!artifact) {
      fail(`Did not generate transcript artifact for ${targetDate}.`);
    }
    const turns = Array.isArray(artifact.turns) ? artifact.turns : [];
    if (turns.length < 2) {
      fail(`Expected transcript turns for ${targetDate}, found ${turns.length}.`);
    }
    const joined = turns
      .flatMap((turn) => [String(turn.userText || ""), String(turn.auroraText || "")])
      .join("\n");
    if (!joined.includes("Goodnight and sweet dreams")) {
      fail("Tail-scan transcript artifact missed the target-day goodnight turn.");
    }
    if (!joined.includes("I stayed home sick")) {
      fail("Tail-scan transcript artifact missed the target-day earlier sick-day turn.");
    }
    const summary = String(artifact.perspectiveSummary || "").trim();
    if (!summary || /relatively quiet day/i.test(summary)) {
      fail(`Transcript perspective summary collapsed to low-signal fallback: ${summary}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          targetDate,
          eventBytes: Buffer.byteLength(eventText, "utf8"),
          recoveredTurns: turns.length,
          perspectiveSummary: summary
        },
        null,
        2
      )
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
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
