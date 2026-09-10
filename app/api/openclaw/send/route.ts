import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import {
  AURORA_STORAGE_AUDIT_DECISION_LIST,
  AURORA_STORAGE_AUDIT_HEADER_EXAMPLE,
  AURORA_STORAGE_AUDIT_TARGET_LIST,
  type AuroraStorageAudit,
  type AuroraStorageAuditTarget,
  parseAuroraStorageAuditOutput
} from "@/lib/auroraStorageAudit";
import {
  applyConversationEmbodimentDirective,
  prepareSendContext,
  recordConversationEvent,
  recordDispatchOutcome
} from "@/lib/auroraCognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendRequestBody {
  text?: unknown;
  sessionId?: unknown;
  sessionKey?: unknown;
  partnerId?: unknown;
  speakerName?: unknown;
  previousResponseId?: unknown;
}

type CognitionMode = "on" | "off";
type PreparedSendContext = {
  complianceId: string;
  gate: string;
  enrichedInput: string;
  contextInjected: boolean;
  cognitionMode: CognitionMode;
  ownerStorageCheckpointRequired: boolean;
};

interface OpenClawHistoryMessageContentPart {
  type?: unknown;
  text?: unknown;
  id?: unknown;
  name?: unknown;
  arguments?: unknown;
}

interface OpenClawHistoryMessage {
  role?: unknown;
  content?: unknown;
  responseId?: unknown;
  timestamp?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  isError?: unknown;
  __openclaw?: {
    seq?: unknown;
  };
}

interface OpenClawHistoryResponse {
  sessionKey?: unknown;
  sessionId?: unknown;
  messages?: unknown;
}

type StorageAuditStatus = "present" | "malformed" | "checkpoint_enforced" | "checkpoint_failed";

const execFileAsync = promisify(execFile);

const OWNER_DASHBOARD_SESSION_ID = "agent:main:main";
const OWNER_APP_OPENRESPONSES_SESSION_ID = `agent:main:openresponses-user:${OWNER_DASHBOARD_SESSION_ID}`;
const OWNER_UNIFIED_CONTINUITY_SESSION_ID = "agent:main:owner:continuity";
const AURORA_MOBILE_DEFAULT_SESSION_KEY = "agent:aurora-mobile:owner:continuity";
const OWNER_STORAGE_CHECKPOINT_SESSION_PREFIX = "agent:main:owner:storage-checkpoint";
const OWNER_DIRECT_CONTINUITY_SESSION_IDS = new Set(["agent:main:telegram:direct:0000000000"]);
const OPENCLAW_CALL_TIMEOUT_MS = 10 * 60 * 1000;
const OPENCLAW_HISTORY_POLL_INTERVAL_MS = 700;
const OPENCLAW_HISTORY_WAIT_TIMEOUT_MS = 90 * 1000;
const OPENCLAW_STREAM_FINAL_HISTORY_POLL_INTERVAL_MS = 200;
const OPENCLAW_STREAM_FINAL_HISTORY_WAIT_TIMEOUT_MS = 5 * 1000;
const RECENT_DUPLICATE_TURN_REPLAY_WINDOW_MS = 5 * 60 * 1000;
const OWNER_STORAGE_CHECKPOINT_MAX_ATTEMPTS = 3;
const COGNITIVE_CONTEXT_CLOSE = "[/AURORA_COGNITIVE_CONTEXT]";
const OWNER_STORAGE_CHECKPOINT_ENABLED = false;
const OPENCLAW_GATEWAY_RUNTIME_MODULE_PATH = envOrDefault(
  process.env.OPENCLAW_GATEWAY_RUNTIME_MODULE_PATH,
  "/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js"
);
const DEFAULT_OPENCLAW_GATEWAY_WS_URL = envOrDefault(process.env.OPENCLAW_GATEWAY_WS_URL, "ws://127.0.0.1:18789");
const OPENCLAW_CONFIG_PATH = envOrDefault(
  process.env.OPENCLAW_CONFIG_PATH,
  `${process.env.HOME ?? ""}/.openclaw/openclaw.json`
);
const TAILSCALE_CLI_PATH = envOrDefault(
  process.env.TAILSCALE_CLI_PATH,
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
);
const OPENCLAW_GATEWAY_BRIDGE_CLIENT_NAME = "openclaw-ios";
const OPENCLAW_GATEWAY_BRIDGE_CLIENT_DISPLAY_NAME = "Aurora app bridge";
const OPENCLAW_GATEWAY_BRIDGE_MODE = "ui";

interface GatewayClientEventFrame {
  event?: unknown;
  payload?: unknown;
  seq?: unknown;
}

interface GatewayClientLike {
  start(): void;
  stop(): void;
  stopAndWait(): Promise<void>;
  request(
    method: string,
    params?: Record<string, unknown>,
    opts?: {
      timeoutMs?: number | null;
      expectFinal?: boolean;
    }
  ): Promise<unknown>;
}

interface GatewayClientConstructor {
  new (opts: {
    url?: string;
    clientName?: string;
    clientDisplayName?: string;
    platform?: string;
    mode?: string;
    instanceId?: string;
    minProtocol?: number;
    maxProtocol?: number;
    onHelloOk?: () => void;
    onEvent?: (event: GatewayClientEventFrame) => void;
    onConnectError?: (error: Error) => void;
    onClose?: (code?: number, reason?: string) => void;
  }): GatewayClientLike;
}

interface GatewayRuntimeModule {
  GatewayClient: GatewayClientConstructor;
}

type SharedGatewayBridgeSubscriber = {
  onEvent?: (event: GatewayClientEventFrame) => void;
  onClose?: (code?: number, reason?: string) => void;
};

interface GatewayChatEventPayload {
  runId?: unknown;
  sessionKey?: unknown;
  state?: unknown;
  message?: unknown;
  errorMessage?: unknown;
}

type AuroraSendSuccessPayload = {
  id: string;
  output_text: string;
  session_id: string;
  resolved_session_key: string;
  reset_previous_response_id: boolean;
  transport: string;
  openclaw_session_id?: string;
  raw?: unknown;
};

type AuroraResponseHeaderParams = {
  sessionId: string;
  cognitionMode: CognitionMode;
  gate?: string;
  complianceId?: string;
  contextInjected?: boolean;
  partnerId?: string;
  replayedTurn?: boolean;
  storageAudit?: AuroraStorageAudit | null;
  storageAuditStatus?: StorageAuditStatus | "" | null;
};

let gatewayRuntimeModulePromise: Promise<GatewayRuntimeModule> | null = null;
let sharedGatewayBridgeClient: GatewayClientLike | null = null;
let sharedGatewayBridgeConnectPromise: Promise<GatewayClientLike> | null = null;
let sharedGatewayBridgeSubscriberId = 0;
const sharedGatewayBridgeSubscribers = new Map<number, SharedGatewayBridgeSubscriber>();
let resolvedGatewayWsUrlPromise: Promise<string> | null = null;

type OpenClawConfigSnapshot = {
  gateway?: {
    bind?: unknown;
    port?: unknown;
  };
};

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeTailnetHost(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\.+$/, "") : "";
}

function requestWantsEventStream(request: Request): boolean {
  return request.headers.get("accept")?.toLowerCase().includes("text/event-stream") ?? false;
}

function isAgentSemanticSessionKey(value: string): boolean {
  return /^agent:[^:\s]+:/i.test(value.trim());
}

function normalizeCognitionMode(value: unknown): CognitionMode {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "off" || normalized === "write_only") {
      return "off";
    }
    if (normalized === "on" || normalized === "full" || normalized === "live_full_realized") {
      return "on";
    }
  }

  return "on";
}

async function resolveConfiguredCognitionMode(): Promise<CognitionMode> {
  const envMode = process.env.AURORA_COGNITION_MODE ?? process.env.NEXT_PUBLIC_AURORA_COGNITION_MODE;
  if (envMode) {
    return normalizeCognitionMode(envMode);
  }
  return "on";
}

function canonicalContinuitySessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!normalized) {
    return "";
  }

  const lower = normalized.toLowerCase();
  if (
    lower === OWNER_DASHBOARD_SESSION_ID ||
    lower === OWNER_APP_OPENRESPONSES_SESSION_ID ||
    OWNER_DIRECT_CONTINUITY_SESSION_IDS.has(lower)
  ) {
    return OWNER_UNIFIED_CONTINUITY_SESSION_ID;
  }

  return normalized;
}

function resolveTransportSessionKey(sessionKey: string, requestedSessionId: string): string {
  const normalizedSessionKey = sessionKey.trim();
  const normalizedRequestedSessionId = requestedSessionId.trim().toLowerCase();
  const normalizedSessionKeyLower = normalizedSessionKey.toLowerCase();

  if (
    normalizedSessionKeyLower === OWNER_DASHBOARD_SESSION_ID ||
    normalizedSessionKeyLower === OWNER_APP_OPENRESPONSES_SESSION_ID ||
    normalizedSessionKeyLower === AURORA_MOBILE_DEFAULT_SESSION_KEY ||
    normalizedSessionKeyLower === OWNER_UNIFIED_CONTINUITY_SESSION_ID ||
    normalizedRequestedSessionId === OWNER_DASHBOARD_SESSION_ID ||
    normalizedRequestedSessionId === OWNER_APP_OPENRESPONSES_SESSION_ID ||
    normalizedRequestedSessionId === OWNER_UNIFIED_CONTINUITY_SESSION_ID
  ) {
    return AURORA_MOBILE_DEFAULT_SESSION_KEY;
  }

  return normalizedSessionKey;
}

async function safeRecordDispatchOutcome(
  outcome: Parameters<typeof recordDispatchOutcome>[0]
): Promise<void> {
  try {
    await recordDispatchOutcome(outcome);
  } catch {
    // Compliance logging should not break request transport.
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buildAuroraResponseHeaders(params: AuroraResponseHeaderParams): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("x-aurora-session-id", params.sessionId);
  headers.set("x-aurora-cognition-mode", params.cognitionMode);

  if (params.complianceId) {
    headers.set("x-aurora-compliance-id", params.complianceId);
  }
  if (params.gate) {
    headers.set("x-aurora-gate", params.gate);
  }
  if (typeof params.contextInjected === "boolean") {
    headers.set("x-aurora-context-injected", params.contextInjected ? "true" : "false");
  }
  if (params.partnerId) {
    headers.set("x-aurora-partner-id", params.partnerId);
  }
  if (params.replayedTurn) {
    headers.set("x-aurora-replayed-turn", "true");
  }
  if (params.storageAudit) {
    headers.set("x-aurora-storage-audit-decision", params.storageAudit.decision);
    headers.set(
      "x-aurora-storage-audit-lookup-required",
      params.storageAudit.lookupRequired ? "true" : "false"
    );
    headers.set("x-aurora-storage-audit-targets", storageTargetsText(params.storageAudit.targets));
  }
  if (params.storageAuditStatus) {
    headers.set("x-aurora-storage-audit-status", params.storageAuditStatus);
  }

  return headers;
}

function buildSuccessPayload(params: {
  id: string;
  outputText: string;
  sessionId: string;
  sessionKey: string;
  transport: string;
  openClawSessionId?: string;
  raw?: unknown;
}): AuroraSendSuccessPayload {
  return {
    id: params.id,
    output_text: params.outputText,
    session_id: params.sessionId,
    resolved_session_key: params.sessionKey,
    reset_previous_response_id: true,
    transport: params.transport,
    ...(params.openClawSessionId ? { openclaw_session_id: params.openClawSessionId } : {}),
    ...(params.raw !== undefined ? { raw: params.raw } : {})
  };
}

function buildImmediateEventStreamResponse(params: {
  replyText: string;
  finalPayload: AuroraSendSuccessPayload;
  headers: Headers;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(formatSseEvent("reply", { text: params.replyText })));
      controller.enqueue(encoder.encode(formatSseEvent("final", params.finalPayload)));
      controller.close();
    }
  });

  const headers = new Headers(params.headers);
  headers.set("content-type", "text/event-stream; charset=utf-8");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");

  return new Response(stream, {
    status: 200,
    headers
  });
}

function buildErrorResponse(
  wantsEventStream: boolean,
  body: Record<string, unknown>,
  init: {
    status: number;
    headers?: HeadersInit;
  }
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");

  if (wantsEventStream) {
    headers.set("content-type", "text/plain; charset=utf-8");
    return new Response(toText(body.error).trim() || "Aurora request failed.", {
      status: init.status,
      headers
    });
  }

  return NextResponse.json(body, {
    status: init.status,
    headers
  });
}

function formatSseEvent(eventName: string, payload: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function extractGatewayAssistantText(payload: GatewayChatEventPayload | null): string {
  const raw = extractAssistantText((payload?.message ?? null) as OpenClawHistoryMessage | null);
  return raw.trim();
}

async function loadGatewayRuntimeModule(): Promise<GatewayRuntimeModule> {
  if (!gatewayRuntimeModulePromise) {
    const nodeModule = (
      process as typeof process & {
        getBuiltinModule?: (
          moduleName: string
        ) => {
          createRequire: (filename: string | URL) => (modulePath: string) => GatewayRuntimeModule;
        };
      }
    ).getBuiltinModule?.("module");
    if (!nodeModule?.createRequire) {
      throw new Error("Node builtin module loader is unavailable.");
    }
    const runtimeRequire = nodeModule.createRequire(`${process.cwd()}/package.json`);
    gatewayRuntimeModulePromise = Promise.resolve(
      runtimeRequire(OPENCLAW_GATEWAY_RUNTIME_MODULE_PATH) as GatewayRuntimeModule
    );
  }

  return gatewayRuntimeModulePromise;
}

async function resolveTailnetGatewayHost(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(TAILSCALE_CLI_PATH, ["status", "--json"]);
    const payload = JSON.parse(stdout) as {
      Self?: {
        DNSName?: unknown;
        TailscaleIPs?: unknown;
      };
    };

    const dnsName = normalizeTailnetHost(payload.Self?.DNSName);
    if (dnsName) {
      return dnsName;
    }

    const tailnetIps = Array.isArray(payload.Self?.TailscaleIPs) ? payload.Self?.TailscaleIPs : [];
    const ipv4 = tailnetIps.find((candidate): candidate is string => typeof candidate === "string" && candidate.includes("."));
    return ipv4?.trim() || null;
  } catch {
    return null;
  }
}

async function resolveGatewayWsUrl(): Promise<string> {
  if (process.env.OPENCLAW_GATEWAY_WS_URL?.trim()) {
    return DEFAULT_OPENCLAW_GATEWAY_WS_URL;
  }

  if (!resolvedGatewayWsUrlPromise) {
    resolvedGatewayWsUrlPromise = (async () => {
      try {
        const rawConfig = await readFile(OPENCLAW_CONFIG_PATH, "utf8");
        const config = JSON.parse(rawConfig) as OpenClawConfigSnapshot;
        if (config.gateway?.bind !== "tailnet") {
          return DEFAULT_OPENCLAW_GATEWAY_WS_URL;
        }

        const tailnetHost = await resolveTailnetGatewayHost();
        if (!tailnetHost) {
          return DEFAULT_OPENCLAW_GATEWAY_WS_URL;
        }

        process.env.OPENCLAW_ALLOW_INSECURE_PRIVATE_WS ??= "1";
        const port = parsePositiveInteger(config.gateway?.port, 18789);
        return `ws://${tailnetHost}:${port}`;
      } catch {
        return DEFAULT_OPENCLAW_GATEWAY_WS_URL;
      }
    })();
  }

  return resolvedGatewayWsUrlPromise;
}

async function createAuroraGatewayBridgeClient(params: {
  onEvent?: (event: GatewayClientEventFrame) => void;
  onClose?: (code?: number, reason?: string) => void;
}): Promise<GatewayClientLike> {
  const gatewayWsUrl = await resolveGatewayWsUrl();
  const runtimeModule = await loadGatewayRuntimeModule();

  return await new Promise<GatewayClientLike>((resolve, reject) => {
    let settled = false;
    let client: GatewayClientLike | null = null;

    const resolveOnce = (value: GatewayClientLike) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    client = new runtimeModule.GatewayClient({
      url: gatewayWsUrl,
      clientName: OPENCLAW_GATEWAY_BRIDGE_CLIENT_NAME,
      clientDisplayName: OPENCLAW_GATEWAY_BRIDGE_CLIENT_DISPLAY_NAME,
      platform: process.platform,
      mode: OPENCLAW_GATEWAY_BRIDGE_MODE,
      instanceId: randomUUID(),
      minProtocol: 3,
      maxProtocol: 3,
      onHelloOk: () => {
        if (client) {
          resolveOnce(client);
        }
      },
      onEvent: params.onEvent,
      onConnectError: (error) => {
        rejectOnce(error);
      },
      onClose: (code, reason) => {
        const closeReason = reason?.trim();
        if (!settled) {
          rejectOnce(new Error(closeReason || `Gateway bridge closed (${code ?? "unknown"}).`));
          return;
        }
        params.onClose?.(code, reason);
      }
    });

    client.start();
  });
}

function notifySharedGatewayBridgeEvent(frame: GatewayClientEventFrame): void {
  for (const subscriber of sharedGatewayBridgeSubscribers.values()) {
    try {
      subscriber.onEvent?.(frame);
    } catch {
      // A listener failure should not disrupt the shared bridge.
    }
  }
}

function notifySharedGatewayBridgeClosed(code?: number, reason?: string): void {
  for (const subscriber of sharedGatewayBridgeSubscribers.values()) {
    try {
      subscriber.onClose?.(code, reason);
    } catch {
      // A listener failure should not disrupt other subscribers.
    }
  }
}

async function connectSharedAuroraGatewayBridge(params: {
  onEvent?: (event: GatewayClientEventFrame) => void;
  onClose?: (code?: number, reason?: string) => void;
}): Promise<{
  client: GatewayClientLike;
  release: () => void;
}> {
  const subscriberId = ++sharedGatewayBridgeSubscriberId;
  sharedGatewayBridgeSubscribers.set(subscriberId, {
    onEvent: params.onEvent,
    onClose: params.onClose
  });

  const release = () => {
    sharedGatewayBridgeSubscribers.delete(subscriberId);
  };

  try {
    if (!sharedGatewayBridgeConnectPromise) {
      sharedGatewayBridgeConnectPromise = createAuroraGatewayBridgeClient({
        onEvent: notifySharedGatewayBridgeEvent,
        onClose: (code, reason) => {
          sharedGatewayBridgeClient = null;
          sharedGatewayBridgeConnectPromise = null;
          notifySharedGatewayBridgeClosed(code, reason);
        }
      }).then((client) => {
        sharedGatewayBridgeClient = client;
        return client;
      }).catch((error) => {
        sharedGatewayBridgeClient = null;
        sharedGatewayBridgeConnectPromise = null;
        throw error;
      });
    }

    const client = sharedGatewayBridgeClient ?? (await sharedGatewayBridgeConnectPromise);
    return {
      client,
      release
    };
  } catch (error) {
    release();
    throw error;
  }
}

function historyMessageArray(history: OpenClawHistoryResponse | null): OpenClawHistoryMessage[] {
  return Array.isArray(history?.messages) ? (history?.messages as OpenClawHistoryMessage[]) : [];
}

function baselineAssistantSeq(messages: OpenClawHistoryMessage[]): number {
  let seq = 0;
  for (const message of messages) {
    if (String(message?.role ?? "").trim().toLowerCase() !== "assistant") {
      continue;
    }
    const candidate = toFiniteNumber(message?.__openclaw?.seq);
    if (candidate !== null && candidate > seq) {
      seq = candidate;
    }
  }
  return seq;
}

function extractMessageText(message: OpenClawHistoryMessage | null): string {
  if (!message || !Array.isArray(message.content)) {
    return "";
  }

  const parts: string[] = [];
  for (const part of message.content as OpenClawHistoryMessageContentPart[]) {
    if (String(part?.type ?? "").trim().toLowerCase() !== "text") {
      continue;
    }
    const text = toText(part?.text).trim();
    if (text) {
      parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

function extractAssistantText(message: OpenClawHistoryMessage | null): string {
  return extractMessageText(message);
}

function extractVisibleUserText(message: OpenClawHistoryMessage | null): string {
  const raw = extractMessageText(message);
  if (!raw) {
    return "";
  }

  const lines = raw.split(/\r?\n/);
  const closeIndex = lines.findIndex((line) => line.trim() === COGNITIVE_CONTEXT_CLOSE);
  if (closeIndex < 0) {
    return raw;
  }

  return lines.slice(closeIndex + 1).join("\n").trim();
}

function messageHasToolCalls(message: OpenClawHistoryMessage | null): boolean {
  if (!message || !Array.isArray(message.content)) {
    return false;
  }
  return (message.content as OpenClawHistoryMessageContentPart[]).some(
    (part) => String(part?.type ?? "").trim().toLowerCase() === "toolcall"
  );
}

function newHistoryMessages(history: OpenClawHistoryResponse | null, baselineCount: number): OpenClawHistoryMessage[] {
  const messages = historyMessageArray(history);
  return baselineCount >= 0 ? messages.slice(Math.max(0, baselineCount)) : messages;
}

function parseObjectLike(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function extractToolCallWritePaths(messages: OpenClawHistoryMessage[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    if (String(message?.role ?? "").trim().toLowerCase() !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content as OpenClawHistoryMessageContentPart[]) {
      if (String(part?.type ?? "").trim().toLowerCase() !== "toolcall") {
        continue;
      }
      const toolName = String(part?.name ?? "").trim().toLowerCase();
      if (toolName !== "edit" && toolName !== "write") {
        continue;
      }
      const args = parseObjectLike(part?.arguments);
      const path = typeof args?.path === "string" ? args.path.trim() : "";
      if (path) {
        paths.add(path);
      }
    }
  }
  return [...paths];
}

function extractToolResultWritePaths(messages: OpenClawHistoryMessage[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    if (String(message?.role ?? "").trim().toLowerCase() !== "toolresult") {
      continue;
    }
    const toolName = String(message?.toolName ?? "").trim().toLowerCase();
    if (toolName !== "edit" && toolName !== "write") {
      continue;
    }
    if (message?.isError === true) {
      continue;
    }
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content as OpenClawHistoryMessageContentPart[]) {
      if (String(part?.type ?? "").trim().toLowerCase() !== "text") {
        continue;
      }
      const text = toText(part?.text).trim();
      if (!/^Successfully\b/i.test(text)) {
        continue;
      }
      const pathMatch =
        text.match(/^Successfully replaced text in (.+)\.$/i) ||
        text.match(/^Successfully wrote \d+ bytes to (.+)$/i);
      if (pathMatch?.[1]) {
        paths.add(pathMatch[1].trim());
      }
    }
  }
  return [...paths];
}

function storageWritePathsForMessages(messages: OpenClawHistoryMessage[]): string[] {
  const successful = extractToolResultWritePaths(messages);
  if (successful.length > 0) {
    return successful;
  }
  return extractToolCallWritePaths(messages);
}

function pathMatchesStorageAuditTarget(path: string, target: AuroraStorageAuditTarget): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  switch (target) {
    case "none":
      return false;
    case "beliefs.json":
      return normalized.endsWith("/memory/beliefs.json");
    case "traits.json":
      return normalized.endsWith("/memory/traits.json");
    case "preferences.json":
      return normalized.endsWith("/memory/preferences.json");
    case "capabilities.json":
      return normalized.endsWith("/memory/capabilities.json");
    case "promises.json":
      return normalized.endsWith("/memory/promises.json");
    case "USER.md":
      return normalized.endsWith("/user.md");
    case "MEMORY.md":
      return normalized.endsWith("/memory.md");
    case "today_log":
      return /\/memory\/\d{4}-\d{2}-\d{2}\.md$/.test(normalized);
    default:
      return false;
  }
}

function storageTargetsText(targets: AuroraStorageAuditTarget[]): string {
  return targets.length > 0 ? targets.join(",") : "none";
}

function resolveStorageAuditStatus(
  parsedAudit: ReturnType<typeof parseAuroraStorageAuditOutput>,
  enforcedAudit: AuroraStorageAudit | null
): StorageAuditStatus | "" {
  if (parsedAudit.hadHeader) {
    return parsedAudit.malformedHeader ? "malformed" : "present";
  }
  if (enforcedAudit) {
    return "checkpoint_enforced";
  }
  return "";
}

function buildStorageAuditPersistence(
  audit: AuroraStorageAudit | null,
  status: StorageAuditStatus | ""
): NonNullable<Parameters<typeof recordDispatchOutcome>[0]["storageAudit"]> | undefined {
  if (!audit && !status) {
    return undefined;
  }
  return {
    ...(audit ? { decision: audit.decision, lookupRequired: audit.lookupRequired, targets: audit.targets } : {}),
    ...(status ? { status } : {})
  };
}

type StorageCheckpointValidationResult =
  | {
      ok: true;
      audit: AuroraStorageAudit;
      matchedPaths: string[];
    }
  | {
      ok: false;
      reason: string;
      audit: AuroraStorageAudit | null;
    };

function validateOwnerStorageCheckpoint(
  messages: OpenClawHistoryMessage[],
  parsedAudit: AuroraStorageAudit | null
): StorageCheckpointValidationResult {
  if (!parsedAudit) {
    return {
      ok: false,
      reason:
        "Missing or malformed storage audit header. Emit exactly one valid AURORA_STORAGE_AUDIT header before the checkpoint completes.",
      audit: null
    };
  }

  if (parsedAudit.decision === "none") {
    const noneTargets = parsedAudit.targets.length === 1 && parsedAudit.targets[0] === "none";
    if (!noneTargets) {
      return {
        ok: false,
        reason: "If decision=none, emit targets=none and do not claim a storage destination.",
        audit: parsedAudit
      };
    }
    return {
      ok: true,
      audit: parsedAudit,
      matchedPaths: []
    };
  }

  const concreteTargets = parsedAudit.targets.filter((target) => target !== "none");
  if (concreteTargets.length === 0) {
    return {
      ok: false,
      reason:
        "A non-none decision must declare at least one concrete file target in targets= that you actually updated for this turn.",
      audit: parsedAudit
    };
  }

  const writePaths = storageWritePathsForMessages(messages);
  const matchedPaths = writePaths.filter((path) =>
    concreteTargets.some((target) => pathMatchesStorageAuditTarget(path, target))
  );
  if (matchedPaths.length === 0) {
    return {
      ok: false,
      reason: `No matching storage write was observed for targets=${storageTargetsText(concreteTargets)}. Complete the write first, then emit the audit header.`,
      audit: parsedAudit
    };
  }

  return {
    ok: true,
    audit: parsedAudit,
    matchedPaths
  };
}

function buildOwnerStorageCheckpointSessionKey(sessionKey: string): string {
  const normalized = sessionKey.replace(/[^a-z0-9:_-]+/gi, "-").slice(0, 80) || "main";
  return `${OWNER_STORAGE_CHECKPOINT_SESSION_PREFIX}:${normalized}:${randomUUID()}`;
}

function buildOwnerStorageCheckpointPrompt(enrichedInput: string): string {
  return `${enrichedInput}

[AURORA_STORAGE_CHECKPOINT]
checkpoint_mode=pre_reply_storage
checkpoint_visibility=This checkpoint is hidden from Cade. Do not write user-facing prose here.
checkpoint_decisions=${AURORA_STORAGE_AUDIT_DECISION_LIST}
checkpoint_targets=${AURORA_STORAGE_AUDIT_TARGET_LIST}
checkpoint_header_rule=Finish with exactly one text line in this format: ${AURORA_STORAGE_AUDIT_HEADER_EXAMPLE}
checkpoint_none_rule=If the correct classification is none, emit the header with targets=none and stop.
checkpoint_write_rule=If the correct classification is not none, complete any needed lookup and storage actions first. Then emit the header with targets naming the file(s) you actually updated for this turn.
checkpoint_lookup_rule=If you need to inspect an existing store before deciding add vs revise, set lookup_required=true and do that before the header.
[/AURORA_STORAGE_CHECKPOINT]`;
}

function buildOwnerStorageCheckpointCorrectionPrompt(reason: string): string {
  return `[AURORA_STORAGE_CHECKPOINT_RETRY]
checkpoint_error=${reason}
checkpoint_visibility=This checkpoint is still hidden from Cade. Do not write user-facing prose here.
checkpoint_header_rule=Finish with exactly one text line in this format: ${AURORA_STORAGE_AUDIT_HEADER_EXAMPLE}
checkpoint_fix_rule=Classify the turn, complete any required storage write, and ensure targets= names the file(s) you actually updated. Use targets=none only when decision=none.
[/AURORA_STORAGE_CHECKPOINT_RETRY]`;
}

function injectCompletedStorageCheckpointContext(enrichedInput: string, audit: AuroraStorageAudit): string {
  const lines = enrichedInput.split("\n");
  if (!lines.some((line) => line.trim() === COGNITIVE_CONTEXT_CLOSE)) {
    return enrichedInput;
  }
  const rewritten: string[] = [];
  const targets = storageTargetsText(audit.targets);
  for (const line of lines) {
    if (
      line.startsWith("owner_turn_reminder=") ||
      line.startsWith("owner_turn_reminder_rule=") ||
      line.startsWith("storage_audit_")
    ) {
      continue;
    }
    if (line.trim() === COGNITIVE_CONTEXT_CLOSE) {
      rewritten.push("storage_checkpoint_status=completed");
      rewritten.push(`storage_checkpoint_result=decision:${audit.decision}; targets:${targets}`);
      rewritten.push(
        "storage_checkpoint_rule=Pre-reply storage classification and any required storage actions for this turn are already complete. Answer naturally and do not repeat storage work unless correcting a real mistake."
      );
    }
    rewritten.push(line);
  }
  return rewritten.join("\n");
}

function extractNewAssistantMessage(
  history: OpenClawHistoryResponse | null,
  baselineCount: number,
  baselineSeq: number
): OpenClawHistoryMessage | null {
  const messages = historyMessageArray(history);

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message?.role ?? "").trim().toLowerCase() !== "assistant") {
      continue;
    }

    const seq = toFiniteNumber(message?.__openclaw?.seq);
    if ((seq !== null && seq > baselineSeq) || index >= baselineCount) {
      return message;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runGatewayCall(method: string, params: Record<string, unknown>): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(
      "openclaw",
      ["gateway", "call", method, "--json", "--params", JSON.stringify(params)],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: OPENCLAW_CALL_TIMEOUT_MS
      }
    );

    return JSON.parse(stdout);
  } catch (error) {
    const details =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "").trim()
        : "";
    const message = error instanceof Error ? error.message : "OpenClaw gateway call failed.";
    throw new Error(details || message);
  }
}

async function readChatHistory(sessionKey: string): Promise<OpenClawHistoryResponse | null> {
  try {
    return (await runGatewayCall("chat.history", { sessionKey })) as OpenClawHistoryResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("session not found")) {
      return null;
    }
    throw error;
  }
}

async function waitForAssistantReplyWithReader(
  readHistory: () => Promise<OpenClawHistoryResponse | null>,
  baselineCount: number,
  baselineSeq: number,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<{
  history: OpenClawHistoryResponse;
  message: OpenClawHistoryMessage;
}> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const history = await readHistory();
    const message = extractNewAssistantMessage(history, baselineCount, baselineSeq);
    if (history && message && extractAssistantText(message) && !messageHasToolCalls(message)) {
      return { history, message };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("Timed out waiting for OpenClaw assistant reply.");
}

async function waitForAssistantReply(
  sessionKey: string,
  baselineCount: number,
  baselineSeq: number
): Promise<{
  history: OpenClawHistoryResponse;
  message: OpenClawHistoryMessage;
}> {
  return await waitForAssistantReplyWithReader(
    async () => await readChatHistory(sessionKey),
    baselineCount,
    baselineSeq,
    OPENCLAW_HISTORY_WAIT_TIMEOUT_MS,
    OPENCLAW_HISTORY_POLL_INTERVAL_MS
  );
}

function findLatestAnsweredDuplicatePrompt(
  history: OpenClawHistoryResponse | null,
  prompt: string
): {
  assistantMessage: OpenClawHistoryMessage;
  responseId: string;
  openClawSessionId?: string;
} | null {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return null;
  }

  const messages = historyMessageArray(history);
  let latestAssistant: OpenClawHistoryMessage | null = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const role = String(message?.role ?? "").trim().toLowerCase();

    if (role === "assistant") {
      if (latestAssistant === null && !messageHasToolCalls(message) && extractAssistantText(message)) {
        latestAssistant = message;
      }
      continue;
    }

    if (role !== "user") {
      continue;
    }

    const visibleUserText = extractVisibleUserText(message);
    if (!visibleUserText) {
      continue;
    }

    if (visibleUserText !== trimmedPrompt || latestAssistant === null) {
      return null;
    }

    const userTimestamp = toFiniteNumber(message?.timestamp);
    const assistantTimestamp = toFiniteNumber(latestAssistant?.timestamp);
    if (userTimestamp !== null && assistantTimestamp !== null && assistantTimestamp < userTimestamp) {
      return null;
    }

    const answeredAt = assistantTimestamp ?? userTimestamp;
    if (answeredAt !== null && Date.now() - answeredAt > RECENT_DUPLICATE_TURN_REPLAY_WINDOW_MS) {
      return null;
    }

    return {
      assistantMessage: latestAssistant,
      responseId: toText(latestAssistant.responseId).trim() || randomUUID(),
      openClawSessionId: toText(history?.sessionId).trim() || undefined
    };
  }

  return null;
}

async function runOwnerStorageCheckpoint(params: {
  sessionKey: string;
  enrichedInput: string;
}): Promise<{
  audit: AuroraStorageAudit;
}> {
  const checkpointSessionKey = buildOwnerStorageCheckpointSessionKey(params.sessionKey);
  let baselineCount = 0;
  let baselineSeq = 0;
  let prompt = buildOwnerStorageCheckpointPrompt(params.enrichedInput);
  let lastReason = "Hidden storage checkpoint did not complete.";

  for (let attempt = 0; attempt < OWNER_STORAGE_CHECKPOINT_MAX_ATTEMPTS; attempt += 1) {
    await runGatewayCall("chat.send", {
      sessionKey: checkpointSessionKey,
      message: prompt,
      idempotencyKey: randomUUID()
    });

    const { history, message } = await waitForAssistantReply(checkpointSessionKey, baselineCount, baselineSeq);
    const checkpointMessages = newHistoryMessages(history, 0);
    const parsed = parseAuroraStorageAuditOutput(extractAssistantText(message));
    const validation = validateOwnerStorageCheckpoint(checkpointMessages, parsed.audit);
    if (validation.ok) {
      return {
        audit: validation.audit
      };
    }

    lastReason = validation.reason;
    baselineCount = historyMessageArray(history).length;
    baselineSeq = baselineAssistantSeq(historyMessageArray(history));
    prompt = buildOwnerStorageCheckpointCorrectionPrompt(validation.reason);
  }

  throw new Error(lastReason);
}

function createStreamingSendResponse(params: {
  request: Request;
  prepared: PreparedSendContext;
  sessionId: string;
  sessionKey: string;
  partnerId?: string;
  baselineCount: number;
  baselineSeq: number;
  idempotencyKey: string;
}): Response {
  const encoder = new TextEncoder();
  const responseHeaders = buildAuroraResponseHeaders({
    sessionId: params.sessionId,
    cognitionMode: params.prepared.cognitionMode,
    gate: params.prepared.gate,
    complianceId: params.prepared.complianceId,
    contextInjected: params.prepared.contextInjected,
    partnerId: params.partnerId
  });
  responseHeaders.set("content-type", "text/event-stream; charset=utf-8");
  responseHeaders.set("Connection", "keep-alive");
  responseHeaders.set("X-Accel-Buffering", "no");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let gatewayClient: GatewayClientLike | null = null;
      let releaseGatewayBridge: (() => void) | null = null;
      let streamClosed = false;
      let finalSent = false;
      let lastReplyText = "";
      let activeRunId = params.idempotencyKey;

      const cleanup = async () => {
        params.request.signal.removeEventListener("abort", abortListener);
        releaseGatewayBridge?.();
        releaseGatewayBridge = null;
        gatewayClient = null;
      };

      const closeStream = async () => {
        if (streamClosed) {
          return;
        }
        streamClosed = true;
        await cleanup();
        try {
          controller.close();
        } catch {
          // Stream may already be closed by the runtime.
        }
      };

      const sendEvent = (eventName: string, payload: unknown) => {
        if (streamClosed) {
          return;
        }
        controller.enqueue(encoder.encode(formatSseEvent(eventName, payload)));
      };

      const failStream = async (message: string, stage: "transport_error" | "upstream_error") => {
        const trimmedMessage = message.trim() || "Aurora request failed.";
        if (params.prepared.cognitionMode === "on") {
          await safeRecordDispatchOutcome({
            complianceId: params.prepared.complianceId,
            stage,
            error: trimmedMessage
          });
        }
        sendEvent("error", { error: trimmedMessage });
        await closeStream();
      };

      const finalizeStream = async (payload: AuroraSendSuccessPayload) => {
        if (finalSent || streamClosed) {
          return;
        }
        finalSent = true;
        sendEvent("final", payload);
        await closeStream();
      };

      const handleGatewayEvent = async (frame: GatewayClientEventFrame) => {
        if (streamClosed || finalSent) {
          return;
        }
        if (toText(frame.event).trim().toLowerCase() !== "chat") {
          return;
        }

        const payload =
          typeof frame.payload === "object" && frame.payload !== null
            ? (frame.payload as GatewayChatEventPayload)
            : null;
        if (!payload) {
          return;
        }

        if (toText(payload.sessionKey).trim() !== params.sessionKey) {
          return;
        }

        const payloadRunId = toText(payload.runId).trim();
        if (payloadRunId && payloadRunId !== activeRunId) {
          return;
        }

        const state = toText(payload.state).trim().toLowerCase();
        if (state === "delta") {
          const replyText = extractGatewayAssistantText(payload);
          if (replyText && replyText !== lastReplyText) {
            lastReplyText = replyText;
            sendEvent("reply", { text: replyText });
          }
          return;
        }

        if (state === "error") {
          await failStream(toText(payload.errorMessage).trim() || "OpenClaw reply failed.", "upstream_error");
          return;
        }

        if (state === "aborted") {
          const partialReplyText = extractGatewayAssistantText(payload);
          if (partialReplyText && partialReplyText !== lastReplyText) {
            lastReplyText = partialReplyText;
            sendEvent("reply", { text: partialReplyText });
          }
          await failStream("OpenClaw reply was aborted.", "upstream_error");
          return;
        }

        if (state !== "final") {
          return;
        }

        const eventReplyText = extractGatewayAssistantText(payload);
        if (eventReplyText && eventReplyText !== lastReplyText) {
          lastReplyText = eventReplyText;
          sendEvent("reply", { text: eventReplyText });
        }

        let finalHistory: OpenClawHistoryResponse | null = null;
        let assistantMessage: OpenClawHistoryMessage | null = null;

        try {
          ({ history: finalHistory, message: assistantMessage } = await waitForAssistantReplyWithReader(
            async () => {
              if (!gatewayClient) {
                return null;
              }
              return (await gatewayClient.request(
                "chat.history",
                { sessionKey: params.sessionKey },
                { timeoutMs: OPENCLAW_STREAM_FINAL_HISTORY_WAIT_TIMEOUT_MS }
              )) as OpenClawHistoryResponse;
            },
            params.baselineCount,
            params.baselineSeq,
            OPENCLAW_STREAM_FINAL_HISTORY_WAIT_TIMEOUT_MS,
            OPENCLAW_STREAM_FINAL_HISTORY_POLL_INTERVAL_MS
          ));
        } catch {
          // If the transcript snapshot lags behind the final event, fall back to the streamed final text.
        }

        const finalReplyTextRaw = assistantMessage ? extractAssistantText(assistantMessage) : eventReplyText;
        if (!finalReplyTextRaw.trim()) {
          await failStream("OpenClaw reply completed without assistant text.", "upstream_error");
          return;
        }

        const parsedStorageAudit = parseAuroraStorageAuditOutput(finalReplyTextRaw);
        const finalReplyText = parsedStorageAudit.visibleText;
        const openClawSessionId = toText(finalHistory?.sessionId).trim() || undefined;
        const responseId = assistantMessage ? toText(assistantMessage.responseId).trim() || activeRunId : activeRunId;

        if (params.prepared.cognitionMode === "on") {
          const effectiveStorageAudit = parsedStorageAudit.audit;
          const storageAuditStatus = resolveStorageAuditStatus(parsedStorageAudit, null);
          const persistedStorageAudit = buildStorageAuditPersistence(effectiveStorageAudit, storageAuditStatus);
          await safeRecordDispatchOutcome({
            complianceId: params.prepared.complianceId,
            stage: "upstream_ok",
            httpStatus: 200,
            responseId,
            ...(persistedStorageAudit ? { storageAudit: persistedStorageAudit } : {})
          });
        }

        await finalizeStream(
          buildSuccessPayload({
            id: responseId,
            outputText: finalReplyText,
            sessionId: params.sessionId,
            sessionKey: params.sessionKey,
            transport: "openclaw-gateway-chat-stream",
            openClawSessionId,
            raw: finalHistory ?? undefined
          })
        );
      };

      const abortListener = () => {
        void closeStream();
      };

      params.request.signal.addEventListener("abort", abortListener);

      void (async () => {
        try {
          const sharedBridge = await connectSharedAuroraGatewayBridge({
            onEvent: (frame) => {
              void handleGatewayEvent(frame);
            },
            onClose: (code, reason) => {
              if (streamClosed || finalSent || params.request.signal.aborted) {
                return;
              }
              void failStream(reason?.trim() || `Gateway bridge closed (${code ?? "unknown"}).`, "transport_error");
            }
          });
          if (streamClosed || params.request.signal.aborted) {
            sharedBridge.release();
            return;
          }
          gatewayClient = sharedBridge.client;
          releaseGatewayBridge = sharedBridge.release;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to connect to OpenClaw gateway.";
          await failStream(message, "transport_error");
          return;
        }

        try {
          const sendResult = await gatewayClient.request("chat.send", {
            sessionKey: params.sessionKey,
            message: params.prepared.enrichedInput,
            idempotencyKey: params.idempotencyKey
          });
          const runId = toText((sendResult as { runId?: unknown })?.runId).trim();
          if (runId) {
            activeRunId = runId;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to reach OpenClaw gateway.";
          await failStream(message, "transport_error");
        }
      })();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: responseHeaders
  });
}

export async function POST(request: Request) {
  const wantsEventStream = requestWantsEventStream(request);
  let parsedBody: SendRequestBody;
  try {
    parsedBody = (await request.json()) as SendRequestBody;
  } catch {
    return buildErrorResponse(wantsEventStream, { error: "Invalid JSON body." }, { status: 400 });
  }

  const text = sanitizeText(parsedBody.text);
  if (!text) {
    return buildErrorResponse(wantsEventStream, { error: "Field 'text' is required." }, { status: 400 });
  }

  const bodySessionId = sanitizeIdentifier(parsedBody.sessionId);
  const bodySessionKey = sanitizeIdentifier(parsedBody.sessionKey);
  const bodyPartnerId = sanitizeIdentifier(parsedBody.partnerId);
  const bodySpeakerName = typeof parsedBody.speakerName === "string" ? parsedBody.speakerName.trim() : "";

  const configuredCognitionMode = await resolveConfiguredCognitionMode();
  const defaultSessionId = envOrDefault(
    process.env.AURORA_SESSION_ID ?? process.env.NEXT_PUBLIC_AURORA_SHARED_SESSION_ID,
    OWNER_DASHBOARD_SESSION_ID
  );
  const requestedSessionId = bodySessionId || defaultSessionId;
  const sessionId = canonicalContinuitySessionId(requestedSessionId) || OWNER_DASHBOARD_SESSION_ID;
  const requestedSessionKey = bodySessionKey || (isAgentSemanticSessionKey(sessionId) ? sessionId : OWNER_DASHBOARD_SESSION_ID);
  const sessionKey = resolveTransportSessionKey(requestedSessionKey, requestedSessionId);
  const cognitionMode = configuredCognitionMode;
  const baselineHistory = await readChatHistory(sessionKey);
  const duplicateTurn = findLatestAnsweredDuplicatePrompt(baselineHistory, text);

  if (duplicateTurn) {
    const responseHeaders = buildAuroraResponseHeaders({
      sessionId,
      cognitionMode,
      partnerId: bodyPartnerId || undefined,
      replayedTurn: true
    });
    const payload = buildSuccessPayload({
      id: duplicateTurn.responseId,
      outputText: extractAssistantText(duplicateTurn.assistantMessage),
      sessionId,
      sessionKey,
      transport: "openclaw-gateway-chat-replay",
      openClawSessionId: duplicateTurn.openClawSessionId
    });

    if (wantsEventStream) {
      return buildImmediateEventStreamResponse({
        replyText: payload.output_text,
        finalPayload: payload,
        headers: responseHeaders
      });
    }

    responseHeaders.set("content-type", "application/json");
    return NextResponse.json(payload, {
      status: 200,
      headers: responseHeaders
    });
  }

  try {
    await applyConversationEmbodimentDirective(text);
  } catch {
    // Embodiment directives should improve movement continuity, but send transport must still proceed if this fails.
  }

  let prepared: PreparedSendContext;
  if (cognitionMode === "on") {
    let preflight: Awaited<ReturnType<typeof prepareSendContext>>;
    try {
      preflight = await prepareSendContext({
        userText: text,
        sessionId,
        partnerId: bodyPartnerId,
        speakerName: bodySpeakerName || undefined
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cognitive preflight failed.";
      return buildErrorResponse(wantsEventStream, { error: message }, { status: 503 });
    }

    if (!preflight.allowSend) {
      await safeRecordDispatchOutcome({
        complianceId: preflight.complianceId,
        stage: "upstream_error",
        httpStatus: 409,
        error: preflight.gateReason
      });
      return buildErrorResponse(
        wantsEventStream,
        {
          error: preflight.gateReason,
          gate: preflight.gate,
          complianceId: preflight.complianceId
        },
        {
          status: 409,
          headers: buildAuroraResponseHeaders({
            sessionId,
            cognitionMode,
            gate: preflight.gate,
            complianceId: preflight.complianceId,
            contextInjected: true,
            partnerId: bodyPartnerId || undefined
          })
        }
      );
    }

    prepared = {
      complianceId: preflight.complianceId,
      gate: preflight.gate,
      enrichedInput: preflight.enrichedInput,
      contextInjected: true,
      cognitionMode,
      ownerStorageCheckpointRequired: preflight.ownerStorageCheckpointRequired === true
    };

    if (typeof preflight.diagnosticDirectReply === "string" && preflight.diagnosticDirectReply.trim()) {
      const directReplyText = preflight.diagnosticDirectReply.trim();
      const directReplyId = randomUUID();
      const responseHeaders = buildAuroraResponseHeaders({
        sessionId,
        cognitionMode,
        gate: preflight.gate,
        complianceId: preflight.complianceId,
        contextInjected: true,
        partnerId: bodyPartnerId || undefined
      });

      try {
        await recordConversationEvent({
          type: "conversation_turn",
          userText: text,
          auroraText: directReplyText,
          sessionId,
          partnerId: bodyPartnerId || undefined,
          speakerName: bodySpeakerName || undefined,
          responseId: directReplyId,
          complianceId: preflight.complianceId,
          lightweightPersistence: true
        });
      } catch {
        // Deterministic direct replies should still return even if lightweight persistence fails.
      }

      await safeRecordDispatchOutcome({
        complianceId: preflight.complianceId,
        stage: "upstream_ok",
        httpStatus: 200
      });

      const payload = buildSuccessPayload({
        id: directReplyId,
        outputText: directReplyText,
        sessionId,
        sessionKey,
        transport: "aurora-diagnostic-direct"
      });

      if (wantsEventStream) {
        return buildImmediateEventStreamResponse({
          replyText: directReplyText,
          finalPayload: payload,
          headers: responseHeaders
        });
      }

      responseHeaders.set("content-type", "application/json");
      return NextResponse.json(payload, {
        status: 200,
        headers: responseHeaders
      });
    }
  } else {
    prepared = {
      complianceId: `cmp_bypass_${randomUUID()}`,
      gate: "bypass_off",
      enrichedInput: text,
      contextInjected: false,
      cognitionMode,
      ownerStorageCheckpointRequired: false
    };
  }

  let enforcedStorageAudit: AuroraStorageAudit | null = null;
  if (OWNER_STORAGE_CHECKPOINT_ENABLED && prepared.contextInjected && prepared.ownerStorageCheckpointRequired) {
    try {
      const checkpoint = await runOwnerStorageCheckpoint({
        sessionKey,
        enrichedInput: prepared.enrichedInput
      });
      enforcedStorageAudit = checkpoint.audit;
      prepared = {
        ...prepared,
        enrichedInput: injectCompletedStorageCheckpointContext(prepared.enrichedInput, checkpoint.audit)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Owner storage checkpoint failed.";
      await safeRecordDispatchOutcome({
        complianceId: prepared.complianceId,
        stage: "upstream_error",
        error: message,
        storageAudit: {
          status: "checkpoint_failed"
        }
      });
      return buildErrorResponse(
        wantsEventStream,
        {
          error: message,
          complianceId: prepared.complianceId
        },
        {
          status: 409,
          headers: buildAuroraResponseHeaders({
            sessionId,
            cognitionMode: prepared.cognitionMode,
            gate: prepared.gate,
            complianceId: prepared.complianceId,
            contextInjected: prepared.contextInjected,
            partnerId: bodyPartnerId || undefined,
            storageAuditStatus: "checkpoint_failed"
          })
        }
      );
    }
  }

  const baselineMessages = historyMessageArray(baselineHistory);
  const baselineCount = baselineMessages.length;
  const baselineSeq = baselineAssistantSeq(baselineMessages);
  const idempotencyKey = randomUUID();

  if (wantsEventStream) {
    return createStreamingSendResponse({
      request,
      prepared,
      sessionId,
      sessionKey,
      partnerId: bodyPartnerId || undefined,
      baselineCount,
      baselineSeq,
      idempotencyKey
    });
  }

  try {
    await runGatewayCall("chat.send", {
      sessionKey,
      message: prepared.enrichedInput,
      idempotencyKey
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach OpenClaw gateway.";
    if (prepared.cognitionMode === "on") {
      await safeRecordDispatchOutcome({
        complianceId: prepared.complianceId,
        stage: "transport_error",
        error: message
      });
    }
    return buildErrorResponse(wantsEventStream, { error: message }, { status: 502 });
  }

  let finalHistory: OpenClawHistoryResponse;
  let assistantMessage: OpenClawHistoryMessage;
  try {
    ({ history: finalHistory, message: assistantMessage } = await waitForAssistantReply(
      sessionKey,
      baselineCount,
      baselineSeq
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenClaw reply did not complete.";
    if (prepared.cognitionMode === "on") {
      await safeRecordDispatchOutcome({
        complianceId: prepared.complianceId,
        stage: "upstream_error",
        error: message
      });
    }
    return buildErrorResponse(
      wantsEventStream,
      {
        error: message,
        complianceId: prepared.complianceId
      },
      {
        status: 504,
        headers: buildAuroraResponseHeaders({
          sessionId,
          cognitionMode: prepared.cognitionMode,
          gate: prepared.gate,
          complianceId: prepared.complianceId,
          contextInjected: prepared.contextInjected,
          partnerId: bodyPartnerId || undefined
        })
      }
    );
  }

  const finalReplyTextRaw = extractAssistantText(assistantMessage);
  const parsedStorageAudit = parseAuroraStorageAuditOutput(finalReplyTextRaw);
  const finalReplyText = parsedStorageAudit.visibleText;
  const effectiveStorageAudit = enforcedStorageAudit ?? parsedStorageAudit.audit;
  const storageAuditStatus = resolveStorageAuditStatus(parsedStorageAudit, enforcedStorageAudit);
  const persistedStorageAudit = buildStorageAuditPersistence(effectiveStorageAudit, storageAuditStatus);
  const openClawSessionId = toText(finalHistory.sessionId).trim() || undefined;
  const responseId = toText(assistantMessage.responseId).trim() || idempotencyKey;

  if (prepared.cognitionMode === "on") {
    await safeRecordDispatchOutcome({
      complianceId: prepared.complianceId,
      stage: "upstream_ok",
      httpStatus: 200,
      responseId,
      ...(persistedStorageAudit ? { storageAudit: persistedStorageAudit } : {})
    });
  }

  const responseHeaders = buildAuroraResponseHeaders({
    sessionId,
    cognitionMode: prepared.cognitionMode,
    gate: prepared.gate,
    complianceId: prepared.complianceId,
    contextInjected: prepared.contextInjected,
    partnerId: bodyPartnerId || undefined,
    storageAudit: effectiveStorageAudit,
    storageAuditStatus
  });
  responseHeaders.set("content-type", "application/json");

  return NextResponse.json(
    buildSuccessPayload({
      id: responseId,
      outputText: finalReplyText,
      sessionId,
      sessionKey,
      transport: "openclaw-gateway-chat",
      openClawSessionId,
      raw: finalHistory
    }),
    {
      status: 200,
      headers: responseHeaders
    }
  );
}
