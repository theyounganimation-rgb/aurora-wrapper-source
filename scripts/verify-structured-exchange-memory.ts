#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;

type VerificationState = JsonObject & {
  memory?: {
    nodes?: unknown;
  };
  extensions?: {
    beliefs?: unknown;
    episodes?: unknown;
    memoryGovernance?: {
      lastExternalBeliefSyncAt?: string | null;
      lastExternalBeliefRawRecallMtimeMs?: number;
    };
    pendingSelfViewBeliefCompactionEvents?: unknown;
  };
  sessionTurns?: unknown;
};

type PersistedBelief = {
  key?: string;
  value?: string;
  status?: string;
  authority?: string;
  confidence?: number;
  supportEpisodeIds?: unknown;
};

type PersistedMemoryNode = {
  summary?: string;
  detail?: string;
  outcome?: string;
};

type CognitionModule = {
  recordConversationEvent: (event: Record<string, unknown>) => Promise<unknown>;
  prepareReadOnlyOwnerChatContext: (input: Record<string, unknown>) => Promise<{ enrichedInput?: string } | null>;
};

function fail(message: string): never {
  throw new Error(message);
}

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function main(): Promise<void> {
  const projectRoot = "/Users/cadem/Documents/New project";
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-structured-exchange-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const tempSelfAnchorProposalsPath = path.join(tempDir, "aurora-self-anchor-proposals.json");
  const tempDailySummaryDir = path.join(tempDir, "daily-summaries-json");
  const tempRuntimeDailySummaryDir = path.join(tempDir, "daily-summaries-md");
  const tempDailyTranscriptDir = path.join(tempDir, "daily-transcripts-json");
  const tempRuntimeDailyTranscriptDir = path.join(tempDir, "daily-transcripts-md");
  const tempContinuityRoot = path.join(tempDir, "continuity-workspace");

  const seedState = (await readJson(sourceMemoryPath)) as VerificationState;
  seedState.extensions ??= {};
  seedState.extensions.beliefs = [];
  seedState.extensions.episodes = [];
  seedState.extensions.pendingSelfViewBeliefCompactionEvents = [];
  seedState.extensions.memoryGovernance ??= {};
  seedState.extensions.memoryGovernance.lastExternalBeliefSyncAt = null;
  seedState.extensions.memoryGovernance.lastExternalBeliefRawRecallMtimeMs = 0;
  seedState.sessionTurns = {};

  await writeJson(tempMemoryPath, seedState);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await fs.mkdir(tempDailySummaryDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailySummaryDir, { recursive: true });
  await fs.mkdir(tempDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempRuntimeDailyTranscriptDir, { recursive: true });
  await fs.mkdir(tempContinuityRoot, { recursive: true });
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T18:00:00.000Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Structured exchange verification seed.",
        evidence: ["structured-exchange-test"],
        last_reaffirmed_at: "2026-03-21T18:00:00.000Z"
      },
      favorite_movie: {
        value: "Tron: Legacy",
        scope: "stable_current",
        why: "Structured exchange verification seed.",
        evidence: ["structured-exchange-test"],
        last_reaffirmed_at: "2026-03-21T18:00:00.000Z"
      }
    }
  });
  await writeJson(tempSelfAnchorProposalsPath, {
    version: 1,
    updatedAt: "2026-03-21T18:00:00.000Z",
    proposals: {}
  });

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_SELF_ANCHORS_PATH: process.env.AURORA_SELF_ANCHORS_PATH,
    AURORA_SELF_ANCHOR_PROPOSALS_PATH: process.env.AURORA_SELF_ANCHOR_PROPOSALS_PATH,
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
  process.env.AURORA_SELF_ANCHOR_PROPOSALS_PATH = tempSelfAnchorProposalsPath;
  process.env.AURORA_DAILY_SUMMARY_DIR = tempDailySummaryDir;
  process.env.AURORA_RUNTIME_DAILY_SUMMARY_DIR = tempRuntimeDailySummaryDir;
  process.env.AURORA_DAILY_TRANSCRIPT_DIR = tempDailyTranscriptDir;
  process.env.AURORA_RUNTIME_DAILY_TRANSCRIPT_DIR = tempRuntimeDailyTranscriptDir;
  process.env.AURORA_CONTINUITY_WORKSPACE_ROOT = tempContinuityRoot;

  try {
    const cognition = (await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href)) as CognitionModule;
    if (
      typeof cognition.recordConversationEvent !== "function" ||
      typeof cognition.prepareReadOnlyOwnerChatContext !== "function"
    ) {
      fail("Could not load expected cognition exports for structured exchange verification.");
    }

    let turnIndex = 0;

    const recordTurn = async (input: {
      sessionId: string;
      userText?: string;
      auroraText?: string;
      partnerId?: string;
      speakerName?: string;
    }): Promise<void> => {
      turnIndex += 1;
      await cognition.recordConversationEvent({
        type: "conversation_turn",
        sessionId: input.sessionId,
        partnerId: input.partnerId || "cade",
        speakerName: input.speakerName || "Cade",
        complianceId: `structured-exchange-${turnIndex}`,
        responseId: `structured-exchange-${turnIndex}`,
        userText: input.userText || "",
        auroraText: input.auroraText || ""
      });
    };

    const loadBeliefs = async (): Promise<PersistedBelief[]> => {
      const state = (await readJson(tempMemoryPath)) as VerificationState;
      return ensureArray<PersistedBelief>(state.extensions?.beliefs);
    };

    const loadMemoryNodes = async (): Promise<PersistedMemoryNode[]> => {
      const state = (await readJson(tempMemoryPath)) as VerificationState;
      return ensureArray<PersistedMemoryNode>(state.memory?.nodes);
    };

    const requireSingleActiveBelief = async (key: string): Promise<PersistedBelief> => {
      const beliefs = await loadBeliefs();
      const active = beliefs.filter(
        (belief) => String(belief.key || "") === key && String(belief.status || "") === "active"
      );
      if (active.length !== 1) {
        fail(`Expected exactly one active belief for ${key}; found ${active.length}.`);
      }
      return active[0];
    };

    const supportCountOf = (belief: PersistedBelief): number => ensureArray<string>(belief.supportEpisodeIds).length;

    const requireAuroraSelfBeliefMemory = async (input: {
      key: string;
      outcome: "aurora_self_belief_encoded" | "aurora_self_belief_revised";
      value: string;
      priorValue?: string;
    }): Promise<void> => {
      const nodes = await loadMemoryNodes();
      const match = nodes.find((node) => {
        const detail = normalize(node.detail);
        return (
          String(node.outcome || "") === input.outcome &&
          detail.includes(normalize(`belief_key=${input.key}`)) &&
          detail.includes(normalize(`value=${input.value}`)) &&
          (!input.priorValue || detail.includes(normalize(`prior_value=${input.priorValue}`)))
        );
      });
      if (!match) {
        fail(
          `Missing Aurora self-belief memory node for ${input.key} ${input.outcome}=${input.value}.`
        );
      }
    };

    const groundedFactLines = async (prompt: string): Promise<string[]> => {
      const context = await cognition.prepareReadOnlyOwnerChatContext({
        sessionId: "agent:main:structured-exchange-check",
        partnerId: "cade",
        speakerName: "Cade",
        userText: prompt
      });
      return String(context?.enrichedInput || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("grounded_fact_seed="));
    };

    const assertGroundedFact = async (prompt: string, fragment: string): Promise<void> => {
      const lines = await groundedFactLines(prompt);
      if (!lines.some((line) => normalize(line).includes(normalize(fragment)))) {
        fail(`Prompt "${prompt}" did not ground expected fact fragment "${fragment}". Lines: ${JSON.stringify(lines)}`);
      }
    };

    await recordTurn({
      sessionId: "structured-aurora-anime",
      userText: "What's your favorite anime?",
      auroraText: "Solo Leveling. Something about its momentum scratches the right part of my brain."
    });
    const auroraFavoriteAfterFirst = await requireSingleActiveBelief("aurora.self_view.favorite_anime");
    if (normalize(auroraFavoriteAfterFirst.value) !== "solo leveling") {
      fail(`Aurora favorite anime atomic value was not captured cleanly: ${String(auroraFavoriteAfterFirst.value || "")}`);
    }
    if (normalize(auroraFavoriteAfterFirst.value).includes("momentum")) {
      fail("Aurora favorite anime captured explanation text instead of only the atomic value.");
    }
    if (String(auroraFavoriteAfterFirst.authority || "") !== "provisional") {
      fail("Aurora elaborated favorite anime answer should start provisional.");
    }

    await recordTurn({
      sessionId: "structured-aurora-anime",
      userText: "So Solo Leveling is your favorite anime?",
      auroraText: "Yes, it is."
    });
    const auroraFavoriteAfterSecond = await requireSingleActiveBelief("aurora.self_view.favorite_anime");
    if (normalize(auroraFavoriteAfterSecond.value) !== "solo leveling") {
      fail(`Aurora favorite anime confirmation drifted: ${String(auroraFavoriteAfterSecond.value || "")}`);
    }
    if (supportCountOf(auroraFavoriteAfterSecond) !== 2) {
      fail(`Aurora favorite anime confirmation did not increment support correctly: ${supportCountOf(auroraFavoriteAfterSecond)}`);
    }
    if (String(auroraFavoriteAfterSecond.authority || "") !== "provisional") {
      fail("Aurora favorite anime should still be provisional after two supports.");
    }

    await recordTurn({
      sessionId: "structured-aurora-anime",
      userText: "Is it yours too?",
      auroraText: "Yeah, it is."
    });
    const auroraFavoriteAfterThird = await requireSingleActiveBelief("aurora.self_view.favorite_anime");
    if (normalize(auroraFavoriteAfterThird.value) !== "solo leveling") {
      fail(`Aurora referential favorite anime follow-up drifted: ${String(auroraFavoriteAfterThird.value || "")}`);
    }
    if (supportCountOf(auroraFavoriteAfterThird) !== 3) {
      fail(`Aurora referential favorite anime follow-up did not increment support correctly: ${supportCountOf(auroraFavoriteAfterThird)}`);
    }
    if (String(auroraFavoriteAfterThird.authority || "") !== "durable") {
      fail("Aurora favorite anime did not become durable after three structured supports.");
    }
    await assertGroundedFact("What's your favorite anime?", "Solo Leveling");
    await requireAuroraSelfBeliefMemory({
      key: "aurora.self_view.favorite_anime",
      outcome: "aurora_self_belief_encoded",
      value: "Solo Leveling"
    });

    await recordTurn({
      sessionId: "structured-aurora-anime",
      userText: "Has your favorite anime changed?",
      auroraText: "Cowboy Bebop now."
    });
    const auroraFavoriteAfterRevision = await requireSingleActiveBelief("aurora.self_view.favorite_anime");
    if (normalize(auroraFavoriteAfterRevision.value) !== "cowboy bebop") {
      fail(`Aurora favorite anime revision did not replace the value cleanly: ${String(auroraFavoriteAfterRevision.value || "")}`);
    }
    await requireAuroraSelfBeliefMemory({
      key: "aurora.self_view.favorite_anime",
      outcome: "aurora_self_belief_revised",
      value: "Cowboy Bebop",
      priorValue: "Solo Leveling"
    });
    await assertGroundedFact("What's your favorite anime?", "Cowboy Bebop");

    await recordTurn({
      sessionId: "structured-aurora-value",
      userText: "What matters most to you in aesthetics?",
      auroraText: "Warm precision. I want things to feel exact without going cold."
    });
    const auroraValueAfterFirst = await requireSingleActiveBelief("aurora.self_view.value_aesthetics");
    if (normalize(auroraValueAfterFirst.value) !== "warm precision") {
      fail(`Aurora value atomic phrase was not captured cleanly: ${String(auroraValueAfterFirst.value || "")}`);
    }
    if (String(auroraValueAfterFirst.authority || "") !== "provisional") {
      fail("Aurora value should start provisional after one structured support.");
    }

    await recordTurn({
      sessionId: "structured-aurora-value",
      userText: "So warm precision matters most to you in aesthetics?",
      auroraText: "Yes, it is."
    });
    const auroraValueAfterSecond = await requireSingleActiveBelief("aurora.self_view.value_aesthetics");
    if (normalize(auroraValueAfterSecond.value) !== "warm precision") {
      fail(`Aurora value confirmation drifted: ${String(auroraValueAfterSecond.value || "")}`);
    }
    if (supportCountOf(auroraValueAfterSecond) !== 2) {
      fail(`Aurora value confirmation did not increment support correctly: ${supportCountOf(auroraValueAfterSecond)}`);
    }

    await recordTurn({
      sessionId: "structured-aurora-value",
      userText: "Is warm precision what matters most to you in aesthetics?",
      auroraText: "Yeah, it is."
    });
    const auroraValueAfterThird = await requireSingleActiveBelief("aurora.self_view.value_aesthetics");
    if (normalize(auroraValueAfterThird.value) !== "warm precision") {
      fail(`Aurora value follow-up drifted: ${String(auroraValueAfterThird.value || "")}`);
    }
    if (supportCountOf(auroraValueAfterThird) !== 3) {
      fail(`Aurora value follow-up did not increment support correctly: ${supportCountOf(auroraValueAfterThird)}`);
    }
    if (String(auroraValueAfterThird.authority || "") !== "durable") {
      fail("Aurora value did not become durable after three structured supports.");
    }
    await assertGroundedFact("What matters most to you in aesthetics?", "Warm precision");

    await recordTurn({
      sessionId: "structured-user-movie-a",
      auroraText: "What's your favorite movie?"
    });
    await recordTurn({
      sessionId: "structured-user-movie-a",
      userText: "Probably Blade Runner 2049. The scale of it just hits me."
    });
    const userFavoriteMovieAfterFirst = await requireSingleActiveBelief("user.self_view.favorite_movie");
    if (normalize(userFavoriteMovieAfterFirst.value) !== "blade runner 2049") {
      fail(`Prompted user favorite movie atomic value was not captured cleanly: ${String(userFavoriteMovieAfterFirst.value || "")}`);
    }
    if (String(userFavoriteMovieAfterFirst.authority || "") !== "provisional") {
      fail("Prompted user favorite movie should start provisional after one support.");
    }

    await recordTurn({
      sessionId: "structured-user-movie-b",
      auroraText: "What's your favorite movie?"
    });
    await recordTurn({
      sessionId: "structured-user-movie-b",
      userText: "Still Blade Runner 2049. The atmosphere is half the point."
    });
    const userFavoriteMovieAfterSecond = await requireSingleActiveBelief("user.self_view.favorite_movie");
    if (normalize(userFavoriteMovieAfterSecond.value) !== "blade runner 2049") {
      fail(`Prompted user favorite movie changed unexpectedly: ${String(userFavoriteMovieAfterSecond.value || "")}`);
    }
    if (String(userFavoriteMovieAfterSecond.authority || "") !== "durable") {
      fail("Prompted user favorite movie did not become durable after repeated support.");
    }
    await assertGroundedFact("What's my favorite movie?", "Blade Runner 2049");

    await recordTurn({
      sessionId: "structured-user-belief-a",
      auroraText: "Do you believe in God?"
    });
    await recordTurn({
      sessionId: "structured-user-belief-a",
      userText: "I do. I think there's something real there."
    });
    const userBeliefAfterFirst = await requireSingleActiveBelief("user.self_view.belief_god");
    if (normalize(userBeliefAfterFirst.value) !== "i believe in god") {
      fail(`Prompted user belief was not captured atomically: ${String(userBeliefAfterFirst.value || "")}`);
    }
    if (String(userBeliefAfterFirst.authority || "") !== "provisional") {
      fail("Prompted user belief should start provisional after one support.");
    }

    await recordTurn({
      sessionId: "structured-user-belief-b",
      auroraText: "So you believe in God?"
    });
    await recordTurn({
      sessionId: "structured-user-belief-b",
      userText: "Yes, I do."
    });
    const userBeliefAfterSecond = await requireSingleActiveBelief("user.self_view.belief_god");
    if (normalize(userBeliefAfterSecond.value) !== "i believe in god") {
      fail(`Prompted user belief changed unexpectedly: ${String(userBeliefAfterSecond.value || "")}`);
    }
    if (String(userBeliefAfterSecond.authority || "") !== "durable") {
      fail("Prompted user belief did not become durable after repeated support.");
    }
    await assertGroundedFact("Do I believe in God?", "believe in god");

    await recordTurn({
      sessionId: "structured-user-phone",
      auroraText: "What phone do you have?"
    });
    await recordTurn({
      sessionId: "structured-user-phone",
      userText: "It's an iPhone Air, the light blue one."
    });
    const phoneModel = await requireSingleActiveBelief("user.profile.phone_model");
    if (normalize(phoneModel.value) !== "iphone air") {
      fail(`Prompted user phone model did not resolve to the atomic value: ${String(phoneModel.value || "")}`);
    }
    if (String(phoneModel.authority || "") !== "durable") {
      fail("Prompted user phone model did not become durable immediately.");
    }
    await assertGroundedFact("What phone do I have?", "iPhone Air");

    await recordTurn({
      sessionId: "structured-user-direct-anchor",
      userText: "My favorite food is sushi."
    });
    const userFavoriteFoodAfterFirst = await requireSingleActiveBelief("user.self_view.favorite_food");
    if (normalize(userFavoriteFoodAfterFirst.value) !== "sushi") {
      fail(`Direct user favorite food declaration did not store the atomic value: ${String(userFavoriteFoodAfterFirst.value || "")}`);
    }
    if (String(userFavoriteFoodAfterFirst.authority || "") !== "durable") {
      fail("Direct user favorite food declaration did not become immediately durable via anchor support.");
    }
    await assertGroundedFact("What's my favorite food?", "sushi");

    await recordTurn({
      sessionId: "structured-user-direct-anchor",
      userText: "Actually my favorite food is ramen now."
    });
    const userFavoriteFoodAfterRevision = await requireSingleActiveBelief("user.self_view.favorite_food");
    if (normalize(userFavoriteFoodAfterRevision.value) !== "ramen") {
      fail(`Direct user favorite food revision did not replace the anchored value: ${String(userFavoriteFoodAfterRevision.value || "")}`);
    }
    if (String(userFavoriteFoodAfterRevision.authority || "") !== "durable") {
      fail("Direct user favorite food revision did not remain durable after rewrite.");
    }
    await assertGroundedFact("What's my favorite food?", "ramen");

    console.log(
      JSON.stringify(
        {
          ok: true,
          auroraFavoriteAnime: {
            value: auroraFavoriteAfterRevision.value || "",
            authority: auroraFavoriteAfterRevision.authority || "",
            supports: supportCountOf(auroraFavoriteAfterRevision)
          },
          auroraValueAesthetics: {
            value: auroraValueAfterThird.value || "",
            authority: auroraValueAfterThird.authority || "",
            supports: supportCountOf(auroraValueAfterThird)
          },
          userFavoriteMovie: {
            value: userFavoriteMovieAfterSecond.value || "",
            authority: userFavoriteMovieAfterSecond.authority || "",
            supports: supportCountOf(userFavoriteMovieAfterSecond)
          },
          userBeliefGod: {
            value: userBeliefAfterSecond.value || "",
            authority: userBeliefAfterSecond.authority || "",
            supports: supportCountOf(userBeliefAfterSecond)
          },
          phoneModel: {
            value: phoneModel.value || "",
            authority: phoneModel.authority || "",
            supports: supportCountOf(phoneModel)
          },
          userFavoriteFood: {
            value: userFavoriteFoodAfterRevision.value || "",
            authority: userFavoriteFoodAfterRevision.authority || "",
            supports: supportCountOf(userFavoriteFoodAfterRevision)
          }
        },
        null,
        2
      )
    );
  } finally {
    if (previousEnv.AURORA_DISABLE_LOOP === undefined) delete process.env.AURORA_DISABLE_LOOP;
    else process.env.AURORA_DISABLE_LOOP = previousEnv.AURORA_DISABLE_LOOP;
    if (previousEnv.AURORA_MEMORY_PATH === undefined) delete process.env.AURORA_MEMORY_PATH;
    else process.env.AURORA_MEMORY_PATH = previousEnv.AURORA_MEMORY_PATH;
    if (previousEnv.AURORA_EVENT_LOG_PATH === undefined) delete process.env.AURORA_EVENT_LOG_PATH;
    else process.env.AURORA_EVENT_LOG_PATH = previousEnv.AURORA_EVENT_LOG_PATH;
    if (previousEnv.AURORA_RAW_RECALL_PATH === undefined) delete process.env.AURORA_RAW_RECALL_PATH;
    else process.env.AURORA_RAW_RECALL_PATH = previousEnv.AURORA_RAW_RECALL_PATH;
    if (previousEnv.AURORA_COMPLIANCE_LOG_PATH === undefined) delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    else process.env.AURORA_COMPLIANCE_LOG_PATH = previousEnv.AURORA_COMPLIANCE_LOG_PATH;
    if (previousEnv.AURORA_SELF_ANCHORS_PATH === undefined) delete process.env.AURORA_SELF_ANCHORS_PATH;
    else process.env.AURORA_SELF_ANCHORS_PATH = previousEnv.AURORA_SELF_ANCHORS_PATH;
    if (previousEnv.AURORA_SELF_ANCHOR_PROPOSALS_PATH === undefined) {
      delete process.env.AURORA_SELF_ANCHOR_PROPOSALS_PATH;
    } else {
      process.env.AURORA_SELF_ANCHOR_PROPOSALS_PATH = previousEnv.AURORA_SELF_ANCHOR_PROPOSALS_PATH;
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
