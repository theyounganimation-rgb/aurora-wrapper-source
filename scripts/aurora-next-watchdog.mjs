#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const logDir = path.join(projectRoot, ".aurora");
const logPath = path.join(logDir, "next-watchdog.log");
const statusPath = path.join(logDir, "next-watchdog-status.json");

const requestedMode = (process.argv[2] || "dev").trim().toLowerCase();
const scriptName = requestedMode === "start" ? "start" : "dev";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = (process.env.AURORA_HOST || process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const healthUrl = process.env.AURORA_HEALTH_URL || `http://127.0.0.1:${port}/api/health`;
const healthPollMs = Math.max(5_000, Number.parseInt(process.env.AURORA_HEALTH_POLL_MS || "15000", 10));
const healthTimeoutMs = Math.max(1_000, Number.parseInt(process.env.AURORA_HEALTH_TIMEOUT_MS || "4000", 10));
const startupGraceMs = Math.max(5_000, Number.parseInt(process.env.AURORA_STARTUP_GRACE_MS || "20000", 10));
const failureThreshold = Math.max(2, Number.parseInt(process.env.AURORA_HEALTH_FAILURE_THRESHOLD || "3", 10));
const restartDelayMs = Math.max(1_000, Number.parseInt(process.env.AURORA_RESTART_DELAY_MS || "2500", 10));
const nextCliPath = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const preferredNodePath =
  process.env.AURORA_NODE_PATH ||
  (process.platform !== "win32" && existsSync("/opt/homebrew/opt/node@22/bin/node")
    ? "/opt/homebrew/opt/node@22/bin/node"
    : process.execPath);

let child = null;
let adoptedExternalServer = false;
let stopping = false;
let failureCount = 0;
let lastOutputSnippet = "";
let childStartedAt = 0;
let healthTimer = null;
let pendingRestart = null;

function nowIso() {
  return new Date().toISOString();
}

async function ensureLogDir() {
  await mkdir(logDir, { recursive: true });
}

async function appendLog(message) {
  await ensureLogDir();
  const line = `[${nowIso()}] ${message}${os.EOL}`;
  await appendFile(logPath, line, "utf8");
  process.stdout.write(line);
}

async function writeStatus(extra = {}) {
  await ensureLogDir();
  const payload = {
    updatedAt: nowIso(),
    mode: scriptName,
    port,
    hostname,
    healthUrl,
    pid: process.pid,
    childPid: child?.pid ?? null,
    adoptedExternalServer,
    failureCount,
    stopping,
    ...extra
  };
  await writeFile(statusPath, `${JSON.stringify(payload, null, 2)}${os.EOL}`, "utf8");
}

async function checkHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, healthTimeoutMs);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function captureOutput(chunk) {
  const text = chunk.toString();
  lastOutputSnippet = `${lastOutputSnippet}${text}`.slice(-4000);
  void appendLog(text.trimEnd() || "[next-watchdog] empty output chunk");
}

function clearPendingRestart() {
  if (pendingRestart) {
    clearTimeout(pendingRestart);
    pendingRestart = null;
  }
}

async function scheduleRestart(reason) {
  if (stopping || pendingRestart) {
    return;
  }

  await appendLog(`Scheduling Aurora Next restart: ${reason}`);
  await writeStatus({ state: "restart_scheduled", reason });
  pendingRestart = setTimeout(() => {
    pendingRestart = null;
    void spawnManagedServer(`restart:${reason}`);
  }, restartDelayMs);
}

async function stopChild(reason, signal = "SIGTERM") {
  if (!child) {
    return;
  }

  const currentChild = child;
  await appendLog(`Stopping Aurora Next child (${currentChild.pid}) with ${signal}: ${reason}`);
  currentChild.kill(signal);
}

async function spawnManagedServer(reason) {
  clearPendingRestart();
  childStartedAt = Date.now();
  lastOutputSnippet = "";
  adoptedExternalServer = false;

  await appendLog(
    `Starting Aurora Next via ${preferredNodePath} ${path.relative(projectRoot, nextCliPath)} ${scriptName} --hostname ${hostname} --port ${port} (${reason})`
  );
  child = spawn(preferredNodePath, [nextCliPath, scriptName, "--hostname", hostname, "--port", String(port)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: hostname,
      AURORA_HOST: hostname,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", captureOutput);
  child.stderr?.on("data", captureOutput);
  child.on("exit", (code, signal) => {
    const eaddrInUse = /eaddrinuse|address already in use/i.test(lastOutputSnippet);
    const exitedChildPid = child?.pid ?? null;
    child = null;
    void appendLog(`Aurora Next child exited (pid=${exitedChildPid}, code=${code}, signal=${signal ?? "none"})`);
    void writeStatus({
      state: "child_exited",
      code,
      signal: signal ?? null,
      eaddrInUse
    });

    if (stopping) {
      return;
    }

    void (async () => {
      const healthy = await checkHealth();
      if (eaddrInUse && healthy) {
        adoptedExternalServer = true;
        failureCount = 0;
        await appendLog("Aurora Next already healthy on the target port; watchdog is adopting the existing server.");
        await writeStatus({ state: "adopted_external_after_exit" });
        return;
      }
      await scheduleRestart(`child_exit:${code ?? signal ?? "unknown"}`);
    })();
  });

  failureCount = 0;
  await writeStatus({
    state: "starting_child",
    reason,
    childPid: child.pid
  });
}

async function ensureServerOwnership() {
  const healthy = await checkHealth();
  if (healthy) {
    adoptedExternalServer = true;
    failureCount = 0;
    await appendLog("Aurora Next is already healthy on the target port. Watchdog will monitor and re-acquire if it drops.");
    await writeStatus({ state: "adopted_external_existing" });
    return;
  }

  await spawnManagedServer("initial_boot");
}

async function pollHealth() {
  const healthy = await checkHealth();
  if (healthy) {
    if (failureCount > 0) {
      await appendLog("Aurora Next health recovered.");
    }
    failureCount = 0;
    await writeStatus({
      state: child ? "healthy_child" : adoptedExternalServer ? "healthy_external" : "healthy_unknown"
    });
    return;
  }

  const startupAgeMs = Date.now() - childStartedAt;
  if (child && startupAgeMs < startupGraceMs) {
    await writeStatus({
      state: "starting_grace",
      startupAgeMs
    });
    return;
  }

  failureCount += 1;
  await appendLog(`Aurora Next health check failed (${failureCount}/${failureThreshold}).`);
  await writeStatus({
    state: "health_failed",
    failureCount
  });

  if (failureCount < failureThreshold) {
    return;
  }

  failureCount = 0;
  if (child) {
    await stopChild("health_check_failure");
    setTimeout(() => {
      if (child) {
        void stopChild("health_check_force_kill", "SIGKILL");
      }
    }, 5000);
    return;
  }

  adoptedExternalServer = false;
  await spawnManagedServer("health_recovery");
}

function installSignalHandlers() {
  const shutdown = async (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    clearPendingRestart();
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    await appendLog(`Aurora Next watchdog stopping on ${signal}.`);
    await writeStatus({ state: "stopping", signal });
    if (child) {
      await stopChild(`watchdog_shutdown:${signal}`);
      setTimeout(() => {
        if (child) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }
    setTimeout(() => {
      process.exit(0);
    }, 250);
  };

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

await appendLog(`Aurora Next watchdog booting in ${scriptName} mode.`);
installSignalHandlers();
await ensureServerOwnership();
healthTimer = setInterval(() => {
  void pollHealth();
}, healthPollMs);
await writeStatus({ state: "watching" });
