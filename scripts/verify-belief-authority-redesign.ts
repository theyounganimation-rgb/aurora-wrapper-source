#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type VerificationState = JsonObject & {
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

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-belief-authority-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");

  const state = (await readJson(sourceMemoryPath)) as VerificationState;
  state.extensions ??= {};
  state.extensions.beliefs = [
    {
      id: "belief_user_nickname",
      key: "user.self_view.nickname_for_aurora",
      value: "Auri",
      condition: "default",
      status: "active",
      authority: "provisional",
      confidence: 0.92,
      source: "inferred_from_user",
      supportEpisodeIds: ["epi_user_nickname"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T15:30:00.000Z"
    },
    {
      id: "belief_user_opinion_this_question",
      key: "user.self_view.opinion_this_question",
      value: "I think it's good",
      condition: "default",
      status: "active",
      authority: "durable",
      confidence: 0.97,
      source: "inferred_from_user",
      supportEpisodeIds: ["epi_user_opinion_a", "epi_user_opinion_b", "epi_user_opinion_c"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T15:31:00.000Z"
    },
    {
      id: "belief_aurora_favorite_movie",
      key: "aurora.self_view.favorite_movie",
      value: "Tron: Legacy",
      condition: "default",
      status: "active",
      authority: "provisional",
      confidence: 0.9,
      source: "inferred_from_aurora",
      supportEpisodeIds: ["epi_aurora_movie_a", "epi_aurora_movie_b", "epi_aurora_movie_c"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T15:32:00.000Z"
    },
    {
      id: "belief_aurora_stance_this_question",
      key: "aurora.self_view.stance_this_question",
      value: "I love this question",
      condition: "default",
      status: "active",
      authority: "durable",
      confidence: 0.97,
      source: "inferred_from_aurora",
      supportEpisodeIds: ["epi_aurora_stance_a", "epi_aurora_stance_b", "epi_aurora_stance_c"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T15:33:00.000Z"
    }
  ];
  state.extensions.memoryGovernance ??= {};
  state.extensions.memoryGovernance.lastExternalBeliefSyncAt = null;
  state.extensions.memoryGovernance.lastExternalBeliefRawRecallMtimeMs = 0;
  state.updatedAt = "2026-03-21T15:34:00Z";
  await writeJson(tempMemoryPath, state);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, { version: 1, updatedAt: "2026-03-21T15:35:00Z", anchors: {} });

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
    const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const getCanonicalBeliefAuthoritySnapshot = cognitionModule.getCanonicalBeliefAuthoritySnapshot as
      | (() => Promise<{
          userBeliefs?: Array<{ key: string; value: string; authority?: string }>;
          auroraBeliefs?: Array<{ key: string; value: string; authority?: string }>;
        }>)
      | undefined;
    const runCanonicalMemoryAuthorityRepair = cognitionModule.runCanonicalMemoryAuthorityRepair as
      | (() => Promise<unknown>)
      | undefined;
    const prepareReadOnlyOwnerChatContext = cognitionModule.prepareReadOnlyOwnerChatContext as
      | ((input: JsonObject) => Promise<{ enrichedInput?: string } | null>)
      | undefined;

    if (
      typeof getCanonicalBeliefAuthoritySnapshot !== "function" ||
      typeof runCanonicalMemoryAuthorityRepair !== "function" ||
      typeof prepareReadOnlyOwnerChatContext !== "function"
    ) {
      fail("Could not load expected cognition exports for belief authority verification.");
    }

    const snapshot = await getCanonicalBeliefAuthoritySnapshot();
    const userBeliefs = Array.isArray(snapshot.userBeliefs) ? snapshot.userBeliefs : [];
    const auroraBeliefs = Array.isArray(snapshot.auroraBeliefs) ? snapshot.auroraBeliefs : [];

    if (!userBeliefs.some((belief) => belief.key === "user.self_view.nickname_for_aurora" && belief.value === "Auri")) {
      fail("Durable user nickname was not retained in canonical memory.");
    }
    if (userBeliefs.some((belief) => belief.key === "user.self_view.opinion_this_question")) {
      fail("One-shot user opinion residue leaked into canonical memory.");
    }
    if (!auroraBeliefs.some((belief) => belief.key === "aurora.self_view.favorite_movie" && belief.value === "Tron: Legacy")) {
      fail("Repeated Aurora favorite did not become durable canonical memory.");
    }
    if (auroraBeliefs.some((belief) => belief.key === "aurora.self_view.stance_this_question")) {
      fail("One-shot Aurora stance residue leaked into canonical memory.");
    }

    const nicknameContext = String(
      (
        await prepareReadOnlyOwnerChatContext({
          sessionId: "agent:main:belief-authority-check",
          partnerId: "cade",
          speakerName: "Cade",
          userText: "What's my nickname for you?"
        })
      )?.enrichedInput || ""
    );
    if (!nicknameContext.includes("grounded_fact_seed=Your nickname for Aurora is Auri.")) {
      fail("Durable nickname was not grounded into the read-only direct answer path.");
    }

    const provisionalContext = String(
      (
        await prepareReadOnlyOwnerChatContext({
          sessionId: "agent:main:belief-authority-check",
          partnerId: "cade",
          speakerName: "Cade",
          userText: "Do you like this question?"
        })
      )?.enrichedInput || ""
    );
    if (/grounded_fact_seed=.*I love this question/i.test(provisionalContext)) {
      fail("Provisional one-shot Aurora stance still grounded as canonical memory.");
    }

    await runCanonicalMemoryAuthorityRepair();
    const repairedState = (await readJson(tempMemoryPath)) as VerificationState;
    const repairedBeliefs = Array.isArray(repairedState.extensions?.beliefs) ? repairedState.extensions.beliefs : [];
    const findBelief = (key: string) =>
      repairedBeliefs.find(
        (belief): belief is Record<string, unknown> =>
          Boolean(belief) && typeof belief === "object" && !Array.isArray(belief) && String((belief as JsonObject).key || "") === key
      );
    const persistedNickname = findBelief("user.self_view.nickname_for_aurora");
    const persistedOpinion = findBelief("user.self_view.opinion_this_question");
    const persistedMovie = findBelief("aurora.self_view.favorite_movie");
    const persistedStance = findBelief("aurora.self_view.stance_this_question");

    if (String(persistedNickname?.authority || "") !== "durable") {
      fail("Durable nickname authority was not persisted to disk.");
    }
    if (persistedOpinion) {
      fail("Conversational user opinion residue was not removed from the belief store.");
    }
    if (String(persistedMovie?.authority || "") !== "durable") {
      fail("Durable Aurora favorite authority was not persisted to disk.");
    }
    if (persistedStance) {
      fail("Conversational Aurora stance residue was not removed from the belief store.");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          canonicalUserKeys: userBeliefs.map((belief) => belief.key),
          canonicalAuroraKeys: auroraBeliefs.map((belief) => belief.key),
          nicknameGrounded: nicknameContext.includes("grounded_fact_seed=Your nickname for Aurora is Auri."),
          provisionalSuppressed: !/grounded_fact_seed=.*I love this question/i.test(provisionalContext),
          persistedAuthorities: {
            nickname: persistedNickname?.authority || "",
            opinion: persistedOpinion ? String((persistedOpinion as JsonObject).authority || "") : "removed",
            favoriteMovie: persistedMovie?.authority || "",
            stance: persistedStance ? String((persistedStance as JsonObject).authority || "") : "removed"
          }
        },
        null,
        2
      )
    );
  } finally {
    process.env.AURORA_DISABLE_LOOP = previousEnv.AURORA_DISABLE_LOOP;
    process.env.AURORA_MEMORY_PATH = previousEnv.AURORA_MEMORY_PATH;
    process.env.AURORA_EVENT_LOG_PATH = previousEnv.AURORA_EVENT_LOG_PATH;
    process.env.AURORA_RAW_RECALL_PATH = previousEnv.AURORA_RAW_RECALL_PATH;
    process.env.AURORA_COMPLIANCE_LOG_PATH = previousEnv.AURORA_COMPLIANCE_LOG_PATH;
    process.env.AURORA_SELF_ANCHORS_PATH = previousEnv.AURORA_SELF_ANCHORS_PATH;
  }
}

void main();
