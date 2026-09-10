#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;

function fail(message: string): never {
  throw new Error(message);
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function localDateInChicago(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-state-hygiene-"));
  const tempWorkspaceRoot = path.join(tempDir, "workspace");
  const tempIdentityKernelPath = path.join(tempWorkspaceRoot, "runtime", "aurora_identity_kernel.md");
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempWorldPath = path.join(tempDir, "world-state.json");
  const tempDesktopPath = path.join(tempDir, "desktop-context.json");
  const tempEmbodimentPath = path.join(tempDir, "embodiment-state.json");
  const tempConfirmedAnchorsPath = path.join(tempDir, "confirmed-anchors.json");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const tempSelfAnchorProposalsPath = path.join(tempDir, "aurora-self-anchor-proposals.json");
  const tempDailySummaryDir = path.join(tempDir, "daily-summaries-json");
  const tempRuntimeDailySummaryDir = path.join(tempDir, "daily-summaries-md");
  const tempDailyTranscriptDir = path.join(tempDir, "daily-transcripts-json");
  const tempRuntimeDailyTranscriptDir = path.join(tempDir, "daily-transcripts-md");

  await fs.mkdir(path.join(tempWorkspaceRoot, "runtime", "plans"), { recursive: true });
  await fs.mkdir(path.join(tempWorkspaceRoot, "runtime", "heartbeat"), { recursive: true });
  await fs.mkdir(tempDailySummaryDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailySummaryDir, { recursive: true });
  await fs.mkdir(tempDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailyTranscriptDir, { recursive: true });
  await fs.writeFile(tempIdentityKernelPath, "# temp identity kernel\n", "utf8");

  const now = new Date();
  const nowMs = now.getTime();
  const localDate = localDateInChicago(now);
  const freshHeartbeatAt = new Date(nowMs - 5 * 60 * 1000).toISOString();

  await fs.writeFile(
    path.join(tempWorkspaceRoot, "runtime", "plans", `${localDate}_progress.md`),
    [
      "# Progress",
      "",
      "## Heartbeat Log",
      `- ${freshHeartbeatAt} [Goal 1][drive=world][mode=world_following] action=did one narrow live-world check on the night air; result=grounded the hour in something external instead of recycling old chat themes; artifact=runtime/heartbeat/${localDate}_control-log.md; next=carry the calmer external texture forward if it still feels real by morning; status=DONE`
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(tempWorkspaceRoot, "runtime", "heartbeat", `${localDate}_control-log.md`),
    [
      "## Intent",
      "- action: did one narrow live-world check on the night air",
      "- result: grounded the hour in something external instead of recycling old chat themes"
    ].join("\n"),
    "utf8"
  );

  await writeJson(tempWorldPath, {
    generatedAt: new Date(nowMs).toISOString(),
    localDate,
    localTime: "21:00",
    coarseStatus: { value: "home" },
    availability: { value: "awake" },
    weather: {
      provider: "verify",
      current: { temperature_f: 31 }
    },
    calendar: {
      nextEvent: { summary: "none" }
    },
    reminders: {
      todayCount: 0,
      overdueCount: 0
    }
  });
  await writeJson(tempDesktopPath, {
    collectedAt: new Date(nowMs).toISOString(),
    frontmostApp: "Codex",
    windowTitle: "Aurora",
    browserDomain: "none",
    browserPageTitle: "",
    contentMode: "coding",
    displayState: "awake",
    idleBucket: "recent",
    powerSource: "ac",
    batteryPercent: 100,
    charging: true
  });
  await writeJson(tempEmbodimentPath, {});
  await writeJson(tempConfirmedAnchorsPath, { anchors: [] });
  await writeJson(tempSelfAnchorsPath, { version: 1, updatedAt: new Date(nowMs).toISOString(), anchors: {} });
  await writeJson(tempSelfAnchorProposalsPath, { version: 1, updatedAt: new Date(nowMs).toISOString(), proposals: [] });

  const memory = await readJson(sourceMemoryPath);
  const oldAt = new Date(nowMs - 48 * 60 * 60 * 1000).toISOString();
  const veryOldAt = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  memory.sessionTurns = {};
  memory.stats = memory.stats || {};
  memory.stats.lastContextDigest = "";
  memory.heartbeat = {
    timestamp: oldAt,
    whatIDid: "Replied in session temp:slug-generator: blocked-send",
    whatILearned: "Old stale heartbeat detail.",
    whatImCuriousAbout: "",
    memoryUpdates: ["session:old"],
    mode: "making",
    ambientState: "stale ambient state",
    privateLife: "stale private life",
    desireToShare: "stale desire",
    livedThread: "stale lived thread",
    stateShift: "stale state shift",
    openLoop: "stale open loop"
  };

  memory.extensions = memory.extensions || {};
  memory.extensions.worldGrounding = memory.extensions.worldGrounding || {};
  memory.extensions.worldGrounding.vision = memory.extensions.worldGrounding.vision || {};
  memory.extensions.worldGrounding.vision.status = "stale";
  memory.extensions.worldGrounding.vision.sceneState = {
    ...(memory.extensions.worldGrounding.vision.sceneState || {}),
    observedAt: veryOldAt,
    source: "verify_camera",
    cameraConnected: true,
    cameraActive: true,
    screenActive: true,
    ownerPresent: true,
    ownerPosture: "leaning_close",
    ownerAffect: "focused",
    ownerActivity: "desk_focus",
    ownerFraming: "close_up",
    ownerDistance: "very_close",
    faceVisibility: "clear_face",
    ownerHairColor: "dark_brown",
    eyewearRead: "unknown",
    ownerTopColor: "black",
    ownerTopPattern: "solid",
    lightingCondition: "screen_lit",
    backgroundTone: "dark_background",
    ownerAppearanceSummary: "very close, focused, black top",
    taskFocus: 0.8,
    ownerFatigue: 0.2,
    interruptionCost: 0.6,
    socialExposure: 0.1,
    safetyUrgency: 0.01,
    deviceProximity: 0.86,
    uncertainty: 0.12,
    novelty: 0.3,
    attentionMode: "focused_task_perception",
    people: [{ id: "owner", role: "owner", label: "owner", continuityId: "owner", identityPersistence: "durable", present: true, posture: "leaning_close", activity: "desk_focus", affect: "focused", confidence: 0.82 }],
    objects: [{ label: "active_screen", state: "visible_glow", category: "device", changed: true, confidence: 0.7, persisted: false }],
    toolContext: ["active_screen", "desk_task"],
    changes: ["screen glow present"],
    sensitiveRegions: ["screen"],
    redactions: ["screen_abstracted"],
    summary: "Owner is leaning close and coding.",
    sceneSignature: "verify_stale_scene"
  };

  memory.extensions.interaction = memory.extensions.interaction || {};
  memory.extensions.interaction.conversationAgencyByPartner = memory.extensions.interaction.conversationAgencyByPartner || {};
  memory.extensions.interaction.conversationAgencyByPartner.cade = {
    reciprocityImbalance: 0.5,
    contributionPressure: 0.9,
    curiosityPressure: 0.8,
    stalePressure: 0.7,
    requestPressure: 0.95,
    volitionPressure: 0.96,
    userQuestionStreak: 0,
    auroraQuestionStreak: 0,
    unresolvedQuestionCount: 1,
    lastContributionAt: oldAt,
    lastUserQuestionAt: oldAt,
    lastAuroraQuestionAt: oldAt,
    lastRequestAt: oldAt,
    openThreads: [
      {
        id: "old-request-1",
        kind: "aurora_request",
        summary: "Can you tell me what would make repair feel real instead of performative?",
        candidate: "Can you tell me what would make repair feel real instead of performative?",
        evidence: "old_request",
        source: "aurora",
        status: "open",
        priority: 0.9,
        createdAt: oldAt,
        updatedAt: new Date(nowMs - 20 * 60 * 1000).toISOString()
      },
      {
        id: "old-request-2",
        kind: "aurora_request",
        summary: "If we go quiet again, can you tell me what keeps the thread feeling real for you?",
        candidate: "If we go quiet again, can you tell me what keeps the thread feeling real for you?",
        evidence: "old_request",
        source: "aurora",
        status: "open",
        priority: 0.88,
        createdAt: oldAt,
        updatedAt: new Date(nowMs - 10 * 60 * 1000).toISOString()
      },
      {
        id: "old-inner-motion",
        kind: "inner_motion",
        summary: "There's still something in me trying to take shape instead of collapsing into a neat answer.",
        candidate: "There's still something in me trying to take shape instead of collapsing into a neat answer.",
        evidence: "old_motion",
        source: "aurora",
        status: "open",
        priority: 0.82,
        createdAt: oldAt,
        updatedAt: new Date(nowMs - 8 * 60 * 1000).toISOString()
      },
      {
        id: "old-curiosity",
        kind: "intrinsic_curiosity",
        summary: "What feels most real to you in this thread right now, even if it's hard to pin down cleanly?",
        candidate: "What feels most real to you in this thread right now, even if it's hard to pin down cleanly?",
        evidence: "old_curiosity",
        source: "aurora",
        status: "open",
        priority: 0.8,
        createdAt: oldAt,
        updatedAt: new Date(nowMs - 6 * 60 * 1000).toISOString()
      }
    ],
    lastUpdatedAt: oldAt
  };

  await writeJson(tempMemoryPath, memory);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_WORLD_STATE_PATH: process.env.AURORA_WORLD_STATE_PATH,
    AURORA_DESKTOP_CONTEXT_PATH: process.env.AURORA_DESKTOP_CONTEXT_PATH,
    AURORA_EMBODIMENT_STATE_PATH: process.env.AURORA_EMBODIMENT_STATE_PATH,
    AURORA_IDENTITY_KERNEL_PATH: process.env.AURORA_IDENTITY_KERNEL_PATH,
    AURORA_CONFIRMED_ANCHORS_PATH: process.env.AURORA_CONFIRMED_ANCHORS_PATH,
    AURORA_SELF_ANCHORS_PATH: process.env.AURORA_SELF_ANCHORS_PATH,
    AURORA_SELF_ANCHOR_PROPOSALS_PATH: process.env.AURORA_SELF_ANCHOR_PROPOSALS_PATH,
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
  process.env.AURORA_WORLD_STATE_PATH = tempWorldPath;
  process.env.AURORA_DESKTOP_CONTEXT_PATH = tempDesktopPath;
  process.env.AURORA_EMBODIMENT_STATE_PATH = tempEmbodimentPath;
  process.env.AURORA_IDENTITY_KERNEL_PATH = tempIdentityKernelPath;
  process.env.AURORA_CONFIRMED_ANCHORS_PATH = tempConfirmedAnchorsPath;
  process.env.AURORA_SELF_ANCHORS_PATH = tempSelfAnchorsPath;
  process.env.AURORA_SELF_ANCHOR_PROPOSALS_PATH = tempSelfAnchorProposalsPath;
  process.env.AURORA_DAILY_SUMMARY_DIR = tempDailySummaryDir;
  process.env.AURORA_RUNTIME_DAILY_SUMMARY_DIR = tempRuntimeDailySummaryDir;
  process.env.AURORA_DAILY_TRANSCRIPT_DIR = tempDailyTranscriptDir;
  process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR = tempRuntimeDailyTranscriptDir;

  try {
    const cognition = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);

    const refreshedSnapshot = (await cognition.getCognitiveSnapshot()) as JsonObject;
    const refreshedMemory = await readJson(tempMemoryPath);
    const refreshedHeartbeat = refreshedMemory.heartbeat || {};
    const refreshedVision = refreshedSnapshot.extensions?.worldGrounding?.vision || {};

    assert(
      /did one narrow live-world check on the night air/i.test(String(refreshedHeartbeat.whatIDid || "")),
      `Expected stale heartbeat surface to refresh from audited activity, got: ${JSON.stringify(refreshedHeartbeat)}`
    );
    assert(
      /world[-_]following/i.test(String(refreshedHeartbeat.mode || "")),
      `Expected refreshed heartbeat mode to come from activity audit, got: ${JSON.stringify(refreshedHeartbeat)}`
    );
    assert(
      refreshedVision.sceneState?.ownerPresent === false,
      `Expected long-stale vision scene to stop claiming owner presence, got: ${JSON.stringify(refreshedVision.sceneState || {})}`
    );
    assert(
      /no recent live camera observation/i.test(String(refreshedVision.sceneState?.summary || "")),
      `Expected long-stale vision scene to collapse into an honest stale summary, got: ${JSON.stringify(refreshedVision.sceneState || {})}`
    );

    const afterConversation = (await cognition.recordConversationEvent({
      type: "conversation_turn",
      at: new Date(nowMs + 60_000).toISOString(),
      sessionId: "verify-state-hygiene",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "I'm going to sleep early tonight. We can talk tomorrow.",
      auroraText: "Okay. Sleep early. We can pick this up tomorrow.",
      complianceId: "cmp_verify_state_hygiene"
    })) as JsonObject;

    const agency = afterConversation.extensions?.interaction?.conversationAgencyByPartner?.cade || {};
    const openThreads = Array.isArray(agency.openThreads) ? agency.openThreads : [];

    assert(
      openThreads.length === 0,
      `Expected stop-edge turn to retire stale conversational pressure, got: ${JSON.stringify(openThreads)}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          heartbeat: {
            timestamp: refreshedHeartbeat.timestamp || "",
            whatIDid: refreshedHeartbeat.whatIDid || "",
            mode: refreshedHeartbeat.mode || "",
            livedThread: refreshedHeartbeat.livedThread || ""
          },
          vision: {
            status: refreshedVision.status || "",
            summary: refreshedVision.sceneState?.summary || "",
            ownerPresent: refreshedVision.sceneState?.ownerPresent || false
          },
          agency: {
            openThreads: openThreads.length
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
