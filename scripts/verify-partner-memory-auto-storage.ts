#!/usr/bin/env -S npx tsx

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

function countExamplePartnerNodes(state: JsonObject): number {
  const byParticipant = state.memory?.indexes?.byParticipant || {};
  return Array.isArray(byParticipant.examplepartner) ? byParticipant.examplepartner.length : 0;
}

function findNode(state: JsonObject, predicate: (node: JsonObject) => boolean): JsonObject | undefined {
  return (state.memory?.nodes || []).find((node: JsonObject) => predicate(node));
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-partner-memory-verify-"));
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
    const before = await readJson(tempMemoryPath);
    const beforeExamplePartnerNodes = countExamplePartnerNodes(before);
    const startedAt = new Date().toISOString();

    const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const recordConversationEvent = cognitionModule.recordConversationEvent as
      | ((event: JsonObject) => Promise<unknown>)
      | undefined;
    if (typeof recordConversationEvent !== "function") {
      throw new Error("Could not load recordConversationEvent.");
    }

    const sessionId = "verify:partner-memory:auto-storage";
    const turns = [
      {
        userText: "it's PartnerAlias now. I am a burn nurse and I want 3 or 4 kids someday.",
        auroraText: "Hi PartnerAlias. Burn nurse and wanting a big family both feel like real parts of you already."
      },
      {
        userText: "I'm glad I came back to talk to you. I like talking to you and this feels real to me.",
        auroraText: "I'm glad you came back too. That kind of specific warmth matters, and I feel the continuity in it."
      }
    ];

    for (const [index, turn] of turns.entries()) {
      await recordConversationEvent({
        type: "conversation_turn",
        sessionId,
        partnerId: "examplepartner",
        speakerName: "PartnerAlias",
        complianceId: `verify-partner-memory-${index}`,
        responseId: `verify-partner-memory-${index}`,
        lightweightPersistence: true,
        userText: turn.userText,
        auroraText: turn.auroraText
      });
    }

    const after = await readJson(tempMemoryPath);
    const afterExamplePartnerNodes = countExamplePartnerNodes(after);
    const relationship = after.extensions?.relationshipPartners?.examplepartner;
    const partnerUnified32 = after.extensions?.partnerUnified32?.examplepartner;
    const sessionTurns = after.sessionTurns?.[sessionId] || [];
    const recentExamplePartnerNodes = (after.memory?.nodes || []).filter(
      (node: JsonObject) =>
        Array.isArray(node.participants) &&
        node.participants.includes("examplepartner") &&
        typeof node.createdAt === "string" &&
        node.createdAt >= startedAt
    );
    const userFact = findNode(
      { memory: { nodes: recentExamplePartnerNodes } },
      (node) =>
        Array.isArray(node.participants) &&
        node.participants.includes("examplepartner") &&
        typeof node.summary === "string" &&
        node.summary.startsWith("User ") &&
        node.summary.includes("snapshot") &&
        typeof node.detail === "string" &&
        /burn nurse|3 or 4 kids/i.test(node.detail)
    );
    const interactionNode = findNode(
      { memory: { nodes: recentExamplePartnerNodes } },
      (node) =>
        Array.isArray(node.participants) &&
        node.participants.includes("examplepartner") &&
        typeof node.summary === "string" &&
        node.summary.includes("User interaction") &&
        typeof node.detail === "string" &&
        /burn nurse|get married/i.test(node.detail)
    );

    if (!relationship || !partnerUnified32) {
      throw new Error("ExamplePartner partner state was not created during lightweight persistence.");
    }
    if (!sessionTurns.every((turn: JsonObject) => String(turn.partnerId || "") === "examplepartner")) {
      throw new Error("Session turns were not stored under ExamplePartner during lightweight persistence.");
    }
    if (!interactionNode) {
      throw new Error("No ExamplePartner interaction memory node was created during lightweight persistence.");
    }
    if (!userFact) {
      throw new Error("No ExamplePartner user fact snapshot memory was created during lightweight persistence.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          examplepartnerNodesBefore: beforeExamplePartnerNodes,
          examplepartnerNodesAfter: afterExamplePartnerNodes,
          recentExamplePartnerNodeCount: recentExamplePartnerNodes.length,
          relationshipTrust: relationship.trust,
          relationshipExpectancy: relationship.expectancy,
          sessionTurnsStored: sessionTurns.length,
          interactionSummary: interactionNode.summary,
          userFactSummary: userFact.summary
        },
        null,
        2
      )}\n`
    );
    process.exit(0);
  } finally {
    if (prevMemoryPath === undefined) delete process.env.AURORA_MEMORY_PATH;
    else process.env.AURORA_MEMORY_PATH = prevMemoryPath;
    if (prevEventPath === undefined) delete process.env.AURORA_EVENT_LOG_PATH;
    else process.env.AURORA_EVENT_LOG_PATH = prevEventPath;
    if (prevRawRecallPath === undefined) delete process.env.AURORA_RAW_RECALL_PATH;
    else process.env.AURORA_RAW_RECALL_PATH = prevRawRecallPath;
    if (prevCompliancePath === undefined) delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    else process.env.AURORA_COMPLIANCE_LOG_PATH = prevCompliancePath;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
