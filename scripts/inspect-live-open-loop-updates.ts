#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import path from "node:path";

type LoopDiagnostics = {
  storePath: string;
  storeCountBefore: number;
  storeCountAfter: number;
  inferredCandidates: Array<{
    type: string;
    title: string;
    reason: string;
  }>;
  discardedCandidates?: Array<{
    type: string;
    title: string;
    reason: string;
  }>;
  actions: Array<{
    action: string;
    type: string;
    title: string;
    loopId: string;
    reason: string;
    matchedLoopId: string | null;
    matchedScore: number;
  }>;
  touchedLoopIds: string[];
  resolvedLoopIds: string[];
  blockedLoopIds: string[];
  wroteStore: boolean;
};

type ComplianceEvent = {
  type: string;
  at?: string;
  sessionId?: string;
  complianceId?: string;
  responseId?: string;
  loopDiagnostics?: LoopDiagnostics;
};

type OpenLoopStore = {
  version: number;
  loops: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    priority: number;
    linkedEntities: string[];
    lastTouchedAt: string;
    closureCondition: string;
  }>;
};

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index === process.argv.length - 1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

async function readNdjson(filePath: string): Promise<ComplianceEvent[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ComplianceEvent);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function main(): Promise<void> {
  const workspaceRoot = process.env.AURORA_OPENCLAW_WORKSPACE_ROOT || "/Users/cadem/.openclaw/workspace";
  const complianceLogPath = process.env.AURORA_COMPLIANCE_LOG_PATH || "/Users/cadem/Documents/New project/.aurora/compliance.local.ndjson";
  const openLoopStorePath =
    process.env.AURORA_OPEN_LOOP_STORE_PATH || path.join(workspaceRoot, "memory", "open-loops.json");
  const limit = Number(argValue("--limit") ?? "5");

  const [events, store] = await Promise.all([
    readNdjson(complianceLogPath),
    readJson<OpenLoopStore>(openLoopStorePath)
  ]);

  const loopUpdates = events
    .filter((event) => event.type === "conversation_open_loop_update" && event.loopDiagnostics)
    .slice(-Math.max(limit, 1))
    .reverse();

  console.log(
    JSON.stringify(
      {
        complianceLogPath,
        openLoopStorePath,
        totalLoopUpdates: events.filter((event) => event.type === "conversation_open_loop_update").length,
        recentLoopUpdates: loopUpdates.map((event) => ({
          at: event.at ?? "",
          sessionId: event.sessionId ?? "",
          complianceId: event.complianceId ?? "",
          responseId: event.responseId ?? "",
          storeCountBefore: event.loopDiagnostics?.storeCountBefore ?? 0,
          storeCountAfter: event.loopDiagnostics?.storeCountAfter ?? 0,
          inferredCandidates: event.loopDiagnostics?.inferredCandidates ?? [],
          discardedCandidates: event.loopDiagnostics?.discardedCandidates ?? [],
          actions: event.loopDiagnostics?.actions ?? [],
          touchedLoopIds: event.loopDiagnostics?.touchedLoopIds ?? [],
          resolvedLoopIds: event.loopDiagnostics?.resolvedLoopIds ?? [],
          blockedLoopIds: event.loopDiagnostics?.blockedLoopIds ?? [],
          wroteStore: event.loopDiagnostics?.wroteStore ?? false
        })),
        activeLoops: store.loops.map((loop) => ({
          id: loop.id,
          title: loop.title,
          type: loop.type,
          status: loop.status,
          priority: loop.priority,
          linkedEntities: loop.linkedEntities,
          lastTouchedAt: loop.lastTouchedAt
        }))
      },
      null,
      2
    )
  );
}

void main();
