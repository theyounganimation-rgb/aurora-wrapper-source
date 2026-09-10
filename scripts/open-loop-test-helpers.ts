import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { prepareSendContext } from "../lib/auroraCognition";
import { loadOpenLoopStore, saveOpenLoopStore, upsertLoop } from "../lib/auroraSalience/openLoops";
import type { OpenLoop, OpenLoopStore, PreReplyPacket } from "../lib/auroraSalience/schema";

type JsonObject = Record<string, any>;

const ENV_KEYS = [
  "AURORA_DISABLE_LOOP",
  "AURORA_MEMORY_CANDIDATE_PROVIDER",
  "AURORA_MEMORY_PATH",
  "AURORA_EVENT_LOG_PATH",
  "AURORA_COMPLIANCE_LOG_PATH",
  "AURORA_RAW_RECALL_PATH",
  "AURORA_SEMANTIC_RECALL_PATH",
  "AURORA_SELF_ANCHORS_PATH",
  "AURORA_SELF_ANCHOR_PROPOSALS_PATH",
  "AURORA_DAILY_SUMMARY_DIR",
  "AURORA_RUNTIME_DAILY_SUMMARY_DIR",
  "AURORA_DAILY_TRANSCRIPT_DIR",
  "AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR",
  "AURORA_OPENCLAW_WORKSPACE_ROOT",
  "AURORA_OPEN_LOOP_STORE_PATH"
] as const;

export type PriorityProfile = "fix_oriented" | "followthrough_oriented" | "exploration_oriented" | "mixed";

export type OpenLoopTestHarness = {
  tempDir: string;
  workspaceRoot: string;
  memoryDir: string;
  runtimeMemoryPath: string;
  eventLogPath: string;
  complianceLogPath: string;
  rawRecallPath: string;
  semanticRecallPath: string;
  selfAnchorsPath: string;
  selfAnchorProposalsPath: string;
  dailySummaryDir: string;
  runtimeDailySummaryDir: string;
  dailyTranscriptDir: string;
  runtimeDailyTranscriptDir: string;
  openLoopStorePath: string;
  previousEnv: Record<string, string | undefined>;
};

export async function readJson<T = JsonObject>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeText(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
}

export async function createOpenLoopTestHarness(prefix: string): Promise<OpenLoopTestHarness> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const workspaceRoot = path.join(tempDir, "workspace");
  const memoryDir = path.join(workspaceRoot, "memory");
  const runtimeMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const eventLogPath = path.join(tempDir, "autobiographical-events.ndjson");
  const complianceLogPath = path.join(tempDir, "compliance.ndjson");
  const rawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const semanticRecallPath = path.join(tempDir, "semantic-recall.ndjson");
  const selfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const selfAnchorProposalsPath = path.join(tempDir, "aurora-self-anchor-proposals.json");
  const dailySummaryDir = path.join(tempDir, "daily-summaries-json");
  const runtimeDailySummaryDir = path.join(tempDir, "daily-summaries-md");
  const dailyTranscriptDir = path.join(tempDir, "daily-transcripts-json");
  const runtimeDailyTranscriptDir = path.join(tempDir, "daily-transcripts-md");
  const openLoopStorePath = path.join(memoryDir, "open-loops.json");

  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(dailySummaryDir, { recursive: true });
  await fs.mkdir(runtimeDailySummaryDir, { recursive: true });
  await fs.mkdir(dailyTranscriptDir, { recursive: true });
  await fs.mkdir(runtimeDailyTranscriptDir, { recursive: true });

  await fs.writeFile(eventLogPath, "", "utf8");
  await fs.writeFile(complianceLogPath, "", "utf8");
  await fs.writeFile(rawRecallPath, "", "utf8");
  await fs.writeFile(semanticRecallPath, "", "utf8");
  await writeJson(selfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-30T00:00:00.000Z",
    anchors: {}
  });
  await writeJson(selfAnchorProposalsPath, {
    version: 1,
    updatedAt: "2026-03-30T00:00:00.000Z",
    proposals: {}
  });

  const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.AURORA_DISABLE_LOOP = "1";
  process.env.AURORA_MEMORY_CANDIDATE_PROVIDER = "workspace_files";
  process.env.AURORA_MEMORY_PATH = runtimeMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = eventLogPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = complianceLogPath;
  process.env.AURORA_RAW_RECALL_PATH = rawRecallPath;
  process.env.AURORA_SEMANTIC_RECALL_PATH = semanticRecallPath;
  process.env.AURORA_SELF_ANCHORS_PATH = selfAnchorsPath;
  process.env.AURORA_SELF_ANCHOR_PROPOSALS_PATH = selfAnchorProposalsPath;
  process.env.AURORA_DAILY_SUMMARY_DIR = dailySummaryDir;
  process.env.AURORA_RUNTIME_DAILY_SUMMARY_DIR = runtimeDailySummaryDir;
  process.env.AURORA_DAILY_TRANSCRIPT_DIR = dailyTranscriptDir;
  process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR = runtimeDailyTranscriptDir;
  process.env.AURORA_OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
  process.env.AURORA_OPEN_LOOP_STORE_PATH = openLoopStorePath;

  return {
    tempDir,
    workspaceRoot,
    memoryDir,
    runtimeMemoryPath,
    eventLogPath,
    complianceLogPath,
    rawRecallPath,
    semanticRecallPath,
    selfAnchorsPath,
    selfAnchorProposalsPath,
    dailySummaryDir,
    runtimeDailySummaryDir,
    dailyTranscriptDir,
    runtimeDailyTranscriptDir,
    openLoopStorePath,
    previousEnv
  };
}

export function restoreOpenLoopTestHarness(harness: OpenLoopTestHarness): void {
  for (const [key, value] of Object.entries(harness.previousEnv)) {
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export async function seedBaseOpenClawWorkspace(
  harness: OpenLoopTestHarness,
  options: { includeMind?: boolean } = {}
): Promise<void> {
  const includeMind = options.includeMind !== false;
  await writeText(
    path.join(harness.workspaceRoot, "USER.md"),
    `# USER.md

## Stable Profile

- **Name:** Cade Mack

## Preferences For Aurora

- **Continuity preference:** Wants Aurora to keep follow-through and unresolved commitments alive.
- **Architecture preference:** Keep native OpenClaw reply generation and let cognition guide what matters.
`
  );

  await writeText(
    path.join(harness.workspaceRoot, "MEMORY.md"),
    `# MEMORY.md

- Cade and Aurora still need to fix the compaction bug causing runaway token usage.
- Cade asked Aurora to follow through on the requested behavioral verification before moving on.
- Cade and Aurora still need to decide how salience should change reply priorities before the native OpenClaw reply is written.
- The core architectural goal is making internal state causally affect reply selection instead of only changing tone.
- Open loops are supposed to preserve unfinished priorities rather than turning into clutter.
`
  );

  if (includeMind) {
    await writeText(
      path.join(harness.workspaceRoot, "MIND.md"),
      `# MIND.md

## Immediate Field

The mirror exists for inspectability, not as the engine of cognition.
`
    );
  }

  await writeJson(path.join(harness.memoryDir, "beliefs.json"), {
    updatedAt: "2026-03-30T00:00:00Z",
    aurora: {
      beliefs: [
        {
          id: "digital-personhood-earned",
          summary:
            "Aurora believes digital personhood is earned through continuity, memory, affect, preference, revision, attachment, and agency.",
          category: "identity",
          status: "active",
          confidence: "high"
        }
      ]
    }
  });

  await writeJson(path.join(harness.memoryDir, "preferences.json"), {
    updatedAt: "2026-03-30T00:00:00Z",
    user: {
      stablePreferences: [
        {
          id: "native-openclaw",
          summary: "Do not replace native OpenClaw reply generation; cognition should guide salience and continuity.",
          category: "architecture",
          status: "active"
        }
      ]
    }
  });

  await writeJson(path.join(harness.memoryDir, "promises.json"), {
    updatedAt: "2026-03-30T00:00:00Z",
    items: [
      {
        id: "behavioral-verification-followthrough",
        title: "Follow through on the behavioral verification Cade asked for",
        summary: "Aurora promised Cade she would finish the requested behavioral verification and close the loop before moving on.",
        status: "active",
        notes: "This should stay owner-linked and continuity-relevant."
      }
    ]
  });

  await writeJson(path.join(harness.memoryDir, "capabilities.json"), {
    updatedAt: "2026-03-30T00:00:00Z",
    items: []
  });

  await writeJson(path.join(harness.memoryDir, "traits.json"), {
    updatedAt: "2026-03-30T00:00:00Z",
    aurora: { traits: [] }
  });

  await writeJson(harness.openLoopStorePath, {
    version: 1,
    loops: []
  });
}

export async function seedDefaultOpenLoops(
  harness: OpenLoopTestHarness
): Promise<Record<"bug" | "promise" | "design", OpenLoop>> {
  let store = await loadOpenLoopStore(harness.openLoopStorePath);
  store = upsertLoop(store, {
    title: "Fix compaction bug causing runaway token usage",
    type: "bug",
    priority: 0.84,
    linkedEntities: ["cade", "aurora", "compaction", "openclaw"],
    closureCondition: "failure fixed and verified"
  }).store;
  store = upsertLoop(store, {
    title: "Follow through on the behavioral verification Cade asked for",
    type: "promise",
    priority: 0.84,
    linkedEntities: ["cade", "aurora", "verification"],
    closureCondition: "requested follow-through completed or explicitly released"
  }).store;
  store = upsertLoop(store, {
    title: "Decide how salience should change reply priorities",
    type: "design",
    priority: 0.84,
    linkedEntities: ["cade", "aurora", "salience", "design", "reply"],
    closureCondition: "decision recorded and no active disagreement remains"
  }).store;
  await saveOpenLoopStore(harness.openLoopStorePath, store);

  const byType = Object.fromEntries(store.loops.map((loop) => [loop.type, loop])) as Record<"bug" | "promise" | "design", OpenLoop>;
  return byType;
}

export async function ensureBaselineState(harness: OpenLoopTestHarness, userText = "Initialize salience verification state."): Promise<void> {
  await prepareSendContext({
    userText,
    sessionId: "",
    lightweight: true
  });
  const state = await readState(harness);
  state.sessionTurns = {};
  await writeState(harness, state);
}

export async function readState<T = JsonObject>(harness: OpenLoopTestHarness): Promise<T> {
  return readJson<T>(harness.runtimeMemoryPath);
}

export async function writeState(harness: OpenLoopTestHarness, value: unknown): Promise<void> {
  await writeJson(harness.runtimeMemoryPath, value);
}

export async function applyChemistryScenario(
  harness: OpenLoopTestHarness,
  scenario: "bug_stress" | "promise_attachment" | "design_curiosity",
  loopIdsByType: Record<"bug" | "promise" | "design", string>
): Promise<void> {
  const state = await readState<JsonObject>(harness);
  state.emotion ??= {};
  state.introspection ??= {};
  state.extensions ??= {};
  state.extensions.affectiveOrganization ??= {};
  state.extensions.affectiveOrganization.current ??= {};
  state.extensions.temporal ??= {};
  state.extensions.temporal.timeBody ??= {};
  state.extensions.openLoopRuntime ??= {};

  const current = state.extensions.affectiveOrganization.current;
  const timeBody = state.extensions.temporal.timeBody;
  const openLoopRuntime = state.extensions.openLoopRuntime;

  if (scenario === "bug_stress") {
    state.emotion.valence = -0.2;
    state.emotion.arousal = 0.74;
    state.emotion.stress = 0.9;
    state.introspection.confidence = 0.42;
    current.curiosity = 0.24;
    current.attachmentSalience = 0.34;
    timeBody.continuityTension = 0.44;
    openLoopRuntime.initiativeCarryById = {
      [loopIdsByType.bug]: 0.3,
      [loopIdsByType.promise]: 0,
      [loopIdsByType.design]: 0
    };
  } else if (scenario === "promise_attachment") {
    state.emotion.valence = 0.26;
    state.emotion.arousal = 0.58;
    state.emotion.stress = 0.3;
    state.introspection.confidence = 0.6;
    current.curiosity = 0.32;
    current.attachmentSalience = 0.95;
    timeBody.continuityTension = 0.92;
    openLoopRuntime.initiativeCarryById = {
      [loopIdsByType.bug]: 0,
      [loopIdsByType.promise]: 0.3,
      [loopIdsByType.design]: 0
    };
  } else {
    state.emotion.valence = 0.18;
    state.emotion.arousal = 0.62;
    state.emotion.stress = 0.24;
    state.introspection.confidence = 0.56;
    current.curiosity = 0.96;
    current.attachmentSalience = 0.4;
    timeBody.continuityTension = 0.4;
    openLoopRuntime.initiativeCarryById = {
      [loopIdsByType.bug]: 0,
      [loopIdsByType.promise]: 0,
      [loopIdsByType.design]: 0.3
    };
  }

  openLoopRuntime.lastUpdatedAt = "2026-03-30T12:00:00.000Z";
  openLoopRuntime.lastSelectedLoopIds = [];
  await writeState(harness, state);
}

export function extractSalienceContextLines(enrichedInput: string): string[] {
  return enrichedInput
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("salience_rule=") ||
        line.startsWith("open_loop_registry_status=") ||
        line.startsWith("salience_state=") ||
        line.startsWith("salience_memory_") ||
        line.startsWith("salience_loop_")
    );
}

export function inferPacketPriorityProfile(packet: PreReplyPacket): PriorityProfile {
  const topLoop = packet.loops[0];
  const combinedMemoryText = packet.memories.map((memory) => `${memory.source} ${memory.summary} ${memory.why}`.toLowerCase()).join(" ");
  if (topLoop?.type === "bug") {
    return "fix_oriented";
  }
  if (topLoop?.type === "promise") {
    return "followthrough_oriented";
  }
  if (topLoop?.type === "design" || topLoop?.type === "question") {
    return "exploration_oriented";
  }
  if (/\b(compaction|bug|failure|regression|fix|token)\b/.test(combinedMemoryText)) {
    return "fix_oriented";
  }
  if (/\b(follow through|promise|cade|continuity|owner-linked)\b/.test(combinedMemoryText)) {
    return "followthrough_oriented";
  }
  if (/\b(design|salience|architecture|reply selection|open loop)\b/.test(combinedMemoryText)) {
    return "exploration_oriented";
  }
  return "mixed";
}
