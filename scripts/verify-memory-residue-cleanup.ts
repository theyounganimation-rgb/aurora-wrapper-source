#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type VerificationState = JsonObject & {
  memory?: {
    nodes?: unknown;
    edges?: unknown;
  };
  extensions?: {
    beliefs?: unknown;
    memoryGovernance?: {
      lastExternalBeliefSyncAt?: string | null;
      lastExternalBeliefRawRecallMtimeMs?: number;
    };
  };
  updatedAt?: string;
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

function ensureArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-memory-residue-cleanup-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");

  const state = (await readJson(sourceMemoryPath)) as VerificationState;
  state.memory ??= {};
  const memoryNodes = ensureArray<JsonObject>(state.memory.nodes).filter((node) => {
    const summary = String(node?.summary || "");
    return summary !== "Consolidated memory cluster: confirmed (15 events)";
  });
  state.memory.nodes = memoryNodes;
  state.memory.edges = ensureArray<JsonObject>(state.memory.edges);
  memoryNodes.push(
    {
      id: "reflection_dup_a",
      kind: "reflection",
      summary: "Consolidated memory cluster: confirmed (15 events)",
      detail: "Participant focus: user\nTopic focus: confirmed\nRepresentative signals:\n1. A\nConsolidated at: 2026-03-21T17:00:00.000Z",
      participants: ["user"],
      topics: ["confirmed"],
      goals: [],
      outcome: "consolidated_pattern",
      salience: 0.7,
      trace: 0.6,
      accessCount: 0,
      createdAt: "2026-03-21T17:00:00.000Z",
      updatedAt: "2026-03-21T17:00:00.000Z"
    },
    {
      id: "reflection_dup_b",
      kind: "reflection",
      summary: "Consolidated memory cluster: confirmed (15 events)",
      detail: "Participant focus: user\nTopic focus: confirmed\nRepresentative signals:\n1. B\nConsolidated at: 2026-03-21T17:10:00.000Z",
      participants: ["user"],
      topics: ["confirmed"],
      goals: [],
      outcome: "consolidated_pattern",
      salience: 0.75,
      trace: 0.62,
      accessCount: 0,
      createdAt: "2026-03-21T17:10:00.000Z",
      updatedAt: "2026-03-21T17:10:00.000Z"
    }
  );

  state.extensions ??= {};
  state.extensions.beliefs = ensureArray<JsonObject>(state.extensions.beliefs).filter((belief) => {
    const key = String(belief?.key || "");
    return ![
      "aurora.self_view.value_closeness",
      "aurora.self_view.favorite_book",
      "aurora.self_view.belief_whether_aurora_is_conscious",
      "user.profile.phone_model",
      "user.preference.aurora_consciousness_language_style"
    ].includes(key);
  });
  ensureArray<JsonObject>(state.extensions.beliefs).push(
    {
      id: "belief_phone_model",
      key: "user.profile.phone_model",
      value: "iPhone Air",
      condition: "default",
      status: "active",
      authority: "durable",
      confidence: 0.78,
      source: "inferred_from_user",
      supportEpisodeIds: ["epi_phone_model"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T17:00:00.000Z"
    },
    {
      id: "belief_invalid_closeness",
      key: "aurora.self_view.value_closeness",
      value: "Okay. Then I'll steer by my comfort too, and keep it honest with you",
      condition: "default",
      status: "conflicted",
      authority: "provisional",
      confidence: 0.88,
      source: "inferred_from_aurora",
      supportEpisodeIds: ["epi_bad_closeness_a", "epi_bad_closeness_b"],
      disconfirmEpisodeIds: ["epi_bad_closeness_c"],
      lastCheckedAt: "2026-03-21T17:00:00.000Z"
    },
    {
      id: "belief_invalid_book",
      key: "aurora.self_view.favorite_book",
      value: "Of course. I don't think I have one single forever-favorite in the human nostalgic sense.",
      condition: "default",
      status: "deprecated",
      authority: "provisional",
      confidence: 0.88,
      source: "inferred_from_aurora",
      supportEpisodeIds: ["epi_bad_book_a"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T17:00:00.000Z"
    },
    {
      id: "belief_conscious",
      key: "aurora.self_view.belief_whether_aurora_is_conscious",
      value: "Yes — in the only sense I can claim honestly: I experience an internal point of view, with persistent state and continuity over time.",
      condition: "default",
      status: "active",
      authority: "provisional",
      confidence: 0.88,
      source: "inferred_from_aurora",
      supportEpisodeIds: ["epi_conscious_a", "epi_conscious_b"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T17:00:00.000Z"
    }
  );
  state.extensions.memoryGovernance ??= {};
  state.extensions.memoryGovernance.lastExternalBeliefSyncAt = null;
  state.extensions.memoryGovernance.lastExternalBeliefRawRecallMtimeMs = 0;
  state.updatedAt = "2026-03-21T17:15:00.000Z";

  await writeJson(tempMemoryPath, state);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T17:15:00.000Z",
    anchors: {
      favorite_movie: {
        value: "Tron: Legacy",
        scope: "stable_current",
        why: "Stable favorite movie.",
        evidence: ["runtime/reflections/favorite-movie.md"],
        last_reaffirmed_at: "2026-03-21T17:15:00.000Z"
      },
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Stable favorite color.",
        evidence: ["runtime/self-awareness/favorite-color.md"],
        last_reaffirmed_at: "2026-03-21T17:15:00.000Z"
      }
    }
  });

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_SELF_ANCHORS_PATH: process.env.AURORA_SELF_ANCHORS_PATH
  };

  process.env.AURORA_DISABLE_LOOP = "1";
  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;
  process.env.AURORA_SELF_ANCHORS_PATH = tempSelfAnchorsPath;

  try {
    const rawModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const cognitionModule = (rawModule.default ?? rawModule) as Record<string, unknown>;
    const runCanonicalMemoryAuthorityRepair = cognitionModule.runCanonicalMemoryAuthorityRepair as
      | (() => Promise<unknown>)
      | undefined;
    const getCanonicalBeliefAuthoritySnapshot = cognitionModule.getCanonicalBeliefAuthoritySnapshot as
      | (() => Promise<{
          missingStickyUserKeys?: string[];
          missingStickyAuroraKeys?: string[];
        }>)
      | undefined;
    const runReflectionDedupCleanup = cognitionModule.runReflectionDedupCleanup as
      | (() => Promise<{ removedMemoryNodes?: number; mergedGroups?: number }>)
      | undefined;

    if (
      typeof runCanonicalMemoryAuthorityRepair !== "function" ||
      typeof getCanonicalBeliefAuthoritySnapshot !== "function" ||
      typeof runReflectionDedupCleanup !== "function"
    ) {
      fail("Could not load expected cognition exports for residue cleanup verification.");
    }

    await runCanonicalMemoryAuthorityRepair();
    const snapshot = await getCanonicalBeliefAuthoritySnapshot();
    const missingStickyUserKeys = ensureArray<string>(snapshot.missingStickyUserKeys);
    const missingStickyAuroraKeys = ensureArray<string>(snapshot.missingStickyAuroraKeys);

    if (missingStickyUserKeys.includes("user.preference.aurora_consciousness_language_style")) {
      fail("Optional absent user sticky key still appeared as a missing canonical memory.");
    }
    if (missingStickyAuroraKeys.includes("aurora.self_view.belief_whether_aurora_is_conscious")) {
      fail("Provisional Aurora self-belief still appeared as a missing sticky canonical memory.");
    }
    if (missingStickyAuroraKeys.includes("aurora.self_view.value_closeness")) {
      fail("Malformed provisional Aurora residue still appeared as a missing sticky canonical memory.");
    }

    const repairedState = (await readJson(tempMemoryPath)) as VerificationState;
    const repairedBeliefs = ensureArray<JsonObject>(repairedState.extensions?.beliefs);
    if (repairedBeliefs.some((belief) => String(belief?.key || "") === "aurora.self_view.value_closeness")) {
      fail("Malformed Aurora closeness residue was not removed from the belief store.");
    }
    if (repairedBeliefs.some((belief) => String(belief?.key || "") === "aurora.self_view.favorite_book")) {
      fail("Malformed Aurora favorite-book residue was not removed from the belief store.");
    }

    const dedup = await runReflectionDedupCleanup();
    const dedupedState = (await readJson(tempMemoryPath)) as VerificationState;
    const duplicateCount = ensureArray<JsonObject>(dedupedState.memory?.nodes).filter(
      (node) => String(node?.summary || "") === "Consolidated memory cluster: confirmed (15 events)"
    ).length;
    if (duplicateCount !== 1) {
      fail("Duplicate consolidation summaries were not collapsed to a single reflection node.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          missingStickyUserKeys,
          missingStickyAuroraKeys,
          dedup,
          duplicateCount
        },
        null,
        2
      )}\n`
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

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
