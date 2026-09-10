#!/usr/bin/env node

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const command = (process.argv[2] || "install").trim().toLowerCase();
const homeDir = os.homedir();
const launchAgentsDir = path.join(homeDir, "Library", "LaunchAgents");
const label = "com.cade.codi";
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const logDir = path.join(projectRoot, ".aurora");
const stdoutPath = path.join(logDir, "codi-launchd.out.log");
const stderrPath = path.join(logDir, "codi-launchd.err.log");
const watchdogScriptPath = path.join(projectRoot, "scripts", "aurora-next-watchdog.mjs");
const uid = process.getuid?.();
const domainTarget = uid ? `gui/${uid}` : "gui/501";

function resolveNodeBinary() {
  if (process.env.AURORA_NODE_PATH?.trim()) {
    return process.env.AURORA_NODE_PATH.trim();
  }
  if (existsSync("/opt/homebrew/opt/node@22/bin/node")) {
    return "/opt/homebrew/opt/node@22/bin/node";
  }
  if (existsSync("/opt/homebrew/bin/node")) {
    return "/opt/homebrew/bin/node";
  }
  return process.execPath;
}

function plistContents() {
  const nodePath = resolveNodeBinary();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${watchdogScriptPath}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectRoot}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${stdoutPath}</string>
  <key>StandardErrorPath</key>
  <string>${stderrPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${homeDir}</string>
    <key>PATH</key>
    <string>/Applications/Codex.app/Contents/Resources:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PORT</key>
    <string>3000</string>
    <key>AURORA_HOST</key>
    <string>0.0.0.0</string>
    <key>AURORA_NODE_PATH</key>
    <string>${nodePath}</string>
    <key>AURORA_HEALTH_URL</key>
    <string>http://127.0.0.1:3000/api/health</string>
    <key>AURORA_HEALTH_POLL_MS</key>
    <string>10000</string>
    <key>AURORA_HEALTH_TIMEOUT_MS</key>
    <string>4000</string>
    <key>AURORA_STARTUP_GRACE_MS</key>
    <string>90000</string>
    <key>AURORA_HEALTH_FAILURE_THRESHOLD</key>
    <string>4</string>
    <key>AURORA_RESTART_DELAY_MS</key>
    <string>3000</string>
  </dict>
</dict>
</plist>
`;
}

function runLaunchctl(args, allowFailure = false) {
  try {
    return execFileSync("launchctl", args, { encoding: "utf8" }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }
    throw error;
  }
}

async function install() {
  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  await writeFile(plistPath, plistContents(), "utf8");

  runLaunchctl(["bootout", domainTarget, plistPath], true);
  runLaunchctl(["bootstrap", domainTarget, plistPath]);
  runLaunchctl(["enable", `${domainTarget}/${label}`], true);
  runLaunchctl(["kickstart", "-k", `${domainTarget}/${label}`]);

  process.stdout.write(`Installed and started ${label}\n`);
  process.stdout.write(`LaunchAgent: ${plistPath}\n`);
}

async function uninstall() {
  runLaunchctl(["bootout", domainTarget, plistPath], true);
  if (existsSync(plistPath)) {
    await unlink(plistPath);
  }
  process.stdout.write(`Uninstalled ${label}\n`);
}

function status() {
  const output = runLaunchctl(["print", `${domainTarget}/${label}`], true);
  process.stdout.write(output ? `${output}\n` : `${label} is not loaded.\n`);
}

if (command === "install") {
  await install();
} else if (command === "uninstall") {
  await uninstall();
} else if (command === "status") {
  status();
} else {
  process.stderr.write(`Unknown command: ${command}\n`);
  process.exitCode = 1;
}
