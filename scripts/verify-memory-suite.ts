#!/usr/bin/env -S npx tsx

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CheckResult = {
  name: string;
  script: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
};

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const tsxPath = path.join(projectRoot, "node_modules", ".bin", "tsx");

const checks = [
  { name: "belief_ingestion_stress", script: "scripts/verify-belief-ingestion-stress.ts" },
  { name: "memory_authority_resolution", script: "scripts/verify-memory-authority-resolution.ts" },
  { name: "belief_authority_redesign", script: "scripts/verify-belief-authority-redesign.ts" },
  { name: "best_friend_memory_repair", script: "scripts/verify-best-friend-memory-repair.ts" },
  { name: "aurora_self_anchor_repair", script: "scripts/verify-aurora-self-anchor-repair.ts" },
  { name: "aurora_self_anchor_proposals", script: "scripts/verify-aurora-self-anchor-proposals.ts" },
  { name: "structured_exchange_memory", script: "scripts/verify-structured-exchange-memory.ts" },
  { name: "canonical_memory_authority_audit", script: "scripts/verify-canonical-memory-authority-audit.ts" },
  { name: "memory_residue_cleanup", script: "scripts/verify-memory-residue-cleanup.ts" },
  { name: "daily_summary_continuity", script: "scripts/verify-daily-summary-continuity.ts" },
  { name: "offscreen_wrapper_continuity", script: "scripts/verify-offscreen-wrapper-continuity.ts" },
  { name: "heartbeat_quality_floor", script: "scripts/verify-heartbeat-quality-floor.ts" },
  { name: "morning_greeting_volition", script: "scripts/verify-morning-greeting-volition.ts" },
  { name: "state_hygiene_refresh", script: "scripts/verify-state-hygiene-refresh.ts" },
  { name: "daily_transcript_tail_scan", script: "scripts/verify-daily-transcript-tail-scan.ts" },
  { name: "daily_summary_retrospective_filter", script: "scripts/verify-daily-summary-retrospective-filter.ts" },
  { name: "daily_summary_topic_overclaim_filter", script: "scripts/verify-daily-summary-topic-overclaim-filter.ts" },
  { name: "autonomy_activity_grounding", script: "scripts/verify-autonomy-activity-grounding.ts" },
  { name: "partner_relationship_grounding", script: "scripts/verify-partner-relationship-grounding.ts" },
  { name: "owner_semantic_direct_contact", script: "scripts/verify-owner-semantic-direct-contact.ts" },
  { name: "freeform_scene_recall", script: "scripts/verify-freeform-scene-recall.ts" },
  { name: "implicit_scene_ambient_recall", script: "scripts/verify-implicit-scene-ambient-recall.ts" }
] as const;

function runCheck(name: string, script: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(tsxPath, [script], {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      resolve({
        name,
        script,
        ok: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    process.stderr.write(`running ${check.name} (${check.script})\n`);
    const result = await runCheck(check.name, check.script);
    results.push(result);
    process.stderr.write(
      `${result.ok ? "pass" : "fail"} ${check.name} in ${(result.durationMs / 1000).toFixed(2)}s\n`
    );
  }

  const summary = {
    ok: results.every((result) => result.ok),
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results: results.map((result) => ({
      name: result.name,
      script: result.script,
      ok: result.ok,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr
    }))
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main();
