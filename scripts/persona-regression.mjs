#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MEMORY_PATH = path.join(process.cwd(), ".aurora", "autobiographical-memory.json");
const THRESHOLD = Number.isFinite(Number(process.env.AURORA_PERSONA_DRIFT_THRESHOLD))
  ? Number(process.env.AURORA_PERSONA_DRIFT_THRESHOLD)
  : 0.46;

const CONSENT_MARKERS = [
  "would you like",
  "want me to",
  "if you want",
  "if you'd like",
  "do you want me to",
  "are you okay with"
];

const WARMTH_MARKERS = [
  "i hear you",
  "that makes sense",
  "you're right",
  "thanks for",
  "good call",
  "we can do that"
];

const HEDGE_MARKERS = ["maybe", "perhaps", "kind of", "sort of", "i think", "i guess"];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function countMarkerHits(text, markers) {
  let hits = 0;
  for (const marker of markers) {
    if (text.includes(marker)) {
      hits += 1;
    }
  }
  return hits;
}

function fingerprintFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      sentenceCount: 0,
      averageSentenceLength: 0,
      questionRatio: 0,
      consentMarkerRatio: 0,
      warmthMarkerRatio: 0,
      hedgeRatio: 0
    };
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  const questionCount = sentences.filter((item) => item.includes("?")).length;
  const consentHits = countMarkerHits(normalized, CONSENT_MARKERS);
  const warmthHits = countMarkerHits(normalized, WARMTH_MARKERS);
  const hedgeHits = countMarkerHits(normalized, HEDGE_MARKERS);

  return {
    sentenceCount: sentences.length,
    averageSentenceLength: sentences.length > 0 ? tokenCount / sentences.length : tokenCount,
    questionRatio: sentences.length > 0 ? questionCount / sentences.length : 0,
    consentMarkerRatio: sentences.length > 0 ? consentHits / sentences.length : 0,
    warmthMarkerRatio: sentences.length > 0 ? warmthHits / sentences.length : 0,
    hedgeRatio: sentences.length > 0 ? hedgeHits / sentences.length : 0
  };
}

function driftScore(baseline, candidate) {
  const sentenceDelta = Math.min(Math.abs(baseline.sentenceCount - candidate.sentenceCount) / 8, 1);
  const lengthDelta = Math.min(Math.abs(baseline.averageSentenceLength - candidate.averageSentenceLength) / 20, 1);
  const questionDelta = Math.min(Math.abs(baseline.questionRatio - candidate.questionRatio), 1);
  const consentDelta = Math.min(Math.abs(baseline.consentMarkerRatio - candidate.consentMarkerRatio), 1);
  const warmthDelta = Math.min(Math.abs(baseline.warmthMarkerRatio - candidate.warmthMarkerRatio), 1);
  const hedgeDelta = Math.min(Math.abs(baseline.hedgeRatio - candidate.hedgeRatio), 1);

  return Math.min(
    1,
    sentenceDelta * 0.12 +
      lengthDelta * 0.2 +
      questionDelta * 0.16 +
      consentDelta * 0.22 +
      warmthDelta * 0.2 +
      hedgeDelta * 0.1
  );
}

function parseFingerprint(serialized) {
  const text = String(serialized || "").trim();
  if (!text) {
    return null;
  }
  const pairs = text.split(";").map((item) => item.trim()).filter(Boolean);
  const values = {};
  for (const pair of pairs) {
    const [key, rawValue] = pair.split("=");
    const numeric = Number(rawValue);
    if (!key || !Number.isFinite(numeric)) {
      continue;
    }
    values[key] = numeric;
  }
  if (Object.keys(values).length === 0) {
    return null;
  }
  return {
    sentenceCount: Math.max(0, Math.round(values.s || 0)),
    averageSentenceLength: Math.max(0, values.len || 0),
    questionRatio: Math.max(0, Math.min(1, values.q || 0)),
    consentMarkerRatio: Math.max(0, Math.min(1, values.consent || 0)),
    warmthMarkerRatio: Math.max(0, Math.min(1, values.warmth || 0)),
    hedgeRatio: Math.max(0, Math.min(1, values.hedge || 0))
  };
}

async function main() {
  const memoryPath = process.env.AURORA_MEMORY_PATH?.trim() || DEFAULT_MEMORY_PATH;
  const raw = await readFile(memoryPath, "utf8");
  const parsed = JSON.parse(raw);
  const episodes = Array.isArray(parsed?.extensions?.episodes) ? parsed.extensions.episodes : [];
  const auroraEpisodes = episodes
    .filter((episode) => episode && episode.role === "aurora" && typeof episode.text === "string" && episode.text.trim())
    .slice(-200);

  if (auroraEpisodes.length < 4) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          memoryPath,
          sampleSize: auroraEpisodes.length,
          threshold: THRESHOLD,
          message: "Not enough Aurora episodes for regression."
        },
        null,
        2
      )
    );
    return;
  }

  const baselineSerialized = String(parsed?.extensions?.persona?.baselineFingerprint || "");
  const baselineFromState = parseFingerprint(baselineSerialized);
  const baseline = baselineFromState || fingerprintFromText(auroraEpisodes[0].text);
  const drifts = auroraEpisodes
    .map((episode) => driftScore(baseline, fingerprintFromText(episode.text)))
    .sort((a, b) => a - b);
  const averageDrift = drifts.reduce((sum, value) => sum + value, 0) / drifts.length;
  const p90 = drifts[Math.max(0, Math.ceil(drifts.length * 0.9) - 1)] || averageDrift;
  const pass = p90 < THRESHOLD;

  console.log(
    JSON.stringify(
      {
        ok: pass,
        memoryPath,
        sampleSize: auroraEpisodes.length,
        threshold: THRESHOLD,
        averageDrift: Number(averageDrift.toFixed(4)),
        p90Drift: Number(p90.toFixed(4))
      },
      null,
      2
    )
  );

  if (!pass) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
