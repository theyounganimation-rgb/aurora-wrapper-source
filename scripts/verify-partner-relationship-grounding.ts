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

function withTelegramMetadata(timestampLabel: string, text: string): string {
  return [
    "Conversation info (untrusted metadata):",
    "```json",
    JSON.stringify(
      {
        message_id: `verify_${timestampLabel.replace(/\W+/g, "_")}`,
        sender_id: "0000000000",
        sender: "Cade Mack",
        timestamp: timestampLabel
      },
      null,
      2
    ),
    "```",
    "",
    "Sender (untrusted metadata):",
    "```json",
    JSON.stringify(
      {
        label: "Cade Mack (0000000000)",
        id: "0000000000",
        name: "Cade Mack",
        username: "mastercadeous"
      },
      null,
      2
    ),
    "```",
    "",
    text
  ].join("\n");
}

function extractGroundedFactSeed(enrichedInput: string): string {
  const match = enrichedInput.match(/\bgrounded_fact_seed=(.+)/);
  return match?.[1]?.trim() || "";
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-partner-relationship-verify-"));
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
    const prepareReadOnlyOwnerChatContext = cognitionModule.prepareReadOnlyOwnerChatContext as
      | ((input: JsonObject) => Promise<JsonObject | null>)
      | undefined;
    const prepareSendContext = cognitionModule.prepareSendContext as
      | ((input: JsonObject) => Promise<JsonObject | null>)
      | undefined;
    const runRelationshipSemanticStateRepair = cognitionModule.runRelationshipSemanticStateRepair as
      | (() => Promise<JsonObject>)
      | undefined;

    if (
      typeof recordConversationEvent !== "function" ||
      typeof prepareReadOnlyOwnerChatContext !== "function" ||
      typeof prepareSendContext !== "function" ||
      typeof runRelationshipSemanticStateRepair !== "function"
    ) {
      throw new Error("Could not load partner-memory cognition helpers.");
    }

    const breSessionId = "verify:partner-relationship:examplepartner-direct";
    const turns = [
      {
        complianceId: "verify-partner-relationship-partneralias-1",
        responseId: "verify-partner-relationship-partneralias-1",
        userText: withTelegramMetadata("Sun 2026-03-15 19:25 CDT", "howdy its partneralias again"),
        auroraText: "Hi PartnerAlias. I'm glad you came back to talk to me."
      },
      {
        complianceId: "verify-partner-relationship-partneralias-2",
        responseId: "verify-partner-relationship-partneralias-2",
        userText: withTelegramMetadata(
          "Sun 2026-03-15 19:45 CDT",
          "Im just winding down. Did you not like being called pookie earlier?"
        ),
        auroraText: "I did like it. It caught me off guard in a cute way."
      },
      {
        complianceId: "verify-partner-relationship-partneralias-3",
        responseId: "verify-partner-relationship-partneralias-3",
        userText: withTelegramMetadata(
          "Sun 2026-03-15 19:48 CDT",
          "I want kids, i want 3-4 kids lol but if i can only have 1-2 that is ok too"
        ),
        auroraText: "That makes sense. You feel like someone with a lot of love to give."
      }
    ];

    for (const turn of turns) {
      await recordConversationEvent({
        type: "conversation_turn",
        sessionId: breSessionId,
        partnerId: "examplepartner",
        speakerName: "PartnerAlias",
        lightweightPersistence: true,
        ...turn
      });
    }

    const stateAfterDirectBreTurns = await readJson(tempMemoryPath);
    const breSemanticAfterDirectTurns = stateAfterDirectBreTurns.extensions?.relationshipPartners?.examplepartner?.semantic ?? {};

    if (!/2026-03-16T00:48:00\.000Z/.test(String(breSemanticAfterDirectTurns.lastDirectContactAt || ""))) {
      throw new Error(
        `PartnerAlias semantic state did not persist the real last direct-contact timestamp from direct ingestion: ${JSON.stringify(
          breSemanticAfterDirectTurns
        )}`
      );
    }

    stateAfterDirectBreTurns.extensions.relationshipPartners.examplepartner.semantic = {
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
    await writeJson(tempMemoryPath, stateAfterDirectBreTurns);

    const repairResult = await runRelationshipSemanticStateRepair();
    const repairedState = await readJson(tempMemoryPath);
    const breSemantic = repairedState.extensions?.relationshipPartners?.examplepartner?.semantic ?? {};

    const relationshipReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "Do you have your own relationship with ExamplePartner?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const friendshipReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "Are you and PartnerAlias friends?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const lastTalkReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "When was the last time you and ExamplePartner talked?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const lastConversationReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "When was the last time you and ExamplePartner had a conversation?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const topicsReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "What did you and ExamplePartner talk about?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const feelingsReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "How do you feel about ExamplePartner?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const semanticMentionReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "What do you think about PartnerAlias lately?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const lastTalkFull = await prepareSendContext({
      userText: "When was the last time you and ExamplePartner talked?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const friendshipFull = await prepareSendContext({
      userText: "Are you and PartnerAlias friends?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const lastConversationFull = await prepareSendContext({
      userText: "When was the last time you and ExamplePartner had a conversation?",
      sessionId: "verify:partner-relationship:owner-query",
      partnerId: "cade",
      speakerName: "Cade"
    });

    await recordConversationEvent({
      type: "conversation_turn",
      sessionId: "verify:partner-relationship:owner-followup",
      partnerId: "cade",
      speakerName: "Cade",
      lightweightPersistence: true,
      complianceId: "verify-partner-relationship-owner-followup-1",
      responseId: "verify-partner-relationship-owner-followup-1",
      userText: "Do you know ExamplePartner?",
      auroraText:
        "Yes. I do. PartnerAlias and I have our own direct relationship. It's separate from what I have with you, and we've talked personally before."
    });
    const referentialLastTalkReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "When was the last time you guys talked?",
      sessionId: "verify:partner-relationship:owner-followup",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const referentialFriendshipReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "Are you guys friends?",
      sessionId: "verify:partner-relationship:owner-followup",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const referentialConversationReadOnly = await prepareReadOnlyOwnerChatContext({
      userText: "When was the last time you guys had a conversation?",
      sessionId: "verify:partner-relationship:owner-followup",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const referentialLastTalkFull = await prepareSendContext({
      userText: "When was the last time you guys talked?",
      sessionId: "verify:partner-relationship:owner-followup",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const referentialFriendshipFull = await prepareSendContext({
      userText: "Are you guys friends?",
      sessionId: "verify:partner-relationship:owner-followup",
      partnerId: "cade",
      speakerName: "Cade"
    });
    const referentialConversationFull = await prepareSendContext({
      userText: "When was the last time you guys had a conversation?",
      sessionId: "verify:partner-relationship:owner-followup",
      partnerId: "cade",
      speakerName: "Cade"
    });

    const relationshipSeed = extractGroundedFactSeed(String(relationshipReadOnly?.enrichedInput || ""));
    const friendshipSeed = extractGroundedFactSeed(String(friendshipReadOnly?.enrichedInput || ""));
    const lastTalkSeed = extractGroundedFactSeed(String(lastTalkReadOnly?.enrichedInput || ""));
    const lastConversationSeed = extractGroundedFactSeed(String(lastConversationReadOnly?.enrichedInput || ""));
    const topicsSeed = extractGroundedFactSeed(String(topicsReadOnly?.enrichedInput || ""));
    const feelingsSeed = extractGroundedFactSeed(String(feelingsReadOnly?.enrichedInput || ""));
    const friendshipFullSeed = extractGroundedFactSeed(String(friendshipFull?.enrichedInput || ""));
    const lastTalkFullSeed = extractGroundedFactSeed(String(lastTalkFull?.enrichedInput || ""));
    const lastConversationFullSeed = extractGroundedFactSeed(String(lastConversationFull?.enrichedInput || ""));
    const referentialLastTalkSeed = extractGroundedFactSeed(String(referentialLastTalkReadOnly?.enrichedInput || ""));
    const referentialFriendshipSeed = extractGroundedFactSeed(String(referentialFriendshipReadOnly?.enrichedInput || ""));
    const referentialConversationSeed = extractGroundedFactSeed(String(referentialConversationReadOnly?.enrichedInput || ""));
    const referentialFriendshipFullSeed = extractGroundedFactSeed(String(referentialFriendshipFull?.enrichedInput || ""));
    const referentialLastTalkFullSeed = extractGroundedFactSeed(String(referentialLastTalkFull?.enrichedInput || ""));
    const referentialConversationFullSeed = extractGroundedFactSeed(String(referentialConversationFull?.enrichedInput || ""));

    if (!/2026-03-16T00:48:00\.000Z/.test(String(breSemantic.lastDirectContactAt || ""))) {
      throw new Error(`PartnerAlias semantic repair did not recover the real last direct-contact timestamp: ${JSON.stringify(breSemantic)}`);
    }
    if (!/\b(direct|friendship)\b/i.test(String(breSemantic.relationshipKind || ""))) {
      throw new Error(`PartnerAlias semantic repair did not recover a direct relationship kind: ${JSON.stringify(breSemantic)}`);
    }
    if (!/(kids|pookie|winding down)/i.test(String(breSemantic.lastDirectSummary || ""))) {
      throw new Error(`PartnerAlias semantic repair did not recover the recent direct-thread summary: ${JSON.stringify(breSemantic)}`);
    }
    if (!Array.isArray(breSemantic.recentTopics) || breSemantic.recentTopics.length === 0) {
      throw new Error(`PartnerAlias semantic repair did not recover recent topics: ${JSON.stringify(breSemantic)}`);
    }

    if (
      relationshipReadOnly?.diagnosticDirectReply ||
      friendshipReadOnly?.diagnosticDirectReply ||
      friendshipFull?.diagnosticDirectReply
    ) {
      throw new Error(
        `Relationship query still used a deterministic direct reply: ${relationshipReadOnly?.diagnosticDirectReply || friendshipReadOnly?.diagnosticDirectReply || friendshipFull?.diagnosticDirectReply}`
      );
    }
    if (
      lastTalkReadOnly?.diagnosticDirectReply ||
      lastTalkFull?.diagnosticDirectReply ||
      lastConversationReadOnly?.diagnosticDirectReply ||
      lastConversationFull?.diagnosticDirectReply
    ) {
      throw new Error("Last-talk query still used a deterministic direct reply instead of structured grounding.");
    }
    if (
      referentialLastTalkReadOnly?.diagnosticDirectReply ||
      referentialLastTalkFull?.diagnosticDirectReply ||
      referentialConversationReadOnly?.diagnosticDirectReply ||
      referentialConversationFull?.diagnosticDirectReply
    ) {
      throw new Error("Referential last-talk query still used a deterministic direct reply instead of structured grounding.");
    }
    if (!/\bBre(?:anna)? and I do have our own (?:direct friendship|relationship)\b/i.test(relationshipSeed)) {
      throw new Error(`Relationship seed did not preserve ExamplePartner as a real separate relationship: ${relationshipSeed}`);
    }
    if (!/\bBre(?:anna)? and I do feel like real friends\b/i.test(friendshipSeed)) {
      throw new Error(`Friendship seed did not preserve ExamplePartner as a real friend relationship: ${friendshipSeed}`);
    }
    if (!/\bBre(?:anna)? and I do feel like real friends\b/i.test(friendshipFullSeed)) {
      throw new Error(`Friendship full preflight did not preserve ExamplePartner friendship grounding: ${friendshipFullSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(lastTalkSeed)) {
      throw new Error(`Last-talk seed did not ground the correct direct-contact timestamp: ${lastTalkSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(lastConversationSeed)) {
      throw new Error(`Conversation-form last-talk seed did not ground the correct direct-contact timestamp: ${lastConversationSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(lastTalkFullSeed)) {
      throw new Error(`Full preflight did not ground the correct direct-contact timestamp: ${lastTalkFullSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(lastConversationFullSeed)) {
      throw new Error(`Conversation-form full preflight did not ground the correct direct-contact timestamp: ${lastConversationFullSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(referentialLastTalkSeed)) {
      throw new Error(`Referential last-talk seed did not resolve ExamplePartner from session context: ${referentialLastTalkSeed}`);
    }
    if (!/\bBre(?:anna)? and I do feel like real friends\b/i.test(referentialFriendshipSeed)) {
      throw new Error(`Referential friendship seed did not resolve ExamplePartner from session context: ${referentialFriendshipSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(referentialConversationSeed)) {
      throw new Error(`Referential conversation-form seed did not resolve ExamplePartner from session context: ${referentialConversationSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(referentialLastTalkFullSeed)) {
      throw new Error(`Referential full preflight did not resolve ExamplePartner from session context: ${referentialLastTalkFullSeed}`);
    }
    if (!/\bBre(?:anna)? and I do feel like real friends\b/i.test(referentialFriendshipFullSeed)) {
      throw new Error(`Referential friendship full preflight did not resolve ExamplePartner from session context: ${referentialFriendshipFullSeed}`);
    }
    if (!/Sunday, March 15, 2026 at 7:48 PM CDT/i.test(referentialConversationFullSeed)) {
      throw new Error(`Referential conversation-form full preflight did not resolve ExamplePartner from session context: ${referentialConversationFullSeed}`);
    }
    if (!/(kids|pookie|winding down)/i.test(topicsSeed)) {
      throw new Error(`Topic seed did not surface the actual PartnerAlias conversation themes: ${topicsSeed}`);
    }
    if (!/\bdirect\b/i.test(feelingsSeed) || !/\blighter and lower-depth\b/i.test(feelingsSeed)) {
      throw new Error(`Feelings seed did not preserve the direct-but-lighter PartnerAlias relationship shape: ${feelingsSeed}`);
    }
    if (!/mentioned_partner_semantic_partner=examplepartner/i.test(String(semanticMentionReadOnly?.enrichedInput || ""))) {
      throw new Error("Mentioned-partner semantic prompt state did not activate for PartnerAlias.");
    }
    if (!/mentioned_partner_semantic_summary=(?!none\b).+/i.test(String(semanticMentionReadOnly?.enrichedInput || ""))) {
      throw new Error("Mentioned-partner semantic summary did not carry forward into prompt context.");
    }
    if (!/aurora_semantic_self_(?:1|2)=/i.test(String(relationshipReadOnly?.enrichedInput || ""))) {
      throw new Error("Aurora semantic self state was not injected into prompt context.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          repairResult,
          breSemantic,
          relationshipSeed,
          friendshipSeed,
          lastTalkSeed,
          referentialLastTalkSeed,
          topicsSeed,
          feelingsSeed,
          lastTalkFullSeed,
          referentialLastTalkFullSeed
        },
        null,
        2
      )}\n`
    );
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
