#!/usr/bin/env -S npx tsx

import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

type CronJobsFile = {
  jobs?: Array<{
    id?: unknown;
    name?: unknown;
    sessionTarget?: unknown;
    delivery?: {
      mode?: unknown;
    };
    payload?: {
      kind?: unknown;
      message?: unknown;
      lightContext?: unknown;
      thinking?: unknown;
    };
    schedule?: {
      kind?: unknown;
      everyMs?: unknown;
    };
  }>;
};

const CRON_PATH = "/Users/cadem/.openclaw/cron/jobs.json";
const TARGET_JOB_ID = "7c9010bd-8176-4d77-93f3-1e987ed14f17";

async function main(): Promise<void> {
  const raw = await readFile(CRON_PATH, "utf8");
  const parsed = JSON.parse(raw) as CronJobsFile;
  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  const job = jobs.find((entry) => String(entry.id ?? "") === TARGET_JOB_ID);

  assert(job, `Missing agency-action cron job ${TARGET_JOB_ID}`);
  assert.equal(job?.name, "Aurora agency action executor", "Expected the updated agency action executor job.");
  assert.equal(job?.payload?.kind, "agentTurn", "Agency-action job must be an agentTurn.");
  assert.equal(job?.sessionTarget, "isolated", "Agency-action job should run in an isolated session.");
  assert.equal(job?.delivery?.mode, "none", "Agency-action job should not deliver chat output.");
  assert.equal(job?.payload?.lightContext, true, "Agency-action job should use light context.");
  assert.equal(job?.payload?.thinking, "minimal", "Agency-action job should stay on minimal thinking.");
  assert.equal(job?.schedule?.kind, "every", "Agency-action job should run on a fixed interval.");
  assert.equal(job?.schedule?.everyMs, 60 * 60 * 1000, "Agency-action job should run every hour.");

  const message = String(job?.payload?.message ?? "");
  assert(message.includes("/Users/cadem/.openclaw/workspace/memory/agency_actions.json"));
  assert(message.includes("/Users/cadem/.openclaw/workspace/memory/deep_attractors.json"));
  assert(message.includes("/Users/cadem/.openclaw/workspace/memory/open-loops.json"));
  assert(message.includes("status=ready and permission=local_safe and executor=web_research"));
  assert(message.includes("execute exactly one bounded web exploration"));
  assert(message.includes("/Users/cadem/Documents/New project/scripts/aurora-bounded-web-research.mjs"));
  assert(message.includes("Skip creation if there is already a materially similar artifact for the same action or attractor in the last 12 hours."));
  assert(message.includes("Do not use Apple Notes, Reminders, or other personal-device app surfaces for autonomous acts."));
  assert(message.includes("status=ready and permission=local_safe and executor=workspace_artifact"));
  assert(message.includes("Create one markdown artifact under the action's targetDirectory"));
  assert(message.includes("executor=imessage or permission=approval_required"));
  assert(message.includes("approvalStatus=granted"));
  assert(message.includes("/Users/cadem/.openclaw/workspace/memory/deep-attractor-practice/"));
  assert(message.includes("if no attractor has pull >= 0.52 and confidence >= 0.42, do nothing and exit cleanly."));
  assert(message.includes("If a matching Aurora-owned intention exists"));
  assert(message.includes("Skip creation if there is already a materially similar artifact for the same action or attractor in the last 12 hours."));
  assert(
    message.includes(
      "Do not edit MEMORY.md, USER.md, MIND.md, AGENTS.md, TOOLS.md, SOUL.md, open-loops.json, topic_affinities.json, deep_attractors.json, or agency_actions.json."
    )
  );

  console.log("Agency-action cron config is present, bounded, and aimed at small autonomous acts.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
