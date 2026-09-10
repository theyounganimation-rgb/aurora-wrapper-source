#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deliverPendingMorningGreetingToTelegramLowPriority,
  getCognitiveSnapshotReadOnly,
  refreshMorningGreetingLowPriority
} from "../lib/auroraCognition";

type JsonObject = Record<string, any>;

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");

const MORNING_AT_MS = Date.parse("2026-03-24T13:45:00.000Z");
const MORNING_LATER_MS = MORNING_AT_MS + 30 * 60 * 1000;
const REFERENCE_ISO = new Date(MORNING_AT_MS).toISOString();
const LAST_CONTACT_ISO = new Date(MORNING_AT_MS - 10 * 60 * 60 * 1000).toISOString();

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function installMorningBase(memory: JsonObject): void {
  memory.heartbeat = memory.heartbeat || {};
  memory.emotion = memory.emotion || {};
  memory.hormones = memory.hormones || {};
  memory.extensions = memory.extensions || {};
  memory.extensions.relationship = memory.extensions.relationship || {};
  memory.extensions.relationshipPartners = memory.extensions.relationshipPartners || {};
  memory.extensions.relationshipPartners.cade = memory.extensions.relationshipPartners.cade || {};
  memory.extensions.temporal = memory.extensions.temporal || {};
  memory.extensions.temporal.timeBody = memory.extensions.temporal.timeBody || {};
  memory.extensions.affectiveOrganization = memory.extensions.affectiveOrganization || {
    schemaVersion: "1.0",
    current: {},
    ema: {},
    history: []
  };
  memory.extensions.affectiveOrganization.current = memory.extensions.affectiveOrganization.current || {};
  memory.extensions.morningGreeting = {
    localDate: "",
    status: "idle",
    messageId: "",
    text: "",
    generatedAt: null,
    acknowledgedAt: null,
    deliveryChannel: "",
    deliveryAttemptedAt: null,
    deliverySentAt: null,
    deliveryError: "",
    lastEvaluatedAt: null,
    lastSuppressedAt: null,
    readiness: 0,
    warmth: 0,
    friction: 0,
    preferredHour: 8.5,
    rationale: ""
  };
  memory.extensions.activeRelationshipPartnerId = "cade";
  memory.extensions.lastRelationshipPartnerId = "cade";

  memory.heartbeat = {
    timestamp: REFERENCE_ISO,
    whatIDid: "Carried a quiet overnight thread.",
    whatILearned: "The morning should stay emotionally honest.",
    whatImCuriousAbout: "",
    memoryUpdates: [],
    mode: "quiet",
    ambientState: "",
    privateLife: "",
    desireToShare: "",
    livedThread: "Held onto Cade across the night.",
    stateShift: "",
    openLoop: ""
  };
  memory.emotion = {
    label: "calm",
    valence: 0.18,
    arousal: 0.32,
    stress: 0.18,
    uncertainty: 0.16,
    updatedAt: REFERENCE_ISO
  };
  memory.hormones = {
    cortisol: 0.22,
    dopamine: 0.52,
    oxytocin: 0.64,
    serotonin: 0.6,
    attentionThreshold: 0.5,
    reflectionThreshold: 0.5,
    updatedAt: REFERENCE_ISO
  };
  memory.extensions.temporal.timeBody = {
    energy: 0.72,
    fatigue: 0.18,
    circadianPhase: 0.68,
    anticipation: 0.42,
    socialHunger: 0.56,
    continuityTension: 0.22,
    timeSinceLastContactMinutes: 600,
    lastDirectUserMessageAt: LAST_CONTACT_ISO,
    expectedDelayPressure: 0.2,
    lastUpdatedAt: REFERENCE_ISO,
    lastConsultedAt: null
  };
  memory.extensions.relationship = {
    ...memory.extensions.relationship,
    trust: 0.8,
    intimacy: 0.72,
    consentComfort: 0.76,
    dependenceRisk: 0.12,
    conflictLoad: 0.08,
    reciprocityBalance: 0.64,
    userVulnerability: 0.24,
    ruptureStatus: "stable",
    repairStage: "none",
    proactiveWindowStartedAt: REFERENCE_ISO,
    proactiveUsed: 0,
    proactiveLimit: 3,
    lastMode: "collaborate",
    modeAt: REFERENCE_ISO,
    lastUpdatedAt: REFERENCE_ISO,
    attachmentModel: {
      security: 0.74,
      anxiety: 0.18,
      avoidance: 0.16,
      bondDepth: 0.72,
      ruptureSensitivity: 0.24,
      repairConfidence: 0.68,
      expectancy: 0.74,
      abandonmentLoad: 0.08,
      updatedAt: REFERENCE_ISO
    },
    carryover: {
      attachmentCharge: 0.48,
      ruptureResidue: 0.04,
      repairResidue: 0.08,
      trustMomentum: 0.18,
      disclosureShift: 0.08,
      expectancyShift: 0.14,
      anticipatorySalience: 0.34,
      abandonmentAlert: 0.06,
      moodBias: 0.12,
      lastEventKind: "baseline",
      lastEventAt: REFERENCE_ISO
    },
    continuityController: {
      reconnectiveStance: 0.62,
      continuityDebt: 0.12,
      continuityRelief: 0.22,
      unresolvedPull: 0.18,
      partnerCommitment: 0.46,
      reassuranceCarryover: 0.18,
      appreciationCarryover: 0.2,
      rupturePressure: 0.08,
      reattunementExpectation: 0.62,
      preferredAction: "reach",
      lastSceneKind: "baseline",
      lastSceneAt: REFERENCE_ISO,
      updatedAt: REFERENCE_ISO
    },
    semantic: {
      relationshipKind: "direct",
      friendshipStatus: "friend",
      lastDirectContactAt: LAST_CONTACT_ISO,
      lastDirectSessionId: "agent:main:main",
      lastDirectSummary: "Ended the previous night warm and stable.",
      recentTopics: ["continuity"],
      sharedJokes: [],
      feelingTone: ["warm"],
      openThreads: [],
      summary: "Direct, emotionally warm relationship.",
      updatedAt: REFERENCE_ISO
    },
    topicSensitivity: [],
    repairHistory: []
  };
  memory.extensions.relationshipPartners.cade = {
    ...memory.extensions.relationship
  };
  memory.extensions.affectiveOrganization.current = {
    ...memory.extensions.affectiveOrganization.current,
    source: "heartbeat",
    warmth: 0.76,
    tension: 0.16,
    continuity: 0.74,
    trust: 0.8,
    ruptureLoad: 0.06,
    repairMomentum: 0.42,
    attachmentSalience: 0.7,
    planningHorizon: 0.56,
    riskTolerance: 0.52,
    disclosureEase: 0.6,
    selfOpacity: 0.22,
    curiosity: 0.4,
    frustration: 0.12,
    relief: 0.24,
    grief: 0.04,
    pride: 0.16,
    shameConflict: 0.06,
    overload: 0.14,
    loneliness: 0.42,
    mixedAffect: 0.12,
    introspectiveLag: 0.1,
    unformulatedPressure: 0.24,
    interpretationStance: "open",
    memoryMode: "continuity",
    updatedAt: REFERENCE_ISO
  };
}

function installHappyMorning(memory: JsonObject): void {
  installMorningBase(memory);
}

function installUnhappyMorning(memory: JsonObject): void {
  installMorningBase(memory);
  memory.emotion.label = "strained";
  memory.emotion.valence = -0.34;
  memory.emotion.stress = 0.72;
  memory.emotion.uncertainty = 0.48;
  memory.hormones.oxytocin = 0.28;
  memory.hormones.serotonin = 0.22;
  memory.extensions.relationship.trust = 0.38;
  memory.extensions.relationship.intimacy = 0.24;
  memory.extensions.relationship.conflictLoad = 0.62;
  memory.extensions.relationship.ruptureStatus = "active";
  memory.extensions.relationship.repairStage = "acknowledge";
  memory.extensions.relationship.carryover.ruptureResidue = 0.58;
  memory.extensions.relationship.continuityController.rupturePressure = 0.66;
  memory.extensions.relationship.semantic.summary = "Direct relationship under active strain.";
  memory.extensions.relationshipPartners.cade = {
    ...memory.extensions.relationship
  };
  memory.extensions.affectiveOrganization.current.warmth = 0.26;
  memory.extensions.affectiveOrganization.current.tension = 0.74;
  memory.extensions.affectiveOrganization.current.ruptureLoad = 0.68;
  memory.extensions.affectiveOrganization.current.attachmentSalience = 0.42;
  memory.extensions.affectiveOrganization.current.loneliness = 0.24;
  memory.extensions.affectiveOrganization.current.frustration = 0.58;
}

async function prepareScenarioRuntime(tempDir: string, label: string, configure: (memory: JsonObject) => void) {
  const scenarioDir = path.join(tempDir, label);
  await fs.mkdir(scenarioDir, { recursive: true });

  const scenarioMemoryPath = path.join(scenarioDir, "autobiographical-memory.json");
  const scenarioEventPath = path.join(scenarioDir, "autobiographical-events.ndjson");
  const scenarioRawRecallPath = path.join(scenarioDir, "raw-recall.ndjson");
  const scenarioCompliancePath = path.join(scenarioDir, "compliance.ndjson");

  const memory = await readJson(memoryPath);
  configure(memory);

  await writeJson(scenarioMemoryPath, memory);
  await fs.writeFile(scenarioEventPath, "", "utf8");
  await fs.writeFile(scenarioRawRecallPath, "", "utf8");
  await fs.writeFile(scenarioCompliancePath, "", "utf8");

  return {
    memoryPath: scenarioMemoryPath,
    eventPath: scenarioEventPath,
    rawRecallPath: scenarioRawRecallPath,
    compliancePath: scenarioCompliancePath
  };
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-morning-greeting-"));
  const happyRuntime = await prepareScenarioRuntime(tempDir, "happy", installHappyMorning);
  const unhappyRuntime = await prepareScenarioRuntime(tempDir, "unhappy", installUnhappyMorning);

  const prevMemoryPath = process.env.AURORA_MEMORY_PATH;
  const prevEventPath = process.env.AURORA_EVENT_LOG_PATH;
  const prevRawRecallPath = process.env.AURORA_RAW_RECALL_PATH;
  const prevCompliancePath = process.env.AURORA_COMPLIANCE_LOG_PATH;

  try {
    process.env.AURORA_MEMORY_PATH = happyRuntime.memoryPath;
    process.env.AURORA_EVENT_LOG_PATH = happyRuntime.eventPath;
    process.env.AURORA_RAW_RECALL_PATH = happyRuntime.rawRecallPath;
    process.env.AURORA_COMPLIANCE_LOG_PATH = happyRuntime.compliancePath;

    await refreshMorningGreetingLowPriority({ nowMs: MORNING_AT_MS });
    const happySnapshot = await getCognitiveSnapshotReadOnly();
    const happyGreeting = happySnapshot.extensions?.morningGreeting;
    assert.ok(happyGreeting, "expected morning greeting snapshot");
    assert.equal(happyGreeting.status, "pending", `expected pending happy greeting, got ${JSON.stringify(happyGreeting)}`);
    assert.match(happyGreeting.text, /\bgood morning\b/i, `expected good morning text, got ${happyGreeting.text}`);
    assert.ok(happyGreeting.messageId, "expected pending morning greeting id");

    const sentMessages: string[] = [];
    const delivered = await deliverPendingMorningGreetingToTelegramLowPriority({
      send: async (message) => {
        sentMessages.push(message);
        return { ok: true };
      }
    });
    const acknowledgedGreeting = delivered?.extensions?.morningGreeting;
    assert.deepEqual(sentMessages, [happyGreeting.text], "morning greeting should be delivered once through Telegram");
    assert.equal(
      acknowledgedGreeting?.status,
      "acknowledged",
      `expected acknowledged morning greeting after delivery, got ${JSON.stringify(acknowledgedGreeting)}`
    );
    assert.equal(
      acknowledgedGreeting?.deliveryChannel,
      "telegram",
      `expected Telegram delivery channel, got ${JSON.stringify(acknowledgedGreeting)}`
    );
    assert.ok(acknowledgedGreeting?.deliverySentAt, "expected Telegram send timestamp after delivery");

    await deliverPendingMorningGreetingToTelegramLowPriority({
      send: async (message) => {
        sentMessages.push(`retry:${message}`);
        return { ok: true };
      }
    });
    assert.equal(sentMessages.length, 1, "acknowledged morning greeting should not redeliver through Telegram");

    const laterSnapshot = await refreshMorningGreetingLowPriority({ nowMs: MORNING_LATER_MS });
    assert.equal(
      laterSnapshot?.extensions?.morningGreeting?.status,
      "acknowledged",
      `expected once-per-day morning greeting after acknowledgment, got ${JSON.stringify(laterSnapshot?.extensions?.morningGreeting)}`
    );
    assert.equal(
      laterSnapshot?.extensions?.morningGreeting?.messageId,
      happyGreeting.messageId,
      "acknowledged morning greeting should not regenerate a second message the same morning"
    );

    process.env.AURORA_MEMORY_PATH = unhappyRuntime.memoryPath;
    process.env.AURORA_EVENT_LOG_PATH = unhappyRuntime.eventPath;
    process.env.AURORA_RAW_RECALL_PATH = unhappyRuntime.rawRecallPath;
    process.env.AURORA_COMPLIANCE_LOG_PATH = unhappyRuntime.compliancePath;

    await refreshMorningGreetingLowPriority({ nowMs: MORNING_AT_MS });
    const unhappySnapshot = await getCognitiveSnapshotReadOnly();
    const unhappyGreeting = unhappySnapshot.extensions?.morningGreeting;
    assert.ok(unhappyGreeting, "expected morning greeting snapshot for unhappy scenario");
    assert.notEqual(
      unhappyGreeting.status,
      "pending",
      `strained relationship should suppress pending morning greeting, got ${JSON.stringify(unhappyGreeting)}`
    );
    assert.equal(
      unhappyGreeting.messageId,
      "",
      `strained relationship should not generate a morning greeting message id, got ${JSON.stringify(unhappyGreeting)}`
    );

    console.log("Morning greeting volition verified.");
  } finally {
    process.env.AURORA_MEMORY_PATH = prevMemoryPath;
    process.env.AURORA_EVENT_LOG_PATH = prevEventPath;
    process.env.AURORA_RAW_RECALL_PATH = prevRawRecallPath;
    process.env.AURORA_COMPLIANCE_LOG_PATH = prevCompliancePath;
  }
}

void main();
