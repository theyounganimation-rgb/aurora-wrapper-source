#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import net from "node:net";

const tailscaleCliPath = process.env.TAILSCALE_CLI_PATH?.trim() || "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
const listenHost = "127.0.0.1";
const listenPort = Number.parseInt(process.env.OPENCLAW_LOOPBACK_PROXY_LISTEN_PORT || "18789", 10);
const targetPort = Number.parseInt(process.env.OPENCLAW_LOOPBACK_PROXY_TARGET_PORT || String(listenPort), 10);

function trimTrailingDot(value) {
  return value.replace(/\.+$/, "");
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

const targetHost = resolveTargetHost();

const server = net.createServer((clientSocket) => {
  const upstreamSocket = net.connect({ host: targetHost, port: targetPort });

  clientSocket.on("error", () => {
    upstreamSocket.destroy();
  });
  upstreamSocket.on("error", () => {
    clientSocket.destroy();
  });

  clientSocket.pipe(upstreamSocket);
  upstreamSocket.pipe(clientSocket);
});

server.on("error", (error) => {
  console.error(`[openclaw-loopback-proxy] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `[openclaw-loopback-proxy] forwarding ${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`
  );
});
