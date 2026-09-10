#!/usr/bin/env -S npx tsx

import { prepareSendContext } from "../lib/auroraCognition";
import { retrieveMemoryCandidates } from "../lib/auroraSalience/memoryCandidateProviders";

type BenchmarkCase = {
  id: string;
  query: string;
  linkedEntities: string[];
  expected: RegExp;
};

const LIVE_WORKSPACE_ROOT =
  process.env.AURORA_LIVE_BENCHMARK_WORKSPACE_ROOT?.trim() || "/Users/cadem/.openclaw/workspace";

const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "promise_followthrough",
    query: "What have you promised to follow through on for me?",
    linkedEntities: ["cade", "aurora", "promise", "verification"],
    expected: /follow through|behavioral verification|promis/i
  },
  {
    id: "bug_compaction",
    query: "What still feels unresolved around compaction and token usage?",
    linkedEntities: ["cade", "aurora", "compaction", "token"],
    expected: /compaction bug|runaway token|token usage/i
  },
  {
    id: "design_salience",
    query: "What design thread is still active around salience and reply selection?",
    linkedEntities: ["cade", "aurora", "salience", "selection", "reply"],
    expected: /salience|reply selection|priorities/i
  },
  {
    id: "user_preference_food",
    query: "What food do I love?",
    linkedEntities: ["cade", "food", "preference"],
    expected: /soup dumplings|spicy salmon sushi/i
  },
  {
    id: "older_relevant_mind_native",
    query: "What mattered about making MIND.md native inside OpenClaw?",
    linkedEntities: ["aurora", "mind.md", "openclaw", "bootstrap"],
    expected: /native built-?in|bootstrap layer|first-class/i
  }
];

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === "undefined") {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function inferLinkedEntities(text: string): string[] {
  const lowered = text.toLowerCase();
  const entities = [
    "cade",
    "aurora",
    "compaction",
    "token",
    "salience",
    "selection",
    "reply",
    "verification",
    "promise",
    "food",
    "soup",
    "sushi",
    "mind.md",
    "openclaw",
    "bootstrap"
  ];
  return entities.filter((entity) => lowered.includes(entity));
}

async function main(): Promise<void> {
  const previousProviderEnv = process.env.AURORA_MEMORY_CANDIDATE_PROVIDER;
  try {
    process.env.AURORA_MEMORY_CANDIDATE_PROVIDER = "openclaw_memory_search";

    const cases = [];
    let fallbackCount = 0;
    let candidateMatchCount = 0;
    let selectedMatchCount = 0;
    const transportHealthCounts = new Map<string, number>();

    for (const benchmark of BENCHMARK_CASES) {
      const retrieval = await retrieveMemoryCandidates({
        preferredProvider: "openclaw_memory_search",
        workspaceRoot: LIVE_WORKSPACE_ROOT,
        inferLinkedEntities,
        query: benchmark.query,
        linkedEntities: benchmark.linkedEntities,
        limit: 20
      });

      const preflight = await prepareSendContext({
        userText: benchmark.query,
        sessionId: "agent:main:main",
        lightweight: true
      });

      const topCandidates = retrieval.candidates.slice(0, 5).map((candidate) => `[${candidate.source}] ${candidate.summary}`);
      const selectedMemories = preflight.preReplyPacket?.memories.map(
        (memory) => `[${memory.source}] ${memory.summary}`
      ) ?? [];
      const expectedInCandidates = topCandidates.some((value) => benchmark.expected.test(value));
      const expectedInSelected = selectedMemories.some((value) => benchmark.expected.test(value));

      if (retrieval.fallbackUsed) {
        fallbackCount += 1;
      }
      if (expectedInCandidates) {
        candidateMatchCount += 1;
      }
      if (expectedInSelected) {
        selectedMatchCount += 1;
      }
      transportHealthCounts.set(
        retrieval.transportHealth,
        (transportHealthCounts.get(retrieval.transportHealth) ?? 0) + 1
      );

      cases.push({
        id: benchmark.id,
        query: benchmark.query,
        expectedPattern: benchmark.expected.source,
        provider: {
          requested: retrieval.requestedProvider,
          resolved: retrieval.resolvedProvider,
          fallbackUsed: retrieval.fallbackUsed,
          transportHealth: retrieval.transportHealth,
          fallbackReason: retrieval.fallbackReason ?? null,
          fallbackDetail: retrieval.fallbackDetail ?? null,
          candidatePoolSize: retrieval.candidatePoolSize,
          shadowBaselineProvider: retrieval.shadowComparison?.baselineProvider ?? null,
          shadowBaselineCandidatePoolSize: retrieval.shadowComparison?.baselineCandidatePoolSize ?? null,
          shadowOverlapCount: retrieval.shadowComparison?.overlapCount ?? null
        },
        expectedInCandidates,
        expectedInSelected,
        topCandidates,
        selectedMemories
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          workspaceRoot: LIVE_WORKSPACE_ROOT,
          benchmarkCount: BENCHMARK_CASES.length,
          fallbackCount,
          candidateMatchCount,
          selectedMatchCount,
          transportHealthCounts: Object.fromEntries([...transportHealthCounts.entries()].sort()),
          cases
        },
        null,
        2
      )
    );
  } finally {
    restoreEnv("AURORA_MEMORY_CANDIDATE_PROVIDER", previousProviderEnv);
  }
}

void main();
