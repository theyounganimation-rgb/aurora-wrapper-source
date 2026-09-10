import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { parseAuroraStorageAuditOutput } from "@/lib/auroraStorageAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OpenClawHistoryMessageContentPart {
  type?: unknown;
  text?: unknown;
}

interface OpenClawHistoryMessage {
  role?: unknown;
  content?: unknown;
  responseId?: unknown;
  timestamp?: unknown;
  __openclaw?: {
    id?: unknown;
  };
}

interface OpenClawHistoryResponse {
  sessionKey?: unknown;
  sessionId?: unknown;
  messages?: unknown;
}

interface UserVisibleCronRunRecord {
  ts?: unknown;
  runAtMs?: unknown;
  durationMs?: unknown;
  summary?: unknown;
}

type HistoryMessageSource = "conversation" | "cron";
type HistoryMessageCategory = "conversation" | "proactive_contact" | "daily_briefing" | "other_cron";

const execFileAsync = promisify(execFile);
const DEFAULT_SESSION_KEY = "agent:main:main";
const OWNER_DASHBOARD_SESSION_ID = "agent:main:main";
const OWNER_APP_OPENRESPONSES_SESSION_ID = `agent:main:openresponses-user:${OWNER_DASHBOARD_SESSION_ID}`;
const OWNER_UNIFIED_CONTINUITY_SESSION_ID = "agent:main:owner:continuity";
const AURORA_MOBILE_DEFAULT_SESSION_KEY = "agent:aurora-mobile:owner:continuity";
const OWNER_DIRECT_CONTINUITY_SESSION_IDS = new Set(["agent:main:telegram:direct:0000000000"]);
const USER_VISIBLE_CRON_RUNS_ROOT = "/Users/cadem/.openclaw/cron/runs";
const DAILY_WORLD_BRIEFING_CRON_JOB_ID = "885f7697-275f-4a4d-b75d-4a1c7874d480";
const PROACTIVE_CONTACT_CRON_JOB_ID = "1101ef6b-aab8-4822-ab4a-09472868754d";
const USER_VISIBLE_CRON_JOB_IDS = [
  DAILY_WORLD_BRIEFING_CRON_JOB_ID,
  PROACTIVE_CONTACT_CRON_JOB_ID
] as const;
const USER_VISIBLE_CRON_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const SINGLE_MESSAGE_PER_DAY_CRON_JOB_IDS = new Set<string>([DAILY_WORLD_BRIEFING_CRON_JOB_ID]);
const CHICAGO_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const CONTEXT_OPEN = "[AURORA_COGNITIVE_CONTEXT]";
const CONTEXT_CLOSE = "[/AURORA_COGNITIVE_CONTEXT]";
const USER_OPEN = "[USER_MESSAGE]";
const USER_CLOSE = "[/USER_MESSAGE]";

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function sanitizeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAgentSemanticSessionKey(value: string): boolean {
  return /^agent:[^:\s]+:/i.test(value.trim());
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

function resolveHistorySessionKey(sessionKey: string, requestedSessionId: string): string {
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

function extractWrappedBlock(source: string, open: string, close: string): string {
  const start = source.indexOf(open);
  if (start < 0) {
    return "";
  }

  const contentStart = start + open.length;
  const end = source.indexOf(close, contentStart);
  if (end < 0) {
    return source.slice(contentStart).trim();
  }

  return source.slice(contentStart, end).trim();
}

function stripWrappedBlocks(source: string, open: string, close: string): string {
  let remaining = source;

  while (true) {
    const start = remaining.indexOf(open);
    if (start < 0) {
      return remaining;
    }

    const end = remaining.indexOf(close, start + open.length);
    if (end < 0) {
      return remaining.slice(0, start).trim();
    }

    remaining = `${remaining.slice(0, start)}${remaining.slice(end + close.length)}`.trim();
  }
}

function extractMessageText(message: OpenClawHistoryMessage): string {
  if (!Array.isArray(message.content)) {
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

function extractVisibleUserText(textRaw: string): string {
  const wrappedUserText = extractWrappedBlock(textRaw, USER_OPEN, USER_CLOSE);
  if (wrappedUserText) {
    return wrappedUserText;
  }

  return stripWrappedBlocks(textRaw, CONTEXT_OPEN, CONTEXT_CLOSE).trim();
}

function toCreatedAt(timestamp: unknown): string {
  const numeric = toFiniteNumber(timestamp);
  if (numeric !== null) {
    return new Date(numeric).toISOString();
  }

  const text = toText(timestamp).trim();
  if (text) {
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date(0).toISOString();
}

function isProactiveOperationalTurnText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("proactive contact check for cade") &&
    normalized.includes("a scheduled reminder has been triggered") &&
    normalized.includes("handle this reminder internally")
  );
}

function isOperationalNoOpReply(text: string): boolean {
  return text.trim().toUpperCase() === "HEARTBEAT_OK";
}

function normalizeMessages(history: OpenClawHistoryResponse | null) {
  const source = Array.isArray(history?.messages) ? (history.messages as OpenClawHistoryMessage[]) : [];
  const normalized: Array<{
    id: string;
    role: "user" | "aurora";
    text: string;
    createdAt: string;
    status: "done";
    source: HistoryMessageSource;
    category: HistoryMessageCategory;
    jobId?: string;
  }> = [];
  let suppressOperationalAssistant = false;

  for (let index = 0; index < source.length; index += 1) {
    const message = source[index];
    const role = String(message?.role ?? "").trim().toLowerCase();
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const textRaw = extractMessageText(message);
    if (role === "user" && isProactiveOperationalTurnText(textRaw)) {
      suppressOperationalAssistant = true;
      continue;
    }

    const text =
      role === "assistant" ? parseAuroraStorageAuditOutput(textRaw).visibleText : extractVisibleUserText(textRaw);
    if (!text) {
      if (role === "assistant" && suppressOperationalAssistant) {
        suppressOperationalAssistant = false;
      } else if (role === "user") {
        suppressOperationalAssistant = false;
      }
      continue;
    }

    if (role === "assistant" && suppressOperationalAssistant) {
      suppressOperationalAssistant = false;
      if (isOperationalNoOpReply(text)) {
        continue;
      }
    } else if (role === "user") {
      suppressOperationalAssistant = false;
    }

    const id =
      sanitizeIdentifier(message?.__openclaw?.id) ||
      sanitizeIdentifier(message?.responseId) ||
      `${role}-${index + 1}`;

    normalized.push({
      id,
      role: role === "assistant" ? "aurora" : "user",
      text,
      createdAt: toCreatedAt(message?.timestamp),
      status: "done",
      source: "conversation",
      category: "conversation"
    });
  }

  return normalized;
}

type NormalizedChatMessage = ReturnType<typeof normalizeMessages>[number];

function isUserVisibleCronSummary(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  if (isOperationalNoOpReply(normalized)) {
    return false;
  }

  if (normalized.toLowerCase() === "done.") {
    return false;
  }

  if (
    normalized.toLowerCase().startsWith("proactive contact check for cade") ||
    (normalized.includes("return exactly HEARTBEAT_OK") &&
      normalized.includes("one proactive message maximum per silence gap"))
  ) {
    return false;
  }

  return true;
}

function cronMessageCategory(jobId: string): HistoryMessageCategory {
  if (jobId === PROACTIVE_CONTACT_CRON_JOB_ID) {
    return "proactive_contact";
  }

  if (jobId === DAILY_WORLD_BRIEFING_CRON_JOB_ID) {
    return "daily_briefing";
  }

  return "other_cron";
}

function dedupeMessages(messages: NormalizedChatMessage[]): NormalizedChatMessage[] {
  const deduped: NormalizedChatMessage[] = [];

  for (const message of messages) {
    const currentTs = Date.parse(message.createdAt);
    const duplicate = deduped.find((existing) => {
      if (existing.role !== message.role || existing.text !== message.text) {
        return false;
      }

      const existingTs = Date.parse(existing.createdAt);
      if (!Number.isFinite(existingTs) || !Number.isFinite(currentTs)) {
        return existing.id === message.id;
      }

      return Math.abs(existingTs - currentTs) <= 2 * 60 * 1000;
    });

    if (!duplicate) {
      deduped.push(message);
    }
  }

  return deduped;
}

async function readUserVisibleCronMessages(): Promise<NormalizedChatMessage[]> {
  const lookbackFloor = Date.now() - USER_VISIBLE_CRON_LOOKBACK_MS;
  const messages: NormalizedChatMessage[] = [];
  const latestPerJobDay = new Map<string, NormalizedChatMessage>();

  for (const jobId of USER_VISIBLE_CRON_JOB_IDS) {
    const filePath = `${USER_VISIBLE_CRON_RUNS_ROOT}/${jobId}.jsonl`;
    let raw = "";
    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-64);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let parsed: UserVisibleCronRunRecord | null = null;

      try {
        parsed = JSON.parse(line) as UserVisibleCronRunRecord;
      } catch {
        parsed = null;
      }

      if (!parsed) {
        continue;
      }

      const summary = toText(parsed.summary).trim();
      if (!isUserVisibleCronSummary(summary)) {
        continue;
      }

      const completedAtMs =
        toFiniteNumber(parsed.ts) ??
        (() => {
          const runAt = toFiniteNumber(parsed.runAtMs);
          const duration = toFiniteNumber(parsed.durationMs) ?? 0;
          return runAt !== null ? runAt + Math.max(0, duration) : null;
        })();

      if (completedAtMs !== null && completedAtMs < lookbackFloor) {
        continue;
      }

      const message = {
        id: `cron-${jobId}-${completedAtMs ?? index + 1}`,
        role: "aurora",
        text: summary,
        createdAt: toCreatedAt(completedAtMs ?? parsed.ts),
        status: "done",
        source: "cron",
        category: cronMessageCategory(jobId),
        jobId
      } satisfies NormalizedChatMessage;

      if (!SINGLE_MESSAGE_PER_DAY_CRON_JOB_IDS.has(jobId)) {
        messages.push(message);
        continue;
      }

      const createdAtMs = Date.parse(message.createdAt);
      const dayKey = `${jobId}:${Number.isFinite(createdAtMs) ? CHICAGO_DAY_FORMATTER.format(new Date(createdAtMs)) : message.createdAt}`;
      const existing = latestPerJobDay.get(dayKey);
      if (!existing) {
        latestPerJobDay.set(dayKey, message);
        continue;
      }

      if (Date.parse(existing.createdAt) <= createdAtMs) {
        latestPerJobDay.set(dayKey, message);
      }
    }
  }

  messages.push(...latestPerJobDay.values());
  return messages;
}

function mergeConversationMessages(
  historyMessages: NormalizedChatMessage[],
  cronMessages: NormalizedChatMessage[]
): NormalizedChatMessage[] {
  const merged = [...historyMessages, ...cronMessages].sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);

    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return leftTs - rightTs;
    }

    return left.id.localeCompare(right.id);
  });

  return dedupeMessages(merged);
}

async function readMergedChatHistory(sessionKey: string): Promise<OpenClawHistoryResponse | null> {
  return readChatHistory(sessionKey);
}

async function runGatewayCall(method: string, params: Record<string, unknown>): Promise<unknown> {
  const { stdout } = await execFileAsync(
    "openclaw",
    ["gateway", "call", method, "--json", "--params", JSON.stringify(params)],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    }
  );

  return JSON.parse(stdout) as unknown;
}

async function readChatHistory(sessionKey: string): Promise<OpenClawHistoryResponse | null> {
  try {
    return (await runGatewayCall("chat.history", { sessionKey })) as OpenClawHistoryResponse;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedSessionId = sanitizeIdentifier(searchParams.get("sessionId"));
  const requestedSessionKey = sanitizeIdentifier(searchParams.get("sessionKey"));
  const configuredSessionId = envOrDefault(
    process.env.AURORA_SESSION_ID ?? process.env.NEXT_PUBLIC_AURORA_SHARED_SESSION_ID,
    OWNER_DASHBOARD_SESSION_ID
  );
  const sessionId = canonicalContinuitySessionId(requestedSessionId || configuredSessionId) || OWNER_DASHBOARD_SESSION_ID;
  const requestedHistorySessionKey =
    requestedSessionKey || (isAgentSemanticSessionKey(sessionId) ? sessionId : DEFAULT_SESSION_KEY);
  const sessionKey = resolveHistorySessionKey(requestedHistorySessionKey, requestedSessionId || sessionId);

  try {
    const history = await readMergedChatHistory(sessionKey);
    const cronMessages = await readUserVisibleCronMessages();
    const messages = mergeConversationMessages(normalizeMessages(history), cronMessages);

    return NextResponse.json(
      {
        sessionId,
        sessionKey,
        messages
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read OpenClaw history.";
    return NextResponse.json(
      {
        error: message,
        sessionId,
        sessionKey,
        messages: []
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
