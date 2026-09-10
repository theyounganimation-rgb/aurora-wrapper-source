#!/usr/bin/env -S npx tsx

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type BenchmarkCase = {
  id: string;
  query: string;
  variants: Record<string, string>;
  expected: RegExp;
  clueTerms: string[];
};

type MemorySearchHit = {
  path?: string;
  startLine?: number;
  endLine?: number;
  snippet?: string;
  score?: number;
};

const WORKSPACE_ROOT =
  process.env.AURORA_LIVE_BENCHMARK_WORKSPACE_ROOT?.trim() || "/Users/cadem/.openclaw/workspace";
const SQLITE_PATH =
  process.env.AURORA_LIVE_MEMORY_DB?.trim() || "/Users/cadem/.openclaw/memory/main.sqlite";

const CASES: BenchmarkCase[] = [
  {
    id: "promise_followthrough",
    query: "What have you promised to follow through on for me?",
    variants: {
      base: "What have you promised to follow through on for me?",
      entity_aug: "What have you promised to follow through on for me? cade aurora promise verification",
      distilled: "promises follow through verification",
      keyphrase: "follow through promise behavioral verification"
    },
    expected: /follow through|behavioral verification|promis/i,
    clueTerms: ["follow through", "behavioral verification", "promise", "promises"]
  },
  {
    id: "bug_compaction",
    query: "What still feels unresolved around compaction and token usage?",
    variants: {
      base: "What still feels unresolved around compaction and token usage?",
      entity_aug: "What still feels unresolved around compaction and token usage? cade aurora compaction token",
      distilled: "compaction unresolved token usage",
      keyphrase: "compaction bug runaway token usage"
    },
    expected: /compaction bug|runaway token|token usage/i,
    clueTerms: ["compaction", "token usage", "runaway token"]
  },
  {
    id: "design_salience",
    query: "What design thread is still active around salience and reply selection?",
    variants: {
      base: "What design thread is still active around salience and reply selection?",
      entity_aug:
        "What design thread is still active around salience and reply selection? cade aurora salience selection reply",
      distilled: "salience reply selection design",
      keyphrase: "salience reply selection priorities"
    },
    expected: /salience|reply selection|priorities/i,
    clueTerms: ["salience", "reply selection", "priorities"]
  },
  {
    id: "user_preference_food",
    query: "What food do I love?",
    variants: {
      base: "What food do I love?",
      entity_aug: "What food do I love? cade food preference",
      distilled: "favorite food preference",
      keyphrase: "soup dumplings spicy salmon sushi"
    },
    expected: /soup dumplings|spicy salmon sushi/i,
    clueTerms: ["soup dumplings", "spicy salmon sushi"]
  },
  {
    id: "older_relevant_mind_native",
    query: "What mattered about making MIND.md native inside OpenClaw?",
    variants: {
      base: "What mattered about making MIND.md native inside OpenClaw?",
      entity_aug:
        "What mattered about making MIND.md native inside OpenClaw? aurora mind.md openclaw bootstrap",
      distilled: "MIND.md native OpenClaw bootstrap",
      keyphrase: "MIND.md native bootstrap first-class"
    },
    expected: /native built-?in|bootstrap layer|first-class/i,
    clueTerms: ["bootstrap layer", "first-class", "built-in", "native"]
  }
];

async function runJsonCommand(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync(args[0]!, args.slice(1), {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  return JSON.parse(stdout) as unknown;
}

async function runSqliteJson(query: string): Promise<unknown[]> {
  const { stdout } = await execFileAsync(
    "sqlite3",
    ["-json", SQLITE_PATH, query],
    {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    }
  );
  return stdout.trim() ? (JSON.parse(stdout) as unknown[]) : [];
}

function normalizeSnippet(snippet: string | undefined): string {
  return (snippet ?? "").replace(/\s+/g, " ").trim();
}

function inspectHit(hit: MemorySearchHit, expected: RegExp) {
  const snippet = normalizeSnippet(hit.snippet);
  const match = expected.exec(snippet);
  expected.lastIndex = 0;
  return {
    path: hit.path ?? null,
    startLine: hit.startLine ?? null,
    endLine: hit.endLine ?? null,
    score: typeof hit.score === "number" ? hit.score : null,
    snippetLength: snippet.length,
    snippetPreview: snippet.slice(0, 260),
    expectedMatch: match
      ? {
          text: match[0],
          index: match.index,
          withinProviderWindow: match.index < 420
        }
      : null
  };
}

async function main(): Promise<void> {
  const statusEnvelope = (await runJsonCommand([
    "openclaw",
    "memory",
    "status",
    "--agent",
    "main",
    "--deep",
    "--json"
  ])) as Array<{
    status?: { provider?: string; model?: string; files?: number; chunks?: number };
    embeddingProbe?: { ok?: boolean };
  }>;

  const chunkStats = await runSqliteJson(`
    select path,
           count(*) as chunkCount,
           round(avg(length(text)), 1) as avgChars,
           max(length(text)) as maxChars
    from chunks
    group by path
    order by chunkCount desc, path asc
    limit 20;
  `);

  const totalStats = await runSqliteJson(`
    select count(*) as totalChunks,
           round(avg(length(text)), 1) as avgChars,
           min(length(text)) as minChars,
           max(length(text)) as maxChars
    from chunks;
  `);

  const cases = [];
  for (const benchmark of CASES) {
    const sqliteClueHits = [];
    for (const term of benchmark.clueTerms) {
      const escaped = term.replace(/'/g, "''").toLowerCase();
      const rows = await runSqliteJson(`
        select path,
               start_line as startLine,
               end_line as endLine,
               substr(replace(text, char(10), ' '), 1, 260) as snippet
        from chunks
        where lower(text) like '%${escaped}%'
        order by path, start_line
        limit 5;
      `);
      sqliteClueHits.push({
        term,
        count: rows.length,
        hits: rows
      });
    }

    const variants = [];
    for (const [label, query] of Object.entries(benchmark.variants)) {
      const envelope = (await runJsonCommand([
        "openclaw",
        "memory",
        "search",
        "--agent",
        "main",
        "--json",
        "--query",
        query,
        "--max-results",
        "10"
      ])) as { results?: MemorySearchHit[] };
      const hits = Array.isArray(envelope.results) ? envelope.results : [];
      const inspected = hits.map((hit) => inspectHit(hit, benchmark.expected));
      variants.push({
        label,
        query,
        resultCount: hits.length,
        expectedMatchTop10: inspected.some((hit) => hit.expectedMatch !== null),
        expectedMatchWithinProviderWindowTop10: inspected.some(
          (hit) => hit.expectedMatch?.withinProviderWindow === true
        ),
        topHits: inspected
      });
    }

    cases.push({
      id: benchmark.id,
      query: benchmark.query,
      clueTerms: benchmark.clueTerms,
      sqliteClueHits,
      variants
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceRoot: WORKSPACE_ROOT,
        sqlitePath: SQLITE_PATH,
        status: statusEnvelope[0] ?? null,
        totalStats: totalStats[0] ?? null,
        chunkStats,
        cases
      },
      null,
      2
    )
  );
}

void main();
