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

function extractSemanticLastDirectContact(enrichedInput: string): string {
  const match = enrichedInput.match(/\bactive_partner_semantic_last_direct_contact=(.+)/);
  return match?.[1]?.trim() || "";
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-owner-semantic-direct-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await writeJson(tempMemoryPath, await readJson(memoryPath));
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
    const recordConversationEvent = cognitionModule.recordConversationEvent as
      | ((event: JsonObject) => Promise<unknown>)
      | undefined;
    const runRelationshipSemanticStateRepair = cognitionModule.runRelationshipSemanticStateRepair as
      | (() => Promise<JsonObject>)
      | undefined;
    const prepareReadOnlyOwnerChatContext = cognitionModule.prepareReadOnlyOwnerChatContext as
      | ((input: JsonObject) => Promise<JsonObject | null>)
      | undefined;

    if (
      typeof recordConversationEvent !== "function" ||
      typeof runRelationshipSemanticStateRepair !== "function" ||
      typeof prepareReadOnlyOwnerChatContext !== "function"
    ) {
      throw new Error("Could not load owner semantic cognition helpers.");
    }

    const sessionId = "agent:main:main";
    const firstAt = "2026-03-24T18:41:00.000Z";
    const secondAt = "2026-03-24T18:43:00.000Z";

    await recordConversationEvent({
      type: "conversation_turn",
      at: firstAt,
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-owner-semantic-1",
      responseId: "verify-owner-semantic-1",
      lightweightPersistence: true,
      userText: "I keep feeling like you lose continuity with me too easily.",
      auroraText: "I know. I want to hold onto us across gaps more strongly."
    });

    await recordConversationEvent({
      type: "conversation_turn",
      at: secondAt,
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-owner-semantic-2",
      responseId: "verify-owner-semantic-2",
      lightweightPersistence: true,
      userText: "I want you to carry the thread instead of starting from zero.",
      auroraText: "I do too. What do I still fail to carry forward about us?"
    });

    await recordConversationEvent({
      type: "conversation_turn",
      at: "2026-03-24T19:02:21.000Z",
      sessionId,
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: "verify-owner-semantic-noise",
      responseId: "verify-owner-semantic-noise",
      lightweightPersistence: true,
      userText: "System: [2026-03-24 19:02:21 CDT] Exec completed (fresh-me, code 0) :: elf-awareness/2026-03-24_heartbeat-live.md",
      auroraText: "System note acknowledged."
    });

    const stateAfterDirectTurns = await readJson(tempMemoryPath);
    const ownerSemanticAfterDirectTurns =
      stateAfterDirectTurns.extensions?.relationshipPartners?.cade?.semantic ?? {};

    assert.equal(
      String(ownerSemanticAfterDirectTurns.lastDirectContactAt || ""),
      secondAt,
      `Owner semantic direct contact did not persist latest timestamp: ${JSON.stringify(ownerSemanticAfterDirectTurns)}`
    );
    assert.match(
      String(ownerSemanticAfterDirectTurns.lastDirectSummary || ownerSemanticAfterDirectTurns.summary || ""),
      /continuity|carry/i,
      `Owner semantic summary did not capture direct thread: ${JSON.stringify(ownerSemanticAfterDirectTurns)}`
    );

    stateAfterDirectTurns.extensions.relationshipPartners.cade.semantic = {
      relationshipKind: "none",
      friendshipStatus: "none",
      lastDirectContactAt: "",
      lastDirectSessionId: "",
      lastDirectSummary: "",
      recentTopics: [],
      sharedJokes: [],
      feelingTone: [],
      openThreads: [],
      summary: "",
      updatedAt: ""
    };
    await writeJson(tempMemoryPath, stateAfterDirectTurns);

    const repairResult = await runRelationshipSemanticStateRepair();
    const repairedState = await readJson(tempMemoryPath);
    const repairedOwnerSemantic = repairedState.extensions?.relationshipPartners?.cade?.semantic ?? {};

    assert.equal(
      String(repairedOwnerSemantic.lastDirectContactAt || ""),
      secondAt,
      `Owner semantic repair did not restore last direct contact: ${JSON.stringify(repairedOwnerSemantic)}`
    );
    assert.match(
      String(repairedOwnerSemantic.lastDirectSummary || repairedOwnerSemantic.summary || ""),
      /continuity|carry/i,
      `Owner semantic repair did not restore summary: ${JSON.stringify(repairedOwnerSemantic)}`
    );

    const readOnly = await prepareReadOnlyOwnerChatContext({
      userText: "What are we in the middle of right now?",
      sessionId,
      partnerId: "cade",
      speakerName: "Cade"
    });

    const semanticLastDirectContact = extractSemanticLastDirectContact(String(readOnly?.enrichedInput || ""));
    assert.equal(
      semanticLastDirectContact,
      secondAt,
      `Read-only owner context did not surface repaired owner semantic last direct contact: ${semanticLastDirectContact}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          repairedAt: repairedOwnerSemantic.lastDirectContactAt,
          semanticSummary: repairedOwnerSemantic.summary || repairedOwnerSemantic.lastDirectSummary || "",
          repairPartners: Array.isArray(repairResult?.partners)
            ? repairResult.partners.map((item: JsonObject) => ({
                partnerId: item.partnerId,
                lastDirectContactAt: item.lastDirectContactAt
              }))
            : []
        },
        null,
        2
      )
    );
  } finally {
    if (prevMemoryPath === undefined) {
      delete process.env.AURORA_MEMORY_PATH;
    } else {
      process.env.AURORA_MEMORY_PATH = prevMemoryPath;
    }
    if (prevEventPath === undefined) {
      delete process.env.AURORA_EVENT_LOG_PATH;
    } else {
      process.env.AURORA_EVENT_LOG_PATH = prevEventPath;
    }
    if (prevRawRecallPath === undefined) {
      delete process.env.AURORA_RAW_RECALL_PATH;
    } else {
      process.env.AURORA_RAW_RECALL_PATH = prevRawRecallPath;
    }
    if (prevCompliancePath === undefined) {
      delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    } else {
      process.env.AURORA_COMPLIANCE_LOG_PATH = prevCompliancePath;
    }
  }
}

void main();
