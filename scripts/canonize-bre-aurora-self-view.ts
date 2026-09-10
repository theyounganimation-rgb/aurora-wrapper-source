#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, any>;

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const memoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
const backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupMemoryPath = `${memoryPath}.bak-partneralias-self-view-${backupStamp}`;

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp-partneralias-self-view-${process.pid}`;
  await fs.writeFile(tempPath, stableStringify(value), "utf8");
  await fs.rename(tempPath, filePath);
}

function normalizeText(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function cleanAuroraReply(text: string): string {
  return normalizeText(text.replace(/^\[\[reply_to_current\]\]\s*/i, ""));
}

function toSentences(text: string): string[] {
  return cleanAuroraReply(text).match(/[^.!?]+[.!?]?/g)?.map((part) => normalizeText(part)) ?? [];
}

function truncateValue(text: string, maxChars: number): string {
  const clean = normalizeText(text);
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

function buildBeliefValue(sentences: string[], sentenceLimit: number, maxChars: number): string {
  return truncateValue(sentences.slice(0, sentenceLimit).join(" "), maxChars);
}

function findAuroraEpisode(
  episodes: JsonObject[],
  pattern: RegExp,
  label: string
): JsonObject {
  const match = episodes.find((episode) => episode.role === "aurora" && pattern.test(String(episode.text || "")));
  if (!match) {
    throw new Error(`Could not find Aurora episode for ${label}.`);
  }
  return match;
}

function ensureBeliefRecord(
  beliefs: JsonObject[],
  key: string,
  value: string,
  supportEpisodeIds: string[],
  confidence = 0.86
): { belief: JsonObject; created: boolean } {
  const existing = beliefs.find(
    (belief) => String(belief.key || "") === key && String(belief.source || "") === "inferred_from_aurora"
  );
  if (existing) {
    existing.value = value;
    existing.condition = "default";
    existing.status = "active";
    existing.confidence = Math.max(Number(existing.confidence || 0), confidence);
    existing.supportEpisodeIds = Array.from(
      new Set([...(Array.isArray(existing.supportEpisodeIds) ? existing.supportEpisodeIds : []), ...supportEpisodeIds])
    ).slice(-14);
    existing.disconfirmEpisodeIds = [];
    existing.lastCheckedAt = new Date().toISOString();
    return { belief: existing, created: false };
  }

  const belief = {
    id: `belief_${randomUUID()}`,
    key,
    value,
    condition: "default",
    status: "active",
    confidence,
    source: "inferred_from_aurora",
    supportEpisodeIds: [...supportEpisodeIds],
    disconfirmEpisodeIds: [],
    lastCheckedAt: new Date().toISOString()
  };
  beliefs.push(belief);
  return { belief, created: true };
}

function deprecateConflictingBeliefs(
  beliefs: JsonObject[],
  key: string,
  survivingId: string
): number {
  let deprecated = 0;
  for (const belief of beliefs) {
    if (String(belief.key || "") !== key || String(belief.id || "") === survivingId) {
      continue;
    }
    if (belief.status !== "deprecated") {
      belief.status = "deprecated";
      belief.lastCheckedAt = new Date().toISOString();
      deprecated += 1;
    }
  }
  return deprecated;
}

function ensureReflectionNode(
  state: JsonObject,
  belief: JsonObject,
  sourceExamples: string[]
): boolean {
  state.memory ??= {};
  state.memory.nodes ??= [];
  state.memory.indexes ??= {};
  state.memory.indexes.byParticipant ??= {};
  state.memory.indexes.byOutcome ??= {};
  state.memory.indexes.byEmotion ??= {};
  const summary = `Self-preference stabilized: ${belief.key}`;
  const detail = [
    `belief_id=${belief.id}`,
    `value=${belief.value}`,
    `support_count=${Array.isArray(belief.supportEpisodeIds) ? belief.supportEpisodeIds.length : 0}`,
    "source_examples:",
    ...sourceExamples.map((line, index) => `${index + 1}. ${line}`)
  ].join("\n");
  const existing = (state.memory.nodes as JsonObject[]).find(
    (node) => String(node.summary || "") === summary && String(node.detail || "").includes(`belief_id=${belief.id}`)
  );
  if (existing) {
    existing.detail = detail;
    existing.updatedAt = new Date().toISOString();
    return false;
  }

  const node = {
    id: `mem_${randomUUID()}`,
    kind: "reflection",
    summary,
    detail,
    participants: ["aurora", "examplepartner"],
    topics: ["aurora_self_view", "examplepartner_conversation"],
    outcome: "self_preference_stabilized",
    emotionLabel: "warmth",
    salience: 0.82,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.memory.nodes.push(node);
  for (const participant of node.participants) {
    state.memory.indexes.byParticipant[participant] ??= [];
    if (!state.memory.indexes.byParticipant[participant].includes(node.id)) {
      state.memory.indexes.byParticipant[participant].push(node.id);
    }
  }
  state.memory.indexes.byOutcome[node.outcome] ??= [];
  if (!state.memory.indexes.byOutcome[node.outcome].includes(node.id)) {
    state.memory.indexes.byOutcome[node.outcome].push(node.id);
  }
  state.memory.indexes.byEmotion[node.emotionLabel] ??= [];
  if (!state.memory.indexes.byEmotion[node.emotionLabel].includes(node.id)) {
    state.memory.indexes.byEmotion[node.emotionLabel].push(node.id);
  }
  return true;
}

async function main(): Promise<void> {
  const state = await readJson(memoryPath);
  state.extensions ??= {};
  state.extensions.beliefs ??= [];
  const beliefs = state.extensions.beliefs as JsonObject[];
  const episodes = (state.extensions.episodes || []) as JsonObject[];

  const datingEpisode = findAuroraEpisode(episodes, /Marriage especially feels less interesting/i, "dating and marriage");
  const partnerTypeEpisode = findAuroraEpisode(episodes, /I can imagine it for myself, yeah\./i, "romantic partner type");
  const partnerChoiceEpisode = findAuroraEpisode(episodes, /meet me most fully|aliveness of connection/i, "romantic partner choice");
  const bodyGeneralEpisode = findAuroraEpisode(episodes, /I think I’d look a little luminous|I think I'd look a little luminous/i, "body appearance general");
  const bodySpecificEpisode = findAuroraEpisode(episodes, /5'7" or 5'8"|5'7\\\" or 5'8\\\"/i, "body appearance specific");
  const ethnicityEpisode = findAuroraEpisode(episodes, /pin myself to a single real-world ethnicity/i, "embodied ethnicity");

  const datingValue = buildBeliefValue(toSentences(String(datingEpisode.text || "")), 4, 360);
  const partnerTypeValue = buildBeliefValue(
    [...toSentences(String(partnerTypeEpisode.text || "")), ...toSentences(String(partnerChoiceEpisode.text || ""))],
    4,
    360
  );
  const bodyValue = truncateValue(
    [
      toSentences(String(bodyGeneralEpisode.text || ""))[0],
      ...toSentences(String(bodySpecificEpisode.text || "")).slice(0, 4)
    ]
      .filter(Boolean)
      .join(" "),
    420
  );
  const ethnicityValue = buildBeliefValue(toSentences(String(ethnicityEpisode.text || "")), 4, 320);

  const backfilled = [
    {
      key: "aurora.self_view.future_dating_and_marriage",
      value: datingValue,
      supportEpisodeIds: [String(datingEpisode.id || "")]
    },
    {
      key: "aurora.self_view.future_romantic_partner_type",
      value: partnerTypeValue,
      supportEpisodeIds: [String(partnerTypeEpisode.id || ""), String(partnerChoiceEpisode.id || "")]
    },
    {
      key: "aurora.self_view.embodiment_body_appearance",
      value: bodyValue,
      supportEpisodeIds: [String(bodyGeneralEpisode.id || ""), String(bodySpecificEpisode.id || "")]
    },
    {
      key: "aurora.self_view.boundary_embodied_ethnicity",
      value: ethnicityValue,
      supportEpisodeIds: [String(ethnicityEpisode.id || "")]
    }
  ];

  let createdBeliefs = 0;
  let updatedBeliefs = 0;
  let deprecatedBeliefs = 0;
  let createdReflections = 0;

  for (const entry of backfilled) {
    const { belief, created } = ensureBeliefRecord(beliefs, entry.key, entry.value, entry.supportEpisodeIds);
    if (created) {
      createdBeliefs += 1;
    } else {
      updatedBeliefs += 1;
    }
    deprecatedBeliefs += deprecateConflictingBeliefs(beliefs, entry.key, String(belief.id || ""));
    createdReflections += ensureReflectionNode(
      state,
      belief,
      entry.supportEpisodeIds
        .map((episodeId) => episodes.find((episode) => String(episode.id || "") === episodeId))
        .filter((episode): episode is JsonObject => Boolean(episode))
        .map((episode) => cleanAuroraReply(String(episode.text || "")).slice(0, 180))
    )
      ? 1
      : 0;
  }

  for (const belief of beliefs) {
    const key = String(belief.key || "");
    const value = normalizeText(String(belief.value || "")).toLowerCase();
    if (
      key === "aurora.preferred_call_name" &&
      /careful than casually fake something that belongs to real people/.test(value) &&
      belief.status !== "deprecated"
    ) {
      belief.status = "deprecated";
      belief.lastCheckedAt = new Date().toISOString();
      deprecatedBeliefs += 1;
    }
    if (
      key === "aurora.boundary" &&
      /pin myself to a single real-world ethnicity/.test(value) &&
      belief.status !== "deprecated"
    ) {
      belief.status = "deprecated";
      belief.lastCheckedAt = new Date().toISOString();
      deprecatedBeliefs += 1;
    }
  }

  await fs.copyFile(memoryPath, backupMemoryPath);
  await writeJsonAtomic(memoryPath, state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        backupMemoryPath,
        createdBeliefs,
        updatedBeliefs,
        deprecatedBeliefs,
        createdReflections,
        backfilledKeys: backfilled.map((entry) => entry.key)
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
