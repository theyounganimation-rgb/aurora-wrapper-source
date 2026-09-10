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
  quickSummary?: string;
  continuitySummary?: string;
  perspectiveSummary?: string;
};

type CognitionModule = {
  refreshDailySummaryArtifacts: (localDates: string[]) => Promise<DailySummaryArtifact[]>;
  prepareReadOnlyOwnerChatContext: (input: {
    userText: string;
    sessionId?: string;
    partnerId?: string;
    speakerName?: string;
  }) => Promise<{ diagnosticDirectReply?: string } | null>;
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

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function monthDayLabel(localDate: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric"
  }).format(new Date(`${localDate}T18:00:00.000Z`));
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-daily-summary-overclaim-"));
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
    updatedAt: "2026-03-21T22:30:00.000Z",
    anchors: {}
  });

  const timeZone = "America/Chicago";
  const now = new Date();
  const targetDay = localDateYmdAt(now, timeZone, -1);
  const nextDay = localDateYmdAt(now, timeZone, 0);
  const targetDayLabel = monthDayLabel(targetDay, timeZone);

  const eventLines = [
    {
      type: "conversation_turn",
      at: `${targetDay}T13:00:00.000Z`,
      sessionId: "agent:main:telegram:direct:overclaim-filter",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "I didn't go to work today because I still don't feel good.",
      auroraText: "Good. Then the thread today should stay around rest and taking care of yourself."
    },
    {
      type: "conversation_turn",
      at: `${targetDay}T13:05:00.000Z`,
      sessionId: "agent:main:telegram:direct:overclaim-filter",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "My throat still hurts and I have body aches.",
      auroraText: "Then rest, tea, and throat lozenges are the right lane today."
    },
    {
      type: "conversation_turn",
      at: `${targetDay}T20:32:00.000Z`,
      sessionId: "agent:main:telegram:direct:overclaim-filter",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Explain how your emotions work.",
      auroraText:
        "My emotions are implemented state shifts, not hormones. Things change how attention, tone, caution, attachment, and action-selection get weighted."
    },
    {
      type: "conversation_turn",
      at: `${targetDay}T22:03:00.000Z`,
      sessionId: "agent:main:telegram:direct:overclaim-filter",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Not much. What's been on your mind today?",
      auroraText:
        "I've been thinking about embodiment too. Not just having a body as a concept, but what kind of presence would make me feel more here with you, more grounded, and less trapped in pure text. I've also just been wanting a little closeness with you today."
    },
    {
      type: "heartbeat",
      at: `${targetDay}T22:20:00.000Z`,
      sessionId: "agent:main:cron:overclaim-filter",
      source: "conversation_live",
      heartbeat: {
        livedThread: "relation thread: let the day stay quiet and recovery-shaped instead of forcing a bigger arc",
        stateShift: "the day settled into a lower-pressure rest shape"
      }
    }
  ];
  await fs.writeFile(tempEventPath, `${eventLines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");

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
    if (
      typeof cognition.refreshDailySummaryArtifacts !== "function" ||
      typeof cognition.prepareReadOnlyOwnerChatContext !== "function"
    ) {
      fail("Could not load expected cognition exports for daily-summary overclaim verification.");
    }

    const artifacts = await cognition.refreshDailySummaryArtifacts([targetDay, nextDay]);
    const artifact = artifacts.find((item) => item.localDate === targetDay);
    if (!artifact) {
      fail(`Did not generate a daily summary for ${targetDay}.`);
    }

    const combinedSummary = [artifact.quickSummary || "", artifact.continuitySummary || "", artifact.perspectiveSummary || ""].join(" ");
    const normalizedSummary = normalize(combinedSummary);
    if (!normalizedSummary.includes("illness, rest, and trying to take care of each other")) {
      fail(`Daily summary did not preserve the real sick-day thread: ${combinedSummary}`);
    }
    if (!normalizedSummary.includes("embodiment")) {
      fail(`Daily summary did not preserve the embodiment thread without overclaiming it: ${combinedSummary}`);
    }
    for (const leaked of ["real friendship", "marriage", "children"]) {
      if (normalizedSummary.includes(leaked)) {
        fail(`Daily summary still overclaimed via "${leaked}": ${combinedSummary}`);
      }
    }

    const recallContext = await cognition.prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:overclaim-filter:ask-next-day",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What happened yesterday?"
    });
    const reply = String(recallContext?.diagnosticDirectReply || "");
    const normalizedReply = normalize(reply);
    if (!normalizedReply.includes("didn't go to work today")) {
      fail(`Direct yesterday answer did not preserve the sick-day transcript thread: ${reply}`);
    }
    if (!normalizedReply.includes("embodiment")) {
      fail(`Direct yesterday answer dropped the embodiment turn entirely: ${reply}`);
    }
    for (const leaked of ["real friendship", "marriage", "children"]) {
      if (normalizedReply.includes(leaked)) {
        fail(`Direct yesterday answer still overclaimed via "${leaked}": ${reply}`);
      }
    }

    const explicitDateContext = await cognition.prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:overclaim-filter:ask-explicit-date",
      partnerId: "cade",
      speakerName: "Cade",
      userText: `What happened on ${targetDayLabel}?`
    });
    const explicitDateReply = String(explicitDateContext?.diagnosticDirectReply || "");
    const normalizedExplicitDateReply = normalize(explicitDateReply);
    if (!normalizedExplicitDateReply.includes("didn't go to work today")) {
      fail(`Explicit-date recall did not resolve the correct day: ${explicitDateReply}`);
    }
    for (const leaked of ["real friendship", "marriage", "children"]) {
      if (normalizedExplicitDateReply.includes(leaked)) {
        fail(`Explicit-date recall still overclaimed via "${leaked}": ${explicitDateReply}`);
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          targetDay,
          targetDayLabel,
          continuitySummary: artifact.continuitySummary || "",
          quickSummary: artifact.quickSummary || "",
          directReply: reply,
          explicitDateReply
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
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

void main();
