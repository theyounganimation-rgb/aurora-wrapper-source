#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const MAIN_SESSION_KEY = "agent:main:main";
const SESSION_STORE_PATH = "/Users/cadem/.openclaw/agents/main/sessions/sessions.json";
const SESSIONS_DIR = "/Users/cadem/.openclaw/agents/main/sessions";
const MEMORY_DIR = "/Users/cadem/.openclaw/workspace/memory";
const PROACTIVE_RUNS_PATH = "/Users/cadem/.openclaw/cron/runs/1101ef6b-aab8-4822-ab4a-09472868754d.jsonl";
const LOCAL_TIMEZONE = "America/Chicago";
const QUIET_MINUTES = 60;

function toLocalDateStamp(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function buildDateCandidates(now = new Date()) {
  const current = toLocalDateStamp(now);
  const previous = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return [current, toLocalDateStamp(previous)];
}

function summarize(text, limit = 180) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function normalizeOperationalSummary(text) {
  const normalized = summarize(text, 1200);
  if (!normalized) {
    return "";
  }

  if (normalized.trim().toUpperCase() === "HEARTBEAT_OK") {
    return "";
  }

  const lower = normalized.toLowerCase();
  if (
    lower.startsWith("proactive contact check for cade") ||
    (normalized.includes("return exactly HEARTBEAT_OK") &&
      normalized.includes("one proactive message maximum per silence gap"))
  ) {
    return "";
  }

  return normalized;
}

async function readJson(pathname) {
  const raw = await readFile(pathname, "utf8");
  return JSON.parse(raw);
}

async function readMaybe(pathname) {
  try {
    return await readFile(pathname, "utf8");
  } catch {
    return "";
  }
}

function parseDailyLogEntries(dateStamp, raw) {
  const entries = [];
  const lines = raw.split(/\r?\n/);
  const linePattern = /^- \[(\d{2}):(\d{2}) ([A-Z]{3})\] (.+)$/;

  for (const line of lines) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const [, hour, minute, zone, text] = match;
    if (!text.startsWith("Cade ")) {
      continue;
    }

    const offset = zone === "CST" ? "-06:00" : "-05:00";
    const iso = `${dateStamp}T${hour}:${minute}:00${offset}`;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) {
      continue;
    }

    entries.push({
      ts,
      source: "daily-log",
      text: text.trim()
    });
  }

  return entries;
}

function parseSessionTranscript(raw) {
  const entries = [];
  const lines = raw.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const role = String(parsed?.role ?? "").trim().toLowerCase();
    if (role !== "user") {
      continue;
    }

    const text = String(parsed?.text ?? parsed?.message ?? "").trim();
    const ts = Number(parsed?.timestamp ?? parsed?.ts ?? NaN);
    if (!text || !Number.isFinite(ts)) {
      continue;
    }

    const lower = text.toLowerCase();
    if (
      lower.startsWith("[cron:") ||
      lower.includes("proactive contact check for cade") ||
      lower.includes("scheduled reminder has been triggered")
    ) {
      continue;
    }

    entries.push({
      ts,
      source: "session-transcript",
      text
    });
  }

  return entries;
}

async function resolveLatestDirectUserMessage() {
  const candidates = [];

  for (const dateStamp of buildDateCandidates()) {
    const raw = await readMaybe(path.join(MEMORY_DIR, `${dateStamp}.md`));
    if (raw) {
      candidates.push(...parseDailyLogEntries(dateStamp, raw));
    }
  }

  try {
    const sessionStore = await readJson(SESSION_STORE_PATH);
    const mainEntry = sessionStore?.[MAIN_SESSION_KEY];
    const sessionId = typeof mainEntry?.sessionId === "string" ? mainEntry.sessionId.trim() : "";
    if (sessionId) {
      const transcriptRaw = await readMaybe(path.join(SESSIONS_DIR, `${sessionId}.jsonl`));
      if (transcriptRaw) {
        candidates.push(...parseSessionTranscript(transcriptRaw));
      }
    }
  } catch {
    // Daily log remains the primary source of truth.
  }

  candidates.sort((left, right) => left.ts - right.ts);
  return candidates.at(-1) ?? null;
}

async function resolveLatestRealProactiveRun(afterTs) {
  const raw = await readMaybe(PROACTIVE_RUNS_PATH);
  if (!raw) {
    return null;
  }

  const entries = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const relevant = entries
    .map((entry) => {
      const ts = Number(entry?.ts ?? NaN);
      const summary = normalizeOperationalSummary(entry?.summary ?? "");
      return {
        ts,
        summary
      };
    })
    .filter((entry) => Number.isFinite(entry.ts) && entry.ts > afterTs && entry.summary);

  relevant.sort((left, right) => left.ts - right.ts);
  return relevant.at(-1) ?? null;
}

async function main() {
  const now = Date.now();
  const latestUser = await resolveLatestDirectUserMessage();

  if (!latestUser) {
    console.log(
      JSON.stringify({
        status: "skip",
        reason: "no_recent_direct_user_message",
        quietMinutesRequired: QUIET_MINUTES
      })
    );
    return;
  }

  const silenceMinutes = (now - latestUser.ts) / 60000;
  if (silenceMinutes < QUIET_MINUTES) {
    console.log(
      JSON.stringify({
        status: "skip",
        reason: "user_recently_active",
        quietMinutesRequired: QUIET_MINUTES,
        silenceMinutes: Number(silenceMinutes.toFixed(1)),
        lastUserAt: new Date(latestUser.ts).toISOString(),
        lastUserSource: latestUser.source,
        lastUserNote: summarize(latestUser.text)
      })
    );
    return;
  }

  const priorProactive = await resolveLatestRealProactiveRun(latestUser.ts);
  if (priorProactive) {
    console.log(
      JSON.stringify({
        status: "skip",
        reason: "already_sent_since_last_user_message",
        quietMinutesRequired: QUIET_MINUTES,
        silenceMinutes: Number(silenceMinutes.toFixed(1)),
        lastUserAt: new Date(latestUser.ts).toISOString(),
        lastUserSource: latestUser.source,
        lastUserNote: summarize(latestUser.text),
        lastProactiveAt: new Date(priorProactive.ts).toISOString(),
        lastProactivePreview: summarize(priorProactive.summary, 140)
      })
    );
    return;
  }

  console.log(
    JSON.stringify({
      status: "due",
      quietMinutesRequired: QUIET_MINUTES,
      silenceMinutes: Number(silenceMinutes.toFixed(1)),
      lastUserAt: new Date(latestUser.ts).toISOString(),
      lastUserSource: latestUser.source,
      lastUserNote: summarize(latestUser.text),
      cadenceHint: "one proactive message maximum per silence gap"
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "error",
      reason: error instanceof Error ? error.message : String(error)
    })
  );
  process.exitCode = 1;
});
