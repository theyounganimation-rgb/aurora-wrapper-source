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

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-storage-audit-"));
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
    const cognition = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const storageAudit = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraStorageAudit.ts")).href);
    const prepareSendContext = cognition.prepareSendContext as
      | ((input: JsonObject) => Promise<JsonObject>)
      | undefined;
    const recordDispatchOutcome = cognition.recordDispatchOutcome as
      | ((input: JsonObject) => Promise<void>)
      | undefined;
    const parseAuroraStorageAuditOutput = storageAudit.parseAuroraStorageAuditOutput as
      | ((text: string) => JsonObject)
      | undefined;

    if (
      typeof prepareSendContext !== "function" ||
      typeof recordDispatchOutcome !== "function" ||
      typeof parseAuroraStorageAuditOutput !== "function"
    ) {
      throw new Error("Could not load storage audit helpers.");
    }

    const ownerPreflight = await prepareSendContext({
      userText: "I think this should probably go in USER.md and maybe revise what you already store about me.",
      sessionId: "agent:main:main",
      partnerId: "cade",
      speakerName: "Cade",
      lightweight: true
    });
    const ownerPrompt = String(ownerPreflight?.enrichedInput || "");
    assert.match(ownerPrompt, /storage_audit_contract=inband_owner_storage_audit/);
    assert.match(ownerPrompt, /storage_audit_decisions=.*belief.*revision/);
    assert.match(ownerPrompt, /storage_audit_rule=If storage work is needed, emit one/);
    assert.match(
      ownerPrompt,
      /\[AURORA_STORAGE_AUDIT decision=belief lookup_required=false targets=beliefs\.json,today_log\]/
    );
    assert.match(ownerPrompt, /owner_turn_reminder=Owner chat: silently classify durable facts, revisions, and storage targets before answering\./);
    assert.match(ownerPrompt, /owner_turn_reminder_rule=.*Prefer USER\.md for simple Cade profile\/preferences and MEMORY\.md for broader durable context\./);
    assert.equal(ownerPreflight?.ownerStorageCheckpointRequired, true);

    const nonOwnerPreflight = await prepareSendContext({
      userText: "Hey Aurora it's PartnerAlias again",
      sessionId: "verify:examplepartner:session",
      partnerId: "examplepartner",
      speakerName: "PartnerAlias",
      lightweight: true
    });
    const nonOwnerPrompt = String(nonOwnerPreflight?.enrichedInput || "");
    assert.doesNotMatch(nonOwnerPrompt, /storage_audit_contract=/);
    assert.notEqual(nonOwnerPreflight?.ownerStorageCheckpointRequired, true);

    const parsedValid = parseAuroraStorageAuditOutput(
      "[AURORA_STORAGE_AUDIT decision=USER.md lookup_required=true targets=USER.md,today_log]\nI do remember that, and I should update it."
    );
    assert.equal(parsedValid.audit?.decision, "USER.md");
    assert.equal(parsedValid.audit?.lookupRequired, true);
    assert.deepEqual(parsedValid.audit?.targets, ["USER.md", "today_log"]);
    assert.equal(parsedValid.visibleText, "I do remember that, and I should update it.");
    assert.equal(parsedValid.malformedHeader, false);

    const parsedReplyRoutingBeforeHeader = parseAuroraStorageAuditOutput(
      "[[reply_to_current]] [AURORA_STORAGE_AUDIT decision=USER.md lookup_required=true targets=USER.md,today_log]\n\nI do remember that, and I should update it."
    );
    assert.equal(parsedReplyRoutingBeforeHeader.audit?.decision, "USER.md");
    assert.deepEqual(parsedReplyRoutingBeforeHeader.audit?.targets, ["USER.md", "today_log"]);
    assert.equal(parsedReplyRoutingBeforeHeader.visibleText, "I do remember that, and I should update it.");
    assert.equal(parsedReplyRoutingBeforeHeader.malformedHeader, false);

    const parsedNone = parseAuroraStorageAuditOutput(
      "[AURORA_STORAGE_AUDIT decision=none lookup_required=false targets=none]\n"
    );
    assert.equal(parsedNone.audit?.decision, "none");
    assert.deepEqual(parsedNone.audit?.targets, ["none"]);
    assert.equal(parsedNone.visibleText, "");

    const parsedMalformed = parseAuroraStorageAuditOutput(
      "[AURORA_STORAGE_AUDIT decision=unknown lookup_required=false targets=beliefs.json]\nVisible reply."
    );
    assert.equal(parsedMalformed.audit, null);
    assert.equal(parsedMalformed.visibleText, "Visible reply.");
    assert.equal(parsedMalformed.hadHeader, true);
    assert.equal(parsedMalformed.malformedHeader, true);

    await recordDispatchOutcome({
      complianceId: "cmp_verify_storage_audit",
      stage: "upstream_ok",
      httpStatus: 200,
      responseId: "resp_verify_storage_audit",
      storageAudit: {
        decision: "belief",
        lookupRequired: false,
        targets: ["beliefs.json", "today_log"],
        status: "checkpoint_enforced"
      }
    });

    const complianceLines = (await fs.readFile(tempCompliancePath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const latestCompliance = JSON.parse(complianceLines.at(-1) || "{}");
    assert.equal(latestCompliance.type, "dispatch_outcome");
    assert.equal(latestCompliance.complianceId, "cmp_verify_storage_audit");
    assert.equal(latestCompliance.responseId, "resp_verify_storage_audit");
    assert.deepEqual(latestCompliance.storageAudit, {
      decision: "belief",
      lookupRequired: false,
      targets: ["beliefs.json", "today_log"],
      status: "checkpoint_enforced"
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          ownerPromptHasStorageAudit: true,
          nonOwnerPromptHasStorageAudit: false,
          parsedValid,
          parsedMalformed,
          persistedStorageAudit: latestCompliance.storageAudit
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
