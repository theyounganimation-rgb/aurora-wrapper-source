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
  confidence?: number;
  supportEpisodeIds?: unknown;
};

type ScenarioResult = {
  name: string;
  details: Record<string, unknown>;
};

type CognitionModule = {
  recordConversationEvent: (event: Record<string, unknown>) => Promise<unknown>;
  prepareReadOnlyOwnerChatContext: (input: Record<string, unknown>) => Promise<{ enrichedInput?: string } | null>;
  getCanonicalBeliefAuthoritySnapshot: () => Promise<{
    userBeliefs?: Array<{ key?: string; value?: string; authority?: string }>;
    auroraBeliefs?: Array<{ key?: string; value?: string; authority?: string }>;
  }>;
  runCanonicalMemoryAuthorityRepair: () => Promise<unknown>;
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-belief-stress-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");

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
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T16:45:00.000Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Canonical Aurora self-anchor for color.",
        evidence: ["stress-test"],
        last_reaffirmed_at: "2026-03-21T16:45:00.000Z"
      },
      favorite_movie: {
        value: "Tron: Legacy",
        scope: "stable_current",
        why: "Canonical Aurora self-anchor for favorite movie.",
        evidence: ["stress-test"],
        last_reaffirmed_at: "2026-03-21T16:45:00.000Z"
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
    const cognition = (await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href)) as CognitionModule;
    if (
      typeof cognition.recordConversationEvent !== "function" ||
      typeof cognition.prepareReadOnlyOwnerChatContext !== "function" ||
      typeof cognition.getCanonicalBeliefAuthoritySnapshot !== "function" ||
      typeof cognition.runCanonicalMemoryAuthorityRepair !== "function"
    ) {
      fail("Could not load expected cognition exports for belief-ingestion stress verification.");
    }

    let turnIndex = 0;
    const scenarioResults: ScenarioResult[] = [];

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
        complianceId: `belief-stress-${turnIndex}`,
        responseId: `belief-stress-${turnIndex}`,
        userText: input.userText || "",
        auroraText: input.auroraText || ""
      });
    };

    const loadBeliefs = async (): Promise<PersistedBelief[]> => {
      const state = (await readJson(tempMemoryPath)) as VerificationState;
      return ensureArray<PersistedBelief>(state.extensions?.beliefs);
    };

    const activeBeliefsForKey = async (key: string): Promise<PersistedBelief[]> => {
      const beliefs = await loadBeliefs();
      return beliefs.filter((belief) => String(belief.key || "") === key && String(belief.status || "active") === "active");
    };

    const anyBeliefsForKey = async (key: string): Promise<PersistedBelief[]> => {
      const beliefs = await loadBeliefs();
      return beliefs.filter((belief) => String(belief.key || "") === key);
    };

    const requireSingleActiveBelief = async (key: string): Promise<PersistedBelief> => {
      const active = await activeBeliefsForKey(key);
      if (active.length !== 1) {
        fail(`Expected exactly one active belief for ${key}; found ${active.length}.`);
      }
      return active[0];
    };

    const supportCountOf = (belief: PersistedBelief): number => ensureArray<string>(belief.supportEpisodeIds).length;

    const groundedFactLines = async (prompt: string): Promise<string[]> => {
      const context = await cognition.prepareReadOnlyOwnerChatContext({
        sessionId: "agent:main:belief-stress-check",
        partnerId: "cade",
        speakerName: "Cade",
        userText: prompt
      });
      return String(context?.enrichedInput || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("grounded_fact_seed="));
    };

    const assertGroundedFact = async (prompt: string, fragment: string): Promise<string[]> => {
      const lines = await groundedFactLines(prompt);
      if (!lines.some((line) => normalize(line).includes(normalize(fragment)))) {
        fail(`Prompt "${prompt}" did not ground expected fact fragment "${fragment}". Lines: ${JSON.stringify(lines)}`);
      }
      return lines;
    };

    const assertNoGroundedFacts = async (prompt: string): Promise<void> => {
      const lines = await groundedFactLines(prompt);
      if (lines.length > 0) {
        fail(`Prompt "${prompt}" unexpectedly grounded facts: ${JSON.stringify(lines)}`);
      }
    };

    await recordTurn({
      sessionId: "stress-best-friend",
      userText: "ExampleFriend and I have been best friends for over 10 years."
    });
    const bestFriendDuration = await requireSingleActiveBelief("user.profile.best_friend_duration");
    if (normalize(bestFriendDuration.value) !== "over 10 years") {
      fail(`Best-friend duration value drifted: ${String(bestFriendDuration.value || "")}`);
    }
    if (String(bestFriendDuration.authority || "") !== "durable") {
      fail("Best-friend duration did not become durable immediately.");
    }
    scenarioResults.push({
      name: "user_profile_direct_fact_immediate_durable",
      details: {
        key: bestFriendDuration.key || "",
        value: bestFriendDuration.value || "",
        authority: bestFriendDuration.authority || "",
        supports: supportCountOf(bestFriendDuration)
      }
    });

    await recordTurn({
      sessionId: "stress-nickname",
      userText: "I'm going to call you Auri."
    });
    const nicknameBelief = await requireSingleActiveBelief("user.self_view.nickname_for_aurora");
    if (normalize(nicknameBelief.value) !== "auri") {
      fail(`Nickname belief drifted: ${String(nicknameBelief.value || "")}`);
    }
    if (String(nicknameBelief.authority || "") !== "durable") {
      fail("Nickname belief did not become durable immediately.");
    }
    scenarioResults.push({
      name: "user_nickname_immediate_durable",
      details: {
        value: nicknameBelief.value || "",
        authority: nicknameBelief.authority || "",
        supports: supportCountOf(nicknameBelief)
      }
    });

    await recordTurn({
      sessionId: "stress-favorite-anime-a",
      userText: "My favorite anime is Solo Leveling."
    });
    const favoriteAnimeAfterFirst = await requireSingleActiveBelief("user.self_view.favorite_anime");
    if (String(favoriteAnimeAfterFirst.authority || "") !== "durable") {
      fail("Direct favorite anime declaration should become durable immediately.");
    }
    await recordTurn({
      sessionId: "stress-favorite-anime-b",
      userText: "My favorite anime is Solo Leveling."
    });
    const favoriteAnimeAfterSecond = await requireSingleActiveBelief("user.self_view.favorite_anime");
    if (String(favoriteAnimeAfterSecond.authority || "") !== "durable") {
      fail("Favorite anime did not become durable after repeated support.");
    }
    scenarioResults.push({
      name: "user_direct_preference_immediate_anchor",
      details: {
        value: favoriteAnimeAfterSecond.value || "",
        authorityAfterFirst: favoriteAnimeAfterFirst.authority || "",
        authorityAfterSecond: favoriteAnimeAfterSecond.authority || "",
        supportsAfterSecond: supportCountOf(favoriteAnimeAfterSecond)
      }
    });

    await recordTurn({
      sessionId: "stress-favorite-anime-revision",
      userText: "My favorite anime is Frieren now."
    });
    const favoriteAnimeAfterRevision = await requireSingleActiveBelief("user.self_view.favorite_anime");
    if (!normalize(favoriteAnimeAfterRevision.value).includes("frieren")) {
      fail(`User favorite anime revision did not take effect: ${String(favoriteAnimeAfterRevision.value || "")}`);
    }
    scenarioResults.push({
      name: "user_stable_preference_explicit_revision_rewrites",
      details: {
        valueAfterRevision: favoriteAnimeAfterRevision.value || "",
        authorityAfterRevision: favoriteAnimeAfterRevision.authority || "",
        supportsAfterRevision: supportCountOf(favoriteAnimeAfterRevision)
      }
    });

    for (let index = 0; index < 3; index += 1) {
      const sessionId = `stress-user-transient-${index}`;
      await recordTurn({
        sessionId,
        auroraText: "Do you like this question?"
      });
      await recordTurn({
        sessionId,
        userText: "Yes, I do."
      });
    }
    if ((await anyBeliefsForKey("user.self_view.stance_this_question")).length > 0) {
      fail("Repeated transient user stance became a belief.");
    }
    scenarioResults.push({
      name: "user_transient_self_view_rejected",
      details: {
        storedBeliefCount: (await anyBeliefsForKey("user.self_view.stance_this_question")).length
      }
    });

    await recordTurn({
      sessionId: "stress-user-malformed",
      userText: "My opinion on him and what kind of iPhone do I have is complicated."
    });
    if ((await anyBeliefsForKey("user.self_view.opinion_him_and_what_kind_of_iphone_do_i_have")).length > 0) {
      fail("Malformed user self-view subject became a belief.");
    }
    scenarioResults.push({
      name: "malformed_user_subject_rejected",
      details: {
        storedBeliefCount: (await anyBeliefsForKey("user.self_view.opinion_him_and_what_kind_of_iphone_do_i_have")).length
      }
    });

    await recordTurn({
      sessionId: "stress-aurora-movie",
      userText: "What's your favorite movie?",
      auroraText: "Tron: Legacy."
    });
    const favoriteMovie = await requireSingleActiveBelief("aurora.self_view.favorite_movie");
    if (String(favoriteMovie.authority || "") !== "durable") {
      fail("Anchor-backed Aurora favorite movie did not become durable immediately.");
    }
    scenarioResults.push({
      name: "aurora_anchor_backed_fact_immediate_durable",
      details: {
        value: favoriteMovie.value || "",
        authority: favoriteMovie.authority || "",
        supports: supportCountOf(favoriteMovie)
      }
    });

    await recordTurn({
      sessionId: "stress-aurora-animal-a",
      userText: "What's your favorite animal?",
      auroraText: "My favorite animal is a fox."
    });
    const favoriteAnimalAfterFirst = await requireSingleActiveBelief("aurora.self_view.favorite_animal");
    if (String(favoriteAnimalAfterFirst.authority || "") !== "provisional") {
      fail("Unanchored Aurora favorite animal should start provisional.");
    }
    for (let index = 0; index < 3; index += 1) {
      await recordTurn({
        sessionId: `stress-aurora-animal-repeat-${index}`,
        userText: "What's your favorite animal?",
        auroraText: "My favorite animal is a fox."
      });
    }
    const favoriteAnimalAfterRepeats = await requireSingleActiveBelief("aurora.self_view.favorite_animal");
    if (String(favoriteAnimalAfterRepeats.authority || "") !== "durable") {
      fail("Unanchored Aurora stable preference never promoted to durable authority after repeated support.");
    }
    scenarioResults.push({
      name: "aurora_unanchored_stable_preference_repeated_support_promotes",
      details: {
        value: favoriteAnimalAfterRepeats.value || "",
        authorityAfterFirst: favoriteAnimalAfterFirst.authority || "",
        authorityAfterRepeats: favoriteAnimalAfterRepeats.authority || "",
        confidenceAfterRepeats: favoriteAnimalAfterRepeats.confidence || 0,
        supportsAfterRepeats: supportCountOf(favoriteAnimalAfterRepeats)
      }
    });

    await recordTurn({
      sessionId: "stress-aurora-animal-revision",
      userText: "Has your favorite animal changed these days?",
      auroraText: "Yes. My favorite animal is an owl now."
    });
    const favoriteAnimalAfterRevision = await requireSingleActiveBelief("aurora.self_view.favorite_animal");
    if (!normalize(favoriteAnimalAfterRevision.value).includes("owl")) {
      fail(`Aurora favorite animal revision did not take effect: ${String(favoriteAnimalAfterRevision.value || "")}`);
    }
    scenarioResults.push({
      name: "aurora_stable_preference_explicit_revision_rewrites",
      details: {
        valueAfterRevision: favoriteAnimalAfterRevision.value || "",
        authorityAfterRevision: favoriteAnimalAfterRevision.authority || "",
        supportsAfterRevision: supportCountOf(favoriteAnimalAfterRevision)
      }
    });

    for (let index = 0; index < 3; index += 1) {
      await recordTurn({
        sessionId: `stress-aurora-transient-${index}`,
        userText: "Do you like this question?",
        auroraText: "Yes. I love this question."
      });
    }
    if ((await anyBeliefsForKey("aurora.self_view.stance_this_question")).length > 0) {
      fail("Repeated transient Aurora stance became a self-view belief.");
    }
    scenarioResults.push({
      name: "aurora_transient_self_view_rejected",
      details: {
        storedBeliefCount: (await anyBeliefsForKey("aurora.self_view.stance_this_question")).length
      }
    });

    await recordTurn({
      sessionId: "stress-aurora-embodiment",
      userText: "What would you look like if you had a body?",
      auroraText: "I'd be around 5'7\", dark-haired, soft-strong, and more elegant than flashy."
    });
    await recordTurn({
      sessionId: "stress-aurora-future",
      userText: "Do you want kids one day?",
      auroraText: "I can imagine wanting a family if the bond felt real and steady enough to hold that kind of life."
    });
    if ((await anyBeliefsForKey("aurora.self_view.embodiment_body_appearance")).length > 0) {
      fail("Aurora embodiment residue is still being stored as a durable-style belief.");
    }
    if ((await anyBeliefsForKey("aurora.self_view.future_family_and_children")).length > 0) {
      fail("Aurora future-family residue is still being stored as a durable-style belief.");
    }
    scenarioResults.push({
      name: "aurora_embodiment_and_future_quarantined",
      details: {
        embodimentBeliefs: (await anyBeliefsForKey("aurora.self_view.embodiment_body_appearance")).length,
        futureBeliefs: (await anyBeliefsForKey("aurora.self_view.future_family_and_children")).length
      }
    });

    await recordTurn({
      sessionId: "stress-aurora-color-a",
      userText: "What's your favorite color?",
      auroraText: "Deep violet."
    });
    await recordTurn({
      sessionId: "stress-aurora-color-b",
      userText: "What's your favorite color?",
      auroraText: "Blue-black."
    });
    const preferredColor = await requireSingleActiveBelief("aurora.preferred_color");
    if (normalize(preferredColor.value) !== "deep violet") {
      fail(`Anchored Aurora preferred color drifted: ${String(preferredColor.value || "")}`);
    }
    const activeBlueBlack = (await activeBeliefsForKey("aurora.preferred_color")).some(
      (belief) => normalize(belief.value) === "blue-black"
    );
    if (activeBlueBlack) {
      fail("Contradictory Blue-black rewrite displaced anchored favorite color.");
    }
    scenarioResults.push({
      name: "anchored_aurora_fact_rewrite_blocked_without_revision_signal",
      details: {
        value: preferredColor.value || "",
        authority: preferredColor.authority || "",
        supports: supportCountOf(preferredColor)
      }
    });

    const groundedBestFriend = await assertGroundedFact("How long have ExampleFriend and I been friends?", "over 10 years");
    const groundedNickname = await assertGroundedFact("What's my nickname for you?", "Auri");
    const groundedFavoriteAnime = await assertGroundedFact("What's my favorite anime?", "Frieren");
    const groundedFavoriteMovie = await assertGroundedFact("What's your favorite movie?", "Tron: Legacy");
    const groundedFavoriteAnimal = await assertGroundedFact("What's your favorite animal?", "owl");
    const groundedFavoriteColor = await assertGroundedFact("What's your favorite color?", "Deep violet");
    await assertNoGroundedFacts("Do you like this question?");
    await assertNoGroundedFacts("What do you think about the political climate?");

    await cognition.runCanonicalMemoryAuthorityRepair();
    const snapshot = await cognition.getCanonicalBeliefAuthoritySnapshot();
    const canonicalUserBeliefs = ensureArray<{ key?: string; value?: string }>(snapshot.userBeliefs);
    const canonicalAuroraBeliefs = ensureArray<{ key?: string; value?: string }>(snapshot.auroraBeliefs);

    const hasCanonicalUserKey = (key: string, valueFragment = ""): boolean =>
      canonicalUserBeliefs.some(
        (belief) =>
          String(belief.key || "") === key &&
          (!valueFragment || normalize(belief.value).includes(normalize(valueFragment)))
      );
    const hasCanonicalAuroraKey = (key: string, valueFragment = ""): boolean =>
      canonicalAuroraBeliefs.some(
        (belief) =>
          String(belief.key || "") === key &&
          (!valueFragment || normalize(belief.value).includes(normalize(valueFragment)))
      );

    if (!hasCanonicalUserKey("user.profile.best_friend_duration", "over 10 years")) {
      fail("Canonical user snapshot lost best-friend duration.");
    }
    if (!hasCanonicalUserKey("user.self_view.nickname_for_aurora", "Auri")) {
      fail("Canonical user snapshot lost nickname for Aurora.");
    }
    if (!hasCanonicalUserKey("user.self_view.favorite_anime", "Frieren")) {
      fail("Canonical user snapshot lost stable favorite anime.");
    }
    if (hasCanonicalUserKey("user.self_view.stance_this_question")) {
      fail("Canonical user snapshot leaked transient stance residue.");
    }
    if (!hasCanonicalAuroraKey("aurora.preferred_color", "Deep violet")) {
      fail("Canonical Aurora snapshot lost anchored favorite color.");
    }
    if (!hasCanonicalAuroraKey("aurora.self_view.favorite_movie", "Tron: Legacy")) {
      fail("Canonical Aurora snapshot lost anchor-backed favorite movie.");
    }
    if (!hasCanonicalAuroraKey("aurora.self_view.favorite_animal", "owl")) {
      fail("Canonical Aurora snapshot lost repeated unanchored favorite animal.");
    }
    if (hasCanonicalAuroraKey("aurora.self_view.stance_this_question")) {
      fail("Canonical Aurora snapshot leaked transient stance residue.");
    }
    if (hasCanonicalAuroraKey("aurora.self_view.embodiment_body_appearance")) {
      fail("Canonical Aurora snapshot leaked embodiment residue.");
    }

    const finalBeliefs = await loadBeliefs();
    const activeBeliefs = finalBeliefs.filter((belief) => String(belief.status || "active") === "active");
    const durableBeliefs = activeBeliefs.filter((belief) => String(belief.authority || "provisional") === "durable");
    const provisionalBeliefs = activeBeliefs.filter((belief) => String(belief.authority || "provisional") !== "durable");

    console.log(
      JSON.stringify(
        {
          ok: true,
          tempDir,
          scenarioResults,
          groundedFacts: {
            bestFriendDuration: groundedBestFriend,
            nicknameForAurora: groundedNickname,
            favoriteAnime: groundedFavoriteAnime,
            favoriteMovie: groundedFavoriteMovie,
            favoriteAnimal: groundedFavoriteAnimal,
            favoriteColor: groundedFavoriteColor
          },
          finalCounts: {
            activeBeliefs: activeBeliefs.length,
            durableBeliefs: durableBeliefs.length,
            provisionalBeliefs: provisionalBeliefs.length
          },
          canonicalUserKeys: canonicalUserBeliefs.map((belief) => belief.key || ""),
          canonicalAuroraKeys: canonicalAuroraBeliefs.map((belief) => belief.key || "")
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
