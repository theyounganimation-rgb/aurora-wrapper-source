#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import { prepareSendContext } from "../lib/auroraCognition";
import {
  createOpenLoopTestHarness,
  ensureBaselineState,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  seedDefaultOpenLoops
} from "./open-loop-test-helpers";
import { writeFakeOpenClawMemorySearchBinary } from "./openclaw-memory-search-test-helpers";

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === "undefined") {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-memory-provider");
  const previousProviderEnv = process.env.AURORA_MEMORY_CANDIDATE_PROVIDER;
  const previousSearchBinaryEnv = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN;
  try {
    await seedBaseOpenClawWorkspace(harness);
    await seedDefaultOpenLoops(harness);
    await ensureBaselineState(harness);

    process.env.AURORA_MEMORY_CANDIDATE_PROVIDER = "workspace_files";
    let preflight = await prepareSendContext({
      userText: "What should we prioritize next?",
      sessionId: "agent:main:main",
      lightweight: true
    });
    assert.equal(preflight.preReplyRetrieval?.requestedProvider, "workspace_files");
    assert.equal(preflight.preReplyRetrieval?.resolvedProvider, "workspace_files");
    assert.equal(preflight.preReplyRetrieval?.fallbackUsed, false);
    assert.equal(preflight.preReplyRetrieval?.transportHealth, "ok");

    process.env.AURORA_MEMORY_CANDIDATE_PROVIDER = "openclaw_memory_search";
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN = pathJoinOrMissing(harness.tempDir, "missing-openclaw");
    preflight = await prepareSendContext({
      userText: "What should we prioritize next?",
      sessionId: "agent:main:main",
      lightweight: true
    });
    assert.equal(preflight.preReplyRetrieval?.requestedProvider, "openclaw_memory_search");
    assert.equal(preflight.preReplyRetrieval?.resolvedProvider, "workspace_files");
    assert.equal(preflight.preReplyRetrieval?.fallbackUsed, true);
    assert.equal(preflight.preReplyRetrieval?.transportHealth, "cli_unavailable");
    assert.equal(preflight.preReplyRetrieval?.fallbackReason, "cli_unavailable");

    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN = await writeFakeOpenClawMemorySearchBinary(harness.tempDir, {
      "What should we prioritize next? cade aurora": {
        results: [
          {
            path: "MEMORY.md",
            startLine: 3,
            endLine: 3,
            score: 0.94,
            snippet: "Fix compaction bug causing runaway token usage."
          }
        ]
      },
      "What should we prioritize next?": {
        results: [
          {
            path: "memory/2026-03-30.md",
            startLine: 3,
            endLine: 3,
            score: 0.51,
            snippet: "Cade asked Aurora to follow through on behavioral verification."
          }
        ]
      }
    });
    preflight = await prepareSendContext({
      userText: "What should we prioritize next?",
      sessionId: "agent:main:main",
      lightweight: true
    });
    assert.equal(preflight.preReplyRetrieval?.requestedProvider, "openclaw_memory_search");
    assert.equal(preflight.preReplyRetrieval?.resolvedProvider, "openclaw_memory_search");
    assert.equal(preflight.preReplyRetrieval?.fallbackUsed, false);
    assert.equal(preflight.preReplyRetrieval?.transportHealth, "ok");
    assert(
      preflight.preReplyPacket?.memories.every((memory) =>
        ["MEMORY.md", "memory/2026-03-30.md"].includes(memory.source)
      ),
      "OpenClaw search provider should normalize hits into ordinary memory-file candidates."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseline: "workspace_files",
          fallback: "workspace_files",
          transportProvider: "openclaw_memory_search"
        },
        null,
        2
      )
    );
  } finally {
    restoreEnv("AURORA_MEMORY_CANDIDATE_PROVIDER", previousProviderEnv);
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_BIN", previousSearchBinaryEnv);
    restoreOpenLoopTestHarness(harness);
  }
}

void main();

function pathJoinOrMissing(root: string, leaf: string): string {
  return `${root}/${leaf}`;
}
