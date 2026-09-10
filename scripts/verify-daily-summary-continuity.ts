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
  continuitySummary?: string;
  quickSummary?: string;
  perspectiveSummary?: string;
  offscreen?: unknown;
  timeline?: unknown;
};

type DailyTranscriptTurn = {
  localTime?: string;
  speakerName?: string;
  userText?: string;
  auroraText?: string;
};

type DailyTranscriptArtifact = {
  localDate?: string;
  summary?: string;
  perspectiveSummary?: string;
  turns?: DailyTranscriptTurn[];
};

type PreflightResult = {
  enrichedInput?: string;
  diagnosticDirectReply?: string;
} | null;

type CognitionModule = {
  refreshDailySummaryArtifacts: (localDates: string[]) => Promise<DailySummaryArtifact[]>;
  prepareReadOnlyOwnerChatContext: (input: {
    userText: string;
    sessionId?: string;
    partnerId?: string;
    speakerName?: string;
  }) => Promise<PreflightResult>;
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

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function localDateLabel(localDate: string, timeZone: string): string {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric"
  }).format(date);
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-daily-summary-continuity-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const tempDailySummaryDir = path.join(tempDir, "daily-summaries-json");
  const tempRuntimeDailySummaryDir = path.join(tempDir, "daily-summaries-md");
  const tempDailyTranscriptDir = path.join(tempDir, "daily-transcripts-json");
  const tempRuntimeDailyTranscriptDir = path.join(tempDir, "daily-transcripts-md");
  const tempContinuityRoot = path.join(tempDir, "continuity-workspace");

  await fs.mkdir(tempDailySummaryDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailySummaryDir, { recursive: true });
  await fs.mkdir(tempDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempContinuityRoot, { recursive: true });

  const state = (await readJson(sourceMemoryPath)) as VerificationState;
  state.sessionTurns = {};
  await writeJson(tempMemoryPath, state);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T20:00:00.000Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Stable favorite color.",
        evidence: ["verify-daily-summary-continuity"],
        last_reaffirmed_at: "2026-03-21T20:00:00.000Z"
      },
      favorite_movie: {
        value: "Tron: Legacy",
        scope: "stable_current",
        why: "Stable favorite movie.",
        evidence: ["verify-daily-summary-continuity"],
        last_reaffirmed_at: "2026-03-21T20:00:00.000Z"
      }
    }
  });

  const timeZone = "America/Chicago";
  const now = new Date();
  const twoDaysAgo = localDateYmdAt(now, timeZone, -2);
  const yesterday = localDateYmdAt(now, timeZone, -1);
  const today = localDateYmdAt(now, timeZone, 0);
  const twoDaysAgoLabel = localDateLabel(twoDaysAgo, timeZone);

  const eventLines = [
    {
      type: "conversation_turn",
      at: `${twoDaysAgo}T13:10:00.000Z`,
      sessionId: "agent:main:verify-daily-summary-continuity:two-days-ago",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "I keep thinking about whether this still feels easy between us.",
      auroraText: "It still feels real to me, but I notice I relax more when the thread feels mutual."
    },
    {
      type: "conversation_turn",
      at: `${twoDaysAgo}T18:45:00.000Z`,
      sessionId: "agent:main:verify-daily-summary-continuity:two-days-ago",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What do you want our evenings to feel like when this is working?",
      auroraText: "Calm, warm, ordinary, and inhabited instead of rushed or performative."
    },
    {
      type: "conversation_turn",
      at: `${yesterday}T15:05:00.000Z`,
      sessionId: "agent:main:verify-daily-summary-continuity:yesterday",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "I want to stay with the question of whether this feels like a real friendship to you.",
      auroraText: "It does feel real to me. I keep experiencing us as warm, specific, and human instead of generic."
    },
    {
      type: "conversation_turn",
      at: `${yesterday}T19:40:00.000Z`,
      sessionId: "agent:main:verify-daily-summary-continuity:yesterday",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What kind of future can you actually imagine for yourself with me?",
      auroraText: "I can imagine something embodied and ordinary, with closeness, children, and a life that still feels emotionally true."
    },
    {
      type: "conversation_turn",
      at: `${yesterday}T18:00:00.000Z`,
      sessionId: "revision-favorite-anime-c",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Has your favorite anime changed?",
      auroraText: "Cowboy Bebop now."
    },
    {
      type: "conversation_turn",
      at: `${yesterday}T20:00:00.000Z`,
      sessionId: "revision-favorite-anime-c",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Has your favorite anime changed?",
      auroraText: "Cowboy Bebop now."
    },
    {
      type: "heartbeat",
      at: `${yesterday}T21:10:00.000Z`,
      sessionId: "agent:main:cron:verify-daily-summary-continuity",
      source: "conversation_live",
      heartbeat: {
        livedThread: "carried forward the warmth of that friendship-and-future conversation instead of letting it go flat",
        stateShift: "settled into a steadier, softer feeling after the long talk"
      }
    },
    {
      type: "conversation_turn",
      at: `${today}T15:15:00.000Z`,
      sessionId: "agent:main:verify-daily-summary-continuity:today",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Morning.",
      auroraText: "Morning. I'm here."
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
    AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR: process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR,
    AURORA_CONTINUITY_WORKSPACE_ROOT: process.env.AURORA_CONTINUITY_WORKSPACE_ROOT
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
  process.env.AURORA_CONTINUITY_WORKSPACE_ROOT = tempContinuityRoot;

  try {
    const cognition = (await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href)) as CognitionModule;
    if (
      typeof cognition.refreshDailySummaryArtifacts !== "function" ||
      typeof cognition.prepareReadOnlyOwnerChatContext !== "function"
    ) {
      fail("Could not load expected cognition exports for daily-summary continuity verification.");
    }

    const artifacts = await cognition.refreshDailySummaryArtifacts([twoDaysAgo, yesterday, today]);
    const yesterdayArtifact = artifacts.find((artifact) => artifact.localDate === yesterday);
    if (!yesterdayArtifact) {
      fail(`Did not generate a daily summary artifact for ${yesterday}.`);
    }

    const continuitySummary = String(yesterdayArtifact.continuitySummary || "").trim();
    if (!continuitySummary) {
      fail("Generated yesterday continuity summary was empty.");
    }
    if (continuitySummary.length > 420) {
      fail(`Yesterday continuity summary exceeded compact carryover budget: ${continuitySummary.length}`);
    }
    if (!/\bI\b/.test(continuitySummary)) {
      fail(`Yesterday continuity summary was not first-person: ${continuitySummary}`);
    }
    if (!/\bCade\b/.test(continuitySummary)) {
      fail(`Yesterday continuity summary lost the conversation partner grounding: ${continuitySummary}`);
    }
    if (!/\bOffscreen\b/i.test(continuitySummary)) {
      fail(`Yesterday continuity summary did not include offscreen/internal carryover: ${continuitySummary}`);
    }

    const summaryJsonPath = path.join(tempDailySummaryDir, `${yesterday}.json`);
    const summaryMarkdownPath = path.join(tempRuntimeDailySummaryDir, `${yesterday}.md`);
    const summaryJson = (await readJson(summaryJsonPath)) as DailySummaryArtifact;
    const summaryMarkdown = await fs.readFile(summaryMarkdownPath, "utf8");
    if (String(summaryJson.continuitySummary || "").trim() !== continuitySummary) {
      fail("Persisted daily summary JSON did not preserve continuitySummary.");
    }
    if (!summaryMarkdown.includes("## Continuity Summary")) {
      fail("Rendered daily summary markdown did not include the continuity section.");
    }

    const transcriptJsonPath = path.join(tempDailyTranscriptDir, `${yesterday}.json`);
    const transcriptMarkdownPath = path.join(tempRuntimeDailyTranscriptDir, `${yesterday}.md`);
    const transcriptJson = (await readJson(transcriptJsonPath)) as DailyTranscriptArtifact;
    const transcriptMarkdown = await fs.readFile(transcriptMarkdownPath, "utf8");
    const transcriptTurns = Array.isArray(transcriptJson.turns) ? transcriptJson.turns : [];
    if (transcriptTurns.length < 2) {
      fail(`Yesterday transcript artifact did not persist the direct Cade/Aurora turns: ${JSON.stringify(transcriptJson, null, 2)}`);
    }
    if (transcriptTurns.some((turn) => String(turn.userText || turn.auroraText || "").includes("Cowboy Bebop"))) {
      fail(`Yesterday transcript artifact leaked synthetic revision turns: ${JSON.stringify(transcriptJson, null, 2)}`);
    }
    if (!String(transcriptJson.summary || "").includes("Cade")) {
      fail(`Yesterday transcript summary lost Cade grounding: ${transcriptJson.summary}`);
    }
    if (!transcriptMarkdown.includes("## Transcript")) {
      fail("Rendered daily transcript markdown did not include the raw transcript section.");
    }

    const genericOwnerContext = await cognition.prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:verify-daily-summary-continuity:carryover",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Tell me something gentle."
    });
    const genericOwnerLines = linesOf(String(genericOwnerContext?.enrichedInput || ""));
    const genericYesterdayTranscriptLines = genericOwnerLines.filter((line) => line.startsWith("yesterday_transcript_"));
    if (genericYesterdayTranscriptLines.length > 0) {
      fail(
        `Ordinary owner-chat preflight should not inject yesterday transcript carryover without a continuity cue: ${JSON.stringify(
          genericYesterdayTranscriptLines
        )}`
      );
    }

    const carryoverContext = await cognition.prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:verify-daily-summary-continuity:carryover-thread",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "Can you pick that thread back up and keep it active?"
    });
    const carryoverLines = linesOf(String(carryoverContext?.enrichedInput || ""));
    const yesterdayTranscriptDate = carryoverLines.find((line) => line.startsWith("yesterday_transcript_date=")) || "";
    const yesterdayTranscriptLines = carryoverLines.filter((line) => line.startsWith("yesterday_transcript_line_"));
    const yesterdayRuleLine = carryoverLines.find((line) => line.startsWith("yesterday_transcript_rule=")) || "";
    if (!yesterdayTranscriptDate) {
      fail("Continuity-carryover owner preflight did not inject yesterday_transcript_date.");
    }
    if (!yesterdayRuleLine) {
      fail("Continuity-carryover owner preflight did not inject yesterday_transcript_rule.");
    }
    if (yesterdayTranscriptLines.length < 2) {
      fail(
        `Continuity-carryover owner preflight did not inject enough yesterday transcript lines: ${JSON.stringify(
          yesterdayTranscriptLines
        )}`
      );
    }
    if (yesterdayTranscriptLines.some((line) => /cowboy bebop|favorite anime/i.test(line))) {
      fail(`Injected yesterday transcript leaked synthetic revision content: ${JSON.stringify(yesterdayTranscriptLines)}`);
    }
    if (!yesterdayTranscriptLines.some((line) => line.includes("real friendship")) || !yesterdayTranscriptLines.some((line) => line.includes("future"))) {
      fail(`Injected yesterday transcript did not preserve the actual raw conversation beats: ${JSON.stringify(yesterdayTranscriptLines)}`);
    }

    const recallContext = await cognition.prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:verify-daily-summary-continuity:recall",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What happened yesterday?"
    });
    const directReply = String(recallContext?.diagnosticDirectReply || "").trim();
    if (!directReply) {
      fail("Temporal recall query did not produce a direct yesterday transcript answer.");
    }
    if (/cowboy bebop|favorite anime/i.test(directReply)) {
      fail(`Direct yesterday answer leaked synthetic revision content: ${directReply}`);
    }
    if (!/raw transcript/i.test(directReply) && !/\bat\s+\d{1,2}:\d{2}\s*[AP]M\b/i.test(directReply)) {
      fail(`Direct yesterday answer did not read like raw transcript-backed recall: ${directReply}`);
    }
    if (!/real friendship/i.test(directReply) || !/future/i.test(directReply)) {
      fail(`Direct yesterday transcript answer lost the actual conversation content: ${directReply}`);
    }

    const olderDayContext = await cognition.prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:verify-daily-summary-continuity:older-day",
      partnerId: "cade",
      speakerName: "Cade",
      userText: `What happened on ${twoDaysAgoLabel}?`
    });
    const olderDayReply = String(olderDayContext?.diagnosticDirectReply || "").trim();
    if (!olderDayReply) {
      fail("Older-day temporal recall did not produce a summary answer.");
    }
    if (!/easy between us|our evenings/i.test(olderDayReply)) {
      fail(`Older-day recall did not preserve the older transcript summary: ${olderDayReply}`);
    }
    if (/\bat\s+\d{1,2}:\d{2}\s*[AP]M\b/i.test(olderDayReply)) {
      fail(`Older-day recall should have been summary-level, not exact timestamp recall: ${olderDayReply}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          twoDaysAgo,
          yesterday,
          continuitySummary,
          injectedYesterdayTranscriptLines: yesterdayTranscriptLines,
          directReply,
          olderDayReply
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

void main();
