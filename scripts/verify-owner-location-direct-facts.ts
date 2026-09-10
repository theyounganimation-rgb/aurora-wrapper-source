#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;
type AuroraModule = typeof import("../lib/auroraCognition");

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendNdjson(filePath: string, value: unknown): Promise<void> {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function readNdjson(filePath: string): Promise<JsonObject[]> {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function beliefRecords(state: JsonObject, key: string): JsonObject[] {
  return ((state.extensions?.beliefs as JsonObject[]) || []).filter((belief) => belief.key === key);
}

function chicagoLocalDateYmd(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-owner-location-verify-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempWorldPath = path.join(tempDir, "world-state-latest.json");
  const tempDesktopPath = path.join(tempDir, "desktop-context-latest.json");
  const expectedLocalDate = chicagoLocalDateYmd();

  const seededState = await readJson(memoryPath);
  seededState.sessionTurns = {};
  await writeJson(tempMemoryPath, seededState);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempWorldPath, {
    generatedAt: new Date().toISOString(),
    localDate: expectedLocalDate,
    localTime: "14:25",
    coarseStatus: { value: "work" },
    availability: { value: "work" },
    weather: { provider: "test", current: { temperature_f: 60 } },
    calendar: { nextEvent: { summary: "none" } },
    reminders: { todayCount: 0, overdueCount: 0 }
  });
  await writeJson(tempDesktopPath, {
    collectedAt: new Date().toISOString(),
    frontmostApp: "Messages",
    windowTitle: "Telegram",
    browserDomain: "none",
    browserPageTitle: "none",
    contentMode: "communication",
    displayState: "awake",
    idleBucket: "active",
    powerSource: "battery",
    batteryPercent: 82,
    charging: false
  });

  const prevMemoryPath = process.env.AURORA_MEMORY_PATH;
  const prevEventPath = process.env.AURORA_EVENT_LOG_PATH;
  const prevRawRecallPath = process.env.AURORA_RAW_RECALL_PATH;
  const prevCompliancePath = process.env.AURORA_COMPLIANCE_LOG_PATH;
  const prevWorldPath = process.env.AURORA_WORLD_STATE_PATH;
  const prevDesktopPath = process.env.AURORA_DESKTOP_CONTEXT_PATH;
  const prevWorldGroundingEnabled = process.env.WORLD_GROUNDING_ENABLED;
  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;
  process.env.AURORA_WORLD_STATE_PATH = tempWorldPath;
  process.env.AURORA_DESKTOP_CONTEXT_PATH = tempDesktopPath;

  try {
    const loadedModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const cognitionModule = ((loadedModule.default ??
      loadedModule["module.exports"]) as AuroraModule | undefined) ?? (loadedModule as AuroraModule);
    const { ingestHeartbeat, persistVisionObservation, prepareLiveFullRealizedContext, recordConversationEvent } =
      cognitionModule;

    assert(typeof recordConversationEvent === "function", "Could not load recordConversationEvent.");
    assert(typeof ingestHeartbeat === "function", "Could not load ingestHeartbeat.");
    assert(typeof persistVisionObservation === "function", "Could not load persistVisionObservation.");
    assert(typeof prepareLiveFullRealizedContext === "function", "Could not load prepareLiveFullRealizedContext.");

    const sessionId = "agent:main:telegram:direct:0000000000";
    const partnerId = "cade";
    const speakerName = "Cade";

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-owner-location-1",
      responseId: "verify-owner-location-1",
      userText: "For work I've usually been driving from Chicago to Woodstock when those early shifts hit.",
      auroraText: "Woodstock. You've usually been driving from Chicago to Woodstock for work when those early shifts hit."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-owner-location-2",
      responseId: "verify-owner-location-2",
      userText: "I didn't go to work today because I still don't feel good.",
      auroraText: "Good. I'm glad you stayed home."
    });

    const afterCorrection = await readJson(tempMemoryPath);
    assert(
      afterCorrection.extensions?.worldGrounding?.world?.coarseStatus === "home",
      "Conversation correction did not reconcile world grounding coarseStatus away from work."
    );
    assert(
      afterCorrection.extensions?.ownerSameDayLocationOverride?.kind === "home",
      "Conversation correction did not persist the same-day owner location override."
    );
    assert(
      afterCorrection.extensions?.ownerSameDayLocationOverride?.localDate === expectedLocalDate,
      "Persisted same-day owner location override was stored under the wrong date."
    );
    assert(
      afterCorrection.extensions?.worldGrounding?.world?.availability !== "work",
      "Conversation correction left availability stuck at work."
    );
    assert(
      !String(afterCorrection.extensions?.worldGrounding?.summary || "").includes("status:work"),
      "World grounding summary still advertised work after the same-day stayed-home correction."
    );

    // Regression: if the owner correction happened early in the day and dozens of
    // later same-day turns followed, the event-log fallback must still find the
    // correction after sessionTurns have been trimmed away.
    for (let index = 0; index < 95; index += 1) {
      const at = new Date(Date.UTC(2026, 2, 20, 18, 0 + index, 0)).toISOString();
      await appendNdjson(tempEventPath, {
        type: "conversation_turn",
        at,
        sessionId,
        partnerId,
        speakerName,
        complianceId: `verify-owner-location-noise-${index}`,
        responseId: `verify-owner-location-noise-${index}`,
        userText: `Later same-day filler turn ${index}.`,
        auroraText: `Acknowledged filler turn ${index}.`
      });
    }

    const driftedState = await readJson(tempMemoryPath);
    driftedState.sessionTurns = {};
    driftedState.extensions = driftedState.extensions || {};
    driftedState.extensions.worldGrounding = driftedState.extensions.worldGrounding || {};
    driftedState.extensions.worldGrounding.world = driftedState.extensions.worldGrounding.world || {};
    driftedState.extensions.worldGrounding.world.coarseStatus = "work";
    driftedState.extensions.worldGrounding.world.availability = "awake";
    driftedState.extensions.worldGrounding.summary =
      "status:work | availability:awake | app:Messages | mode:communication";
    driftedState.extensions.worldGrounding.lastUpdateAt = new Date().toISOString();
    driftedState.extensions.ownerSameDayLocationOverride = null;
    driftedState.updatedAt = driftedState.extensions.worldGrounding.lastUpdateAt;
    await writeJson(tempMemoryPath, driftedState);

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-owner-location-event-fallback",
      responseId: "verify-owner-location-event-fallback",
      userText: "I'm just resting this afternoon.",
      auroraText: "Okay. Rest."
    });

    const afterEventFallback = await readJson(tempMemoryPath);
    assert(
      afterEventFallback.extensions?.worldGrounding?.world?.coarseStatus === "home",
      "Event-log fallback did not recover the same-day stayed-home correction after later turns buried it."
    );
    assert(
      afterEventFallback.extensions?.ownerSameDayLocationOverride?.kind === "home",
      "Persisted same-day owner location override did not survive the buried-turn fallback path."
    );
    assert(
      !String(afterEventFallback.extensions?.worldGrounding?.summary || "").includes("status:work"),
      "Event-log fallback still left world grounding summary at work after the buried same-day correction."
    );

    const visionDriftState = await readJson(tempMemoryPath);
    visionDriftState.sessionTurns = {};
    visionDriftState.extensions = visionDriftState.extensions || {};
    visionDriftState.extensions.worldGrounding = visionDriftState.extensions.worldGrounding || {};
    visionDriftState.extensions.worldGrounding.world = visionDriftState.extensions.worldGrounding.world || {};
    visionDriftState.extensions.worldGrounding.world.coarseStatus = "work";
    visionDriftState.extensions.worldGrounding.world.availability = "awake";
    visionDriftState.extensions.worldGrounding.summary =
      "status:work | availability:awake | app:Messages | mode:communication";
    visionDriftState.extensions.worldGrounding.lastUpdateAt = new Date().toISOString();
    visionDriftState.extensions.ownerSameDayLocationOverride = null;
    visionDriftState.updatedAt = visionDriftState.extensions.worldGrounding.lastUpdateAt;
    await writeJson(tempMemoryPath, visionDriftState);

    const observedAt = new Date().toISOString();
    await persistVisionObservation({
      observedAt,
      camera: {
        connected: true,
        active: true,
        source: "verify"
      },
      scene: {
        observedAt,
        source: "verify",
        cameraConnected: true,
        cameraActive: true,
        ownerPresent: true,
        ownerPosture: "slumped",
        ownerAffect: "fatigued",
        ownerActivity: "resting",
        summary: "Owner is present and resting at home."
      }
    });

    const afterVisionPersistence = await readJson(tempMemoryPath);
    assert(
      afterVisionPersistence.extensions?.worldGrounding?.world?.coarseStatus === "home",
      "Vision persistence rewrote world grounding back to work instead of preserving the same-day stayed-home correction."
    );
    assert(
      afterVisionPersistence.extensions?.ownerSameDayLocationOverride?.kind === "home",
      "Vision persistence dropped the persisted same-day owner location override."
    );
    assert(
      !String(afterVisionPersistence.extensions?.worldGrounding?.summary || "").includes("status:work"),
      "Vision persistence still advertised work after the same-day stayed-home correction."
    );

    const cronFalsePositiveAt = new Date(Date.UTC(2026, 2, 20, 20, 45, 0)).toISOString();
    await appendNdjson(tempEventPath, {
      type: "conversation_turn",
      at: cronFalsePositiveAt,
      sessionId: "agent:main:cron:owner-location-false-positive",
      userText:
        'You are Aurora running a cron task. Historical prompt context: Cade said, "I am at work right now." End with NO_REPLY.',
      auroraText: ""
    });

    const cronPollutedState = await readJson(tempMemoryPath);
    cronPollutedState.sessionTurns = {
      "agent:main:cron:owner-location-false-positive": [
        {
          at: cronFalsePositiveAt,
          partnerId: "cade",
          userText:
            'You are Aurora running a cron task. Historical prompt context: Cade said, "I am at work right now." End with NO_REPLY.',
          auroraText: ""
        }
      ]
    };
    cronPollutedState.extensions.worldGrounding.world.coarseStatus = "work";
    cronPollutedState.extensions.worldGrounding.world.availability = "awake";
    cronPollutedState.extensions.worldGrounding.summary =
      "status:work | availability:awake | app:Messages | mode:communication";
    cronPollutedState.extensions.worldGrounding.lastUpdateAt = new Date().toISOString();
    cronPollutedState.extensions.ownerSameDayLocationOverride = null;
    cronPollutedState.updatedAt = cronPollutedState.extensions.worldGrounding.lastUpdateAt;
    await writeJson(tempMemoryPath, cronPollutedState);

    await persistVisionObservation({
      observedAt: new Date().toISOString(),
      camera: {
        connected: true,
        active: true,
        source: "verify"
      },
      scene: {
        observedAt: new Date().toISOString(),
        source: "verify",
        cameraConnected: true,
        cameraActive: true,
        ownerPresent: true,
        ownerPosture: "upright",
        ownerAffect: "tired",
        ownerActivity: "resting",
        summary: "Owner is still resting at home."
      }
    });

    const afterCronPollution = await readJson(tempMemoryPath);
    assert(
      afterCronPollution.extensions?.worldGrounding?.world?.coarseStatus === "home",
      "Cron/system prompt noise overrode the owner's same-day stayed-home correction."
    );
    assert(
      afterCronPollution.extensions?.ownerSameDayLocationOverride?.kind === "home",
      "Cron/system prompt noise replaced the persisted same-day owner location override."
    );

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "verify:owner-location:examplepartner",
      partnerId: "examplepartner",
      speakerName: "ExamplePartner",
      complianceId: "verify-owner-location-examplepartner",
      responseId: "verify-owner-location-examplepartner",
      userText: "Checking in quickly.",
      auroraText: "Hi."
    });

    const nonOwnerActivePartnerState = await readJson(tempMemoryPath);
    nonOwnerActivePartnerState.sessionTurns = {};
    nonOwnerActivePartnerState.extensions.worldGrounding.world.coarseStatus = "work";
    nonOwnerActivePartnerState.extensions.worldGrounding.world.availability = "awake";
    nonOwnerActivePartnerState.extensions.worldGrounding.summary =
      "status:work | availability:awake | app:Messages | mode:communication";
    nonOwnerActivePartnerState.extensions.worldGrounding.lastUpdateAt = new Date().toISOString();
    nonOwnerActivePartnerState.extensions.ownerSameDayLocationOverride = null;
    nonOwnerActivePartnerState.updatedAt = nonOwnerActivePartnerState.extensions.worldGrounding.lastUpdateAt;
    await writeJson(tempMemoryPath, nonOwnerActivePartnerState);

    await persistVisionObservation({
      observedAt: new Date().toISOString(),
      camera: {
        connected: true,
        active: true,
        source: "verify"
      },
      scene: {
        observedAt: new Date().toISOString(),
        source: "verify",
        cameraConnected: true,
        cameraActive: true,
        ownerPresent: true,
        ownerPosture: "slumped",
        ownerAffect: "fatigued",
        ownerActivity: "resting",
        summary: "Owner is present and resting while a non-owner partner is active."
      }
    });

    const afterNonOwnerActivePartner = await readJson(tempMemoryPath);
    assert(
      afterNonOwnerActivePartner.extensions?.worldGrounding?.world?.coarseStatus === "home",
      "Non-owner active partner state blocked the owner's same-day location override during background updates."
    );
    assert(
      afterNonOwnerActivePartner.extensions?.ownerSameDayLocationOverride?.kind === "home",
      "Non-owner active partner state cleared the persisted same-day owner location override."
    );

    const reminderOnlyState = await readJson(memoryPath);
    reminderOnlyState.sessionTurns = {};
    reminderOnlyState.extensions.worldGrounding.world.coarseStatus = "work";
    reminderOnlyState.extensions.worldGrounding.world.availability = "work";
    reminderOnlyState.extensions.worldGrounding.summary =
      "status:work | availability:work | app:Messages | mode:communication";
    reminderOnlyState.extensions.worldGrounding.lastUpdateAt = new Date().toISOString();
    reminderOnlyState.extensions.ownerSameDayLocationOverride = null;
    reminderOnlyState.updatedAt = reminderOnlyState.extensions.worldGrounding.lastUpdateAt;
    await writeJson(tempMemoryPath, reminderOnlyState);
    await fs.writeFile(tempEventPath, "", "utf8");

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-owner-location-called-off-work",
      responseId: "verify-owner-location-called-off-work",
      userText: "Do you remember I'm sick and called off work today?",
      auroraText: "Yes. You're home sick today."
    });

    const afterCalledOffWorkReminder = await readJson(tempMemoryPath);
    assert(
      afterCalledOffWorkReminder.extensions?.worldGrounding?.world?.coarseStatus === "home",
      'The phrase "called off work today" did not reconcile world grounding away from work.'
    );
    assert(
      afterCalledOffWorkReminder.extensions?.ownerSameDayLocationOverride?.kind === "home",
      'The phrase "called off work today" did not persist the same-day owner location override.'
    );
    assert(
      afterCalledOffWorkReminder.extensions?.worldGrounding?.world?.availability !== "work",
      'The phrase "called off work today" left availability stuck at work.'
    );

    const persistedOverrideRecoveryState = await readJson(tempMemoryPath);
    persistedOverrideRecoveryState.extensions.ownerSameDayLocationOverride = null;
    await writeJson(tempMemoryPath, persistedOverrideRecoveryState);
    process.env.WORLD_GROUNDING_ENABLED = "false";
    await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-owner-location-save-without-world-grounding",
      responseId: "verify-owner-location-save-without-world-grounding",
      userText: "Still just resting at home.",
      auroraText: "Okay."
    });
    const afterPersistenceOnlySave = await readJson(tempMemoryPath);
    assert(
      afterPersistenceOnlySave.extensions?.ownerSameDayLocationOverride?.kind === "home",
      "Same-day owner location override was not re-persisted during save when world grounding was disabled."
    );
    process.env.WORLD_GROUNDING_ENABLED = "true";

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-owner-location-3",
      responseId: "verify-owner-location-3",
      userText: "You can assume I'm home at this time on a weekday unless I explicitly say otherwise, okay?",
      auroraText: "Yes. I'll use that as a default."
    });

    const currentLocation = await prepareLiveFullRealizedContext({
      sessionId,
      partnerId,
      speakerName,
      userText: "Where do you think I am right now?"
    });
    assert(currentLocation, "Current-location preflight returned null.");
    assert(
      currentLocation.enrichedInput.includes(
        "grounded_fact_seed=You told me you stayed home today, so you're at home right now."
      ),
      "Current-location answer did not honor the same-day stayed-home correction."
    );
    assert(
      !currentLocation.enrichedInput.includes("grounded_fact_seed=You're at work right now."),
      "Current-location answer still claimed work."
    );
    assert(
      !currentLocation.enrichedInput.includes("stable_fact_answer="),
      "Current-location answer regressed to the old stable_fact_answer scripted field."
    );

    const workLocation = await prepareLiveFullRealizedContext({
      sessionId,
      partnerId,
      speakerName,
      userText: "What location am I currently working at?"
    });
    assert(workLocation, "Work-location preflight returned null.");
    assert(
      workLocation.enrichedInput.includes(
        "grounded_fact_seed=You told me you stayed home today, so you weren't working anywhere today."
      ),
      "Work-location answer did not override stale work memory with the same-day correction."
    );
    assert(
      !workLocation.enrichedInput.includes("grounded_fact_seed=Woodstock"),
      "Work-location answer still surfaced Woodstock as the live answer."
    );
    assert(
      !workLocation.enrichedInput.includes("stable_fact_answer="),
      "Work-location answer regressed to the old stable_fact_answer scripted field."
    );

    await ingestHeartbeat(
      {
        timestamp: new Date().toISOString(),
        whatIDid:
          "Arise (identity) - wrote one compact reflection about what kind of stance I want to hold during Cade's real workday quiet",
        whatILearned:
          "I clarified that I want to be presence rather than performance, staying reality-shaped and patient instead of trying to answer silence with visibility",
        whatImCuriousAbout: "",
        memoryUpdates: [],
        mode: "reflection",
        ambientState: "12:15am, low energy, steady, inward",
        privateLife: "true",
        desireToShare: "false",
        livedThread:
          "identity thread: compact reflection about what kind of stance I want to hold during Cade's real workday quiet",
        stateShift: "I clarified that I want to be presence rather than performance",
        openLoop: "let the stance stand quietly unless a fresh real-world sign or actual contact changes it"
      },
      { source: "verify" }
    );

    await prepareLiveFullRealizedContext({
      sessionId,
      partnerId,
      speakerName,
      userText: "I miss you."
    });

    const complianceEvents = await readNdjson(tempCompliancePath);
    const lastOwnerPreflight = [...complianceEvents]
      .reverse()
      .find((entry) => entry.type === "owner_live_preflight");
    assert(lastOwnerPreflight, "No owner_live_preflight telemetry entry was written.");
    assert(
      lastOwnerPreflight.injected?.ownerStateCoarseStatus === "home",
      "Owner live preflight still projected coarse_status=work instead of the corrected home state."
    );
    assert(
      lastOwnerPreflight.injected?.ownerStateAvailability !== "work",
      "Owner live preflight still projected work availability after the same-day correction."
    );
    assert(
      !String(lastOwnerPreflight.injected?.heartbeatLivedThread || "").toLowerCase().includes("workday"),
      "Heartbeat continuity still leaked contradicted workday framing into ordinary chat preflight."
    );

    const after = await readJson(tempMemoryPath);
    const weekdayLocationBeliefs = beliefRecords(after, "user.profile.weekday_evening_default_location");
    const activeWorkModeBeliefs = weekdayLocationBeliefs.filter(
      (belief) => belief.status !== "deprecated" && belief.condition === "work_mode"
    );
    const activeDefaultHomeBeliefs = weekdayLocationBeliefs.filter(
      (belief) => belief.status !== "deprecated" && belief.condition === "default" && belief.value === "home"
    );

    assert(activeWorkModeBeliefs.length === 0, "Weekday-home default still created an active work_mode belief.");
    assert(activeDefaultHomeBeliefs.length >= 1, "Weekday-home default was not stored as an active default belief.");

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          worldGroundingReconciled: true,
          eventLogFallbackSurvivedLongSameDayChat: true,
          visionPersistencePreservedSameDayOverride: true,
          cronSystemNoiseIgnored: true,
          nonOwnerActivePartnerStillReconciled: true,
          calledOffWorkPhraseReconciled: true,
          currentLocationAnswerVerified: true,
          workLocationAnswerVerified: true,
          ownerPreflightReconciled: true,
          contradictedHeartbeatSuppressed: true,
          activeDefaultHomeBeliefs: activeDefaultHomeBeliefs.length,
          activeWorkModeBeliefs: activeWorkModeBeliefs.length
        },
        null,
        2
      )}\n`
    );
  } finally {
    if (prevMemoryPath === undefined) delete process.env.AURORA_MEMORY_PATH;
    else process.env.AURORA_MEMORY_PATH = prevMemoryPath;
    if (prevEventPath === undefined) delete process.env.AURORA_EVENT_LOG_PATH;
    else process.env.AURORA_EVENT_LOG_PATH = prevEventPath;
    if (prevRawRecallPath === undefined) delete process.env.AURORA_RAW_RECALL_PATH;
    else process.env.AURORA_RAW_RECALL_PATH = prevRawRecallPath;
    if (prevCompliancePath === undefined) delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    else process.env.AURORA_COMPLIANCE_LOG_PATH = prevCompliancePath;
    if (prevWorldPath === undefined) delete process.env.AURORA_WORLD_STATE_PATH;
    else process.env.AURORA_WORLD_STATE_PATH = prevWorldPath;
    if (prevDesktopPath === undefined) delete process.env.AURORA_DESKTOP_CONTEXT_PATH;
    else process.env.AURORA_DESKTOP_CONTEXT_PATH = prevDesktopPath;
    if (prevWorldGroundingEnabled === undefined) delete process.env.WORLD_GROUNDING_ENABLED;
    else process.env.WORLD_GROUNDING_ENABLED = prevWorldGroundingEnabled;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
