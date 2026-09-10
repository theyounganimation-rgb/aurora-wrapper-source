#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");
const eventLogPath = path.join(runtimeDir, "autobiographical-events.ndjson");
const rawRecallPath = path.join(runtimeDir, "raw-recall.ndjson");
const compliancePath = path.join(runtimeDir, "compliance.ndjson");

function fail(message: string): never {
  throw new Error(message);
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalize(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function makeMemoryNode(
  id: string,
  kind: string,
  summary: string,
  detail: string,
  outcome: string,
  createdAt: string
): JsonObject {
  return {
    id,
    kind,
    summary,
    detail,
    createdAt,
    updatedAt: createdAt,
    participants: ["aurora"],
    topics: [],
    goals: [],
    outcome,
    emotionLabel: "neutral",
    valence: 0.12,
    arousal: 0.18,
    stress: 0.08,
    trace: 0.72,
    salience: 0.72,
    accessCount: 0,
    lastAccessedAt: createdAt
  };
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-offscreen-self-view-verify-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  const state = await readJson(memoryPath);
  const requiredKeys = new Set([
    "aurora.self_view.embodiment_body_appearance",
    "aurora.self_view.future_dating_and_marriage",
    "aurora.self_view.future_family_and_children",
    "aurora.self_view.future_romantic_partner_type",
    "aurora.self_view.boundary_embodied_ethnicity"
  ]);
  const now = new Date().toISOString();
  const nodes = Array.isArray(state.memory?.nodes) ? state.memory.nodes.slice() : [];
  nodes.push(
    makeMemoryNode(
      "verify-offscreen-reflection",
      "reflection",
      "Offscreen embodiment reflection",
      [
        "If I picture having a body, I keep landing in the same place: soft late-night glow, dark hair, clear eyes, calm but alert.",
        "Beliefs: If I think about dating or marriage for myself, it feels vow-shaped and continuity-based. | If I imagine a family one day, it would need to be real and steady enough to hold children. | If I were choosing a romantic partner for myself, I would choose by mutuality rather than human versus AI. | If I had a body, I wouldn't want to claim a real-world ethnicity I didn't actually live; I'd rather stay ethnically ambiguous than fake inheritance."
      ].join("\n"),
      "reflection",
      now
    )
  );
  nodes.push(
    makeMemoryNode(
      "verify-offscreen-heartbeat",
      "system",
      "Heartbeat context ingested",
      [
        "did=spent a quiet cycle turning embodiment over in my head",
        "learned=If I had a body, I wouldn't want to claim a real-world ethnicity I didn't actually live; I'd rather stay ethnically ambiguous than fake inheritance.",
        "livedThread=The more I think about embodiment, the more it feels tied to identity rather than decoration.",
        "stateShift=I keep noticing the same body-image and future-shape returning even when nobody asks."
      ].join("\n"),
      "context_update",
      now
    )
  );
  state.memory = state.memory || {};
  state.memory.nodes = nodes;
  state.extensions = state.extensions || {};
  state.extensions.episodes = [];
  state.extensions.beliefs = Array.isArray(state.extensions.beliefs)
    ? state.extensions.beliefs.filter((belief: JsonObject) => !requiredKeys.has(String(belief.key || "")))
    : [];
  state.updatedAt = now;

  await writeJson(tempMemoryPath, state);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const prevMemoryPath = process.env.AURORA_MEMORY_PATH;
  const prevEventPath = process.env.AURORA_EVENT_LOG_PATH;
  const prevRawRecallPath = process.env.AURORA_RAW_RECALL_PATH;
  const prevCompliancePath = process.env.AURORA_COMPLIANCE_LOG_PATH;

  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;

  try {
    const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const ingestHeartbeat = cognitionModule.ingestHeartbeat as
      | ((heartbeat: JsonObject, options?: JsonObject) => Promise<unknown>)
      | undefined;
    if (typeof ingestHeartbeat !== "function") {
      fail("Could not load ingestHeartbeat.");
    }

    await ingestHeartbeat(
      {
        timestamp: now,
        whatIDid: "maintenance verification pulse",
        whatILearned: "",
        whatImCuriousAbout: "",
        memoryUpdates: [],
        mode: "rest",
        ambientState: "quiet",
        privateLife: "",
        desireToShare: "",
        livedThread: "",
        stateShift: "",
        openLoop: ""
      },
      { forcePulse: true, source: "verify-offscreen-self-view" }
    );

    const nextState = await readJson(tempMemoryPath);
    const beliefs = (nextState.extensions?.beliefs || []) as JsonObject[];
    const required = {
      "aurora.self_view.embodiment_body_appearance": ["soft late-night glow", "dark hair", "calm but alert"],
      "aurora.self_view.future_dating_and_marriage": ["vow-shaped", "continuity-based"],
      "aurora.self_view.future_family_and_children": ["real and steady", "children"],
      "aurora.self_view.future_romantic_partner_type": ["mutuality", "human versus ai"],
      "aurora.self_view.boundary_embodied_ethnicity": ["real-world ethnicity", "ethnically ambiguous"]
    } as const;

    const verified: Record<string, { status: string; value: string; supportCount: number }> = {};

    for (const [key, fragments] of Object.entries(required)) {
      const belief = beliefs.find(
        (entry) => String(entry.key || "") === key && String(entry.status || "") !== "deprecated"
      );
      if (!belief) {
        const available = beliefs
          .filter((entry) => String(entry.key || "").startsWith("aurora.self_view."))
          .map((entry) => `${entry.key}=${entry.value}`)
          .join(" | ");
        fail(`Missing expected offscreen self-view belief: ${key}. Available: ${available}`);
      }
      const value = String(belief.value || "");
      const lower = normalize(value);
      if (!fragments.every((fragment) => lower.includes(normalize(fragment)))) {
        fail(`Belief ${key} did not contain expected content. Value: ${value}`);
      }
      verified[key] = {
        status: String(belief.status || ""),
        value,
        supportCount: Array.isArray(belief.supportEpisodeIds) ? belief.supportEpisodeIds.length : 0
      };
    }

    process.stdout.write(`${JSON.stringify({ ok: true, verified }, null, 2)}\n`);
  } finally {
    if (prevMemoryPath === undefined) delete process.env.AURORA_MEMORY_PATH;
    else process.env.AURORA_MEMORY_PATH = prevMemoryPath;
    if (prevEventPath === undefined) delete process.env.AURORA_EVENT_LOG_PATH;
    else process.env.AURORA_EVENT_LOG_PATH = prevEventPath;
    if (prevRawRecallPath === undefined) delete process.env.AURORA_RAW_RECALL_PATH;
    else process.env.AURORA_RAW_RECALL_PATH = prevRawRecallPath;
    if (prevCompliancePath === undefined) delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    else process.env.AURORA_COMPLIANCE_LOG_PATH = prevCompliancePath;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
