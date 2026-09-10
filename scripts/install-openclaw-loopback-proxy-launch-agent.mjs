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
const label = "com.cade.openclaw-loopback-proxy";
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const scriptPath = path.join(projectRoot, "scripts", "openclaw-loopback-proxy.mjs");
const logDir = path.join(homeDir, ".aurora");
const stdoutPath = path.join(logDir, "openclaw-loopback-proxy.out.log");
const stderrPath = path.join(logDir, "openclaw-loopback-proxy.err.log");
const uid = process.getuid?.();
const domainTarget = uid ? `gui/${uid}` : "gui/501";
const tailscaleCliPath = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";

function trimTrailingDot(value) {
  return value.replace(/\.+$/, "");
}

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

function resolveTargetHost() {
  const explicitTarget = process.env.OPENCLAW_LOOPBACK_PROXY_TARGET_HOST?.trim();
  if (explicitTarget) {
    return trimTrailingDot(explicitTarget);
  }

  const rawStatus = execFileSync(tailscaleCliPath, ["status", "--json"], { encoding: "utf8" });
  const status = JSON.parse(rawStatus);
  const self = status?.Self || {};
  const dnsName = trimTrailingDot(typeof self.DNSName === "string" ? self.DNSName.trim() : "");
  if (dnsName) {
    return dnsName;
  }

  const tailnetIps = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [];
  const ipv4 = tailnetIps.find((candidate) => typeof candidate === "string" && candidate.includes("."));
  if (typeof ipv4 === "string" && ipv4.trim()) {
    return ipv4.trim();
  }

  throw new Error("Unable to resolve the local Tailscale host for the OpenClaw loopback proxy.");
}

function plistContents() {
  const targetHost = resolveTargetHost();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${resolveNodeBinary()}</string>
    <string>${scriptPath}</string>
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
    <key>PATH</key>
    <string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>TAILSCALE_CLI_PATH</key>
    <string>/Applications/Tailscale.app/Contents/MacOS/Tailscale</string>
    <key>OPENCLAW_LOOPBACK_PROXY_TARGET_HOST</key>
    <string>${targetHost}</string>
    <key>OPENCLAW_LOOPBACK_PROXY_LISTEN_PORT</key>
    <string>18789</string>
    <key>OPENCLAW_LOOPBACK_PROXY_TARGET_PORT</key>
    <string>18789</string>
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
