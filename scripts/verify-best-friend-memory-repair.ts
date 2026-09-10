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

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-best-friend-repair-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const sessionId = "agent:main:best-friend-repair-check";

  const rawRecallLines = [
    {
      at: "2026-03-08T07:09:29.855Z",
      sessionId,
      complianceId: "cmp_best_friend_1",
      responseId: "",
      userText: "How long have I been friends with ExampleFriend?",
      auroraText:
        "I don't know how long you've been friends with ExampleFriend. When did you two first meet?"
    },
    {
      at: "2026-03-08T07:14:17.632Z",
      sessionId,
      complianceId: "cmp_best_friend_2",
      responseId: "",
      userText: "ExampleFriend and I have been best friends for over 10 years.",
      auroraText:
        "Got it — you and ExampleFriend have been best friends for over 10 years."
    },
    {
      at: "2026-03-08T07:14:45.000Z",
      sessionId,
      complianceId: "cmp_best_friend_3",
      responseId: "",
      userText: "ExampleFriend is my best friend.",
      auroraText: "Yeah — ExampleFriend is your best friend."
    }
  ];
  await fs.writeFile(
    tempRawRecallPath,
    `${rawRecallLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    "utf8"
  );
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, { version: 1, updatedAt: "2026-03-21T15:00:00Z", anchors: {} });

  const rawRecallMtimeMs = (await fs.stat(tempRawRecallPath)).mtimeMs;
  const state = (await readJson(sourceMemoryPath)) as VerificationState;
  state.extensions ??= {};
  state.extensions.beliefs = ensureArray<JsonObject>(state.extensions.beliefs).filter((belief) => {
    const key = String(belief?.key || "");
    return key !== "user.profile.best_friend_name" && key !== "user.profile.best_friend_duration";
  });
  state.extensions.memoryGovernance ??= {};
  state.extensions.memoryGovernance.lastExternalBeliefSyncAt = "2026-03-21T15:00:00Z";
  state.extensions.memoryGovernance.lastExternalBeliefRawRecallMtimeMs = Math.max(0, Math.round(rawRecallMtimeMs));
  state.updatedAt = "2026-03-21T15:01:00Z";
  await writeJson(tempMemoryPath, state);

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
    const getOwnerFallbackSupport = cognitionModule.getOwnerFallbackSupport as
      | ((userText: string, sessionId?: string) => Promise<{ userProfileDirectAnswer?: string }>)
      | undefined;
    const prepareReadOnlyOwnerChatContext = cognitionModule.prepareReadOnlyOwnerChatContext as
      | ((input: JsonObject) => Promise<{ enrichedInput?: string } | null>)
      | undefined;
    const prepareLiveFullRealizedContext = cognitionModule.prepareLiveFullRealizedContext as
      | ((input: JsonObject) => Promise<{ enrichedInput?: string } | null>)
      | undefined;
    const runUserProfileArchiveBackfill = cognitionModule.runUserProfileArchiveBackfill as
      | (() => Promise<{ activeBeliefs?: Array<{ key: string; value: string }> }>)
      | undefined;

    if (
      typeof getOwnerFallbackSupport !== "function" ||
      typeof prepareReadOnlyOwnerChatContext !== "function" ||
      typeof prepareLiveFullRealizedContext !== "function" ||
      typeof runUserProfileArchiveBackfill !== "function"
    ) {
      fail("Could not load expected cognition exports for best-friend memory verification.");
    }

    const support = await getOwnerFallbackSupport("How long have ExampleFriend and I been friends?", sessionId);
    const supportAnswer = String(support?.userProfileDirectAnswer || "");
    if (!/over 10 years/i.test(supportAnswer)) {
      fail("Owner fallback support did not recover the best-friend duration from archive evidence.");
    }

    const readOnly = await prepareReadOnlyOwnerChatContext({
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      userText: "How long have ExampleFriend and I been friends?"
    });
    const readOnlyText = String(readOnly?.enrichedInput || "");
    if (!readOnlyText.includes("grounded_fact_seed=You and ExampleFriend have been friends for over 10 years.")) {
      fail("Read-only path did not ground best-friend duration from repaired canonical memory.");
    }

    const live = await prepareLiveFullRealizedContext({
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      userText: "How long have ExampleFriend and I been friends?"
    });
    const liveText = String(live?.enrichedInput || "");
    if (!liveText.includes("grounded_fact_seed=You and ExampleFriend have been friends for over 10 years.")) {
      fail("Live full realized path did not ground best-friend duration from repaired canonical memory.");
    }

    const persistedRepair = await runUserProfileArchiveBackfill();
    const activeBeliefs = ensureArray<{ key: string; value: string }>(persistedRepair?.activeBeliefs);
    const bestFriendName = activeBeliefs.find((belief) => belief.key === "user.profile.best_friend_name")?.value || "";
    const bestFriendDuration =
      activeBeliefs.find((belief) => belief.key === "user.profile.best_friend_duration")?.value || "";
    if (bestFriendName !== "ExampleFriend" || !/over 10 years/i.test(bestFriendDuration)) {
      fail("Persistent archive repair did not restore the canonical best-friend beliefs.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          supportAnswer,
          readOnlyGrounded: true,
          liveGrounded: true,
          persisted: {
            bestFriendName,
            bestFriendDuration
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
