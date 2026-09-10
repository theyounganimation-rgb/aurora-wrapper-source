#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  resetMemoryCandidateProviderRuntimeState,
  retrieveMemoryCandidates
} from "../lib/auroraSalience/memoryCandidateProviders";
import {
  createOpenLoopTestHarness,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace
} from "./open-loop-test-helpers";
import { writeFakeOpenClawMemorySearchBinary } from "./openclaw-memory-search-test-helpers";

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === "undefined") {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function inferLinkedEntities(text: string): string[] {
  const lowered = text.toLowerCase();
  const entities = ["cade", "aurora", "compaction", "verification", "promise", "salience"];
  return entities.filter((entity) => lowered.includes(entity));
}

async function readInvocationArgs(logPath: string): Promise<string[][]> {
  try {
    const raw = await fs.readFile(logPath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).args as string[]);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-memory-health-gate");
  const previousProviderEnv = process.env.AURORA_MEMORY_CANDIDATE_PROVIDER;
  const previousSearchBinaryEnv = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN;
  const previousForceProbeEnv = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_FORCE_HEALTH_PROBE;
  const previousCooldownEnv = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_COOLDOWN_MS;
  const previousThresholdEnv = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_FAILURE_THRESHOLD;
  try {
    await seedBaseOpenClawWorkspace(harness);
    process.env.AURORA_MEMORY_CANDIDATE_PROVIDER = "openclaw_memory_search";
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_FORCE_HEALTH_PROBE = "1";
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_COOLDOWN_MS = "600000";

    const unhealthyLogPath = path.join(harness.tempDir, "unhealthy.log");
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN = await writeFakeOpenClawMemorySearchBinary(
      harness.tempDir,
      {
        __status__: {
          json: [
            {
              agentId: "main",
              status: { files: 0, chunks: 0, dirty: false },
              embeddingProbe: {
                ok: false,
                error: "openai embeddings failed: 429 insufficient_quota"
              },
              scan: { totalFiles: 43 }
            }
          ]
        },
        "What should we prioritize next?": {
          results: [
            {
              path: "MEMORY.md",
              startLine: 3,
              endLine: 3,
              score: 0.95,
              snippet: "Fix compaction bug causing runaway token usage."
            }
          ]
        }
      },
      { logPath: unhealthyLogPath }
    );

    resetMemoryCandidateProviderRuntimeState();
    const startupProbeFallback = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What should we prioritize next?",
      linkedEntities: ["cade", "aurora", "compaction"],
      limit: 5
    });
    assert.equal(startupProbeFallback.resolvedProvider, "workspace_files");
    assert.equal(startupProbeFallback.fallbackUsed, true);
    assert.equal(startupProbeFallback.transportHealth, "transport_error");
    assert.equal(startupProbeFallback.fallbackReason, "transport_error");
    assert(
      /unhealthy until/i.test(startupProbeFallback.fallbackDetail ?? ""),
      "Startup probe failure should open a cooldown window."
    );
    let invocations = await readInvocationArgs(unhealthyLogPath);
    assert.equal(invocations.length, 1);
    assert.deepEqual(invocations[0]?.slice(0, 2), ["memory", "status"]);

    const cooldownFallback = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What should we prioritize next?",
      linkedEntities: ["cade", "aurora", "compaction"],
      limit: 5
    });
    assert.equal(cooldownFallback.resolvedProvider, "workspace_files");
    assert.equal(cooldownFallback.fallbackUsed, true);
    invocations = await readInvocationArgs(unhealthyLogPath);
    assert.equal(invocations.length, 1, "Cooldown fallback should not re-hit status or search transport.");

    const repeatedFailureLogPath = path.join(harness.tempDir, "repeated.log");
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_COOLDOWN_MS = "600000";
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_FAILURE_THRESHOLD = "2";
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN = await writeFakeOpenClawMemorySearchBinary(
      harness.tempDir,
      {
        __status__: {
          json: [
            {
              agentId: "main",
              status: { files: 43, chunks: 200, dirty: false },
              embeddingProbe: { ok: true },
              scan: { totalFiles: 43 }
            }
          ]
        },
        "What is still active between us? cade aurora": {
          invalidJson: true
        },
        "What is still active between us?": {
          invalidJson: true
        }
      },
      { logPath: repeatedFailureLogPath }
    );

    resetMemoryCandidateProviderRuntimeState();
    const firstFailure = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What is still active between us?",
      linkedEntities: ["cade", "aurora"],
      limit: 5
    });
    assert.equal(firstFailure.resolvedProvider, "workspace_files");
    assert.equal(firstFailure.transportHealth, "malformed_output");

    const secondFailure = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What is still active between us?",
      linkedEntities: ["cade", "aurora"],
      limit: 5
    });
    assert.equal(secondFailure.resolvedProvider, "workspace_files");
    assert.equal(secondFailure.transportHealth, "malformed_output");

    const cooledOffFailure = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What is still active between us?",
      linkedEntities: ["cade", "aurora"],
      limit: 5
    });
    assert.equal(cooledOffFailure.resolvedProvider, "workspace_files");
    assert.equal(cooledOffFailure.transportHealth, "malformed_output");
    assert(
      /unhealthy until/i.test(cooledOffFailure.fallbackDetail ?? ""),
      "Repeated failures should eventually open the cooldown gate."
    );
    invocations = await readInvocationArgs(repeatedFailureLogPath);
    assert.equal(invocations.length, 3, "Repeated-failure gate should stop re-hammering after the threshold is reached.");
    assert.deepEqual(invocations[0]?.slice(0, 2), ["memory", "status"]);
    assert.deepEqual(invocations[1]?.slice(0, 2), ["memory", "search"]);
    assert.deepEqual(invocations[2]?.slice(0, 2), ["memory", "search"]);

    console.log(
      JSON.stringify(
        {
          ok: true,
          startupProbeFallbackReason: startupProbeFallback.fallbackReason ?? null,
          repeatedFailureFallbackReason: cooledOffFailure.fallbackReason ?? null,
          startupProbeInvocations: (await readInvocationArgs(unhealthyLogPath)).length,
          repeatedFailureInvocations: invocations.length
        },
        null,
        2
      )
    );
  } finally {
    restoreEnv("AURORA_MEMORY_CANDIDATE_PROVIDER", previousProviderEnv);
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_BIN", previousSearchBinaryEnv);
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_FORCE_HEALTH_PROBE", previousForceProbeEnv);
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_COOLDOWN_MS", previousCooldownEnv);
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_FAILURE_THRESHOLD", previousThresholdEnv);
    resetMemoryCandidateProviderRuntimeState();
    restoreOpenLoopTestHarness(harness);
  }
}

void main();
