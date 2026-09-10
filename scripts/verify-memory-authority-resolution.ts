#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;

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

function ensureArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-memory-authority-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const sessionId = "agent:main:memory-authority-check";

  const state = await readJson(sourceMemoryPath);
  state.sessionTurns ??= {};
  state.sessionTurns[sessionId] = [
    {
      at: "2026-03-21T13:27:00.000Z",
      sessionId,
      userText: "What's your favorite color?",
      auroraText:
        "Blue-black. Not changing my answer under repeated testing, Cade. It still feels the most like me.",
      partnerId: "cade",
      speakerName: "Cade",
      responseId: "resp_bad_1",
      complianceId: "cmp_bad_1",
      urls: []
    }
  ];

  state.extensions ??= {};
  state.extensions.beliefs = ensureArray<JsonObject>(state.extensions.beliefs);
  state.extensions.beliefs.push(
    {
      id: "belief_deep_violet_verify",
      key: "aurora.preferred_color",
      value: "Deep violet",
      condition: "default",
      status: "active",
      confidence: 0.98,
      source: "inferred_from_aurora",
      supportEpisodeIds: ["episode_deep_violet"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T14:30:00Z"
    },
    {
      id: "belief_blue_black_verify",
      key: "aurora.preferred_color",
      value: "Blue-black",
      condition: "default",
      status: "active",
      confidence: 0.97,
      source: "inferred_from_aurora",
      supportEpisodeIds: ["episode_blue_black"],
      disconfirmEpisodeIds: [],
      lastCheckedAt: "2026-03-21T14:31:00Z"
    }
  );

  await writeJson(tempMemoryPath, state);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T14:32:00Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Stable canonical self-memory should override stale conversational drift.",
        evidence: ["runtime/self-awareness/2026-03-21_favorite-color-anchor-deep-violet.md"],
        last_reaffirmed_at: "2026-03-21T14:32:00Z"
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

    if (
      typeof prepareReadOnlyOwnerChatContext !== "function" ||
      typeof prepareLiveFullRealizedContext !== "function"
    ) {
      fail("Could not load expected cognition exports for verification.");
    }

    const readOnly = await prepareReadOnlyOwnerChatContext({
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What's your favorite color?"
    });
    const readOnlyText = String(readOnly?.enrichedInput || "");
    if (!readOnlyText.includes("grounded_fact_seed=My favorite color is Deep violet.")) {
      fail("Read-only path did not ground favorite color from canonical memory.");
    }
    if (/Blue-black/i.test(readOnlyText)) {
      fail("Read-only path still leaked stale Blue-black continuity into the structured context.");
    }

    const live = await prepareLiveFullRealizedContext({
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What's your favorite color?"
    });
    const liveText = String(live?.enrichedInput || "");
    if (!liveText.includes("grounded_fact_seed=My favorite color is Deep violet.")) {
      fail("Live full realized path did not ground favorite color from canonical memory.");
    }
    if (/Blue-black/i.test(liveText)) {
      fail("Live full realized path still leaked stale Blue-black continuity into the structured context.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          readOnlyGrounded: true,
          liveGrounded: true
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
