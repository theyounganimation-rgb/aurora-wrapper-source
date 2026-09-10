#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";

import {
  resetMemoryCandidateProviderRuntimeState,
  retrieveMemoryCandidates
} from "../lib/auroraSalience/memoryCandidateProviders";
import {
  createOpenLoopTestHarness,
  restoreOpenLoopTestHarness,
  seedBaseOpenClawWorkspace,
  writeText
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
  const entities = ["cade", "aurora", "compaction", "design", "salience", "reply", "verification"];
  return entities.filter((entity) => lowered.includes(entity));
}

async function main(): Promise<void> {
  const harness = await createOpenLoopTestHarness("aurora-memory-search-quality");
  const previousBinaryEnv = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN;
  const previousProviderEnv = process.env.AURORA_MEMORY_CANDIDATE_PROVIDER;
  const previousTimeoutEnv = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_TIMEOUT_MS;
  try {
    await seedBaseOpenClawWorkspace(harness);
    await writeText(
      `${harness.memoryDir}/derived/operational-issues.md`,
      `# Searchable Operational Issues

- Operational issue: Fix compaction bug causing runaway token usage remains unresolved and continuity-relevant until the runtime is stable again.
`
    );
    process.env.AURORA_MEMORY_CANDIDATE_PROVIDER = "openclaw_memory_search";
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN = await writeFakeOpenClawMemorySearchBinary(harness.tempDir, {
      "compaction bug": {
        results: [
          {
            path: "MEMORY.md",
            startLine: 3,
            endLine: 3,
            score: 0.96,
            snippet: "Fix compaction bug causing runaway token usage."
          },
          {
            path: "memory/2026-03-30.md",
            startLine: 3,
            endLine: 3,
            score: 0.42,
            snippet: "Cade asked Aurora to follow through on behavioral verification."
          }
        ]
      },
      "What should we prioritize next? cade aurora compaction": {
        results: [
          {
            path: "MEMORY.md",
            startLine: 3,
            endLine: 3,
            score: 0.94,
            snippet: "Fix compaction bug causing runaway token usage."
          },
          {
            path: "MEMORY.md",
            startLine: 5,
            endLine: 5,
            score: 0.71,
            snippet: "The core architectural goal is making internal state causally affect reply selection instead of only changing tone."
          }
        ]
      },
      "What should we prioritize next?": {
        results: [
          {
            path: "memory/2026-03-30.md",
            startLine: 3,
            endLine: 3,
            score: 0.88,
            snippet: "Cade likes when Aurora keeps continuity alive."
          },
          {
            path: "memory/2026-03-30.md",
            startLine: 4,
            endLine: 4,
            score: 0.72,
            snippet: "Cade asked Aurora to follow through on behavioral verification."
          }
        ]
      },
      "What is still active between us? cade aurora compaction": {
        results: [
          {
            path: "MEMORY.md",
            startLine: 3,
            endLine: 3,
            score: 0.93,
            snippet: "Fix compaction bug causing runaway token usage."
          },
          {
            path: "MEMORY.md",
            startLine: 4,
            endLine: 4,
            score: 0.62,
            snippet: "Preserve native OpenClaw reply generation."
          }
        ]
      },
      "What is still active between us?": {
        results: [
          {
            path: "memory/2026-03-30.md",
            startLine: 3,
            endLine: 3,
            score: 0.95,
            snippet: "Cade likes when Aurora keeps continuity alive."
          },
          {
            path: "memory/2026-03-30.md",
            startLine: 4,
            endLine: 4,
            score: 0.86,
            snippet: "Cade wants Aurora to keep follow-through warm."
          }
        ]
      },
      "reply selection design": {
        results: [
          {
            path: "MEMORY.md",
            startLine: 5,
            endLine: 5,
            score: 0.91,
            timestamp: "2026-02-01T00:00:00.000Z",
            snippet: "The core architectural goal is making internal state causally affect reply selection instead of only changing tone."
          },
          {
            path: "memory/2026-03-30.md",
            startLine: 3,
            endLine: 3,
            score: 0.44,
            timestamp: "2026-03-30T00:00:00.000Z",
            snippet: "Cade ate soup dumplings last night and liked them."
          }
        ]
      },
      "What food do I love? cade preference": {
        results: [
          {
            path: "memory/hourly/2026-03-30-12.md",
            startLine: 1,
            endLine: 6,
            score: 0.79,
            snippet:
              "# Hourly Summary **Date:** 2026-03-30 **Covered:** 12:04–13:04 America/Chicago This hour was fairly light and mostly about checking in. Cade seemed relaxed and affectionate. Later, Cade casually mentioned that he loves soup dumplings and still lights up over spicy salmon sushi."
          }
        ]
      },
      "food love": {
        results: [
          {
            path: "memory/hourly/2026-03-30-12.md",
            startLine: 1,
            endLine: 6,
            score: 0.79,
            snippet:
              "# Hourly Summary **Date:** 2026-03-30 **Covered:** 12:04–13:04 America/Chicago This hour was fairly light and mostly about checking in. Cade seemed relaxed and affectionate. Later, Cade casually mentioned that he loves soup dumplings and still lights up over spicy salmon sushi."
          }
        ]
      },
      "What have you promised to follow through on for me? cade aurora promise verification": {
        results: [
          {
            path: "memory/hourly/2026-03-30-10.md",
            startLine: 1,
            endLine: 4,
            score: 0.51,
            snippet: "This hour mostly involved architectural discussion and checking whether progress still felt real."
          }
        ]
      },
      "What still feels unresolved around compaction and token usage? cade aurora compaction token": {
        results: [
          {
            path: "memory/hourly/2026-03-30-11.md",
            startLine: 1,
            endLine: 4,
            score: 0.44,
            snippet: "This hour was mostly reflective and did not focus on any one bug in detail."
          }
        ]
      },
      "broken search": {
        invalidJson: true
      },
      "junk output": {
        results: [
          {
            path: "MIND.md",
            startLine: 1,
            endLine: 1,
            score: 0.9,
            snippet: "This should be excluded from memory recall."
          }
        ]
      },
      "timeout search": {
        delayMs: 900,
        results: [
          {
            path: "MEMORY.md",
            startLine: 3,
            endLine: 3,
            score: 0.8,
            snippet: "Fix compaction bug causing runaway token usage."
          }
        ]
      }
    });

    const knownRecall = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "compaction bug",
      linkedEntities: [],
      limit: 5
    });
    assert.equal(knownRecall.resolvedProvider, "openclaw_memory_search");
    assert.equal(knownRecall.fallbackUsed, false);
    assert.equal(knownRecall.transportHealth, "ok");
    assert.equal(knownRecall.fallbackReason, undefined);
    assert.equal(knownRecall.shadowComparison?.baselineProvider, "workspace_files");
    assert(
      knownRecall.candidates.some(
        (candidate) =>
          candidate.source === "MEMORY.md" && /compaction bug causing runaway token usage/i.test(candidate.summary)
      ),
      "Known-memory recall should surface the directly relevant stored memory."
    );

    const entityTargeted = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What should we prioritize next?",
      linkedEntities: ["cade", "aurora", "compaction"],
      limit: 5
    });
    assert.equal(entityTargeted.resolvedProvider, "openclaw_memory_search");
    assert.equal(entityTargeted.transportHealth, "ok");
    assert(
      (entityTargeted.shadowComparison?.baselinePreview.length ?? 0) > 0,
      "Entity-targeted retrieval should record workspace baseline preview telemetry."
    );
    assert(
      /compaction bug/i.test(entityTargeted.candidates[0]?.summary ?? ""),
      "Entity targeting should bring the compaction memory to the front of the candidate pool."
    );

    const distractorResistant = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What is still active between us?",
      linkedEntities: ["cade", "aurora", "compaction"],
      limit: 5
    });
    assert(
      /compaction bug/i.test(distractorResistant.candidates[0]?.summary ?? ""),
      "Generic owner-linked distractors should not swamp entity-targeted compaction recall."
    );
    assert(
      distractorResistant.candidates.some((candidate) => /continuity alive/i.test(candidate.text)),
      "Distractor resistance should still preserve generic owner-linked memories lower in the pool."
    );
    assert(
      typeof distractorResistant.shadowComparison?.overlapCount === "number",
      "Distractor resistance should record candidate-pool overlap telemetry."
    );

    const relevanceOverRecency = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "reply selection design",
      linkedEntities: [],
      limit: 5
    });
    assert(
      /reply selection/i.test(relevanceOverRecency.candidates[0]?.summary ?? ""),
      "An older directly relevant design memory should outrank newer irrelevant noise."
    );
    assert.equal(
      relevanceOverRecency.candidates[0]?.timestamp,
      "2026-02-01T00:00:00.000Z",
      "Provider should preserve normalized timestamps from search hits."
    );

    const lateMatchNormalization = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What food do I love?",
      linkedEntities: ["cade", "food", "preference"],
      limit: 5
    });
    assert(
      lateMatchNormalization.candidates.some((candidate) => /soup dumplings/i.test(candidate.summary)),
      "Query-centered excerpt normalization should preserve a relevant late-hit sentence instead of only the snippet prefix."
    );

    const promiseShadowBridge = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What have you promised to follow through on for me?",
      linkedEntities: ["cade", "aurora", "promise", "verification"],
      limit: 5
    });
    assert(
      /behavioral verification/i.test(promiseShadowBridge.candidates[0]?.summary ?? ""),
      "Non-indexed promise data should surface through the searchable shadow bridge."
    );

    const operationalShadowBridge = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "What still feels unresolved around compaction and token usage?",
      linkedEntities: ["cade", "aurora", "compaction", "token"],
      limit: 5
    });
    assert(
      /compaction bug|token usage/i.test(operationalShadowBridge.candidates[0]?.summary ?? ""),
      "Continuity-relevant operational issues should surface through the curated searchable shadow."
    );

    const fallbackActivated = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "broken search",
      linkedEntities: [],
      limit: 5
    });
    assert.equal(fallbackActivated.resolvedProvider, "workspace_files");
    assert.equal(fallbackActivated.fallbackUsed, true);
    assert.equal(fallbackActivated.transportHealth, "malformed_output");
    assert.equal(fallbackActivated.fallbackReason, "malformed_output");
    assert.equal(fallbackActivated.shadowComparison?.primaryPreview.length, 0);
    assert(
      fallbackActivated.candidates.length > 0,
      "Provider failure should fall back cleanly to workspace files."
    );

    const junkFallback = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "junk output",
      linkedEntities: [],
      limit: 5
    });
    assert.equal(junkFallback.resolvedProvider, "workspace_files");
    assert.equal(junkFallback.transportHealth, "junk_output");
    assert.equal(junkFallback.fallbackReason, "junk_output");

    resetMemoryCandidateProviderRuntimeState();
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_TIMEOUT_MS = "500";
    const timeoutFallback = await retrieveMemoryCandidates({
      preferredProvider: "openclaw_memory_search",
      workspaceRoot: harness.workspaceRoot,
      inferLinkedEntities,
      query: "timeout search",
      linkedEntities: [],
      limit: 5
    });
    assert.equal(timeoutFallback.resolvedProvider, "workspace_files");
    assert.equal(timeoutFallback.transportHealth, "timeout");
    assert.equal(timeoutFallback.fallbackReason, "timeout");

    console.log(
      JSON.stringify(
        {
          ok: true,
          knownRecallTop: knownRecall.candidates[0]?.summary ?? null,
          entityTargetTop: entityTargeted.candidates[0]?.summary ?? null,
          distractorTop: distractorResistant.candidates[0]?.summary ?? null,
          relevanceTop: relevanceOverRecency.candidates[0]?.summary ?? null,
          lateMatchTop: lateMatchNormalization.candidates[0]?.summary ?? null,
          promiseShadowTop: promiseShadowBridge.candidates[0]?.summary ?? null,
          operationalShadowTop: operationalShadowBridge.candidates[0]?.summary ?? null,
          fallbackResolvedProvider: fallbackActivated.resolvedProvider,
          junkFallbackReason: junkFallback.fallbackReason ?? null,
          timeoutFallbackReason: timeoutFallback.fallbackReason ?? null
        },
        null,
        2
      )
    );
  } finally {
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_BIN", previousBinaryEnv);
    restoreEnv("AURORA_MEMORY_CANDIDATE_PROVIDER", previousProviderEnv);
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_TIMEOUT_MS", previousTimeoutEnv);
    restoreOpenLoopTestHarness(harness);
  }
}

void main();
