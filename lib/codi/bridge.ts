import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getCodexAppServerClient } from "./appServerClient";

const execFileAsync = promisify(execFile);

const ACTIVE_THREAD_CACHE_MS = 3_500;
const OCR_CACHE_MS = 3_000;
const OCR_FILE_CACHE_MAX_AGE_MS = 10_000;
const THREAD_DETAIL_CACHE_MS = 4_000;
const MAX_RECENT_THREADS = 12;
const MAX_THREAD_DETAILS = 6;
const OCR_SCRIPT_PATH = path.join(process.cwd(), "scripts", "codi-window-ocr.swift");
const OCR_CACHE_FILE_PATH = path.join(process.cwd(), ".aurora", "codi-window-ocr-cache.json");

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "being",
  "both",
  "from",
  "have",
  "left",
  "make",
  "must",
  "need",
  "only",
  "onto",
  "over",
  "same",
  "send",
  "that",
  "them",
  "then",
  "they",
  "this",
  "what",
  "when",
  "with",
  "your"
]);

interface AppServerThreadListResponse {
  data?: AppServerThread[];
}

interface AppServerThreadReadResponse {
  thread?: AppServerThread | null;
}

interface AppServerTurnStartResponse {
  turn?: {
    id?: string | null;
    status?: string | null;
  } | null;
}

interface AppServerTurn {
  id?: string | null;
  items?: AppServerItem[] | null;
  status?: string | null;
  error?: unknown;
}

interface AppServerThread {
  id: string;
  name?: string | null;
  preview?: string | null;
  updatedAt?: number | null;
  createdAt?: number | null;
  cwd?: string | null;
  source?: string | null;
  modelProvider?: string | null;
  path?: string | null;
  status?: {
    type?: string | null;
  } | null;
  turns?: AppServerTurn[] | null;
}

interface AppServerTextInputPart {
  type?: string | null;
  text?: string | null;
  path?: string | null;
}

interface AppServerUserMessageItem {
  type: "userMessage";
  id?: string | null;
  content?: AppServerTextInputPart[] | null;
}

interface AppServerAgentMessageItem {
  type: "agentMessage";
  id?: string | null;
  text?: string | null;
  phase?: string | null;
}

interface AppServerErrorItem {
  type: "error";
  id?: string | null;
  message?: string | null;
}

type AppServerItem = AppServerUserMessageItem | AppServerAgentMessageItem | AppServerErrorItem | Record<string, unknown>;

interface OcrWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OcrProbePayload {
  ok?: boolean;
  windowId?: number | null;
  ownerName?: string | null;
  title?: string | null;
  text?: string | null;
  error?: string | null;
  bounds?: OcrWindowBounds | null;
}

export interface CodiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  phase: "user" | "commentary" | "final_answer" | "error";
  pending: boolean;
}

export interface CodiThreadSnapshot {
  id: string;
  title: string;
  preview: string;
  updatedAt: string | null;
  createdAt: string | null;
  cwd: string;
  source: string;
  modelProvider: string;
  status: string;
}

export interface CodiSnapshot {
  generatedAt: string;
  activeThread: CodiThreadSnapshot | null;
  messages: CodiMessage[];
  pendingTurn: boolean;
  resolver: {
    source: string;
    confidence: number;
    windowId: number | null;
    resolvedAt: string;
  };
  server: {
    defaultRemoteBaseUrl: string;
  };
}

export interface CodiSendResult {
  threadId: string;
  turnId: string | null;
}

interface ThreadDetailCacheEntry {
  expiresAt: number;
  updatedAt: number;
  thread: AppServerThread;
}

interface ActiveThreadCacheEntry {
  expiresAt: number;
  resolvedAt: number;
  confidence: number;
  source: string;
  windowId: number | null;
  thread: AppServerThread;
}

interface OcrCacheEntry {
  expiresAt: number;
  payload: OcrProbePayload;
}

const threadDetailCache = new Map<string, ThreadDetailCacheEntry>();
let activeThreadCache: ActiveThreadCacheEntry | null = null;
let ocrCache: OcrCacheEntry | null = null;

function toIsoSeconds(value: number | null | undefined): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return new Date((value as number) * 1000).toISOString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  const normalized = normalizeText(value);
  const matches = normalized.match(/[a-z0-9]{3,}/g) ?? [];
  return new Set(matches.filter((token) => !STOP_WORDS.has(token)));
}

function overlapRatio(ocrTokens: Set<string>, candidateTokens: Set<string>): number {
  if (!ocrTokens.size || !candidateTokens.size) {
    return 0;
  }

  let overlap = 0;
  for (const token of candidateTokens) {
    if (ocrTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / candidateTokens.size;
}

function excerpt(value: string, maxLength = 180): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function defaultRemoteBaseUrl(): string {
  return (
    process.env.CODI_NATIVE_API_BASE_URL?.trim() ||
    process.env.CODEX_COMPANION_NATIVE_API_BASE_URL?.trim() ||
    "http://cades-mac-mini.tail1afb62.ts.net:3000"
  );
}

function threadTitle(thread: AppServerThread): string {
  return asString(thread.name) || excerpt(asString(thread.preview), 80) || thread.id;
}

function stringifyUserContent(content: AppServerTextInputPart[] | null | undefined): string {
  if (!Array.isArray(content)) {
    return "";
  }

  const lines: string[] = [];
  const imageLabels: string[] = [];

  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }

    if (part.type === "text") {
      const text = asString(part.text);
      if (text) {
        lines.push(text);
      }
      continue;
    }

    if (part.type === "localImage") {
      const filePath = asString(part.path);
      if (filePath) {
        imageLabels.push(`[Image: ${path.basename(filePath)}]`);
      }
    }
  }

  const text = lines.join("\n").trim();
  const attachments = imageLabels.join("\n").trim();
  return [text, attachments].filter(Boolean).join("\n\n").trim();
}

function extractMessages(thread: AppServerThread): CodiMessage[] {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const messages: CodiMessage[] = [];

  for (const turn of turns) {
    const items = Array.isArray(turn.items) ? turn.items : [];
    const turnPending = asString(turn.status).toLowerCase() === "inprogress";

    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      if ((item as AppServerUserMessageItem).type === "userMessage") {
        const userItem = item as AppServerUserMessageItem;
        const text = stringifyUserContent(userItem.content);
        if (!text) {
          continue;
        }

        messages.push({
          id: `${asString(turn.id) || "turn"}:${asString(userItem.id) || "user"}`,
          role: "user",
          text,
          phase: "user",
          pending: turnPending
        });
        continue;
      }

      if ((item as AppServerAgentMessageItem).type === "agentMessage") {
        const agentItem = item as AppServerAgentMessageItem;
        const text = asString(agentItem.text);
        if (!text) {
          continue;
        }

        const phase = asString(agentItem.phase) === "final_answer" ? "final_answer" : "commentary";
        messages.push({
          id: `${asString(turn.id) || "turn"}:${asString(agentItem.id) || "assistant"}`,
          role: "assistant",
          text,
          phase,
          pending: turnPending
        });
        continue;
      }

      if ((item as AppServerErrorItem).type === "error") {
        const errorItem = item as AppServerErrorItem;
        const text = asString(errorItem.message);
        if (!text) {
          continue;
        }

        messages.push({
          id: `${asString(turn.id) || "turn"}:${asString(errorItem.id) || "error"}`,
          role: "assistant",
          text,
          phase: "error",
          pending: false
        });
      }
    }
  }

  return messages;
}

function threadPending(thread: AppServerThread): boolean {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const lastTurn = turns.at(-1);
  return asString(lastTurn?.status).toLowerCase() === "inprogress";
}

function scorePreliminaryThread(thread: AppServerThread, ocrText: string): number {
  const ocrTokens = tokenSet(ocrText);
  if (!ocrTokens.size) {
    return 0;
  }

  const title = threadTitle(thread);
  const preview = asString(thread.preview);
  return overlapRatio(ocrTokens, tokenSet(title)) * 8 + overlapRatio(ocrTokens, tokenSet(preview)) * 4;
}

function scoreResolvedThread(thread: AppServerThread, ocrText: string, rank: number): number {
  const ocrTokens = tokenSet(ocrText);
  if (!ocrTokens.size) {
    return 0;
  }

  const titleScore = overlapRatio(ocrTokens, tokenSet(threadTitle(thread)));
  const previewScore = overlapRatio(ocrTokens, tokenSet(asString(thread.preview)));
  const visibleMessages = extractMessages(thread);
  const tailMessages = visibleMessages.slice(-6);
  const messageScores = tailMessages.map((message) => overlapRatio(ocrTokens, tokenSet(message.text)));
  const bestMessageScore = messageScores.length ? Math.max(...messageScores) : 0;
  const secondMessageScore = messageScores.sort((left, right) => right - left)[1] ?? 0;
  const recencyBonus = Math.max(0, (MAX_THREAD_DETAILS - rank) / MAX_THREAD_DETAILS);

  return titleScore * 10 + previewScore * 4 + bestMessageScore * 10 + secondMessageScore * 3 + recencyBonus;
}

async function readOcrProbe(force = false): Promise<OcrProbePayload> {
  const now = Date.now();
  if (!force && ocrCache && ocrCache.expiresAt > now) {
    return ocrCache.payload;
  }

  try {
    const raw = await readFile(OCR_CACHE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      capturedAt?: string;
      payload?: OcrProbePayload;
    };
    const capturedAtMs = Date.parse(asString(parsed.capturedAt));
    const payload = parsed.payload;
    if (
      payload &&
      Number.isFinite(capturedAtMs) &&
      now - capturedAtMs <= OCR_FILE_CACHE_MAX_AGE_MS
    ) {
      ocrCache = {
        expiresAt: now + OCR_CACHE_MS,
        payload
      };
      return payload;
    }
  } catch {
    // Fall through to direct OCR.
  }

  try {
    const { stdout } = await execFileAsync("swift", [OCR_SCRIPT_PATH], {
      cwd: process.cwd(),
      maxBuffer: 2 * 1024 * 1024,
      timeout: 20_000
    });

    const payload = JSON.parse(stdout.trim()) as OcrProbePayload;
    ocrCache = {
      expiresAt: now + OCR_CACHE_MS,
      payload
    };
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to OCR the Codex window.";
    const payload: OcrProbePayload = {
      ok: false,
      error: message,
      text: ""
    };
    ocrCache = {
      expiresAt: now + 1_000,
      payload
    };
    return payload;
  }
}

async function listRecentThreads(): Promise<AppServerThread[]> {
  const client = getCodexAppServerClient();
  const response = await client.request<AppServerThreadListResponse>("thread/list", {
    limit: MAX_RECENT_THREADS
  });

  return Array.isArray(response.data) ? response.data : [];
}

async function readThread(threadId: string, expectedUpdatedAt: number | null | undefined): Promise<AppServerThread> {
  const now = Date.now();
  const cacheKey = threadId;
  const updatedAt = Number.isFinite(expectedUpdatedAt) ? Number(expectedUpdatedAt) : -1;
  const cached = threadDetailCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.updatedAt === updatedAt) {
    return cached.thread;
  }

  const client = getCodexAppServerClient();
  const response = await client.request<AppServerThreadReadResponse>("thread/read", {
    threadId,
    includeTurns: true
  });

  if (!response.thread) {
    throw new Error(`Thread '${threadId}' could not be read.`);
  }

  threadDetailCache.set(cacheKey, {
    expiresAt: now + THREAD_DETAIL_CACHE_MS,
    updatedAt,
    thread: response.thread
  });

  return response.thread;
}

async function resolveActiveThread(force = false): Promise<ActiveThreadCacheEntry | null> {
  const now = Date.now();
  if (!force && activeThreadCache && activeThreadCache.expiresAt > now) {
    return activeThreadCache;
  }

  const [ocr, recentThreads] = await Promise.all([readOcrProbe(force), listRecentThreads()]);
  if (!recentThreads.length) {
    activeThreadCache = null;
    return null;
  }

  const ocrText = asString(ocr.text);
  if (!ocrText) {
    const fallbackThread = await readThread(recentThreads[0].id, recentThreads[0].updatedAt);
    activeThreadCache = {
      expiresAt: now + ACTIVE_THREAD_CACHE_MS,
      resolvedAt: now,
      confidence: 0,
      source: "fallback:most-recent",
      windowId: ocr.windowId ?? null,
      thread: fallbackThread
    };
    return activeThreadCache;
  }

  const preliminary = recentThreads
    .map((thread) => ({
      thread,
      score: scorePreliminaryThread(thread, ocrText)
    }))
    .sort((left, right) => right.score - left.score);

  const candidateThreads = preliminary.slice(0, MAX_THREAD_DETAILS);
  const resolvedCandidates = await Promise.all(
    candidateThreads.map(async ({ thread }, index) => {
      const detail = await readThread(thread.id, thread.updatedAt);
      return {
        thread: detail,
        score: scoreResolvedThread(detail, ocrText, index)
      };
    })
  );

  resolvedCandidates.sort((left, right) => right.score - left.score);
  let winner = resolvedCandidates[0];

  if (activeThreadCache) {
    const prior = resolvedCandidates.find((candidate) => candidate.thread.id === activeThreadCache?.thread.id);
    if (prior && winner && prior.score >= winner.score - 1.25 && prior.score > 1.25) {
      winner = prior;
    }
  }

  if (!winner) {
    const fallbackThread = await readThread(recentThreads[0].id, recentThreads[0].updatedAt);
    activeThreadCache = {
      expiresAt: now + ACTIVE_THREAD_CACHE_MS,
      resolvedAt: now,
      confidence: 0,
      source: "fallback:most-recent",
      windowId: ocr.windowId ?? null,
      thread: fallbackThread
    };
    return activeThreadCache;
  }

  activeThreadCache = {
    expiresAt: now + ACTIVE_THREAD_CACHE_MS,
    resolvedAt: now,
    confidence: Number(winner.score.toFixed(3)),
    source: "ocr",
    windowId: ocr.windowId ?? null,
    thread: winner.thread
  };

  return activeThreadCache;
}

function toThreadSnapshot(thread: AppServerThread): CodiThreadSnapshot {
  return {
    id: thread.id,
    title: threadTitle(thread),
    preview: asString(thread.preview),
    updatedAt: toIsoSeconds(thread.updatedAt),
    createdAt: toIsoSeconds(thread.createdAt),
    cwd: asString(thread.cwd),
    source: asString(thread.source),
    modelProvider: asString(thread.modelProvider),
    status: asString(thread.status?.type) || "unknown"
  };
}

export async function readCodiSnapshot(force = false): Promise<CodiSnapshot> {
  const resolved = await resolveActiveThread(force);
  const thread = resolved?.thread ?? null;
  const messages = thread ? extractMessages(thread) : [];

  return {
    generatedAt: new Date().toISOString(),
    activeThread: thread ? toThreadSnapshot(thread) : null,
    messages,
    pendingTurn: thread ? threadPending(thread) : false,
    resolver: {
      source: resolved?.source ?? "none",
      confidence: resolved?.confidence ?? 0,
      windowId: resolved?.windowId ?? null,
      resolvedAt: resolved ? new Date(resolved.resolvedAt).toISOString() : new Date().toISOString()
    },
    server: {
      defaultRemoteBaseUrl: defaultRemoteBaseUrl()
    }
  };
}

export async function sendToVisibleCodexThread(text: string): Promise<CodiSendResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("A non-empty message is required.");
  }

  const resolved = await resolveActiveThread(true);
  if (!resolved?.thread?.id) {
    throw new Error("No visible Codex thread could be resolved.");
  }

  const client = getCodexAppServerClient();
  const response = await client.request<AppServerTurnStartResponse>("turn/start", {
    threadId: resolved.thread.id,
    input: [
      {
        type: "text",
        text: trimmed,
        text_elements: []
      }
    ],
    summary: "none"
  });

  activeThreadCache = null;
  threadDetailCache.delete(resolved.thread.id);
  ocrCache = null;

  return {
    threadId: resolved.thread.id,
    turnId: asString(response.turn?.id) || null
  };
}
