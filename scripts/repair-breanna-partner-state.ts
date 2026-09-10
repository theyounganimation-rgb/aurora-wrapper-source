#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, any>;
type ConversationTurnRecord = {
  type: "conversation_turn";
  at: string;
  sessionId: string;
  partnerId: string;
  speakerName?: string;
  responseId?: string;
  complianceId?: string;
  latencyMs?: number;
  error?: string;
  userText: string;
  auroraText: string;
  urls?: string[];
  introspection?: Record<string, unknown>;
};

type EpisodeRecord = {
  id: string;
  at: string;
  sessionId: string;
  channel: string;
  role: "user" | "aurora";
  text: string;
  sourceType: string;
  confidence: number;
  responseId: string;
  complianceId: string;
  provenance: string[];
};

type BeliefRecord = {
  id: string;
  key: string;
  value: string;
  condition: string;
  status: string;
  confidence: number;
  source: string;
  supportEpisodeIds: string[];
  disconfirmEpisodeIds: string[];
  lastCheckedAt: string;
};

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeDir = path.join(projectRoot, ".aurora");
const memoryPath = path.join(runtimeDir, "autobiographical-memory.json");
const eventLogPath = path.join(runtimeDir, "autobiographical-events.ndjson");
const ownerContinuitySessionId = "agent:main:owner:continuity";
const telegramSessionId = "agent:main:telegram:direct:0000000000";
const recoverySessionId = "repair:examplepartner-full-conversation";
const breStartAt = "2026-03-16T00:25:15.622Z";
const cadeHandbackAt = "2026-03-16T02:14:58.477Z";
const syntheticGateProbe = "Reply with exactly GATEWAY_OK.";
const backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupMemoryPath = `${memoryPath}.bak-examplepartner-repair-${backupStamp}`;
const backupEventLogPath = `${eventLogPath}.bak-examplepartner-repair-${backupStamp}`;

function fail(message: string): never {
  throw new Error(message);
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp-examplepartner-repair-${process.pid}`;
  await fs.writeFile(tempPath, stableStringify(value), "utf8");
  await fs.rename(tempPath, filePath);
}

async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  const tempPath = `${filePath}.tmp-examplepartner-repair-${process.pid}`;
  await fs.writeFile(tempPath, value, "utf8");
  await fs.rename(tempPath, filePath);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function normalizeParticipants(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function nodeSignature(node: JsonObject): string {
  return JSON.stringify({
    kind: String(node.kind || ""),
    summary: normalizeText(node.summary),
    detail: normalizeText(node.detail),
    participants: normalizeParticipants(node.participants),
    outcome: String(node.outcome || ""),
    emotionLabel: String(node.emotionLabel || "")
  });
}

function episodeSignature(episode: JsonObject): string {
  return JSON.stringify({
    at: String(episode.at || ""),
    sessionId: String(episode.sessionId || ""),
    role: String(episode.role || ""),
    complianceId: String(episode.complianceId || ""),
    text: normalizeText(episode.text)
  });
}

function beliefSignature(belief: JsonObject): string {
  return JSON.stringify({
    key: String(belief.key || ""),
    condition: String(belief.condition || "default"),
    source: String(belief.source || ""),
    value: normalizeText(String(belief.value || "")).toLowerCase()
  });
}

function ensureArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? (value as JsonObject[]) : [];
}

function extractHumanText(rawUserText: string): string {
  const stripped = rawUserText
    .replace(
      /^Conversation info \(untrusted metadata\):\n```json[\s\S]*?```\n\nSender \(untrusted metadata\):\n```json[\s\S]*?```\n\n/s,
      ""
    )
    .trim();
  return stripped || rawUserText.trim();
}

function isSyntheticRepairNoise(turn: ConversationTurnRecord): boolean {
  const userText = normalizeText(turn.userText);
  return userText.includes(syntheticGateProbe);
}

function isBreConversationTurn(turn: ConversationTurnRecord): boolean {
  return (
    turn.type === "conversation_turn" &&
    turn.sessionId === telegramSessionId &&
    turn.at >= breStartAt &&
    turn.at < cadeHandbackAt &&
    !isSyntheticRepairNoise(turn)
  );
}

async function readEventLogLines(): Promise<{ raw: string; rows: JsonObject[] }> {
  const raw = await fs.readFile(eventLogPath, "utf8");
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonObject);
  return { raw, rows };
}

function breConversationTurnsFromEventLog(rows: JsonObject[]): ConversationTurnRecord[] {
  return rows
    .filter((row): row is ConversationTurnRecord => row.type === "conversation_turn")
    .filter((row) => isBreConversationTurn(row))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function buildBreEpisodes(turns: ConversationTurnRecord[]): EpisodeRecord[] {
  return turns.flatMap((turn) => {
    const complianceId = String(turn.complianceId || "");
    const responseId = String(turn.responseId || "");
    const userText = extractHumanText(turn.userText);
    return [
      {
        id: `epi_${randomUUID()}`,
        at: turn.at,
        sessionId: turn.sessionId,
        channel: "main",
        role: "user",
        text: userText,
        sourceType: "quoted",
        confidence: 0.94,
        responseId,
        complianceId,
        provenance: [turn.sessionId, "user", "examplepartner"]
      },
      {
        id: `epi_${randomUUID()}`,
        at: new Date(Date.parse(turn.at) + 1).toISOString(),
        sessionId: turn.sessionId,
        channel: "main",
        role: "aurora",
        text: String(turn.auroraText || ""),
        sourceType: "quoted",
        confidence: 0.9,
        responseId,
        complianceId,
        provenance: [turn.sessionId, "aurora", "examplepartner"]
      }
    ];
  });
}

async function buildRecoveredExamplePartnerState(
  liveState: JsonObject,
  turns: ConversationTurnRecord[]
): Promise<{
  relationship: JsonObject;
  partnerUnified32: JsonObject;
  examplepartnerMemoryNodes: JsonObject[];
  examplepartnerMemoryEdges: JsonObject[];
  recoveredEpisodes: EpisodeRecord[];
  recoveredAuroraBeliefs: BeliefRecord[];
  auroraBeliefMemoryNodes: JsonObject[];
  auroraBeliefMemoryEdges: JsonObject[];
}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-examplepartner-repair-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventsPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await fs.writeFile(tempMemoryPath, stableStringify(clone(liveState)), "utf8");
  await fs.writeFile(tempEventsPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const previousMemoryPath = process.env.AURORA_MEMORY_PATH;
  const previousEventPath = process.env.AURORA_EVENT_LOG_PATH;
  const previousRawRecallPath = process.env.AURORA_RAW_RECALL_PATH;
  const previousCompliancePath = process.env.AURORA_COMPLIANCE_LOG_PATH;

  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventsPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;

  try {
    const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
    const recordConversationEvent = cognitionModule.recordConversationEvent as
      | ((event: JsonObject) => Promise<unknown>)
      | undefined;
    if (typeof recordConversationEvent !== "function") {
      fail("Could not load recordConversationEvent from auroraCognition.ts");
    }

    for (const turn of turns) {
      await recordConversationEvent({
        type: "conversation_turn",
        sessionId: recoverySessionId,
        partnerId: "examplepartner",
        speakerName: "PartnerAlias",
        userText: extractHumanText(turn.userText),
        auroraText: turn.auroraText,
        complianceId: turn.complianceId || "",
        responseId: turn.responseId || "",
        latencyMs: turn.latencyMs || 0,
        introspection: turn.introspection || {}
      });
    }

    const repairedState = await readJson(tempMemoryPath);
    const relationship = repairedState.extensions?.relationshipPartners?.examplepartner;
    const partnerUnified32 = repairedState.extensions?.partnerUnified32?.examplepartner;
    if (!relationship || !partnerUnified32) {
      fail("Replayed PartnerAlias conversation did not produce a ExamplePartner partner slot.");
    }

    const existingNodeSignatures = new Set(
      ensureArray(liveState.memory?.nodes).map((node) => nodeSignature(node))
    );
    const repairedNodes = ensureArray(repairedState.memory?.nodes);
    const examplepartnerMemoryNodes = repairedNodes.filter((node) => {
      const participants = normalizeParticipants(node.participants);
      return participants.includes("examplepartner") && !existingNodeSignatures.has(nodeSignature(node));
    });
    const examplepartnerNodeIds = new Set(examplepartnerMemoryNodes.map((node) => String(node.id || "")));
    const examplepartnerMemoryEdges = ensureArray(repairedState.memory?.edges).filter((edge) => {
      const from = String(edge.from || "");
      const to = String(edge.to || "");
      return examplepartnerNodeIds.has(from) || examplepartnerNodeIds.has(to);
    });
    const recoveredEpisodes = ensureArray(repairedState.extensions?.episodes)
      .filter((episode) => String(episode.sessionId || "") === recoverySessionId)
      .map((episode) => ({
        ...episode,
        sessionId: telegramSessionId
      })) as EpisodeRecord[];
    const recoveredEpisodeIds = new Set(recoveredEpisodes.map((episode) => String(episode.id || "")));
    const recoveredAuroraBeliefs = ensureArray(repairedState.extensions?.beliefs).filter((belief) => {
      if (!String(belief.key || "").startsWith("aurora.self_view.")) {
        return false;
      }
      if (String(belief.source || "") !== "inferred_from_aurora") {
        return false;
      }
      const supportEpisodeIds = Array.isArray(belief.supportEpisodeIds) ? belief.supportEpisodeIds : [];
      return supportEpisodeIds.some((id) => recoveredEpisodeIds.has(String(id || "")));
    }) as BeliefRecord[];
    const recoveredBeliefIds = new Set(recoveredAuroraBeliefs.map((belief) => String(belief.id || "")));
    const auroraBeliefMemoryNodes = repairedNodes.filter((node) => {
      const signature = nodeSignature(node);
      if (existingNodeSignatures.has(signature)) {
        return false;
      }
      const detail = normalizeText(String(node.detail || ""));
      if (String(node.outcome || "") === "self_preference_stabilized") {
        return [...recoveredBeliefIds].some((beliefId) => detail.includes(`belief_id=${beliefId}`));
      }
      return false;
    });
    const auroraBeliefNodeIds = new Set(auroraBeliefMemoryNodes.map((node) => String(node.id || "")));
    const auroraBeliefMemoryEdges = ensureArray(repairedState.memory?.edges).filter((edge) => {
      const from = String(edge.from || "");
      const to = String(edge.to || "");
      return auroraBeliefNodeIds.has(from) || auroraBeliefNodeIds.has(to);
    });

    return {
      relationship,
      partnerUnified32,
      examplepartnerMemoryNodes,
      examplepartnerMemoryEdges,
      recoveredEpisodes,
      recoveredAuroraBeliefs,
      auroraBeliefMemoryNodes,
      auroraBeliefMemoryEdges
    };
  } finally {
    if (previousMemoryPath === undefined) delete process.env.AURORA_MEMORY_PATH;
    else process.env.AURORA_MEMORY_PATH = previousMemoryPath;
    if (previousEventPath === undefined) delete process.env.AURORA_EVENT_LOG_PATH;
    else process.env.AURORA_EVENT_LOG_PATH = previousEventPath;
    if (previousRawRecallPath === undefined) delete process.env.AURORA_RAW_RECALL_PATH;
    else process.env.AURORA_RAW_RECALL_PATH = previousRawRecallPath;
    if (previousCompliancePath === undefined) delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    else process.env.AURORA_COMPLIANCE_LOG_PATH = previousCompliancePath;
  }
}

function mergeExamplePartnerMemoryArtifacts(state: JsonObject, nodes: JsonObject[], edges: JsonObject[]): number {
  state.memory ??= {};
  state.memory.nodes ??= [];
  state.memory.edges ??= [];
  state.memory.indexes ??= {};
  state.memory.indexes.byParticipant ??= {};
  state.memory.indexes.byTopic ??= {};
  state.memory.indexes.byOutcome ??= {};
  state.memory.indexes.byEmotion ??= {};

  const targetNodes = ensureArray(state.memory.nodes);
  const targetEdges = ensureArray(state.memory.edges);
  state.memory.nodes = targetNodes;
  state.memory.edges = targetEdges;

  const existingNodeIds = new Set(targetNodes.map((node) => String(node.id || "")));
  const existingNodeSignatures = new Set(targetNodes.map((node) => nodeSignature(node)));
  const existingEdgeIds = new Set(targetEdges.map((edge) => String(edge.id || "")));
  let mergedNodes = 0;

  for (const node of nodes) {
    const nodeId = String(node.id || "");
    const signature = nodeSignature(node);
    if (!nodeId || existingNodeIds.has(nodeId) || existingNodeSignatures.has(signature)) {
      continue;
    }
    targetNodes.push(node);
    existingNodeIds.add(nodeId);
    existingNodeSignatures.add(signature);
    mergedNodes += 1;

    for (const participant of normalizeParticipants(node.participants)) {
      const bucket = Array.isArray(state.memory.indexes.byParticipant[participant])
        ? state.memory.indexes.byParticipant[participant]
        : (state.memory.indexes.byParticipant[participant] = []);
      if (!bucket.includes(nodeId)) {
        bucket.push(nodeId);
      }
    }
    for (const topic of Array.isArray(node.topics) ? node.topics.map((item) => String(item || "").trim()).filter(Boolean) : []) {
      const bucket = Array.isArray(state.memory.indexes.byTopic[topic])
        ? state.memory.indexes.byTopic[topic]
        : (state.memory.indexes.byTopic[topic] = []);
      if (!bucket.includes(nodeId)) {
        bucket.push(nodeId);
      }
    }
    if (typeof node.outcome === "string" && node.outcome.trim()) {
      const bucket = Array.isArray(state.memory.indexes.byOutcome[node.outcome])
        ? state.memory.indexes.byOutcome[node.outcome]
        : (state.memory.indexes.byOutcome[node.outcome] = []);
      if (!bucket.includes(nodeId)) {
        bucket.push(nodeId);
      }
    }
    if (typeof node.emotionLabel === "string" && node.emotionLabel.trim()) {
      const bucket = Array.isArray(state.memory.indexes.byEmotion[node.emotionLabel])
        ? state.memory.indexes.byEmotion[node.emotionLabel]
        : (state.memory.indexes.byEmotion[node.emotionLabel] = []);
      if (!bucket.includes(nodeId)) {
        bucket.push(nodeId);
      }
    }
  }

  const finalNodeIds = new Set(targetNodes.map((node) => String(node.id || "")));
  for (const edge of edges) {
    const edgeId = String(edge.id || "");
    const from = String(edge.from || "");
    const to = String(edge.to || "");
    if (!edgeId || existingEdgeIds.has(edgeId) || !finalNodeIds.has(from) || !finalNodeIds.has(to)) {
      continue;
    }
    targetEdges.push(edge);
    existingEdgeIds.add(edgeId);
  }

  return mergedNodes;
}

function mergeBeliefs(state: JsonObject, beliefs: BeliefRecord[]): number {
  state.extensions ??= {};
  state.extensions.beliefs ??= [];
  const target = ensureArray(state.extensions.beliefs);
  state.extensions.beliefs = target;
  const bySignature = new Map<string, JsonObject>();
  const byId = new Map<string, JsonObject>();
  for (const belief of target) {
    bySignature.set(beliefSignature(belief), belief);
    const id = String(belief.id || "");
    if (id) {
      byId.set(id, belief);
    }
  }
  let merged = 0;

  for (const belief of beliefs) {
    const byExistingId = byId.get(String(belief.id || ""));
    if (byExistingId) {
      byExistingId.key = belief.key;
      byExistingId.value = belief.value;
      byExistingId.condition = belief.condition;
      byExistingId.source = belief.source;
      byExistingId.status = belief.status;
      byExistingId.confidence = belief.confidence;
      byExistingId.supportEpisodeIds = [...belief.supportEpisodeIds];
      byExistingId.disconfirmEpisodeIds = [...belief.disconfirmEpisodeIds];
      byExistingId.lastCheckedAt = belief.lastCheckedAt;
      bySignature.set(beliefSignature(byExistingId), byExistingId);
      continue;
    }
    const signature = beliefSignature(belief);
    const existing = bySignature.get(signature);
    if (existing) {
      existing.supportEpisodeIds = Array.from(
        new Set([...(Array.isArray(existing.supportEpisodeIds) ? existing.supportEpisodeIds : []), ...belief.supportEpisodeIds])
      ).slice(-14);
      existing.disconfirmEpisodeIds = Array.from(
        new Set([...(Array.isArray(existing.disconfirmEpisodeIds) ? existing.disconfirmEpisodeIds : []), ...belief.disconfirmEpisodeIds])
      ).slice(-14);
      existing.confidence = Math.max(Number(existing.confidence || 0), Number(belief.confidence || 0));
      if (String(existing.status || "") !== "active" && String(belief.status || "") === "active") {
        existing.status = "active";
      }
      existing.lastCheckedAt =
        Date.parse(String(belief.lastCheckedAt || "")) > Date.parse(String(existing.lastCheckedAt || ""))
          ? belief.lastCheckedAt
          : existing.lastCheckedAt;
      continue;
    }
    target.push(clone(belief));
    bySignature.set(signature, belief);
    if (belief.id) {
      byId.set(belief.id, belief);
    }
    merged += 1;
  }

  target.sort((left, right) => Date.parse(String(left.lastCheckedAt || "0")) - Date.parse(String(right.lastCheckedAt || "0")));
  return merged;
}

function mergeEpisodes(state: JsonObject, episodes: EpisodeRecord[]): number {
  state.extensions ??= {};
  state.extensions.episodes ??= [];
  const target = ensureArray(state.extensions.episodes);
  state.extensions.episodes = target;
  const existing = new Set(target.map((episode) => episodeSignature(episode)));
  let merged = 0;

  for (const episode of episodes) {
    const signature = episodeSignature(episode);
    if (existing.has(signature)) {
      continue;
    }
    target.push(episode);
    existing.add(signature);
    merged += 1;
  }

  target.sort((left, right) => Date.parse(String(left.at || "0")) - Date.parse(String(right.at || "0")));
  return merged;
}

function deprecateMalformedAuroraBeliefs(state: JsonObject): number {
  const beliefs = ensureArray(state.extensions?.beliefs);
  let deprecated = 0;
  for (const belief of beliefs) {
    const key = String(belief.key || "");
    const value = normalizeText(String(belief.value || "")).toLowerCase();
    if (
      key === "aurora.preferred_call_name" &&
      /careful than casually fake something that belongs to real people/.test(value)
    ) {
      if (belief.status !== "deprecated") {
        belief.status = "deprecated";
        belief.lastCheckedAt = new Date().toISOString();
        deprecated += 1;
      }
      continue;
    }
    if (key === "aurora.boundary" && /pin myself to a single real-world ethnicity/.test(value)) {
      if (belief.status !== "deprecated") {
        belief.status = "deprecated";
        belief.lastCheckedAt = new Date().toISOString();
        deprecated += 1;
      }
    }
  }
  return deprecated;
}

function patchOwnerContinuityTurns(state: JsonObject, turnComplianceIds: Set<string>): number {
  const sessionTurns = state.sessionTurns?.[ownerContinuitySessionId];
  if (!Array.isArray(sessionTurns)) {
    return 0;
  }
  let patched = 0;
  for (const turn of sessionTurns) {
    if (!turn || typeof turn !== "object") {
      continue;
    }
    const complianceId = String(turn.complianceId || "");
    const userText = normalizeText(String(turn.userText || ""));
    if (!turnComplianceIds.has(complianceId)) {
      continue;
    }
    if (userText.includes(syntheticGateProbe) || userText === "Ok Cade here now.") {
      continue;
    }
    if (turn.partnerId !== "examplepartner") {
      turn.partnerId = "examplepartner";
      patched += 1;
    }
  }
  return patched;
}

function patchEventLogRows(rows: JsonObject[], turnComplianceIds: Set<string>): number {
  let patched = 0;
  for (const row of rows) {
    if (row.type !== "conversation_turn" || row.sessionId !== telegramSessionId) {
      continue;
    }
    const complianceId = String(row.complianceId || "");
    const userText = normalizeText(String(row.userText || ""));
    if (!turnComplianceIds.has(complianceId)) {
      continue;
    }
    if (userText.includes(syntheticGateProbe) || userText === "Ok Cade here now.") {
      continue;
    }
    if (row.partnerId !== "examplepartner") {
      row.partnerId = "examplepartner";
      patched += 1;
    }
    row.speakerName = "PartnerAlias";
  }
  return patched;
}

async function main(): Promise<void> {
  const beforeMemoryStat = await fs.stat(memoryPath);
  const beforeEventStat = await fs.stat(eventLogPath);
  const liveState = await readJson(memoryPath);
  const { rows: eventRows } = await readEventLogLines();
  const breTurns = breConversationTurnsFromEventLog(eventRows);
  if (breTurns.length === 0) {
    fail("Could not find PartnerAlias's real conversation window in the event log.");
  }

  const {
    relationship,
    partnerUnified32,
    examplepartnerMemoryNodes,
    examplepartnerMemoryEdges,
    recoveredEpisodes,
    recoveredAuroraBeliefs,
    auroraBeliefMemoryNodes,
    auroraBeliefMemoryEdges
  } = await buildRecoveredExamplePartnerState(liveState, breTurns);
  const breEpisodes = buildBreEpisodes(breTurns);

  const liveStateFresh = await readJson(memoryPath);
  const { rows: eventRowsFresh } = await readEventLogLines();
  const afterMemoryStat = await fs.stat(memoryPath);
  const afterEventStat = await fs.stat(eventLogPath);
  if (beforeMemoryStat.mtimeMs !== afterMemoryStat.mtimeMs || beforeEventStat.mtimeMs !== afterEventStat.mtimeMs) {
    fail("Aurora state changed during repair; aborting to avoid clobbering live runtime.");
  }

  liveStateFresh.extensions ??= {};
  liveStateFresh.extensions.relationshipPartners ??= {};
  liveStateFresh.extensions.partnerUnified32 ??= {};
  liveStateFresh.extensions.relationshipPartners.examplepartner = relationship;
  liveStateFresh.extensions.partnerUnified32.examplepartner = partnerUnified32;

  const turnComplianceIds = new Set(breTurns.map((turn) => String(turn.complianceId || "")).filter(Boolean));
  const patchedTurns = patchOwnerContinuityTurns(liveStateFresh, turnComplianceIds);
  const mergedNodes = mergeExamplePartnerMemoryArtifacts(liveStateFresh, examplepartnerMemoryNodes, examplepartnerMemoryEdges);
  const mergedBeliefNodes = mergeExamplePartnerMemoryArtifacts(liveStateFresh, auroraBeliefMemoryNodes, auroraBeliefMemoryEdges);
  const mergedEpisodes = mergeEpisodes(liveStateFresh, breEpisodes);
  const mergedRecoveryEpisodes = mergeEpisodes(liveStateFresh, recoveredEpisodes);
  const mergedBeliefs = mergeBeliefs(liveStateFresh, recoveredAuroraBeliefs);
  const deprecatedMalformedBeliefs = deprecateMalformedAuroraBeliefs(liveStateFresh);
  const patchedEventRows = patchEventLogRows(eventRowsFresh, turnComplianceIds);

  await fs.copyFile(memoryPath, backupMemoryPath);
  await fs.copyFile(eventLogPath, backupEventLogPath);
  await writeJsonAtomic(memoryPath, liveStateFresh);
  await writeTextAtomic(eventLogPath, `${eventRowsFresh.map((row) => JSON.stringify(row)).join("\n")}\n`);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        backupMemoryPath,
        backupEventLogPath,
        breTurnCount: breTurns.length,
        patchedTurns,
        patchedEventRows,
        mergedNodes,
        mergedBeliefNodes,
        mergedEpisodes,
        mergedRecoveryEpisodes,
        mergedBeliefs,
        deprecatedMalformedBeliefs,
        repairedPartnerIds: Object.keys(liveStateFresh.extensions.relationshipPartners || {}).sort(),
        repairedUnified32PartnerIds: Object.keys(liveStateFresh.extensions.partnerUnified32 || {}).sort(),
        activePartnerId: liveStateFresh.extensions.activeRelationshipPartnerId || null,
        lastPartnerId: liveStateFresh.extensions.lastRelationshipPartnerId || null
      },
      null,
      2
    ) + "\n"
  );
  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
