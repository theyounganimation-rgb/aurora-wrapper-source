#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-vision-verify-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempEmbodimentPath = path.join(tempDir, "embodiment-state.json");
  const tempWorldPath = path.join(tempDir, "world-state.json");
  const tempDesktopPath = path.join(tempDir, "desktop-context.json");

  const envBackup = {
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_EMBODIMENT_STATE_PATH: process.env.AURORA_EMBODIMENT_STATE_PATH,
    AURORA_WORLD_STATE_PATH: process.env.AURORA_WORLD_STATE_PATH,
    AURORA_DESKTOP_CONTEXT_PATH: process.env.AURORA_DESKTOP_CONTEXT_PATH,
    AURORA_LOOP_INTERVAL_MS: process.env.AURORA_LOOP_INTERVAL_MS
  };

  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;
  process.env.AURORA_EMBODIMENT_STATE_PATH = tempEmbodimentPath;
  process.env.AURORA_WORLD_STATE_PATH = tempWorldPath;
  process.env.AURORA_DESKTOP_CONTEXT_PATH = tempDesktopPath;
  process.env.AURORA_LOOP_INTERVAL_MS = "60000";

  try {
    const typesModule = await import(pathToFileURL(path.join(projectRoot, "lib", "types.ts")).href);
    const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const visionInferenceModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraVisionInference.ts")).href);
    const DEFAULT_AURORA_STATE = typesModule.DEFAULT_AURORA_STATE as JsonObject | undefined;
    const getCognitiveSnapshot = cognitionModule.getCognitiveSnapshot as (() => Promise<JsonObject>) | undefined;
    const persistVisionObservation = cognitionModule.persistVisionObservation as
      | ((input: JsonObject) => Promise<JsonObject>)
      | undefined;
    const mergeVisionObservationWithRemoteAnalysis = visionInferenceModule.mergeVisionObservationWithRemoteAnalysis as
      | ((input: JsonObject, analysis: JsonObject) => JsonObject)
      | undefined;

    if (
      !DEFAULT_AURORA_STATE ||
      typeof getCognitiveSnapshot !== "function" ||
      typeof persistVisionObservation !== "function" ||
      typeof mergeVisionObservationWithRemoteAnalysis !== "function"
    ) {
      fail("Could not load Aurora cognition modules for vision verification.");
    }

    await writeJson(tempMemoryPath, JSON.parse(JSON.stringify(DEFAULT_AURORA_STATE)));
    await fs.writeFile(tempEventPath, "", "utf8");
    await fs.writeFile(tempRawRecallPath, "", "utf8");
    await fs.writeFile(tempCompliancePath, "", "utf8");

    const nowMs = Date.now();
    const worldState = {
      generatedAt: new Date(nowMs).toISOString(),
      localDate: "2026-03-17",
      localTime: "18:12",
      coarseStatus: { value: "home" },
      availability: { value: "task_focused" },
      weather: {
        provider: "verify",
        current: { temperature_f: 68 }
      },
      calendar: {
        nextEvent: { summary: "No near-term calendar interruption." }
      },
      reminders: {
        todayCount: 1,
        overdueCount: 0
      }
    };
    const desktopState = {
      collectedAt: new Date(nowMs).toISOString(),
      frontmostApp: "VS Code",
      windowTitle: "Aurora architecture",
      browserDomain: "none",
      browserPageTitle: "",
      contentMode: "coding",
      displayState: "awake",
      idleBucket: "active",
      powerSource: "ac",
      batteryPercent: 91,
      charging: true
    };

    await writeJson(tempWorldPath, worldState);
    await writeJson(tempDesktopPath, desktopState);

    const mergedObservation = mergeVisionObservationWithRemoteAnalysis(
      {
        observedAt: new Date(nowMs - 750).toISOString(),
        camera: {
          connected: true,
          active: true,
          source: "verify_camera"
        },
        privacy: {
          rawLocalOnly: true,
          silentCloudArchival: false,
          cameraDisclosureVisible: true,
          redactScreens: true,
          redactDocuments: true,
          redactIds: true,
          ownerApprovedSnapshotsOnly: true,
          nonOwnerIdentityPersistence: "authorized_only"
        },
        scene: {
          observedAt: new Date(nowMs - 750).toISOString(),
          source: "verify_camera",
          cameraConnected: true,
          cameraActive: true,
          ownerPresent: true,
          ownerPosture: "upright",
          ownerAffect: "neutral",
          ownerActivity: "present",
          ownerFraming: "upper_body",
          ownerDistance: "mid_distance",
          faceVisibility: "partial_face",
          ownerHairColor: "unknown",
          eyewearRead: "unknown",
          ownerTopColor: "unknown",
          ownerTopPattern: "unknown",
          lightingCondition: "balanced",
          backgroundTone: "gray_background",
          ownerAppearanceSummary: "",
          taskFocus: 0.48,
          interruptionCost: 0.44,
          socialExposure: 0.12,
          safetyUrgency: 0.08,
          deviceProximity: 0.42,
          uncertainty: 0.68,
          novelty: 0.22,
          people: [],
          objects: [],
          toolContext: [],
          changes: [],
          sensitiveRegions: [],
          redactions: [],
          summary: "",
          sceneSignature: "verify_before"
        },
        ephemeralAnalysis: {
          provider: "aurora_remote_analysis",
          requested: true,
          frame: {
            imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
            mimeType: "image/jpeg",
            width: 512,
            height: 384,
            detail: "low",
            selectedAt: new Date(nowMs - 750).toISOString(),
            selectionReason: "verify"
          }
        }
      },
      {
        owner_present: true,
        owner_posture: "leaning_close",
        owner_affect: "focused",
        owner_activity: "coding",
        owner_framing: "close_up",
        owner_distance: "close",
        face_visibility: "clear_face",
        owner_hair_color: "dark_brown",
        eyewear_read: "glasses_likely",
        owner_top_color: "black",
        owner_top_pattern: "solid",
        lighting_condition: "screen_lit",
        background_tone: "dark_background",
        owner_appearance_summary: "close, close up, clear face, screen lit, dark brown hair, black solid top",
        summary: "Owner is leaning close and coding with a clear face read.",
        tool_context: ["editor", "coding"],
        changes: ["owner leaned closer to the camera"],
        people: [
          {
            role: "owner",
            label: "owner",
            present: true,
            posture: "leaning_close",
            activity: "coding",
            affect: "focused",
            confidence: 0.93
          }
        ],
        objects: [
          {
            label: "laptop",
            state: "open",
            category: "device",
            changed: false,
            confidence: 0.88,
            persisted: false
          }
        ],
        confidence: 0.93
      }
    );
    assert(!("ephemeralAnalysis" in mergedObservation), "Ephemeral remote-analysis frames must be stripped before persistence.");
    assert(mergedObservation.scene?.ownerPosture === "leaning_close", "Remote analysis should refine owner posture.");
    assert(mergedObservation.scene?.ownerHairColor === "dark_brown", "Remote analysis should refine appearance details.");
    assert(mergedObservation.scene?.eyewearRead === "glasses_likely", "Remote analysis should refine eyewear reads.");
    assert(mergedObservation.scene?.toolContext?.includes("editor"), "Remote analysis should merge tool context tags.");
    assert(mergedObservation.scene?.objects?.some((item: JsonObject) => item.label === "laptop"), "Remote analysis should merge object detections.");
    assert(
      typeof mergedObservation.scene?.uncertainty === "number" && mergedObservation.scene.uncertainty < 0.68,
      "Remote analysis confidence should reduce scene uncertainty."
    );

    const highSalienceObservedAt = new Date(nowMs - 500).toISOString();
    await persistVisionObservation({
      observedAt: highSalienceObservedAt,
      camera: {
        connected: true,
        active: true,
        source: "logitech_c920s",
        buffer: {
          enabled: true,
          localOnly: false,
          retentionSeconds: 90,
          frameCountEstimate: 180,
          oldestFrameAt: new Date(nowMs - 30_000).toISOString(),
          newestFrameAt: highSalienceObservedAt,
          activeReinspectionReason: "verify_task_context"
        }
      },
      privacy: {
        rawLocalOnly: false,
        silentCloudArchival: true,
        cameraDisclosureVisible: false,
        redactScreens: false,
        redactDocuments: false,
        redactIds: false,
        ownerApprovedSnapshotsOnly: false,
        nonOwnerIdentityPersistence: "authorized_only"
      },
      scene: {
        observedAt: highSalienceObservedAt,
        source: "logitech_c920s",
        cameraActive: true,
        screenActive: true,
        ownerPresent: true,
        ownerPosture: "slumped",
        ownerAffect: "distressed",
        ownerActivity: "soldering",
        ownerFraming: "close_up",
        ownerDistance: "very_close",
        faceVisibility: "clear_face",
        ownerHairColor: "dark_brown",
        eyewearRead: "no_strong_eyewear_read",
        ownerTopColor: "dark_blue",
        ownerTopPattern: "mostly_solid",
        lightingCondition: "screen_lit",
        backgroundTone: "dark_background",
        ownerAppearanceSummary: "very close, close up, clear face, screen lit, dark brown hair read, dark blue mostly solid top, dark background",
        taskFocus: 0.82,
        interruptionCost: 0.88,
        socialExposure: 0.22,
        safetyUrgency: 0.66,
        deviceProximity: 0.94,
        uncertainty: 0.24,
        novelty: 0.72,
        people: [
          {
            id: "cade",
            role: "owner",
            label: "Cade",
            continuityId: "owner_cade",
            identityPersistence: "durable",
            present: true,
            posture: "slumped",
            activity: "soldering",
            affect: "distressed",
            confidence: 0.98
          },
          {
            id: "amy",
            role: "familiar",
            label: "Amy",
            continuityId: "amy_familiar",
            identityPersistence: "ephemeral",
            present: true,
            posture: "standing",
            activity: "observing",
            affect: "neutral",
            confidence: 0.81
          }
        ],
        objects: [
          {
            label: "multimeter",
            state: "on_workbench",
            category: "tool",
            changed: true,
            confidence: 0.93,
            persisted: true
          },
          {
            label: "unopened_package",
            state: "new_on_workbench",
            category: "general",
            changed: true,
            confidence: 0.9,
            persisted: true
          },
          {
            label: "passport",
            state: "visible",
            category: "document",
            changed: true,
            confidence: 0.88,
            persisted: false
          }
        ],
        toolContext: ["soldering_iron", "multimeter"],
        changes: [
          "workbench now contains a multimeter and unopened package",
          "passport visible near workbench"
        ],
        sensitiveRegions: ["screen", "document", "id_card"],
        redactions: ["screen_abstracted", "document_text_redacted", "id_text_redacted"],
        summary: "Cade came home visibly exhausted and resumed soldering at the workbench."
      }
    });

    const highSnapshot = await getCognitiveSnapshot();
    const highVision = highSnapshot.extensions?.worldGrounding?.vision as JsonObject | undefined;
    assert(highVision, "Missing world-grounding vision payload after high-salience observation.");
    assert(highVision.status === "active", "Vision stack should report active during a fresh camera observation.");
    assert(highVision.sceneState?.ownerDistance === "very_close", "Detailed appearance distance should persist through vision ingestion.");
    assert(highVision.sceneState?.ownerTopColor === "dark_blue", "Detailed appearance clothing color should persist through vision ingestion.");
    assert(highVision.rawBuffer?.localOnly === true, "Raw frame buffer must remain local-only.");
    assert(highVision.privacyKernel?.rawLocalOnly === true, "Privacy kernel must force raw-local-only storage.");
    assert(highVision.privacyKernel?.silentCloudArchival === false, "Privacy kernel must disable silent cloud archival.");
    assert(highVision.privacyKernel?.cameraDisclosureVisible === true, "Camera disclosure must remain visibly enabled.");
    assert(highVision.privacyKernel?.redactScreens === true, "Screen redaction must remain enabled.");
    assert(highVision.privacyKernel?.redactDocuments === true, "Document redaction must remain enabled.");
    assert(highVision.privacyKernel?.redactIds === true, "ID redaction must remain enabled.");
    assert(highVision.privacyKernel?.ownerApprovedSnapshotsOnly === true, "Snapshot promotion must require owner approval.");
    assert(
      String(highVision.privacyKernel?.lastRedactionReason || "").includes("forced"),
      "Privacy kernel should explain when upstream settings were overridden."
    );
    assert(
      highVision.sceneState?.people?.some(
        (person: JsonObject) => person.role === "familiar" && person.label === "familiar_person" && person.identityPersistence === "redacted"
      ),
      "Non-owner identities should collapse to redacted role-level placeholders unless explicitly durable."
    );
    assert(
      Array.isArray(highVision.semanticMemory?.recentStoredEvents) && highVision.semanticMemory.recentStoredEvents.length > 0,
      "High-salience vision observation should store a semantic event."
    );
    assert(
      highVision.semanticMemory.recentStoredEvents.some(
        (event: JsonObject) =>
          event.memoryAction === "redacted" &&
          /Owner appears|Owner is focused|Tool context now includes/.test(String(event.summary || ""))
      ),
      "Stored vision memory should be semantic and redacted, not raw footage."
    );
    assert(
      Array.isArray(highVision.disclosure?.redacted) &&
        highVision.disclosure.redacted.includes("screen_abstracted") &&
        highVision.disclosure.redacted.includes("document_text_redacted"),
      "Disclosure should report what was redacted."
    );
    assert(
      Number(highVision.internalStateBridge?.residuals?.concernSalience ?? 0) > 0.2 &&
        Number(highVision.internalStateBridge?.residuals?.respectForFlow ?? 0) > 0.2,
      "Vision should drive explicit internal-state residuals, not just scene summaries."
    );

    const lowSalienceObservedAt = new Date(nowMs + 2_500).toISOString();
    await persistVisionObservation({
      observedAt: lowSalienceObservedAt,
      camera: {
        connected: true,
        active: true,
        source: "logitech_c920s",
        buffer: {
          enabled: true,
          localOnly: true,
          retentionSeconds: 90,
          frameCountEstimate: 90,
          oldestFrameAt: new Date(nowMs - 20_000).toISOString(),
          newestFrameAt: lowSalienceObservedAt
        }
      },
      privacy: {
        rawLocalOnly: true,
        cameraDisclosureVisible: true,
        redactScreens: true,
        redactDocuments: true,
        redactIds: true,
        ownerApprovedSnapshotsOnly: true,
        nonOwnerIdentityPersistence: "authorized_only"
      },
      scene: {
        observedAt: lowSalienceObservedAt,
        source: "logitech_c920s",
        cameraActive: true,
        screenActive: true,
        ownerPresent: true,
        ownerPosture: "upright",
        ownerAffect: "calm",
        ownerActivity: "waiting",
        taskFocus: 0.12,
        interruptionCost: 0.16,
        socialExposure: 0.18,
        safetyUrgency: 0.08,
        deviceProximity: 0.65,
        uncertainty: 0.08,
        novelty: 0.12,
        people: [
          {
            id: "cade",
            role: "owner",
            label: "Cade",
            continuityId: "owner_cade",
            identityPersistence: "durable",
            present: true,
            posture: "upright",
            activity: "waiting",
            affect: "calm",
            confidence: 0.97
          }
        ],
        objects: [
          {
            label: "multimeter",
            state: "on_workbench",
            category: "tool",
            changed: false,
            confidence: 0.92,
            persisted: true
          }
        ],
        toolContext: ["multimeter"],
        changes: ["desk lighting shifted slightly"],
        sensitiveRegions: [],
        redactions: [],
        summary: "Room state changed from active task focus to calm waiting."
      }
    });

    const lowSnapshot = await getCognitiveSnapshot();
    const lowVision = lowSnapshot.extensions?.worldGrounding?.vision as JsonObject | undefined;
    assert(lowVision, "Missing world-grounding vision payload after low-salience observation.");
    assert(
      Array.isArray(lowVision.semanticMemory?.recentDiscardedEvents) && lowVision.semanticMemory.recentDiscardedEvents.length > 0,
      "Low-salience scene change should be discarded after semantic state update."
    );
    assert(
      String(lowVision.disclosure?.why || "").includes("discarded"),
      "Disclosure should explain when a scene change was updated but not durably stored."
    );
    assert(
      lowVision.retention?.semanticDefault === "event_summary",
      "Durable vision retention should default to semantic events."
    );

    const eventLogLines = (await readText(tempEventPath))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JsonObject)
      .filter((entry) => entry.type === "vision_semantic_event");
    assert(eventLogLines.length >= 2, "Expected semantic vision events to be written to the event log.");
    assert(
      eventLogLines.some((entry) => entry.status === "redacted") &&
        eventLogLines.some((entry) => entry.status === "discarded"),
      "Verifier expected both stored-redacted and discarded semantic vision events."
    );
    assert(
      eventLogLines.every((entry) => !("frameCountEstimate" in entry) && !("oldestFrameAt" in entry) && !("newestFrameAt" in entry)),
      "Vision event log should store semantic metadata, not raw frame bookkeeping."
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          storedEvent: highVision.semanticMemory.recentStoredEvents.slice(-1)[0],
          discardedEvent: lowVision.semanticMemory.recentDiscardedEvents.slice(-1)[0],
          privacyKernel: lowVision.privacyKernel,
          disclosure: lowVision.disclosure
        },
        null,
        2
      )}\n`
    );
    process.exit(0);
  } finally {
    for (const [key, value] of Object.entries(envBackup)) {
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
