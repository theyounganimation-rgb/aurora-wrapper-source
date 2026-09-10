#!/usr/bin/env -S npx tsx

import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

type CronJobsFile = {
  jobs?: Array<{
    id?: unknown;
    name?: unknown;
    agentId?: unknown;
    sessionKey?: unknown;
    sessionTarget?: unknown;
    wakeMode?: unknown;
    delivery?: {
      mode?: unknown;
    };
    payload?: {
      kind?: unknown;
      message?: unknown;
      lightContext?: unknown;
      thinking?: unknown;
      model?: unknown;
    };
    schedule?: {
      kind?: unknown;
      everyMs?: unknown;
    };
  }>;
};

const CRON_PATH = "/Users/cadem/.openclaw/cron/jobs.json";
const CONTEXT_SCRIPT_PATH = "/Users/cadem/Documents/New project/scripts/aurora-proactive-contact-context.mjs";
const TARGET_JOB_ID = "1101ef6b-aab8-4822-ab4a-09472868754d";

async function main(): Promise<void> {
  const raw = await readFile(CRON_PATH, "utf8");
  const contextScript = await readFile(CONTEXT_SCRIPT_PATH, "utf8");
  const parsed = JSON.parse(raw) as CronJobsFile;
  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  const job = jobs.find((entry) => String(entry.id ?? "") === TARGET_JOB_ID);

  assert(job, `Missing proactive-contact cron job ${TARGET_JOB_ID}`);
  assert.equal(job?.name, "Aurora proactive contact check");
  assert.equal(job?.agentId, "main");
  assert.equal(job?.sessionTarget, "isolated", "Proactive contact should run in an isolated session.");
  assert.equal(job?.wakeMode, "now", "Proactive contact should run immediately when scheduled.");
  assert.equal(job?.payload?.kind, "agentTurn", "Proactive contact should run as an isolated agent turn.");
  assert.equal(job?.delivery?.mode, "none", "Cron should not announce to a non-existent OpenClaw channel.");
  assert.equal(job?.payload?.lightContext, true, "Proactive contact should use light bootstrap context.");
  assert.equal(job?.payload?.thinking, "minimal", "Proactive contact should stay on minimal thinking.");
  assert.equal(job?.payload?.model, "openai-codex/gpt-5.4-mini", "Proactive contact should use the cheaper mini model.");
  assert.equal(job?.schedule?.kind, "every");
  assert.equal(job?.schedule?.everyMs, 15 * 60 * 1000, "Proactive contact should run every 15 minutes.");

  const message = String(job?.payload?.message ?? "");
  assert(message.includes("/Users/cadem/Documents/New project/scripts/aurora-proactive-contact-context.mjs"));
  assert(message.includes("single JSON object"));
  assert(message.includes("status=\"skip\""));
  assert(message.includes("return exactly HEARTBEAT_OK"));
  assert(message.includes("status=\"due\""));
  assert(message.includes("lastUserNote"));
  assert(message.includes("silenceMinutes"));
  assert(message.includes("one short proactive message to Cade"));
  assert(message.includes("Do not mention cron, heartbeat, timers, checks, silence-gap rules, logs, or system framing."));
  assert(message.includes("Do not use web search or network tools."));
  assert(message.includes("Do not read transcripts or cron logs yourself unless the script fails."));
  assert(message.includes("Do not create files or artifacts."));
  assert(message.includes("Do not send more than one message."));
  assert(
    contextScript.includes("const QUIET_MINUTES = 60;"),
    "Proactive contact should wait 60 minutes after the last owner message."
  );

  console.log("Proactive-contact cron config is isolated, cheap, and tuned for a 60-minute silence gap.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
