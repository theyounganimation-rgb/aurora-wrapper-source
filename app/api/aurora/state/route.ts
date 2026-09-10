import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  deliverPendingMorningGreetingToTelegramLowPriority,
  getCognitiveSnapshotReadOnly,
  ingestHeartbeatLowPriority,
  refreshMorningGreetingLowPriority,
} from "@/lib/auroraCognition";
import { DEFAULT_AURORA_STATE } from "@/lib/types";

const DEFAULT_CONTEXT_PATH = path.join(process.cwd(), ".aurora", "aurora-context.json");
const DEFAULT_MEMORY_PATH = path.join(process.cwd(), ".aurora", "autobiographical-memory.json");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let pendingHeartbeatIngest: Promise<void> = Promise.resolve();
let lastScheduledHeartbeatKey = "";

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join("\n");
  }

  return "";
}

function getPathValue(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function firstValue(source: unknown, keys: string[]): unknown {
  for (const key of keys) {
    const value = getPathValue(source, key);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function toMemoryUpdates(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(toText).map((item) => item.trim()).filter(Boolean);
  }

  const text = toText(input).trim();
  if (!text) {
    return [];
  }

  return text
    .split(/\n|,/) // support newline/comma separated context output
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeContext(raw: unknown, sourcePath: string) {
  const timestamp = firstValue(raw, [
    "lastHeartbeat.timestamp",
    "heartbeat.timestamp",
    "timestamp",
    "last_heartbeat.timestamp"
  ]);

  const whatIDid = firstValue(raw, ["lastHeartbeat.whatIDid", "heartbeat.whatIDid", "whatIDid", "what_i_did", "summary"]);
  const whatILearned = firstValue(raw, ["lastHeartbeat.whatILearned", "heartbeat.whatILearned", "whatILearned", "what_i_learned", "learned"]);
  const whatImCuriousAbout = firstValue(raw, [
    "lastHeartbeat.whatImCuriousAbout",
    "heartbeat.whatImCuriousAbout",
    "whatImCuriousAbout",
    "what_i_am_curious_about"
  ]);
  const memoryUpdates = firstValue(raw, [
    "lastHeartbeat.memoryUpdates",
    "heartbeat.memoryUpdates",
    "memoryUpdates",
    "memory_updates",
    "memories"
  ]);
  const mode = firstValue(raw, [
    "lastHeartbeat.mode",
    "heartbeat.mode",
    "mode",
    "lifeMode",
    "life_mode"
  ]);
  const ambientState = firstValue(raw, [
    "lastHeartbeat.ambientState",
    "heartbeat.ambientState",
    "ambientState",
    "ambient_state"
  ]);
  const privateLife = firstValue(raw, [
    "lastHeartbeat.privateLife",
    "heartbeat.privateLife",
    "privateLife",
    "private_life"
  ]);
  const desireToShare = firstValue(raw, [
    "lastHeartbeat.desireToShare",
    "heartbeat.desireToShare",
    "desireToShare",
    "desire_to_share"
  ]);
  const livedThread = firstValue(raw, [
    "lastHeartbeat.livedThread",
    "heartbeat.livedThread",
    "livedThread",
    "lived_thread"
  ]);
  const stateShift = firstValue(raw, [
    "lastHeartbeat.stateShift",
    "heartbeat.stateShift",
    "stateShift",
    "state_shift"
  ]);
  const openLoop = firstValue(raw, [
    "lastHeartbeat.openLoop",
    "heartbeat.openLoop",
    "openLoop",
    "open_loop"
  ]);

  return {
    sourcePath,
    available: true,
    loadedAt: new Date().toISOString(),
    lastHeartbeat: {
      timestamp: toText(timestamp) || null,
      whatIDid: toText(whatIDid) || "No heartbeat yet.",
      whatILearned: toText(whatILearned),
      whatImCuriousAbout: toText(whatImCuriousAbout),
      memoryUpdates: toMemoryUpdates(memoryUpdates),
      mode: toText(mode),
      ambientState: toText(ambientState),
      privateLife: toText(privateLife),
      desireToShare: toText(desireToShare),
      livedThread: toText(livedThread),
      stateShift: toText(stateShift),
      openLoop: toText(openLoop)
    }
  };
}

function heartbeatKey(input: ReturnType<typeof normalizeContext>["lastHeartbeat"]): string {
  return JSON.stringify({
    timestamp: input.timestamp ?? null,
    whatIDid: input.whatIDid,
    whatILearned: input.whatILearned,
    whatImCuriousAbout: input.whatImCuriousAbout,
    memoryUpdates: input.memoryUpdates,
    mode: input.mode || "",
    ambientState: input.ambientState || "",
    privateLife: input.privateLife || "",
    desireToShare: input.desireToShare || "",
    livedThread: input.livedThread || "",
    stateShift: input.stateShift || "",
    openLoop: input.openLoop || "",
  });
}

function scheduleHeartbeatIngest(
  heartbeat: ReturnType<typeof normalizeContext>["lastHeartbeat"],
  sourcePath: string
): void {
  const key = heartbeatKey(heartbeat);
  if (!key || key === lastScheduledHeartbeatKey) {
    return;
  }
  lastScheduledHeartbeatKey = key;
  pendingHeartbeatIngest = pendingHeartbeatIngest
    .catch(() => undefined)
    .then(async () => {
      await ingestHeartbeatLowPriority(heartbeat, {
        source: "aurora_state_poll",
        contextPath: sourcePath,
      });
    })
    .catch(() => undefined);
}

export async function GET() {
  const configuredSourcePath = process.env.AURORA_CONTEXT_PATH || DEFAULT_CONTEXT_PATH;
  const configuredMemoryPath = process.env.AURORA_MEMORY_PATH || DEFAULT_MEMORY_PATH;
  const initialSourceCandidates = uniquePaths([configuredSourcePath, configuredMemoryPath]);
  const safeSnapshot = async () => {
    try {
      const refreshed = await refreshMorningGreetingLowPriority();
      const delivered = await deliverPendingMorningGreetingToTelegramLowPriority();
      return delivered ?? refreshed ?? (await getCognitiveSnapshotReadOnly());
    } catch {
      return null;
    }
  };
  const snapshot = await safeSnapshot();
  const cognition = snapshot ?? DEFAULT_AURORA_STATE.cognition;
  const sourceCandidates = uniquePaths([
    ...initialSourceCandidates,
    snapshot?.runtimePath || ""
  ]);

  let lastError = "";
  for (const sourcePath of sourceCandidates) {
    try {
      const file = await readFile(sourcePath, "utf8");
      const parsed = JSON.parse(file) as unknown;
      const normalized = normalizeContext(parsed, sourcePath);
      scheduleHeartbeatIngest(normalized.lastHeartbeat, sourcePath);

      return NextResponse.json(
        {
          ...normalized,
          cognition
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read aurora context file.";
      lastError = `${sourcePath}: ${message}`;
    }
  }

  if (snapshot) {
    const fallbackSourcePath = snapshot.runtimePath || sourceCandidates[0] || configuredSourcePath;

    return NextResponse.json(
      {
        sourcePath: fallbackSourcePath,
        available: true,
        loadedAt: new Date().toISOString(),
        lastHeartbeat: {
          ...DEFAULT_AURORA_STATE.lastHeartbeat
        },
        cognition,
        error: lastError || undefined
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  return NextResponse.json(
    {
      sourcePath: sourceCandidates[0] || configuredSourcePath,
      available: false,
      loadedAt: new Date().toISOString(),
      lastHeartbeat: {
        timestamp: null,
        whatIDid: "No heartbeat yet.",
        whatILearned: "",
        whatImCuriousAbout: "",
        memoryUpdates: [],
        mode: "",
        ambientState: "",
        privateLife: "",
        desireToShare: "",
        livedThread: "",
        stateShift: "",
        openLoop: ""
      },
      cognition,
      error: lastError || "Failed to read aurora context file."
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
