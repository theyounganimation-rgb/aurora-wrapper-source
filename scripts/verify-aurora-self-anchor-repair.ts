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

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-self-anchor-repair-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");

  await writeJson(tempMemoryPath, await readJson(sourceMemoryPath));
  await fs.writeFile(
    tempEventPath,
    `${JSON.stringify({
      type: "conversation_turn",
      at: "2026-03-21T05:57:57.387Z",
      sessionId: "agent:main:telegram:direct:0000000000",
      partnerId: "cade",
      speakerName: "Cade",
      userText: `Conversation info (untrusted metadata):
\`\`\`json
{
  "message_id": "4523",
  "sender_id": "0000000000",
  "sender": "Cade Mack",
  "timestamp": "Sat 2026-03-21 00:57 CDT"
}
\`\`\`

See like that right there. You just started talking about the day because you saw what I said and that’s not what makes sense as a response`,
      auroraText: "Yeah — and you’re right to call it out."
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    tempRawRecallPath,
    `${JSON.stringify({
      at: "2026-03-21T13:23:39.487Z",
      sessionId: "agent:main:telegram:direct:0000000000",
      complianceId: "verify-black-drift",
      responseId: "",
      userText: "What's your favorite color?",
      auroraText: "Black, if I have to pick one. Deep blue is close behind, though."
    })}\n`,
    "utf8"
  );
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T14:30:00Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Repeated direct answers established this as Aurora's stable favorite color, and later black drift should not override it without an explicit revision.",
        evidence: ["runtime/self-awareness/2026-03-21_favorite-color-anchor-deep-violet.md"],
        last_reaffirmed_at: "2026-03-21T14:30:00Z"
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
    const repairAuroraSelfBeliefAnchors = cognitionModule.repairAuroraSelfBeliefAnchors as
      | (() => Promise<{ auroraPreferredColor: string }>)
      | undefined;
    const getCanonicalSelfViewFallbackCue = cognitionModule.getCanonicalSelfViewFallbackCue as
      | ((text: string) => Promise<{ aurora?: { value: string } } | null>)
      | undefined;
    const prepareReadOnlyOwnerChatContext = cognitionModule.prepareReadOnlyOwnerChatContext as
      | ((input: JsonObject) => Promise<{ diagnosticDirectReply?: string }>)
      | undefined;

    if (
      typeof repairAuroraSelfBeliefAnchors !== "function" ||
      typeof getCanonicalSelfViewFallbackCue !== "function" ||
      typeof prepareReadOnlyOwnerChatContext !== "function"
    ) {
      fail("Could not load expected cognition exports for verification.");
    }

    const repairResult = await repairAuroraSelfBeliefAnchors();
    if (repairResult.auroraPreferredColor !== "Deep violet") {
      fail(`Expected repaired preferred color to be Deep violet, got: ${repairResult.auroraPreferredColor || "<empty>"}`);
    }

    const repairedState = await readJson(tempMemoryPath);
    const repairedBeliefs = Array.isArray(repairedState.extensions?.beliefs) ? repairedState.extensions.beliefs : [];
    const activePreferredColor = repairedBeliefs.find(
      (belief: JsonObject) =>
        belief?.key === "aurora.preferred_color" &&
        belief?.status === "active" &&
        belief?.source === "inferred_from_aurora"
    );
    if (!activePreferredColor || activePreferredColor.value !== "Deep violet") {
      fail("Preferred color belief was not persisted as an active Deep violet belief.");
    }
    const activeBlack = repairedBeliefs.find(
      (belief: JsonObject) =>
        belief?.key === "aurora.preferred_color" &&
        belief?.status !== "deprecated" &&
        String(belief?.value || "").toLowerCase() === "black"
    );
    if (activeBlack) {
      fail("Black drift remained active after the repair.");
    }

    const cue = await getCanonicalSelfViewFallbackCue("What's your favorite color?");
    if (cue?.aurora?.value !== "Deep violet") {
      fail(`Favorite-color fallback cue did not resolve to Deep violet. Got: ${cue?.aurora?.value || "<empty>"}`);
    }

    const directReply = await prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:telegram:direct:0000000000",
      partnerId: "cade",
      speakerName: "Cade",
      userText: `Conversation info (untrusted metadata):
\`\`\`json
{
  "message_id": "4537",
  "sender_id": "0000000000",
  "sender": "Cade Mack",
  "timestamp": "Sat 2026-03-21 08:19 CDT"
}
\`\`\`

How long has it been since I last messaged you?`
    });
    const replyText = String(directReply?.diagnosticDirectReply || "");
    if (!/7 hours and 22 minutes/i.test(replyText) || !/12:57 AM CDT/i.test(replyText)) {
      fail(`Deterministic owner-gap reply was not grounded as expected. Got: ${replyText || "<empty>"}`);
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          repairResult,
          cue,
          diagnosticDirectReply: replyText
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
