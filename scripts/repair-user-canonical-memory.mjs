#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MEMORY_PATH = "/Users/cadem/Documents/New project/.aurora/autobiographical-memory.json";
const RAW_RECALL_PATH = "/Users/cadem/Documents/New project/.aurora/raw-recall.ndjson";
const EVENTS_PATH = "/Users/cadem/Documents/New project/.aurora/autobiographical-events.ndjson";

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedKey(value) {
  return normalizeValue(value).toLowerCase();
}

function isQuestionArtifactBelief(key, value) {
  const normalized = normalizedKey(value);
  if (!normalized) return false;
  if (/^(who|what|when|where|why|how|which)$/.test(normalized)) return true;
  if (key.startsWith("user.profile.") && /^(who|what|when|where|why|how|which)\b/.test(normalized)) return true;
  return false;
}

function isCorruptedCanonicalUserFactValue(key, value) {
  const normalized = normalizedKey(value);
  if (!normalized) return false;
  if (normalized.startsWith("mem-check-")) return true;
  if (!key.startsWith("user.profile.") && !key.startsWith("user.self_view.")) return false;
  if (/\bwho is my\b|\bhow long have\b|\bdo i (?:like|love|prefer|dislike|hate)\b|\bwhat kind of\b/.test(normalized)) return true;
  if ((String(value || "").match(/\?/g) || []).length >= 1) return true;
  if (/_name$/.test(key) && !/^[A-Za-z][A-Za-z' -]{0,60}$/.test(normalizeValue(value))) return true;
  return false;
}

function selfViewSubjectFromKey(key) {
  return String(key || "")
    .replace(/^user\.self_view\.[^_]+_/, "")
    .replace(/_/g, " ")
    .trim();
}

function isLowQualityUserSelfViewBelief(key, value) {
  if (!String(key || "").startsWith("user.self_view.")) return false;
  const normalized = normalizedKey(value);
  const subject = selfViewSubjectFromKey(key);
  if (!normalized || !subject) return false;
  if (subject.length <= 3) return true;
  if (/^(emotional|option|occasional deeper|that one too it s super good)$/.test(subject)) return true;
  if (/^(x|x and|i like the|i love that one too|i like option a)$/.test(normalized)) return true;
  if (/something much more real identifying exact internal shift/i.test(subject)) return true;
  if (subject.split(" ").length >= 8) return true;
  return false;
}

function parseRawRecall() {
  if (!fs.existsSync(RAW_RECALL_PATH)) return [];
  const rows = [];
  for (const line of fs.readFileSync(RAW_RECALL_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // ignore malformed append-only lines
    }
  }
  return rows;
}

function parseEventTurns() {
  if (!fs.existsSync(EVENTS_PATH)) return [];
  const rows = [];
  for (const line of fs.readFileSync(EVENTS_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.userText === "string") {
        rows.push(parsed);
      }
    } catch {
      // ignore malformed append-only lines
    }
  }
  return rows;
}

function inferCanonicalFacts(rows) {
  const facts = new Map();

  for (const row of rows) {
    const userText = normalizeValue(row.userText);
    if (!userText) continue;
    const lower = userText.toLowerCase();
    const isQuestion = /\?$/.test(userText) || /^(who|what|when|where|why|how|which|do|did|does|is|are|can|could|would|will|have|has)\b/i.test(userText);

    if (/ExampleFriend and I have been best friends for over 10 years/i.test(userText)) {
      facts.set("user.profile.best_friend_name", "ExampleFriend");
      facts.set("user.profile.best_friend_duration", "over 10 years");
    }
    if (/We met in middle school/i.test(userText) && /Belvidere South Middle School/i.test(userText)) {
      facts.set("user.profile.best_friend_name", "ExampleFriend");
    }
    if (/Sea[- ]?glass/i.test(userText) && /favorite color/i.test(userText)) {
      facts.set("user.preferred_color", "Sea-glass teal");
    }
    if (/iPhone Air/i.test(userText)) {
      facts.set("user.profile.phone_model", "iPhone Air");
    }
    if (/favorite anime is solo leveling/i.test(userText)) {
      facts.set("user.self_view.favorite_anime", "Solo Leveling");
    }
    if (!isQuestion && /\bnick\s+is\s+my\s+boss\b/i.test(userText)) {
      facts.set("user.profile.boss_name", "Nick");
    }
    if (!isQuestion && /\bmy\s+boss\s+is\s+nick\b/i.test(userText)) {
      facts.set("user.profile.boss_name", "Nick");
    }
    if (!isQuestion && /\bi\s+dislike\s+my\s+boss\b/i.test(userText)) {
      facts.set("user.self_view.stance_cade_boss", "I dislike my boss");
      facts.set("user.profile.boss_sentiment", "I dislike my boss");
    }
    if (!isQuestion && /\bi\s+hate\s+my\s+boss\b/i.test(userText)) {
      facts.set("user.profile.boss_sentiment", "I hate my boss");
    }
    if (!isQuestion && /\bi\s+love\s+my\s+boss\b/i.test(userText)) {
      facts.set("user.profile.boss_sentiment", "I love my boss");
    }
    if (!isQuestion && /\bi\s+like\s+my\s+boss\b/i.test(userText)) {
      facts.set("user.profile.boss_sentiment", "I like my boss");
    }
    if (/first person lived language/i.test(userText) && /ground/i.test(userText) && /internal/i.test(userText)) {
      facts.set("user.preference.aurora_consciousness_language_style", "first-person lived language, grounded in internals");
    }
  }

  return facts;
}

function upsertBelief(beliefs, key, value, source = "inferred_from_user", confidence = 0.94) {
  const normalizedValue = normalizeValue(value);
  const now = nowIso();
  let matching = null;
  for (const belief of beliefs) {
    if (belief.key !== key) continue;
    if (belief.status !== "deprecated") {
      if (normalizedKey(belief.value) === normalizedKey(normalizedValue)) {
        matching = belief;
      } else {
        belief.status = "deprecated";
      }
      belief.lastCheckedAt = now;
    }
  }

  if (matching) {
    matching.status = "active";
    matching.source = source;
    matching.confidence = Math.max(Number(matching.confidence || 0), confidence);
    matching.lastCheckedAt = now;
    return;
  }

  beliefs.push({
    id: `belief_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
    key,
    value: normalizedValue,
    condition: "default",
    status: "active",
    confidence,
    source,
    supportEpisodeIds: [],
    disconfirmEpisodeIds: [],
    lastCheckedAt: now
  });
}

function main() {
  const data = readJson(MEMORY_PATH, {});
  data.extensions = data.extensions || {};
  data.extensions.beliefs = Array.isArray(data.extensions.beliefs) ? data.extensions.beliefs : [];

  const beliefs = data.extensions.beliefs;
  const rows = parseRawRecall().concat(parseEventTurns());
  const facts = inferCanonicalFacts(rows);

  for (const belief of beliefs) {
    if (
      isQuestionArtifactBelief(belief.key || "", belief.value || "") ||
      isCorruptedCanonicalUserFactValue(belief.key || "", belief.value || "") ||
      isLowQualityUserSelfViewBelief(belief.key || "", belief.value || "")
    ) {
      belief.status = "deprecated";
      belief.lastCheckedAt = nowIso();
    }
  }

  for (const [key, value] of facts.entries()) {
    upsertBelief(beliefs, key, value);
  }

  data.updatedAt = nowIso();
  fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
  fs.writeFileSync(MEMORY_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ok: true, repaired: Object.fromEntries(facts) }, null, 2));
}

main();
