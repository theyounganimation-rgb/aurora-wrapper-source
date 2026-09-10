import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  claimDeferredConversationMaintenanceJob,
  runDeferredConversationMaintenance,
  settleDeferredConversationMaintenanceJob,
} from "../lib/auroraCognition";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

process.chdir(PROJECT_ROOT);

const argv = new Set(process.argv.slice(2));
const once = argv.has("--once");
const pollMs = Math.max(1000, Number(process.env.AURORA_DEEP_MAINTENANCE_POLL_MS || "5000") || 5000);
const drainPauseMs = Math.max(250, Number(process.env.AURORA_DEEP_MAINTENANCE_DRAIN_PAUSE_MS || "500") || 500);
const busyRetryMs = Math.max(1000, Number(process.env.AURORA_DEEP_MAINTENANCE_BUSY_RETRY_MS || "30000") || 30000);
const activeChatRetryMs = Math.max(1000, Number(process.env.AURORA_DEEP_MAINTENANCE_ACTIVE_CHAT_RETRY_MS || "60000") || 60000);
const errorRetryMs = Math.max(1000, Number(process.env.AURORA_DEEP_MAINTENANCE_ERROR_RETRY_MS || "45000") || 45000);
const workerId = `deep-maintenance-worker:${process.pid}`;

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string, extra = ""): void {
  const suffix = extra ? ` ${extra}` : "";
  process.stdout.write(`${new Date().toISOString()} [aurora-deep-maintenance-worker] ${message}${suffix}\n`);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function processOneJob(): Promise<boolean> {
  const job = await claimDeferredConversationMaintenanceJob(workerId);
  if (!job) {
    return false;
  }

  log("claimed", `session=${job.sessionId} attempts=${job.attempts}`);

  try {
    const result = await runDeferredConversationMaintenance({
      sessionId: job.sessionId,
      reason: job.reason,
      lowPriority: true,
    });

    if (result.status === "completed" || result.status === "skipped_strict_hard_off") {
      await settleDeferredConversationMaintenanceJob(job.id, {
        status: result.status,
        detail: result.reason,
      });
      log("settled", `session=${job.sessionId} status=${result.status}`);
      return true;
    }

    await settleDeferredConversationMaintenanceJob(job.id, {
      status: result.status,
      detail: result.reason,
      retryDelayMs: result.status === "skipped_busy" ? busyRetryMs : activeChatRetryMs,
    });
    log("rescheduled", `session=${job.sessionId} status=${result.status}`);
    return true;
  } catch (error) {
    const message = toMessage(error);
    await settleDeferredConversationMaintenanceJob(job.id, {
      status: "retry_error",
      detail: message,
      retryDelayMs: errorRetryMs,
    });
    log("error", `session=${job.sessionId} message=${message}`);
    return true;
  }
}

async function main(): Promise<void> {
  log("started", `workerId=${workerId} once=${once ? "true" : "false"} pollMs=${pollMs}`);
  while (!shuttingDown) {
    const processed = await processOneJob();
    if (once) {
      break;
    }
    await sleep(processed ? drainPauseMs : pollMs);
  }
  log("stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

void main().catch((error) => {
  log("fatal", toMessage(error));
  process.exitCode = 1;
});
