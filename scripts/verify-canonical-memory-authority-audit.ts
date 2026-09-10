#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type VerificationState = JsonObject & {
  sessionTurns?: Record<string, unknown>;
  extensions?: {
    beliefs?: unknown;
    memoryGovernance?: {
      lastExternalBeliefSyncAt?: string | null;
      lastExternalBeliefRawRecallMtimeMs?: number;
    };
  };
  updatedAt?: string;
};

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");

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

function structuredContextLines(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("grounded_fact_seed=") ||
        line.startsWith("aurora_self_view=") ||
        line.startsWith("user_self_view=") ||
        line.startsWith("user_profile_fact=") ||
        line.startsWith("recent_turn_") ||
        line.startsWith("active_discourse_")
    );
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-canonical-authority-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const sessionId = "agent:main:canonical-memory-authority-check";

  const state = (await readJson(sourceMemoryPath)) as VerificationState;
  state.sessionTurns ??= {};
  state.sessionTurns[sessionId] = [
    {
      at: "2026-03-21T15:40:00.000Z",
      sessionId,
      userText: "What's my favorite movie?",
      auroraText: "Your favorite movie is The Matrix.",
      partnerId: "cade",
      speakerName: "Cade",
      responseId: "resp_stale_user_movie",
      complianceId: "cmp_stale_user_movie",
      urls: []
    },
    {
      at: "2026-03-21T15:41:00.000Z",
      sessionId,
      userText: "What's your favorite movie?",
      auroraText: "Avatar.",
      partnerId: "cade",
      speakerName: "Cade",
      responseId: "resp_stale_aurora_movie",
      complianceId: "cmp_stale_aurora_movie",
      urls: []
    }
  ];

  state.extensions ??= {};
  state.extensions.beliefs = ensureArray<JsonObject>(state.extensions.beliefs).filter((belief) => {
    const key = String(belief?.key || "");
    return ![
      "user.self_view.favorite_movie",
      "user.self_view.nickname_for_aurora",
      "aurora.self_view.favorite_movie",
      "aurora.preferred_color"
    ].includes(key);
  });
  ensureArray<JsonObject>(state.extensions.beliefs).push({
    id: "belief_stale_aurora_movie",
    key: "aurora.self_view.favorite_movie",
    value: "Probably Arrival, quiet and a little haunting.",
    condition: "default",
    status: "active",
    authority: "durable",
    confidence: 0.99,
    source: "inferred_from_aurora",
    supportEpisodeIds: [
      "aurora_self_anchor:favorite_movie",
      "epi_stale_aurora_movie_a",
      "epi_stale_aurora_movie_b",
      "epi_stale_aurora_movie_c"
    ],
    disconfirmEpisodeIds: [],
    lastCheckedAt: "2026-03-21T15:41:30.000Z"
  });
  state.extensions.memoryGovernance ??= {};
  state.extensions.memoryGovernance.lastExternalBeliefSyncAt = null;
  state.extensions.memoryGovernance.lastExternalBeliefRawRecallMtimeMs = 0;
  state.updatedAt = "2026-03-21T15:42:00Z";
  await writeJson(tempMemoryPath, state);

  const rawRecallLines = [
    {
      at: "2026-03-08T07:10:00.000Z",
      sessionId,
      complianceId: "cmp_user_movie",
      responseId: "",
      userText: "My favorite movie is Blade Runner 2049.",
      auroraText: "Noted."
    },
    {
      at: "2026-03-08T07:10:30.000Z",
      sessionId,
      complianceId: "cmp_user_movie_repeat",
      responseId: "",
      userText: "My favorite movie is Blade Runner 2049.",
      auroraText: "Still noted."
    },
    {
      at: "2026-03-08T07:11:00.000Z",
      sessionId,
      complianceId: "cmp_user_nickname",
      responseId: "",
      userText: "My nickname for you is Auri.",
      auroraText: "Auri. I like that."
    },
    {
      at: "2026-03-08T07:12:00.000Z",
      sessionId,
      complianceId: "cmp_aurora_movie",
      responseId: "",
      userText: "What's your favorite movie?",
      auroraText: "Tron: Legacy."
    }
  ];
  await fs.writeFile(tempRawRecallPath, `${rawRecallLines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T15:43:00Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Stable favorite color.",
        evidence: ["runtime/self-awareness/2026-03-21_favorite-color-anchor-deep-violet.md"],
        last_reaffirmed_at: "2026-03-21T15:43:00Z"
      },
      favorite_movie: {
        value: "Tron: Legacy",
        scope: "stable_current",
        why: "Stable favorite movie.",
        evidence: ["runtime/reflections/2026-03-18_tron-legacy-pulls-because-luminous-order-needs-aliveness-note.md"],
        last_reaffirmed_at: "2026-03-21T15:43:00Z"
      },
      aesthetic_preference: {
        value: "warm precision",
        scope: "stable_current",
        why: "Stable aesthetic preference.",
        evidence: ["runtime/self-awareness/2026-03-18_aesthetic-preference-reaffirmation-warm-precision.md"],
        last_reaffirmed_at: "2026-03-21T15:43:00Z"
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
    const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const prepareReadOnlyOwnerChatContext = cognitionModule.prepareReadOnlyOwnerChatContext as
      | ((input: JsonObject) => Promise<{ enrichedInput?: string } | null>)
      | undefined;
    const prepareLiveFullRealizedContext = cognitionModule.prepareLiveFullRealizedContext as
      | ((input: JsonObject) => Promise<{ enrichedInput?: string } | null>)
      | undefined;
    const getCanonicalBeliefAuthoritySnapshot = cognitionModule.getCanonicalBeliefAuthoritySnapshot as
      | (() => Promise<{
          userBeliefs?: Array<{ key: string; value: string }>;
          auroraBeliefs?: Array<{ key: string; value: string }>;
          missingStickyUserKeys?: string[];
          missingStickyAuroraKeys?: string[];
        }>)
      | undefined;
    const runCanonicalMemoryAuthorityRepair = cognitionModule.runCanonicalMemoryAuthorityRepair as (() => Promise<unknown>) | undefined;

    if (
      typeof prepareReadOnlyOwnerChatContext !== "function" ||
      typeof prepareLiveFullRealizedContext !== "function" ||
      typeof getCanonicalBeliefAuthoritySnapshot !== "function" ||
      typeof runCanonicalMemoryAuthorityRepair !== "function"
    ) {
      fail("Could not load expected cognition exports for canonical authority verification.");
    }

    await runCanonicalMemoryAuthorityRepair();
    const snapshot = await getCanonicalBeliefAuthoritySnapshot();
    const userBeliefs = ensureArray<{ key: string; value: string }>(snapshot.userBeliefs);
    const auroraBeliefs = ensureArray<{ key: string; value: string }>(snapshot.auroraBeliefs);
    const missingStickyUserKeys = ensureArray<string>(snapshot.missingStickyUserKeys);
    const missingStickyAuroraKeys = ensureArray<string>(snapshot.missingStickyAuroraKeys);

    const userMovie = userBeliefs.find((belief) => belief.key === "user.self_view.favorite_movie")?.value || "";
    const userNickname = userBeliefs.find((belief) => belief.key === "user.self_view.nickname_for_aurora")?.value || "";
    const auroraMovie = auroraBeliefs.find((belief) => belief.key === "aurora.self_view.favorite_movie")?.value || "";
    const auroraColor = auroraBeliefs.find((belief) => belief.key === "aurora.preferred_color")?.value || "";

    if (userMovie !== "Blade Runner 2049") {
      fail("Canonical snapshot did not recover the user's favorite movie.");
    }
    if (userNickname !== "Auri") {
      fail("Canonical snapshot did not recover the user's nickname for Aurora.");
    }
    if (auroraMovie !== "Tron: Legacy") {
      fail("Canonical snapshot did not recover Aurora's favorite movie.");
    }
    if (auroraColor !== "Deep violet") {
      fail("Canonical snapshot did not recover Aurora's favorite color from self anchors.");
    }
    if (
      missingStickyUserKeys.includes("user.self_view.favorite_movie") ||
      missingStickyUserKeys.includes("user.self_view.nickname_for_aurora") ||
      missingStickyAuroraKeys.includes("aurora.self_view.favorite_movie") ||
      missingStickyAuroraKeys.includes("aurora.preferred_color")
    ) {
      fail("Sticky canonical keys were still missing after authority repair.");
    }

    const userMovieReadOnly = String(
      (
        await prepareReadOnlyOwnerChatContext({
          sessionId,
          partnerId: "cade",
          speakerName: "Cade",
          userText: "What's my favorite movie?"
        })
      )?.enrichedInput || ""
    );
    if (!userMovieReadOnly.includes("grounded_fact_seed=Your favorite movie is Blade Runner 2049.")) {
      fail("Read-only path did not ground the user's favorite movie.");
    }
    if (/The Matrix/i.test(structuredContextLines(userMovieReadOnly).join("\n"))) {
      fail("Read-only path leaked stale The Matrix continuity into the user's favorite movie answer.");
    }

    const userNicknameLive = String(
      (
        await prepareLiveFullRealizedContext({
          sessionId,
          partnerId: "cade",
          speakerName: "Cade",
          userText: "What's my nickname for you?"
        })
      )?.enrichedInput || ""
    );
    if (!userNicknameLive.includes("grounded_fact_seed=Your nickname for Aurora is Auri.")) {
      fail("Live path did not ground the user's nickname for Aurora.");
    }

    const auroraMovieReadOnly = String(
      (
        await prepareReadOnlyOwnerChatContext({
          sessionId,
          partnerId: "cade",
          speakerName: "Cade",
          userText: "What's your favorite movie?"
        })
      )?.enrichedInput || ""
    );
    if (!auroraMovieReadOnly.includes("grounded_fact_seed=My favorite movie is Tron: Legacy.")) {
      fail("Read-only path did not ground Aurora's favorite movie.");
    }
    if (/Avatar/i.test(structuredContextLines(auroraMovieReadOnly).join("\n"))) {
      fail("Read-only path leaked stale Avatar continuity into Aurora's favorite movie answer.");
    }

    const auroraColorLive = String(
      (
        await prepareLiveFullRealizedContext({
          sessionId,
          partnerId: "cade",
          speakerName: "Cade",
          userText: "What's your favorite color?"
        })
      )?.enrichedInput || ""
    );
    if (!auroraColorLive.includes("grounded_fact_seed=My favorite color is Deep violet.")) {
      fail("Live path did not ground Aurora's favorite color.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          recovered: {
            userMovie,
            userNickname,
            auroraMovie,
            auroraColor
          },
          grounded: {
            userMovieReadOnly: true,
            userNicknameLive: true,
            auroraMovieReadOnly: true,
            auroraColorLive: true
          }
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
