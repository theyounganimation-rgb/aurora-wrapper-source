import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

type CronJobsFile = {
  jobs?: Array<{
    id?: unknown;
    name?: unknown;
    payload?: {
      kind?: unknown;
      message?: unknown;
    };
  }>;
};

const CRON_PATH = "/Users/cadem/.openclaw/cron/jobs.json";
const TARGET_JOB_ID = "09ab8288-0905-4592-bb37-e09ef41235e6";

async function main(): Promise<void> {
  const raw = await readFile(CRON_PATH, "utf8");
  const parsed = JSON.parse(raw) as CronJobsFile;
  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  const job = jobs.find((entry) => String(entry.id ?? "") === TARGET_JOB_ID);

  assert(job, `Missing hourly summary cron job ${TARGET_JOB_ID}`);
  assert.equal(job?.payload?.kind, "agentTurn", "Hourly summary job must remain an agentTurn");

  const message = String(job?.payload?.message ?? "");
  assert(message.includes("/Users/cadem/.openclaw/workspace/memory/YYYY-MM-DD.md"));
  assert(message.includes("previous local date's daily memory log"));
  assert(message.includes("recent direct session transcripts under /Users/cadem/.openclaw/agents/main/sessions/"));
  assert(message.includes("do not rely on /Users/cadem/.openclaw/agents/main/sessions/sessions.json"));
  assert(!message.includes("resolve the active session file for `agent:main:main`"));

  console.log("Hourly summary cron config points at daily memory logs instead of sessions.json.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
