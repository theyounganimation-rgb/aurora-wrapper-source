import fs from "node:fs/promises";
import path from "node:path";

export type FakeOpenClawMemorySearchHit = {
  path: string;
  snippet: string;
  startLine?: number;
  endLine?: number;
  score?: number;
  timestamp?: string;
};

export type FakeOpenClawMemorySearchBehavior = {
  results?: FakeOpenClawMemorySearchHit[];
  stderr?: string;
  exitCode?: number;
  invalidJson?: boolean;
  delayMs?: number;
};

export type FakeOpenClawMemoryStatusBehavior = {
  json?: unknown;
  stderr?: string;
  exitCode?: number;
  invalidJson?: boolean;
  delayMs?: number;
};

type FakeOpenClawRouteMap = {
  [key: string]: FakeOpenClawMemorySearchBehavior | FakeOpenClawMemoryStatusBehavior | undefined;
  __status__?: FakeOpenClawMemoryStatusBehavior;
};

function escapeForSingleQuotedJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function writeFakeOpenClawMemorySearchBinary(
  tempDir: string,
  routes: FakeOpenClawRouteMap,
  options: { logPath?: string } = {}
): Promise<string> {
  const binaryPath = path.join(tempDir, "fake-openclaw-memory-search.js");
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const routes = JSON.parse('${escapeForSingleQuotedJs(JSON.stringify(routes))}');
const logPath = ${options.logPath ? `'${escapeForSingleQuotedJs(options.logPath)}'` : "null"};
const args = process.argv.slice(2);

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const isMemorySearch = args[0] === 'memory' && args[1] === 'search';
const isMemoryStatus = args[0] === 'memory' && args[1] === 'status';
if (logPath) {
  fs.appendFileSync(logPath, JSON.stringify({ args }) + '\\n');
}
if (!isMemorySearch && !isMemoryStatus) {
  process.stderr.write('Unsupported fake openclaw invocation.\\n');
  process.exit(2);
}

const positionalQuery = args.find((arg, index) => index > 1 && !arg.startsWith('-')) ?? '';
const query = readFlag('--query') ?? positionalQuery;
const rawMaxResults = readFlag('--max-results');
const maxResults = Number.isFinite(Number.parseInt(rawMaxResults ?? '', 10))
  ? Math.max(1, Number.parseInt(rawMaxResults ?? '', 10))
  : 10;

const behavior = isMemoryStatus
  ? (routes.__status__ ?? { json: [] })
  : (routes[query] ?? routes.__default__ ?? { results: [] });

function finish() {
  if (behavior.stderr) {
    process.stderr.write(String(behavior.stderr));
    if (!String(behavior.stderr).endsWith('\\n')) {
      process.stderr.write('\\n');
    }
  }
  if (behavior.invalidJson) {
    process.stdout.write('not-json');
    process.exit(typeof behavior.exitCode === 'number' ? behavior.exitCode : 0);
  }
  if (isMemoryStatus) {
    process.stdout.write(JSON.stringify(behavior.json ?? []));
    process.exit(typeof behavior.exitCode === 'number' ? behavior.exitCode : 0);
  }
  process.stdout.write(
    JSON.stringify({
      results: Array.isArray(behavior.results) ? behavior.results.slice(0, maxResults) : []
    })
  );
  process.exit(typeof behavior.exitCode === 'number' ? behavior.exitCode : 0);
}

if (typeof behavior.delayMs === 'number' && behavior.delayMs > 0) {
  setTimeout(finish, behavior.delayMs);
} else {
  finish();
}
`;

  await fs.writeFile(binaryPath, script, { encoding: "utf8", mode: 0o755 });
  await fs.chmod(binaryPath, 0o755);
  return binaryPath;
}
