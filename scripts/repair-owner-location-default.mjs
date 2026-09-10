#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MEMORY_PATH = process.env.AURORA_MEMORY_PATH || path.join(process.cwd(), ".aurora", "autobiographical-memory.json");
const BELIEF_KEY = "user.profile.weekday_evening_default_location";
const TARGET_VALUE = "home";
const TARGET_PATTERN =
  /\byou can assume i(?:'m| am)\s+(?:at\s+)?home\s+at this time on a weekday unless i(?:'ll| will)?\s+(?:explicitly\s+)?say otherwise\b/i;

function nowIso() {
  return new Date().toISOString();
}

function toId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function main() {
  const state = readJson(MEMORY_PATH);
  state.extensions = state.extensions && typeof state.extensions === "object" ? state.extensions : {};
  state.extensions.episodes = ensureArray(state.extensions.episodes);
  state.extensions.beliefs = ensureArray(state.extensions.beliefs);

  const supportEpisode = [...state.extensions.episodes]
    .reverse()
    .find((episode) => episode?.role === "user" && TARGET_PATTERN.test(normalize(episode.text).toLowerCase()));

  const supportIds = supportEpisode?.id ? [supportEpisode.id] : [];
  const updatedAt = nowIso();
  const conflicting = state.extensions.beliefs.filter(
    (belief) => belief?.key === BELIEF_KEY && belief?.source === "inferred_from_user" && belief?.status !== "deprecated"
  );
  const existing = conflicting.find((belief) => normalize(belief.value).toLowerCase() === TARGET_VALUE);

  if (existing) {
    existing.value = TARGET_VALUE;
    existing.condition = "default";
    existing.status = "active";
    existing.confidence = Math.max(Number(existing.confidence || 0), 0.94);
    existing.supportEpisodeIds = [...new Set([...(existing.supportEpisodeIds || []), ...supportIds])].slice(-14);
    existing.disconfirmEpisodeIds = [];
    existing.lastCheckedAt = updatedAt;
  } else {
    state.extensions.beliefs.push({
      id: toId("belief"),
      key: BELIEF_KEY,
      value: TARGET_VALUE,
      condition: "default",
      status: "active",
      confidence: 0.94,
      source: "inferred_from_user",
      supportEpisodeIds: supportIds,
      disconfirmEpisodeIds: [],
      lastCheckedAt: updatedAt
    });
  }

  for (const belief of conflicting) {
    if (existing && belief.id === existing.id) {
      continue;
    }
    if (!existing && normalize(belief.value).toLowerCase() === TARGET_VALUE) {
      continue;
    }
    belief.status = "deprecated";
    belief.lastCheckedAt = updatedAt;
  }

  state.updatedAt = updatedAt;
  fs.writeFileSync(MEMORY_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        memoryPath: MEMORY_PATH,
        beliefKey: BELIEF_KEY,
        value: TARGET_VALUE,
        supportEpisodeId: supportEpisode?.id || null
      },
      null,
      2
    ) + "\n"
  );
}

main();
