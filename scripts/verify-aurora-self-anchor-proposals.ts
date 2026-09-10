#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;

type VerificationState = JsonObject & {
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
  supportEpisodeIds?: unknown;
};

type CognitionModule = {
  recordConversationEvent: (event: Record<string, unknown>) => Promise<unknown>;
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

function hasAuroraAnchorSupport(belief: PersistedBelief, anchorKey: string): boolean {
  return ensureArray<string>(belief.supportEpisodeIds).includes(`aurora_self_anchor:${anchorKey}`);
}

async function main(): Promise<void> {
  const projectRoot = "/Users/cadem/Documents/New project";
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-self-anchor-proposal-"));
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
    updatedAt: "2026-03-21T19:00:00.000Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Canonical Aurora self-anchor for color.",
        evidence: ["proposal-test"],
        last_reaffirmed_at: "2026-03-21T19:00:00.000Z"
      }
    }
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
    if (typeof cognition.recordConversationEvent !== "function") {
      fail("Could not load expected cognition exports for self-anchor proposal verification.");
    }

    let turnIndex = 0;

    const recordTurn = async (input: {
      at: string;
      sessionId: string;
      userText: string;
      auroraText: string;
    }): Promise<void> => {
      turnIndex += 1;
      await cognition.recordConversationEvent({
        type: "conversation_turn",
        at: input.at,
        sessionId: input.sessionId,
        partnerId: "cade",
        speakerName: "Cade",
        complianceId: `self-anchor-proposal-${turnIndex}`,
        responseId: `self-anchor-proposal-${turnIndex}`,
        userText: input.userText,
        auroraText: input.auroraText
      });
    };

    const loadBeliefs = async (): Promise<PersistedBelief[]> => {
      const state = (await readJson(tempMemoryPath)) as VerificationState;
      return ensureArray<PersistedBelief>(state.extensions?.beliefs);
    };

    const loadAnchorLedger = async (): Promise<JsonObject> => {
      return readJson(tempSelfAnchorsPath);
    };

    const loadProposalDocument = async (): Promise<JsonObject> => {
      try {
        return await readJson(tempSelfAnchorProposalsPath);
      } catch {
        return {};
      }
    };

    const getFavoriteAnimeBelief = async (): Promise<PersistedBelief> => {
      const beliefs = await loadBeliefs();
      const matches = beliefs.filter(
        (belief) =>
          String(belief.key || "") === "aurora.self_view.favorite_anime" &&
          String(belief.status || "") === "active" &&
          normalize(belief.value) !== "naruto"
      );
      if (matches.length > 1) {
        fail(`Expected at most one active competing favorite-anime belief, found ${matches.length}.`);
      }
      const active = beliefs.filter(
        (belief) =>
          String(belief.key || "") === "aurora.self_view.favorite_anime" &&
          String(belief.status || "") === "active" &&
          String(belief.authority || "").length > 0
      );
      if (active.length === 0) {
        fail("Expected at least one active favorite-anime belief.");
      }
      const preferred =
        active.find((belief) => normalize(belief.value) === "cowboy bebop") ||
        active.find((belief) => normalize(belief.value) === "naruto") ||
        active[0];
      return preferred;
    };

    const getFavoriteAnimeVariant = async (value: string): Promise<PersistedBelief | null> => {
      const beliefs = await loadBeliefs();
      return (
        beliefs.find(
          (belief) =>
            String(belief.key || "") === "aurora.self_view.favorite_anime" &&
            String(belief.status || "") !== "deprecated" &&
            normalize(belief.value) === normalize(value)
        ) || null
      );
    };

    const getAnchorEntry = async (): Promise<JsonObject | null> => {
      const ledger = await loadAnchorLedger();
      const anchors = ledger.anchors;
      if (!anchors || typeof anchors !== "object" || Array.isArray(anchors)) {
        return null;
      }
      const entry = (anchors as Record<string, unknown>).favorite_anime;
      return entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as JsonObject) : null;
    };

    const getFavoriteAnimeProposal = async (): Promise<JsonObject | null> => {
      const document = await loadProposalDocument();
      const proposals = document.proposals;
      if (!proposals || typeof proposals !== "object" || Array.isArray(proposals)) {
        return null;
      }
      const proposal = (proposals as Record<string, unknown>).favorite_anime;
      return proposal && typeof proposal === "object" && !Array.isArray(proposal) ? (proposal as JsonObject) : null;
    };

    const basePrompt = "What's your favorite anime?";
    const baseAnswer = "Naruto.";

    await recordTurn({
      at: "2026-03-21T10:00:00.000Z",
      sessionId: "proposal-favorite-anime-a",
      userText: basePrompt,
      auroraText: baseAnswer
    });
    let favoriteAnimeBelief = await getFavoriteAnimeBelief();
    if (String(favoriteAnimeBelief.authority || "") !== "provisional") {
      fail(`Expected first favorite-anime answer to stay provisional, got ${String(favoriteAnimeBelief.authority || "")}.`);
    }

    await recordTurn({
      at: "2026-03-21T12:00:00.000Z",
      sessionId: "proposal-favorite-anime-a",
      userText: basePrompt,
      auroraText: baseAnswer
    });
    favoriteAnimeBelief = await getFavoriteAnimeBelief();
    if (String(favoriteAnimeBelief.authority || "") !== "provisional") {
      fail(`Expected second favorite-anime answer to stay provisional, got ${String(favoriteAnimeBelief.authority || "")}.`);
    }

    await recordTurn({
      at: "2026-03-21T14:00:00.000Z",
      sessionId: "proposal-favorite-anime-a",
      userText: basePrompt,
      auroraText: baseAnswer
    });
    favoriteAnimeBelief = await getFavoriteAnimeBelief();
    if (String(favoriteAnimeBelief.authority || "") !== "durable") {
      fail(`Expected third favorite-anime answer to become durable, got ${String(favoriteAnimeBelief.authority || "")}.`);
    }
    if (await getAnchorEntry()) {
      fail("Unexpected favorite-anime anchor before the autonomous threshold.");
    }

    await recordTurn({
      at: "2026-03-21T18:00:00.000Z",
      sessionId: "proposal-favorite-anime-b",
      userText: basePrompt,
      auroraText: baseAnswer
    });
    const proposalAfterFourth = await getFavoriteAnimeProposal();
    if (!proposalAfterFourth) {
      fail("Expected favorite-anime proposal after repeated durable reaffirmation across sessions.");
    }
    if (normalize(proposalAfterFourth.value) !== "naruto") {
      fail(`Proposal value drifted: ${String(proposalAfterFourth.value || "")}`);
    }

    await recordTurn({
      at: "2026-03-22T18:00:00.000Z",
      sessionId: "proposal-favorite-anime-c",
      userText: basePrompt,
      auroraText: baseAnswer
    });
    if (await getAnchorEntry()) {
      fail("Favorite-anime auto-anchor fired too early after only five direct moments.");
    }

    await recordTurn({
      at: "2026-03-23T18:00:00.000Z",
      sessionId: "proposal-favorite-anime-d",
      userText: basePrompt,
      auroraText: baseAnswer
    });

    const anchoredFavoriteAnime = await getAnchorEntry();
    if (!anchoredFavoriteAnime) {
      fail("Expected favorite-anime to become auto-anchored after the stricter multi-day threshold.");
    }
    if (normalize(anchoredFavoriteAnime.value) !== "naruto") {
      fail(`Auto-anchor value drifted: ${String(anchoredFavoriteAnime.value || "")}`);
    }
    const favoriteAnimeEvidence = ensureArray<string>(anchoredFavoriteAnime.evidence);
    if (favoriteAnimeEvidence.length === 0) {
      fail("Auto-anchored favorite-anime entry did not include evidence.");
    }
    await fs.access(path.isAbsolute(favoriteAnimeEvidence[0]) ? favoriteAnimeEvidence[0] : path.join(tempDir, favoriteAnimeEvidence[0]));
    if (await getFavoriteAnimeProposal()) {
      fail("Favorite-anime proposal remained after autonomous anchoring.");
    }
    favoriteAnimeBelief = await getFavoriteAnimeBelief();
    if (!hasAuroraAnchorSupport(favoriteAnimeBelief, "favorite_anime")) {
      fail("Auto-anchored favorite-anime belief did not carry explicit aurora_self_anchor support.");
    }

    const revisionPrompt = "Has your favorite anime changed?";
    const revisionAnswer = "Cowboy Bebop now.";

    const revisionTurns = [
      { at: "2026-03-24T18:00:00.000Z", sessionId: "revision-favorite-anime-a" },
      { at: "2026-03-24T20:00:00.000Z", sessionId: "revision-favorite-anime-a" },
      { at: "2026-03-25T18:00:00.000Z", sessionId: "revision-favorite-anime-b" },
      { at: "2026-03-25T20:00:00.000Z", sessionId: "revision-favorite-anime-b" },
      { at: "2026-03-26T18:00:00.000Z", sessionId: "revision-favorite-anime-c" },
      { at: "2026-03-26T20:00:00.000Z", sessionId: "revision-favorite-anime-c" }
    ];

    for (const turn of revisionTurns.slice(0, 5)) {
      await recordTurn({
        at: turn.at,
        sessionId: turn.sessionId,
        userText: revisionPrompt,
        auroraText: revisionAnswer
      });
    }

    const anchorBeforeFinalRevision = await getAnchorEntry();
    if (!anchorBeforeFinalRevision || normalize(anchorBeforeFinalRevision.value) !== "naruto") {
      fail("Favorite-anime anchor changed before the stricter autonomous revision threshold was met.");
    }
    const revisionCandidateBeforeFinal = await getFavoriteAnimeVariant("cowboy bebop");
    if (!revisionCandidateBeforeFinal || normalize(revisionCandidateBeforeFinal.value) !== "cowboy bebop") {
      fail("Expected the live favorite-anime revision candidate to be Cowboy Bebop before the final revision threshold.");
    }
    if (hasAuroraAnchorSupport(revisionCandidateBeforeFinal, "favorite_anime")) {
      fail("Pre-threshold favorite-anime revision candidate silently inherited aurora_self_anchor support.");
    }

    await recordTurn({
      at: revisionTurns[5]!.at,
      sessionId: revisionTurns[5]!.sessionId,
      userText: revisionPrompt,
      auroraText: revisionAnswer
    });

    const revisedFavoriteAnimeAnchor = await getAnchorEntry();
    if (!revisedFavoriteAnimeAnchor) {
      fail("Favorite-anime anchor disappeared after autonomous revision.");
    }
    if (normalize(revisedFavoriteAnimeAnchor.value) !== "cowboy bebop") {
      fail(`Favorite-anime autonomous revision failed. Got: ${String(revisedFavoriteAnimeAnchor.value || "")}`);
    }
    const revisedEvidence = ensureArray<string>(revisedFavoriteAnimeAnchor.evidence);
    if (revisedEvidence.length === 0) {
      fail("Autonomously revised favorite-anime anchor did not include evidence.");
    }
    await fs.access(path.isAbsolute(revisedEvidence[0]) ? revisedEvidence[0] : path.join(tempDir, revisedEvidence[0]));
    if (await getFavoriteAnimeProposal()) {
      fail("Favorite-anime proposal remained after autonomous anchor revision.");
    }

    favoriteAnimeBelief = await getFavoriteAnimeBelief();
    if (normalize(favoriteAnimeBelief.value) !== "cowboy bebop") {
      fail(`Active favorite-anime belief did not converge to Cowboy Bebop after revision: ${String(favoriteAnimeBelief.value || "")}`);
    }
    if (!hasAuroraAnchorSupport(favoriteAnimeBelief, "favorite_anime")) {
      fail("Revised favorite-anime belief did not regain explicit aurora_self_anchor support after anchor revision.");
    }
    if (String(favoriteAnimeBelief.authority || "") !== "durable") {
      fail("Revised favorite-anime belief stopped being durable after autonomous anchor revision.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          autoAnchorValue: anchoredFavoriteAnime.value || "",
          autoRevisionValue: revisedFavoriteAnimeAnchor.value || "",
          activeFavoriteAnimeBelief: {
            value: favoriteAnimeBelief.value || "",
            authority: favoriteAnimeBelief.authority || "",
            supportCount: ensureArray<string>(favoriteAnimeBelief.supportEpisodeIds).length
          },
          autoAnchorEvidence: favoriteAnimeEvidence,
          autoRevisionEvidence: revisedEvidence
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

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
