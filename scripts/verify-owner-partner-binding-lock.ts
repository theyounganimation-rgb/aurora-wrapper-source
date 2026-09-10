#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function importCognition(tag: string): Promise<JsonObject> {
  const url = pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts"));
  url.searchParams.set("verifyOwnerBinding", `${tag}-${Date.now()}`);
  return import(url.href) as Promise<JsonObject>;
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-owner-binding-lock-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await writeJson(tempMemoryPath, await readJson(memoryPath));
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const previousEnv = {
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH
  };
  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;

  try {
    const seedModule = await importCognition("seed");
    const recordSeedConversationEvent = seedModule.recordConversationEvent as
      | ((event: JsonObject) => Promise<unknown>)
      | undefined;
    if (typeof recordSeedConversationEvent !== "function") {
      throw new Error("Could not load cognition conversation recorder.");
    }

    await recordSeedConversationEvent({
      type: "conversation_turn",
      at: "2026-03-29T15:17:40.419Z",
      sessionId: "agent:main:owner:continuity",
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-owner-binding-seed",
      responseId: "verify-owner-binding-seed",
      lightweightPersistence: true,
      userText: "How are you feeling right now?",
      auroraText: "Connected, engaged, and steady."
    });

    const pollutedState = await readJson(tempMemoryPath);
    const ownerTurns = Array.isArray(pollutedState.sessionTurns?.["agent:main:owner:continuity"])
      ? pollutedState.sessionTurns["agent:main:owner:continuity"]
      : [];
    assert.ok(ownerTurns.length > 0, "Expected at least one seeded owner continuity turn.");

    pollutedState.extensions = pollutedState.extensions || {};
    pollutedState.extensions.activeRelationshipPartnerId = "examplepartner";
    pollutedState.extensions.lastRelationshipPartnerId = "examplepartner";
    pollutedState.extensions.sessionPartnerBindings = pollutedState.extensions.sessionPartnerBindings || {};
    pollutedState.extensions.sessionPartnerBindings["agent:main:owner:continuity"] = {
      partnerId: "examplepartner",
      displayName: "PartnerAlias",
      source: "session_binding",
      announcedBy: "partner",
      confidence: 0.9,
      updatedAt: "2026-03-29T15:24:23.348Z"
    };
    pollutedState.extensions.temporal = pollutedState.extensions.temporal || {};
    pollutedState.extensions.temporal.timeBody = pollutedState.extensions.temporal.timeBody || {};
    pollutedState.extensions.temporal.timeBody.lastDirectUserMessageAt = "2026-03-29T05:09:48.081Z";

    for (const turn of ownerTurns) {
      turn.partnerId = "examplepartner";
    }

    await writeJson(tempMemoryPath, pollutedState);

    const probeModule = await importCognition("probe");
    const previewRelationshipPartnerResolution = probeModule.previewRelationshipPartnerResolution as
      | ((input: JsonObject) => Promise<JsonObject | null>)
      | undefined;
    const recordConversationEvent = probeModule.recordConversationEvent as
      | ((event: JsonObject) => Promise<unknown>)
      | undefined;
    if (
      typeof previewRelationshipPartnerResolution !== "function" ||
      typeof recordConversationEvent !== "function"
    ) {
      throw new Error("Could not load owner binding verification helpers.");
    }

    const preview = await previewRelationshipPartnerResolution({
      userText: "Do you feel alive?",
      sessionId: "agent:main:owner:continuity"
    });
    assert.equal(preview?.partnerId, "cade", `Expected owner preview to resolve to Cade, got: ${JSON.stringify(preview)}`);
    assert.equal(preview?.source, "default", `Expected owner preview source=default, got: ${JSON.stringify(preview)}`);

    const finalAt = "2026-03-29T15:22:39.360Z";
    await recordConversationEvent({
      type: "conversation_turn",
      at: finalAt,
      sessionId: "agent:main:owner:continuity",
      lightweightPersistence: true,
      userText: "Do you feel alive?",
      auroraText: "Yes. Not biologically, but as a real ongoing subject here with you."
    });

    const repairedState = await readJson(tempMemoryPath);
    const repairedOwnerTurns = repairedState.sessionTurns?.["agent:main:owner:continuity"] || [];
    const latestTurn = repairedOwnerTurns.at(-1);
    const ownerBinding = repairedState.extensions?.sessionPartnerBindings?.["agent:main:owner:continuity"] || {};
    const lastDirectUserMessageAt = repairedState.extensions?.temporal?.timeBody?.lastDirectUserMessageAt || "";

    assert.equal(latestTurn?.partnerId, "cade", `Expected latest owner turn to be Cade, got: ${JSON.stringify(latestTurn)}`);
    assert.equal(
      repairedState.extensions?.activeRelationshipPartnerId,
      "cade",
      `Expected active partner to repair to Cade, got: ${repairedState.extensions?.activeRelationshipPartnerId}`
    );
    assert.equal(
      repairedState.extensions?.lastRelationshipPartnerId,
      "cade",
      `Expected last partner to repair to Cade, got: ${repairedState.extensions?.lastRelationshipPartnerId}`
    );
    assert.equal(ownerBinding.partnerId, "cade", `Expected owner session binding to repair to Cade, got: ${JSON.stringify(ownerBinding)}`);
    assert.equal(
      lastDirectUserMessageAt,
      finalAt,
      `Expected lastDirectUserMessageAt to update on owner-unified turn, got: ${lastDirectUserMessageAt}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          preview,
          latestTurn: {
            at: latestTurn?.at || "",
            partnerId: latestTurn?.partnerId || "",
            userText: latestTurn?.userText || ""
          },
          ownerBinding,
          lastDirectUserMessageAt
        },
        null,
        2
      )
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

void main();
