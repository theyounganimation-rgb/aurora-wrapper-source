import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_STORE_PATH = path.join(process.cwd(), ".aurora", "codex-link", "sessions", "sessions.json");
const DEFAULT_SESSION_KEY = "agent:codex-link:main";
const DEFAULT_LIMIT = 200;
const DEFAULT_OFFSET = 0;

interface TranscriptMessage {
  id: string;
  timestamp: string;
  role: "user" | "assistant";
  text: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseLimit(request: Request): number {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("limit");
  const parsed = raw ? Number(raw) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.round(parsed), 20), 800);
}

function parseOffset(request: Request): number {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("offset");
  const parsed = raw ? Number(raw) : DEFAULT_OFFSET;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_OFFSET;
  }
  return Math.max(Math.round(parsed), 0);
}

function stripCognitiveContext(rawText: string): string {
  if (!rawText) {
    return "";
  }

  let text = rawText.replace(/\[AURORA_COGNITIVE_CONTEXT][\s\S]*?\[\/AURORA_COGNITIVE_CONTEXT]\s*/gi, "").trim();
  text = text.replace(/\[USER_MESSAGE]\s*/gi, "").replace(/\[\/USER_MESSAGE]/gi, "").trim();
  return text;
}

function extractTextParts(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }

  const chunks: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (record.type !== "text") {
      continue;
    }
    const text = asString(record.text);
    if (text) {
      chunks.push(text);
    }
  }

  return chunks;
}

function readSessionRecord(store: unknown, sessionKey: string): Record<string, unknown> | null {
  if (!store || typeof store !== "object" || Array.isArray(store)) {
    return null;
  }

  const record = store as Record<string, unknown>;
  const direct = record[sessionKey];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const sessions = record.sessions;
  if (!Array.isArray(sessions)) {
    return null;
  }

  for (const item of sessions) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    if (asString(candidate.key) === sessionKey) {
      return candidate;
    }
  }

  return null;
}

function parseTranscript(raw: string): TranscriptMessage[] {
  const lines = raw.split(/\r?\n/);
  const messages: TranscriptMessage[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      continue;
    }
    const entry = parsed as Record<string, unknown>;
    if (asString(entry.type) !== "message") {
      continue;
    }

    const message = entry.message;
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      continue;
    }
    const messageRecord = message as Record<string, unknown>;
    const role = asString(messageRecord.role);
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const textParts = extractTextParts(messageRecord.content);
    let text = textParts.join("\n").trim();
    if (!text) {
      continue;
    }

    if (role === "user") {
      text = stripCognitiveContext(text);
      if (!text) {
        continue;
      }
    }

    const id = asString(entry.id) || `${role}-${index}`;
    const timestamp = asString(entry.timestamp) || new Date().toISOString();
    messages.push({
      id,
      timestamp,
      role,
      text
    });
  }

  return messages;
}

export async function GET(request: Request) {
  const limit = parseLimit(request);
  const offset = parseOffset(request);
  const storePath = asString(process.env.AURORA_CODEX_LINK_SESSIONS_STORE) || DEFAULT_STORE_PATH;
  const sessionKey = asString(process.env.AURORA_CODEX_LINK_SESSION_KEY) || DEFAULT_SESSION_KEY;

  try {
    const storeRaw = await readFile(storePath, "utf8");
    const store = JSON.parse(storeRaw) as unknown;
    const sessionRecord = readSessionRecord(store, sessionKey);

    if (!sessionRecord) {
      return NextResponse.json(
        {
          ok: false,
          error: `Session key '${sessionKey}' was not found in store.`,
          sessionKey,
          storePath
        },
        {
          status: 404,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    const sessionId = asString(sessionRecord.sessionId);
    if (!sessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: `Session key '${sessionKey}' has no sessionId.`,
          sessionKey,
          storePath
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    const sessionFileFromStore = asString(sessionRecord.sessionFile);
    const sessionFile = sessionFileFromStore || path.join(path.dirname(storePath), `${sessionId}.jsonl`);
    const transcriptRaw = await readFile(sessionFile, "utf8");
    const allMessages = parseTranscript(transcriptRaw);
    const totalMessages = allMessages.length;
    const normalizedOffset = Math.min(offset, totalMessages);
    const endIndex = Math.max(totalMessages - normalizedOffset, 0);
    const startIndex = Math.max(endIndex - limit, 0);
    const messages = allMessages.slice(startIndex, endIndex);

    return NextResponse.json(
      {
        ok: true,
        sessionKey,
        sessionId,
        storePath,
        sessionFile,
        totalMessages,
        limit,
        offset: normalizedOffset,
        hasOlder: startIndex > 0,
        hasNewer: normalizedOffset > 0,
        messages
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read codex-link transcript.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        sessionKey,
        storePath
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
