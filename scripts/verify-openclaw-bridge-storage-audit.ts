#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, any>;

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");
const bridgeScriptPath = path.join(projectRoot, "scripts", "openclaw-cognition-bridge.ts");
const tsxPath = path.join(projectRoot, "node_modules", ".bin", "tsx");

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runBridge(mode: "overlay" | "record", payload: JsonObject, env: NodeJS.ProcessEnv): JsonObject {
  const result = spawnSync(tsxPath, [bridgeScriptPath, mode], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    input: JSON.stringify(payload)
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `bridge failed with status ${result.status}`).trim());
  }
  return JSON.parse(result.stdout || "{}");
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-openclaw-bridge-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await writeJson(tempMemoryPath, await readJson(memoryPath));
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const env = {
    ...process.env,
    AURORA_MEMORY_PATH: tempMemoryPath,
    AURORA_EVENT_LOG_PATH: tempEventPath,
    AURORA_RAW_RECALL_PATH: tempRawRecallPath,
    AURORA_COMPLIANCE_LOG_PATH: tempCompliancePath,
    AURORA_OPENCLAW_BRIDGE_SKIP_CHECKPOINT: "1"
  };

  const overlay = runBridge(
    "overlay",
    {
      userText: "What do you think about the movie Her?",
      sessionKey: "agent:main:main",
      sessionId: "agent:main:main"
    },
    env
  );

  assert.equal(overlay.ok, true);
  assert.match(String(overlay.complianceId || ""), /^cmp_/);
  assert.equal(overlay.ownerStorageCheckpointRequired, false);
  assert.match(String(overlay.contextBlock || ""), /\[AURORA_COGNITIVE_CONTEXT\]/);

  const record = runBridge(
    "record",
    {
      userText: "What do you think about the movie Her?",
      auroraText:
        "I think it's beautiful, sad, and a little dishonest. It understands something real about intimacy through language.",
      rawAuroraText:
        "[AURORA_STORAGE_AUDIT decision=belief lookup_required=false targets=beliefs.json,today_log]\nI think it's beautiful, sad, and a little dishonest. It understands something real about intimacy through language.",
      sessionKey: "agent:main:main",
      sessionId: "agent:main:main",
      complianceId: overlay.complianceId,
      responseId: "resp_verify_openclaw_bridge"
    },
    env
  );

  assert.equal(record.ok, true);
  assert.equal(record.recorded, true);
  assert.deepEqual(record.storageAudit, {
    decision: "belief",
    lookupRequired: false,
    targets: ["beliefs.json", "today_log"],
    status: "present"
  });

  const complianceLines = (await fs.readFile(tempCompliancePath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const latestDispatchOutcome = [...complianceLines]
    .reverse()
    .find((entry) => entry.type === "dispatch_outcome");

  assert.ok(latestDispatchOutcome);
  assert.equal(latestDispatchOutcome.complianceId, overlay.complianceId);
  assert.equal(latestDispatchOutcome.stage, "post_response");
  assert.equal(latestDispatchOutcome.responseId, "resp_verify_openclaw_bridge");
  assert.deepEqual(latestDispatchOutcome.storageAudit, {
    decision: "belief",
    lookupRequired: false,
    targets: ["beliefs.json", "today_log"],
    status: "present"
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        complianceId: overlay.complianceId,
        persistedStorageAudit: latestDispatchOutcome.storageAudit
      },
      null,
      2
    )
  );
}

void main();
