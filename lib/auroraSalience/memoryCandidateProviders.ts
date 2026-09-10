import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import type {
  MemoryCandidate,
  MemoryCandidateProvider,
  MemoryCandidateProviderInput,
  MemoryCandidateProviderKind,
  MemoryCandidateProviderResult,
  MemoryCandidateShadowComparison,
  MemoryCandidateTransportHealth
} from "./schema";

type InferLinkedEntities = (text: string) => string[];

type WorkspaceFileProviderOptions = {
  workspaceRoot: string;
  inferLinkedEntities: InferLinkedEntities;
};

type OpenClawMemorySearchProviderOptions = {
  workspaceRoot: string;
  inferLinkedEntities: InferLinkedEntities;
  search?: OpenClawMemorySearchFunction | null;
};

type RetrievalOptions = {
  preferredProvider: MemoryCandidateProviderKind;
  workspaceRoot: string;
  inferLinkedEntities: InferLinkedEntities;
};

type OpenClawMemorySearchFunction = (
  input: MemoryCandidateProviderInput
) => Promise<MemoryCandidate[]>;

type SearchableShadowDocument = {
  source: string;
  filePath: string;
  content: string;
  updatedAt: string | null;
};

let registeredOpenClawMemorySearchProvider: OpenClawMemorySearchFunction | null = null;
const execFileAsync = promisify(execFile);

type OpenClawMemorySearchHit = {
  path?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  snippet?: unknown;
  score?: unknown;
  timestamp?: unknown;
  linkedEntities?: unknown;
};

type OpenClawMemorySearchEnvelope = {
  results?: unknown;
  disabled?: unknown;
  error?: unknown;
};

type OpenClawMemoryStatusEnvelope = Array<{
  agentId?: unknown;
  status?: {
    files?: unknown;
    chunks?: unknown;
    dirty?: unknown;
    dbPath?: unknown;
    provider?: unknown;
    model?: unknown;
  };
  embeddingProbe?: {
    ok?: unknown;
    error?: unknown;
  };
  scan?: {
    totalFiles?: unknown;
  };
}>;

type MemorySearchHealthGateState = {
  consecutiveFailures: number;
  lastFailureAtMs: number;
  lastFailureHealth: MemoryCandidateTransportHealth | null;
  lastFailureDetail?: string;
  cooldownUntilMs: number;
  lastProbeAtMs: number;
};

const RETRIEVAL_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "around",
  "do",
  "does",
  "feels",
  "for",
  "have",
  "how",
  "i",
  "inside",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "should",
  "still",
  "the",
  "next",
  "about",
  "active",
  "matter",
  "mattered",
  "making",
  "to",
  "us",
  "what",
  "you"
]);

const GENERIC_ENTITY_TOKENS = new Set(["cade", "aurora"]);

class OpenClawMemorySearchProviderError extends Error {
  readonly health: MemoryCandidateTransportHealth;

  constructor(health: MemoryCandidateTransportHealth, message: string) {
    super(message);
    this.name = "OpenClawMemorySearchProviderError";
    this.health = health;
  }
}

const memorySearchHealthGateState: MemorySearchHealthGateState = {
  consecutiveFailures: 0,
  lastFailureAtMs: 0,
  lastFailureHealth: null,
  cooldownUntilMs: 0,
  lastProbeAtMs: 0
};

export function getMemorySearchHealthGateSnapshot(now = Date.now()): {
  active: boolean;
  cooldownUntil: string | null;
  lastFailureHealth: MemoryCandidateTransportHealth | null;
  lastFailureDetail?: string;
  consecutiveFailures: number;
} {
  return {
    active: memorySearchHealthGateState.cooldownUntilMs > now,
    cooldownUntil:
      memorySearchHealthGateState.cooldownUntilMs > 0
        ? new Date(memorySearchHealthGateState.cooldownUntilMs).toISOString()
        : null,
    lastFailureHealth: memorySearchHealthGateState.lastFailureHealth,
    ...(memorySearchHealthGateState.lastFailureDetail
      ? { lastFailureDetail: memorySearchHealthGateState.lastFailureDetail }
      : {}),
    consecutiveFailures: memorySearchHealthGateState.consecutiveFailures
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function candidateId(source: string, seed: string): string {
  return createHash("sha1").update(`${source}:${seed}`).digest("hex").slice(0, 12);
}

function normalizeEntityValue(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueEntities(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeEntityValue(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeFailureDetail(detail: string | undefined | null, maxLen = 220): string | undefined {
  const normalized = normalizeText(detail ?? "").slice(0, maxLen);
  return normalized || undefined;
}

function envInt(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function expandRetrievalToken(token: string): string[] {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  const variants = new Set<string>([normalized]);
  if (normalized.length > 4 && normalized.endsWith("ies")) {
    variants.add(`${normalized.slice(0, -3)}y`);
  }
  if (normalized.length > 3 && normalized.endsWith("s")) {
    variants.add(normalized.slice(0, -1));
  }
  if (normalized.length > 4 && normalized.endsWith("ed")) {
    variants.add(normalized.slice(0, -2));
  }
  if (normalized.length > 5 && normalized.endsWith("ing")) {
    variants.add(normalized.slice(0, -3));
  }
  if (normalized.length > 4 && normalized.endsWith("e")) {
    variants.add(normalized.slice(0, -1));
  }
  return [...variants].filter((value) => value.length >= 2 && !RETRIEVAL_STOPWORDS.has(value));
}

function retrievalTokens(text: string): string[] {
  const tokens = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return [...new Set(tokens.flatMap((token) => expandRetrievalToken(token)))];
}

function overlapScore(target: Set<string>, query: Set<string>): number {
  if (query.size === 0 || target.size === 0) {
    return 0;
  }
  let matches = 0;
  for (const token of query) {
    if (target.has(token)) {
      matches += 1;
    }
  }
  return matches / query.size;
}

function rankWorkspaceCandidates(
  candidates: MemoryCandidate[],
  input: MemoryCandidateProviderInput
): MemoryCandidate[] {
  const queryTokens = new Set(retrievalTokens(input.query));
  const specificEntityTokens = new Set(
    uniqueEntities(input.linkedEntities).filter((entity) => !GENERIC_ENTITY_TOKENS.has(entity))
  );
  const genericEntityTokens = new Set(
    uniqueEntities(input.linkedEntities).filter((entity) => GENERIC_ENTITY_TOKENS.has(entity))
  );

  return candidates
    .map((candidate, index) => {
      const summaryTokens = new Set(retrievalTokens(candidate.summary));
      const textTokens = new Set(retrievalTokens(candidate.text));
      const linkedEntityTokens = new Set(candidate.linkedEntities.map((entity) => entity.toLowerCase()));
      const summaryOverlap = overlapScore(summaryTokens, queryTokens);
      const textOverlap = overlapScore(textTokens, queryTokens);
      const specificEntityOverlap = overlapScore(linkedEntityTokens, specificEntityTokens);
      const genericEntityOverlap = overlapScore(linkedEntityTokens, genericEntityTokens);
      const score =
        summaryOverlap * 0.62 +
        textOverlap * 0.22 +
        specificEntityOverlap * 0.12 +
        genericEntityOverlap * 0.04;
      const timestampScore = candidate.timestamp ? Date.parse(candidate.timestamp) || 0 : 0;
      return {
        candidate,
        index,
        score,
        timestampScore
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.timestampScore !== left.timestampScore) {
        return right.timestampScore - left.timestampScore;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.candidate);
}

function openClawMemorySearchBinary(): string {
  return process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN?.trim() || "openclaw";
}

function openClawMemorySearchAgentId(): string {
  return process.env.AURORA_OPENCLAW_MEMORY_SEARCH_AGENT_ID?.trim() || "main";
}

function openClawMemorySearchTimeoutMs(): number {
  const raw = Number.parseInt(process.env.AURORA_OPENCLAW_MEMORY_SEARCH_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(raw) || raw < 500) {
    return 8_000;
  }
  return raw;
}

function openClawMemoryStatusTimeoutMs(): number {
  return envInt("AURORA_OPENCLAW_MEMORY_STATUS_TIMEOUT_MS", 12_000);
}

function openClawMemorySearchFailureWindowMs(): number {
  return envInt("AURORA_OPENCLAW_MEMORY_SEARCH_FAILURE_WINDOW_MS", 60_000);
}

function openClawMemorySearchFailureThreshold(): number {
  return envInt("AURORA_OPENCLAW_MEMORY_SEARCH_FAILURE_THRESHOLD", 2);
}

function openClawMemorySearchCooldownMs(): number {
  return envInt("AURORA_OPENCLAW_MEMORY_SEARCH_COOLDOWN_MS", 300_000);
}

function openClawMemorySearchHealthProbeTtlMs(): number {
  return envInt("AURORA_OPENCLAW_MEMORY_SEARCH_HEALTH_PROBE_TTL_MS", 60_000);
}

function shouldForceHealthProbe(): boolean {
  return process.env.AURORA_OPENCLAW_MEMORY_SEARCH_FORCE_HEALTH_PROBE === "1";
}

function shouldSkipStatusProbeForCustomBinary(): boolean {
  return Boolean(process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN?.trim()) && !shouldForceHealthProbe();
}

function openClawSearchFailure(stderr: string): boolean {
  const message = stderr.toLowerCase();
  return (
    message.includes("memory search failed") ||
    message.includes("sync failed") ||
    message.includes("database is not open") ||
    message.includes("memory search unavailable") ||
    message.includes("sqlite-vec unavailable") ||
    message.includes("out of memory")
  );
}

function candidatePreview(candidates: MemoryCandidate[], limit = 5): string[] {
  return candidates
    .slice(0, limit)
    .map((candidate) => normalizeText(`[${candidate.source}] ${candidate.summary}`).slice(0, 220));
}

function candidateOverlapKey(candidate: MemoryCandidate): string {
  return `${candidate.source}:${candidate.summary.toLowerCase()}`;
}

function buildShadowComparison(
  primaryCandidates: MemoryCandidate[],
  baseline: MemoryCandidateProviderResult
): MemoryCandidateShadowComparison {
  const primaryKeys = new Set(primaryCandidates.map((candidate) => candidateOverlapKey(candidate)));
  const overlapCount = baseline.candidates.reduce(
    (count, candidate) => count + (primaryKeys.has(candidateOverlapKey(candidate)) ? 1 : 0),
    0
  );
  return {
    baselineProvider: "workspace_files",
    baselineCandidatePoolSize: baseline.candidatePoolSize,
    baselinePreview: candidatePreview(baseline.candidates),
    primaryPreview: candidatePreview(primaryCandidates),
    overlapCount
  };
}

function describeCooldown(detail: string | undefined, untilMs: number): string {
  const untilIso = new Date(untilMs).toISOString();
  const prefix = `OpenClaw memory-search backend unhealthy until ${untilIso}.`;
  return normalizeFailureDetail(detail ? `${prefix} Last failure: ${detail}` : prefix) ?? prefix;
}

function recordMemorySearchFailure(health: MemoryCandidateTransportHealth, detail?: string, immediate = false): void {
  const now = Date.now();
  const withinWindow = now - memorySearchHealthGateState.lastFailureAtMs <= openClawMemorySearchFailureWindowMs();
  memorySearchHealthGateState.consecutiveFailures = withinWindow
    ? memorySearchHealthGateState.consecutiveFailures + 1
    : 1;
  memorySearchHealthGateState.lastFailureAtMs = now;
  memorySearchHealthGateState.lastFailureHealth = health;
  memorySearchHealthGateState.lastFailureDetail = normalizeFailureDetail(detail);
  if (immediate || memorySearchHealthGateState.consecutiveFailures >= openClawMemorySearchFailureThreshold()) {
    memorySearchHealthGateState.cooldownUntilMs = now + openClawMemorySearchCooldownMs();
  }
}

function clearMemorySearchFailureState(): void {
  memorySearchHealthGateState.consecutiveFailures = 0;
  memorySearchHealthGateState.lastFailureAtMs = 0;
  memorySearchHealthGateState.lastFailureHealth = null;
  memorySearchHealthGateState.lastFailureDetail = undefined;
  memorySearchHealthGateState.cooldownUntilMs = 0;
}

function classifyOpenClawMemorySearchError(error: unknown): {
  health: MemoryCandidateTransportHealth;
  detail?: string;
} {
  if (error instanceof OpenClawMemorySearchProviderError) {
    return {
      health: error.health,
      detail: normalizeFailureDetail(error.message)
    };
  }

  const candidateError = error as Partial<NodeJS.ErrnoException> & {
    stderr?: unknown;
    code?: unknown;
    killed?: unknown;
    signal?: unknown;
  };
  const stderr = typeof candidateError.stderr === "string" ? normalizeFailureDetail(candidateError.stderr) : undefined;
  const message = normalizeFailureDetail(
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error)
  );
  const lowered = `${stderr ?? ""} ${message ?? ""}`.toLowerCase();
  const code = typeof candidateError.code === "string" ? candidateError.code : undefined;

  if (code === "ENOENT") {
    return {
      health: "cli_unavailable",
      detail: normalizeFailureDetail(`OpenClaw memory-search CLI unavailable: ${openClawMemorySearchBinary()}`)
    };
  }

  if (
    code === "ETIMEDOUT" ||
    lowered.includes("timed out") ||
    lowered.includes("timeout") ||
    (candidateError.killed === true && candidateError.signal === "SIGTERM")
  ) {
    return {
      health: "timeout",
      detail: normalizeFailureDetail(
        stderr ?? `OpenClaw memory-search timed out after ${openClawMemorySearchTimeoutMs()}ms`
      )
    };
  }

  if (
    lowered.includes("invalid json") ||
    lowered.includes("non-object json payload") ||
    lowered.includes("invalid results payload")
  ) {
    return {
      health: "malformed_output",
      detail: stderr ?? message
    };
  }

  if (lowered.includes("no usable memory hits") || lowered.includes("junk output")) {
    return {
      health: "junk_output",
      detail: stderr ?? message
    };
  }

  return {
    health: "transport_error",
    detail: stderr ?? message
  };
}

async function runOpenClawMemoryStatusCli(workspaceRoot: string): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(
    openClawMemorySearchBinary(),
    [
      "memory",
      "status",
      "--agent",
      openClawMemorySearchAgentId(),
      "--deep",
      "--json"
    ],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: openClawMemoryStatusTimeoutMs(),
      env: process.env
    }
  );
}

function parseOpenClawMemoryStatusEnvelope(stdout: string): OpenClawMemoryStatusEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new OpenClawMemorySearchProviderError(
      "malformed_output",
      `OpenClaw memory status returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new OpenClawMemorySearchProviderError(
      "malformed_output",
      "OpenClaw memory status returned a non-array JSON payload."
    );
  }
  return parsed as OpenClawMemoryStatusEnvelope;
}

async function probeOpenClawMemorySearchHealth(workspaceRoot: string): Promise<{
  healthy: boolean;
  health: MemoryCandidateTransportHealth;
  detail?: string;
}> {
  if (shouldSkipStatusProbeForCustomBinary()) {
    return { healthy: true, health: "ok" };
  }

  try {
    const { stdout } = await runOpenClawMemoryStatusCli(workspaceRoot);
    const payload = parseOpenClawMemoryStatusEnvelope(stdout);
    const agent = payload[0];
    const indexedFiles = typeof agent?.status?.files === "number" ? agent.status.files : 0;
    const indexedChunks = typeof agent?.status?.chunks === "number" ? agent.status.chunks : 0;
    const totalFiles = typeof agent?.scan?.totalFiles === "number" ? agent.scan.totalFiles : 0;
    const probeOk = agent?.embeddingProbe?.ok === true;
    const probeError =
      typeof agent?.embeddingProbe?.error === "string" ? normalizeFailureDetail(agent.embeddingProbe.error) : undefined;

    if (probeOk === false && totalFiles > 0 && indexedFiles === 0 && indexedChunks === 0) {
      return {
        healthy: false,
        health: "transport_error",
        detail: normalizeFailureDetail(
          `OpenClaw memory index unavailable: indexed 0/${totalFiles} files, 0 chunks. ${probeError ?? ""}`
        )
      };
    }

    return { healthy: true, health: "ok" };
  } catch (error) {
    const failure = classifyOpenClawMemorySearchError(error);
    return {
      healthy: false,
      health: failure.health,
      detail: failure.detail
    };
  }
}

function stripSearchSnippetArtifacts(snippet: string): string {
  return snippet
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^source:\s+/i.test(line))
    .join("\n")
    .trim();
}

function looksLikeDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseTimestamp(value: string): string | undefined {
  if (!value.trim()) {
    return undefined;
  }
  if (looksLikeDateOnly(value.trim())) {
    return `${value.trim()}T00:00:00.000Z`;
  }
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  return undefined;
}

async function resolveCandidateTimestamp(
  rawPath: string,
  workspaceRoot: string,
  providedTimestamp?: string
): Promise<string | undefined> {
  const normalizedProvided = typeof providedTimestamp === "string" ? parseTimestamp(providedTimestamp) : undefined;
  if (normalizedProvided) {
    return normalizedProvided;
  }

  const datedMatch = rawPath.replace(/\\/g, "/").match(/(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/);
  if (datedMatch) {
    return `${datedMatch[1]}T00:00:00.000Z`;
  }

  const absolutePath = path.isAbsolute(rawPath) ? rawPath : path.join(workspaceRoot, rawPath);
  try {
    return new Date((await stat(absolutePath)).mtimeMs).toISOString();
  } catch {
    return undefined;
  }
}

function isExcludedMemorySearchPath(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.endsWith("/mind.md") ||
    normalized === "mind.md" ||
    normalized.endsWith("/topic_affinities.json") ||
    normalized === "topic_affinities.json" ||
    normalized.endsWith("/deep_attractors.json") ||
    normalized === "deep_attractors.json" ||
    normalized.endsWith("/agency_actions.json") ||
    normalized === "agency_actions.json" ||
    normalized.endsWith("/open-loops.json") ||
    normalized === "open-loops.json"
  );
}

function normalizeMemorySearchSource(rawPath: string, workspaceRoot: string): string {
  const absolutePath = path.isAbsolute(rawPath) ? rawPath : path.join(workspaceRoot, rawPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  if (normalizedRelative && !normalizedRelative.startsWith("..")) {
    return normalizedRelative;
  }
  return rawPath.replace(/\\/g, "/");
}

function normalizeSnippetBoilerplate(snippet: string): string {
  return normalizeText(
    stripSearchSnippetArtifacts(snippet)
      .replace(/\*\*/g, "")
      .replace(/^#\s*Hourly Summary\s+Date:\s*[^.]+Covered:\s*[^.]+\s*/i, "")
      .replace(/^#\s*\d{4}-\d{2}-\d{2}\s+/i, "")
  );
}

function scoreSegment(segment: string, input: MemoryCandidateProviderInput): number {
  const segmentTokens = new Set(retrievalTokens(segment));
  const queryTokens = new Set(retrievalTokens(input.query));
  const entityTokens = new Set(
    uniqueEntities(input.linkedEntities).flatMap((entity) => retrievalTokens(entity))
  );
  const queryOverlap = overlapScore(segmentTokens, queryTokens);
  const entityOverlap = overlapScore(segmentTokens, entityTokens);
  return queryOverlap * 0.78 + entityOverlap * 0.22;
}

function splitSnippetSegments(snippet: string): Array<{ text: string; start: number; end: number }> {
  const segments: Array<{ text: string; start: number; end: number }> = [];
  const matcher = /[^.!?]+[.!?]?/g;
  for (const match of snippet.matchAll(matcher)) {
    const text = normalizeText(match[0] ?? "");
    if (!text) {
      continue;
    }
    const start = match.index ?? 0;
    segments.push({
      text,
      start,
      end: start + (match[0]?.length ?? text.length)
    });
  }
  if (segments.length === 0 && snippet.trim()) {
    segments.push({
      text: snippet.trim(),
      start: 0,
      end: snippet.trim().length
    });
  }
  return segments;
}

function selectExcerptWindow(snippet: string, input: MemoryCandidateProviderInput): {
  summary: string;
  text: string;
} {
  const cleaned = normalizeSnippetBoilerplate(snippet);
  if (!cleaned) {
    return { summary: "", text: "" };
  }
  const segments = splitSnippetSegments(cleaned);
  const scored = segments
    .map((segment) => ({
      ...segment,
      score: scoreSegment(segment.text, input)
    }))
    .sort((left, right) => right.score - left.score || left.start - right.start);

  const best = scored[0];
  if (!best || best.score <= 0) {
    const fallback = cleaned.slice(0, 520).trim();
    const summary = (splitSnippetSegments(fallback)[0]?.text ?? fallback).slice(0, 220);
    return {
      summary,
      text: fallback
    };
  }

  let windowStart = Math.max(0, best.start - 180);
  let windowEnd = Math.min(cleaned.length, best.end + 220);
  for (const candidate of scored.slice(1)) {
    if (candidate.score < best.score * 0.65) {
      continue;
    }
    if (candidate.start > windowEnd + 80 || candidate.end < windowStart - 80) {
      continue;
    }
    windowStart = Math.min(windowStart, candidate.start);
    windowEnd = Math.max(windowEnd, candidate.end);
  }

  const excerpt = cleaned.slice(windowStart, windowEnd).trim().slice(0, 520);
  const excerptSegments = splitSnippetSegments(excerpt);
  const summary =
    excerptSegments
      .map((segment) => ({
        text: segment.text,
        score: scoreSegment(segment.text, input)
      }))
      .sort((left, right) => right.score - left.score || left.text.length - right.text.length)[0]
      ?.text.slice(0, 220) ?? excerpt.slice(0, 220);

  return {
    summary,
    text: excerpt
  };
}

function normalizeSearchSummary(snippet: string, input: MemoryCandidateProviderInput): {
  summary: string;
  text: string;
} {
  return selectExcerptWindow(snippet, input);
}

function buildOpenClawSearchQueries(input: MemoryCandidateProviderInput): string[] {
  const baseQuery = normalizeText(input.query);
  const queries: string[] = [];
  const entities = uniqueEntities(input.linkedEntities).filter((value) => !baseQuery.toLowerCase().includes(value));
  const distilledTokens = retrievalTokens(baseQuery).filter((token) => !GENERIC_ENTITY_TOKENS.has(token)).slice(0, 6);
  const anchorTokens = uniqueEntities(
    [...entities, ...distilledTokens].filter((token) => token.includes(".") || token.length >= 6 || !GENERIC_ENTITY_TOKENS.has(token))
  ).slice(0, 6);
  if (entities.length > 0) {
    queries.push(normalizeText(`${baseQuery} ${entities.slice(0, 4).join(" ")}`));
  }
  if (distilledTokens.length >= 2) {
    queries.push(distilledTokens.join(" "));
  }
  if (anchorTokens.length >= 2) {
    queries.push(anchorTokens.join(" "));
  }
  queries.push(baseQuery);
  return [...new Set(queries.filter(Boolean))];
}

function normalizeRegisteredCandidates(
  candidates: MemoryCandidate[],
  inferLinkedEntities: InferLinkedEntities
): MemoryCandidate[] {
  return candidates
    .map((candidate) => {
      const source = normalizeText(candidate.source).slice(0, 220);
      const summary = normalizeText(candidate.summary).slice(0, 220);
      const text = normalizeText(candidate.text).slice(0, 420);
      if (!source || !summary || !text) {
        return null;
      }
      const linkedEntities = uniqueEntities(
        Array.isArray(candidate.linkedEntities) && candidate.linkedEntities.length > 0
          ? candidate.linkedEntities
          : inferLinkedEntities(`${summary}\n${text}\n${source}`)
      ).slice(0, 8);
      const timestamp = typeof candidate.timestamp === "string" ? parseTimestamp(candidate.timestamp) : undefined;
      return {
        id: candidate.id || candidateId(source, `${summary}:${text}`),
        source,
        summary,
        text,
        linkedEntities,
        ...(timestamp ? { timestamp } : {})
      } satisfies MemoryCandidate;
    })
    .filter((candidate): candidate is MemoryCandidate => Boolean(candidate));
}

async function normalizeOpenClawSearchHits(
  hits: OpenClawMemorySearchHit[],
  input: MemoryCandidateProviderInput,
  options: Pick<OpenClawMemorySearchProviderOptions, "workspaceRoot" | "inferLinkedEntities">
): Promise<MemoryCandidate[]> {
  const candidates: MemoryCandidate[] = [];

  for (const hit of hits) {
    const rawPath = typeof hit.path === "string" ? hit.path.trim() : "";
    if (!rawPath || isExcludedMemorySearchPath(rawPath)) {
      continue;
    }

    const snippet = typeof hit.snippet === "string" ? stripSearchSnippetArtifacts(hit.snippet) : "";
    if (!snippet) {
      continue;
    }

    const source = normalizeMemorySearchSource(rawPath, options.workspaceRoot);
    const excerpt = normalizeSearchSummary(snippet, input);
    const summary = excerpt.summary;
    const text = excerpt.text;
    if (!summary || !text) {
      continue;
    }

    const startLine = typeof hit.startLine === "number" && Number.isFinite(hit.startLine) ? Math.max(1, Math.floor(hit.startLine)) : 1;
    const endLine = typeof hit.endLine === "number" && Number.isFinite(hit.endLine) ? Math.max(startLine, Math.floor(hit.endLine)) : startLine;
    const linkedEntities = uniqueEntities(options.inferLinkedEntities(`${source}\n${snippet}`)).slice(0, 8);
    const timestamp = await resolveCandidateTimestamp(
      rawPath,
      options.workspaceRoot,
      typeof hit.timestamp === "string" ? hit.timestamp : undefined
    );

    candidates.push({
      id: candidateId(source, `${startLine}-${endLine}:${summary}`),
      source,
      summary,
      text,
      linkedEntities,
      ...(timestamp ? { timestamp } : {})
    });
  }

  return candidates;
}

async function runOpenClawMemorySearchCli(
  query: string,
  limit: number,
  workspaceRoot: string
): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(
    openClawMemorySearchBinary(),
    [
      "memory",
      "search",
      "--agent",
      openClawMemorySearchAgentId(),
      "--json",
      "--query",
      query,
      "--max-results",
      String(Math.max(1, limit))
    ],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: openClawMemorySearchTimeoutMs(),
      env: process.env
    }
  );
}

function parseOpenClawMemorySearchEnvelope(stdout: string): OpenClawMemorySearchEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new OpenClawMemorySearchProviderError(
      "malformed_output",
      `OpenClaw memory search returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new OpenClawMemorySearchProviderError(
      "malformed_output",
      "OpenClaw memory search returned a non-object JSON payload."
    );
  }
  return parsed as OpenClawMemorySearchEnvelope;
}

async function searchViaOpenClawCli(
  input: MemoryCandidateProviderInput,
  options: Pick<OpenClawMemorySearchProviderOptions, "workspaceRoot" | "inferLinkedEntities">
): Promise<MemoryCandidate[]> {
  const queries = buildOpenClawSearchQueries(input);
  const merged = new Map<string, MemoryCandidate>();

  for (const query of queries) {
    const { stdout, stderr } = await runOpenClawMemorySearchCli(query, Math.max(input.limit, 10), options.workspaceRoot);
    const payload = parseOpenClawMemorySearchEnvelope(stdout);
    if (payload.disabled === true) {
      throw new OpenClawMemorySearchProviderError(
        "transport_error",
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : "OpenClaw memory search is disabled."
      );
    }
    if (!Array.isArray(payload.results)) {
      throw new OpenClawMemorySearchProviderError(
        "malformed_output",
        "OpenClaw memory search returned an invalid results payload."
      );
    }
    if (payload.results.length === 0 && openClawSearchFailure(stderr)) {
      throw new OpenClawMemorySearchProviderError(
        "transport_error",
        stderr.trim() || "OpenClaw memory search failed."
      );
    }

    const normalized = await normalizeOpenClawSearchHits(
      payload.results as OpenClawMemorySearchHit[],
      input,
      options
    );
    if (payload.results.length > 0 && normalized.length === 0) {
      throw new OpenClawMemorySearchProviderError(
        "junk_output",
        "OpenClaw memory search returned junk output with no usable memory hits."
      );
    }
    for (const candidate of normalized) {
      if (!merged.has(candidate.id)) {
        merged.set(candidate.id, candidate);
      }
    }
  }

  return [...merged.values()];
}

async function safeReadOptionalTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function safeReadOptionalJsonFile(filePath: string): Promise<unknown | null> {
  const raw = await safeReadOptionalTextFile(filePath);
  if (!raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function writeIfChanged(filePath: string, nextContent: string): Promise<void> {
  const previous = await safeReadOptionalTextFile(filePath);
  if (previous === nextContent) {
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, nextContent, "utf8");
}

function extractMarkdownSection(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let active = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^##\s+/.test(line)) {
      active = line.trim() === `## ${heading}`;
      continue;
    }
    if (active && /^#/.test(line)) {
      break;
    }
    if (active && line.trim()) {
      output.push(line);
    }
  }
  return output;
}

function firstSentence(text: string, fallbackLen = 220): string {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }
  return (normalized.split(/[.!?]\s+/)[0] ?? normalized).slice(0, fallbackLen);
}

async function createDerivedShadowDocuments(
  workspaceRoot: string,
  inferLinkedEntities: InferLinkedEntities
): Promise<SearchableShadowDocument[]> {
  const memoryDir = path.join(workspaceRoot, "memory");
  const derivedDir = path.join(memoryDir, "derived");
  const docs: SearchableShadowDocument[] = [];

  const userPath = path.join(workspaceRoot, "USER.md");
  const userMd = await safeReadOptionalTextFile(userPath);
  if (userMd.trim()) {
    const stableProfile = extractMarkdownSection(userMd, "Stable Profile").filter((line) => /^\s*-\s+/.test(line));
    const stablePreferences = extractMarkdownSection(userMd, "Stable Preferences").filter((line) => /^\s*-\s+/.test(line));
    const shadow = [
      "# Searchable User Profile",
      "",
      "## Stable Profile",
      ...stableProfile,
      "",
      "## Stable Preferences",
      ...stablePreferences,
      ""
    ].join("\n");
    const shadowPath = path.join(derivedDir, "user-profile-search.md");
    await writeIfChanged(shadowPath, shadow);
    let updatedAt: string | null = null;
    try {
      updatedAt = new Date((await stat(userPath)).mtimeMs).toISOString();
    } catch {
      updatedAt = null;
    }
    docs.push({
      source: "memory/derived/user-profile-search.md",
      filePath: shadowPath,
      content: shadow,
      updatedAt
    });
  }

  const promisesPath = path.join(memoryDir, "promises.json");
  const promisesRaw = await safeReadOptionalJsonFile(promisesPath);
  const promiseItems = Array.isArray((promisesRaw as { items?: unknown[] } | null)?.items)
    ? ((promisesRaw as { items: Array<Record<string, unknown>> }).items ?? [])
    : [];
  if (promiseItems.length > 0) {
    const lines = [
      "# Searchable Promises",
      ""
    ];
    for (const item of promiseItems) {
      const status = typeof item.status === "string" ? item.status.trim() : "active";
      if (status && status.toLowerCase() === "resolved") {
        continue;
      }
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!title) {
        continue;
      }
      const notes = typeof item.notes === "string" ? firstSentence(item.notes, 260) : "";
      const summary = [`Promise: ${title}.`, status ? `Status: ${status}.` : "", notes ? `Notes: ${notes}` : ""]
        .filter(Boolean)
        .join(" ");
      lines.push(`- ${summary}`);
    }
    if (lines.length > 2) {
      lines.push("");
      const shadow = lines.join("\n");
      const shadowPath = path.join(derivedDir, "promises-search.md");
      await writeIfChanged(shadowPath, shadow);
      let updatedAt: string | null = null;
      try {
        updatedAt = new Date((await stat(promisesPath)).mtimeMs).toISOString();
      } catch {
        updatedAt = null;
      }
      docs.push({
        source: "memory/derived/promises-search.md",
        filePath: shadowPath,
        content: shadow,
        updatedAt
      });
    }
  }

  const operationalShadowPath = path.join(derivedDir, "operational-issues.md");
  const operationalShadow = await safeReadOptionalTextFile(operationalShadowPath);
  if (operationalShadow.trim()) {
    let updatedAt: string | null = null;
    try {
      updatedAt = new Date((await stat(operationalShadowPath)).mtimeMs).toISOString();
    } catch {
      updatedAt = null;
    }
    docs.push({
      source: "memory/derived/operational-issues.md",
      filePath: operationalShadowPath,
      content: operationalShadow,
      updatedAt
    });
  }

  return docs.filter((doc) => {
    const candidates = extractWorkspaceMarkdownCandidates(
      doc.source,
      doc.content,
      doc.updatedAt,
      inferLinkedEntities
    );
    return candidates.length > 0;
  });
}

async function collectSearchableShadowCandidates(
  workspaceRoot: string,
  inferLinkedEntities: InferLinkedEntities
): Promise<MemoryCandidate[]> {
  const docs = await createDerivedShadowDocuments(workspaceRoot, inferLinkedEntities);
  const candidates: MemoryCandidate[] = [];
  for (const doc of docs) {
    candidates.push(
      ...extractWorkspaceMarkdownCandidates(doc.source, doc.content, doc.updatedAt, inferLinkedEntities)
    );
  }
  const deduped = new Map<string, MemoryCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.summary.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }
  return [...deduped.values()];
}

function extractWorkspaceMarkdownCandidates(
  source: string,
  content: string,
  updatedAt: string | null,
  inferLinkedEntities: InferLinkedEntities
): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  let currentHeading = "";
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      currentHeading = line.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }
    if (!/^-\s+/.test(line)) {
      continue;
    }
    const bullet = line.replace(/^-+\s+/, "").replace(/\*\*/g, "").trim();
    if (!bullet) {
      continue;
    }
    const summary = currentHeading ? `${currentHeading}: ${bullet}` : bullet;
    const text = currentHeading ? `${summary}\n${currentHeading}` : summary;
    candidates.push({
      id: candidateId(source, summary),
      source,
      summary: normalizeText(summary).slice(0, 220),
      text: normalizeText(text).slice(0, 420),
      linkedEntities: [...new Set(inferLinkedEntities(text))].slice(0, 8),
      ...(updatedAt ? { timestamp: updatedAt } : {})
    });
  }
  return candidates;
}

function collectWorkspaceJsonCandidates(
  value: unknown,
  source: string,
  updatedAt: string | null,
  output: MemoryCandidate[],
  inferLinkedEntities: InferLinkedEntities,
  pathStack: string[] = []
): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectWorkspaceJsonCandidates(entry, source, updatedAt, output, inferLinkedEntities, pathStack);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim()
      : typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : "";
  if (summary) {
    const detailParts = [
      typeof record.category === "string" ? record.category : "",
      typeof record.status === "string" ? record.status : "",
      typeof record.notes === "string" ? record.notes : "",
      typeof record.value === "string" ? record.value : ""
    ]
      .filter(Boolean)
      .map((part) => normalizeText(String(part)).slice(0, 180));
    const detail = detailParts.join(" | ");
    const seed = typeof record.id === "string" && record.id.trim() ? record.id : `${pathStack.join(".")}:${summary}`;
    const text = detail ? `${summary}\n${detail}` : summary;
    output.push({
      id: candidateId(source, seed),
      source,
      summary: normalizeText(summary).slice(0, 220),
      text: normalizeText(text).slice(0, 420),
      linkedEntities: [...new Set(inferLinkedEntities(text))].slice(0, 8),
      ...(updatedAt ? { timestamp: updatedAt } : {})
    });
  }
  for (const [key, child] of Object.entries(record)) {
    collectWorkspaceJsonCandidates(child, source, updatedAt, output, inferLinkedEntities, [...pathStack, key]);
  }
}

export function registerOpenClawMemorySearchProvider(search: OpenClawMemorySearchFunction): void {
  registeredOpenClawMemorySearchProvider = search;
}

export function clearOpenClawMemorySearchProvider(): void {
  registeredOpenClawMemorySearchProvider = null;
}

export function resetMemoryCandidateProviderRuntimeState(): void {
  clearOpenClawMemorySearchProvider();
  clearMemorySearchFailureState();
  memorySearchHealthGateState.lastProbeAtMs = 0;
}

export function createWorkspaceFileMemoryCandidateProvider(
  options: WorkspaceFileProviderOptions
): MemoryCandidateProvider {
  const markdownSources = [
    { source: "USER.md", path: path.join(options.workspaceRoot, "USER.md") },
    { source: "MEMORY.md", path: path.join(options.workspaceRoot, "MEMORY.md") }
  ];
  const jsonSources = [
    { source: "beliefs.json", path: path.join(options.workspaceRoot, "memory", "beliefs.json") },
    { source: "preferences.json", path: path.join(options.workspaceRoot, "memory", "preferences.json") },
    { source: "capabilities.json", path: path.join(options.workspaceRoot, "memory", "capabilities.json") },
    { source: "promises.json", path: path.join(options.workspaceRoot, "memory", "promises.json") },
    { source: "traits.json", path: path.join(options.workspaceRoot, "memory", "traits.json") }
  ];

  return {
    kind: "workspace_files",
    async getCandidates(input: MemoryCandidateProviderInput): Promise<MemoryCandidateProviderResult> {
      const candidates: MemoryCandidate[] = [];

      for (const source of markdownSources) {
        const raw = await safeReadOptionalTextFile(source.path);
        if (!raw.trim()) {
          continue;
        }
        let updatedAt: string | null = null;
        try {
          updatedAt = new Date((await stat(source.path)).mtimeMs).toISOString();
        } catch {
          updatedAt = null;
        }
        candidates.push(
          ...extractWorkspaceMarkdownCandidates(source.source, raw, updatedAt, options.inferLinkedEntities)
        );
      }

      for (const source of jsonSources) {
        const parsed = await safeReadOptionalJsonFile(source.path);
        if (!parsed) {
          continue;
        }
        let updatedAt: string | null = null;
        try {
          updatedAt = new Date((await stat(source.path)).mtimeMs).toISOString();
        } catch {
          updatedAt = null;
        }
        collectWorkspaceJsonCandidates(parsed, source.source, updatedAt, candidates, options.inferLinkedEntities);
      }

      const uniqueCandidates = new Map<string, MemoryCandidate>();
      for (const candidate of candidates) {
        const key = `${candidate.source}:${candidate.summary.toLowerCase()}`;
        if (!uniqueCandidates.has(key)) {
          uniqueCandidates.set(key, candidate);
        }
      }
      const deduped = rankWorkspaceCandidates([...uniqueCandidates.values()], input);
      return {
        requestedProvider: "workspace_files",
        resolvedProvider: "workspace_files",
        fallbackUsed: false,
        transportHealth: "ok",
        transportAttempted: false,
        healthGateActive: false,
        candidatePoolSize: deduped.length,
        candidates: deduped.slice(0, Math.max(1, input.limit))
      };
    }
  };
}

export function createOpenClawMemorySearchCandidateProvider(
  options: OpenClawMemorySearchProviderOptions
): MemoryCandidateProvider {
  const search = options.search ?? registeredOpenClawMemorySearchProvider;
  return {
    kind: "openclaw_memory_search",
    async getCandidates(input: MemoryCandidateProviderInput): Promise<MemoryCandidateProviderResult> {
      try {
        const rawCandidates = search ? await search(input) : null;
        const candidates = rawCandidates
          ? normalizeRegisteredCandidates(rawCandidates, options.inferLinkedEntities)
          : await searchViaOpenClawCli(input, options);
        if (rawCandidates && rawCandidates.length > 0 && candidates.length === 0) {
          throw new OpenClawMemorySearchProviderError(
            "junk_output",
            "OpenClaw memory search returned junk output with no usable memory hits."
          );
        }
        return {
          requestedProvider: "openclaw_memory_search",
          resolvedProvider: "openclaw_memory_search",
          fallbackUsed: false,
          transportHealth: "ok",
          transportAttempted: true,
          healthGateActive: false,
          candidatePoolSize: candidates.length,
          candidates: candidates.slice(0, Math.max(1, input.limit))
        };
      } catch (error) {
        const failure = classifyOpenClawMemorySearchError(error);
        throw new OpenClawMemorySearchProviderError(
          failure.health,
          failure.detail ?? "OpenClaw memory search failed."
        );
      }
    }
  };
}

function selectRelevantShadowCandidates(
  candidates: MemoryCandidate[],
  input: MemoryCandidateProviderInput,
  limit = 3
): MemoryCandidate[] {
  const specificEntityTokens = new Set(
    uniqueEntities(input.linkedEntities)
      .filter((entity) => !GENERIC_ENTITY_TOKENS.has(entity))
      .flatMap((entity) => retrievalTokens(entity))
  );
  const ranked = rankWorkspaceCandidates(candidates, input)
    .map((candidate) => {
      const summaryTokens = new Set(retrievalTokens(candidate.summary));
      const textTokens = new Set(retrievalTokens(candidate.text));
      const queryTokens = new Set(retrievalTokens(input.query));
      const combinedTokens = new Set([...summaryTokens, ...textTokens]);
      const queryOverlap = overlapScore(summaryTokens, queryTokens) * 0.72 + overlapScore(textTokens, queryTokens) * 0.28;
      const specificEntityOverlap = overlapScore(combinedTokens, specificEntityTokens);
      const score =
        queryOverlap * 0.78 +
        specificEntityOverlap * 0.22;
      return { candidate, score, queryOverlap, specificEntityOverlap };
    })
    .filter((entry) => {
      if (entry.score < 0.16) {
        return false;
      }
      if (specificEntityTokens.size > 0) {
        return entry.specificEntityOverlap > 0;
      }
      return entry.queryOverlap >= 0.25;
    })
    .slice(0, limit)
    .map((entry) => entry.candidate);
  return ranked;
}

export async function retrieveMemoryCandidates(
  input: RetrievalOptions & MemoryCandidateProviderInput
): Promise<MemoryCandidateProviderResult> {
  const workspaceProvider = createWorkspaceFileMemoryCandidateProvider({
    workspaceRoot: input.workspaceRoot,
    inferLinkedEntities: input.inferLinkedEntities
  });
  if (input.preferredProvider === "workspace_files") {
    return workspaceProvider.getCandidates(input);
  }

  const openClawProvider = createOpenClawMemorySearchCandidateProvider({
    workspaceRoot: input.workspaceRoot,
    inferLinkedEntities: input.inferLinkedEntities
  });
  const workspaceBaseline = await workspaceProvider.getCandidates(input);
  const searchableShadowCandidates = await collectSearchableShadowCandidates(
    input.workspaceRoot,
    input.inferLinkedEntities
  );
  const now = Date.now();

  if (memorySearchHealthGateState.cooldownUntilMs > now) {
    const health = memorySearchHealthGateState.lastFailureHealth ?? "transport_error";
    return {
      ...workspaceBaseline,
      requestedProvider: "openclaw_memory_search",
      resolvedProvider: "workspace_files",
      fallbackUsed: true,
      transportHealth: health,
      transportAttempted: false,
      healthGateActive: true,
      cooldownUntil: new Date(memorySearchHealthGateState.cooldownUntilMs).toISOString(),
      fallbackReason: health,
      fallbackDetail: describeCooldown(memorySearchHealthGateState.lastFailureDetail, memorySearchHealthGateState.cooldownUntilMs),
      shadowComparison: buildShadowComparison([], workspaceBaseline)
    };
  }

  if (now - memorySearchHealthGateState.lastProbeAtMs >= openClawMemorySearchHealthProbeTtlMs()) {
    memorySearchHealthGateState.lastProbeAtMs = now;
    const probe = await probeOpenClawMemorySearchHealth(input.workspaceRoot);
    if (!probe.healthy) {
      recordMemorySearchFailure(probe.health, probe.detail, true);
      return {
        ...workspaceBaseline,
        requestedProvider: "openclaw_memory_search",
        resolvedProvider: "workspace_files",
        fallbackUsed: true,
        transportHealth: probe.health,
        transportAttempted: false,
        healthGateActive: true,
        cooldownUntil: new Date(memorySearchHealthGateState.cooldownUntilMs).toISOString(),
        fallbackReason: probe.health,
        ...(probe.detail ? { fallbackDetail: describeCooldown(probe.detail, memorySearchHealthGateState.cooldownUntilMs) } : {}),
        shadowComparison: buildShadowComparison([], workspaceBaseline)
      };
    }
  }

  try {
    const primary = await openClawProvider.getCandidates(input);
    const shadowCandidates = selectRelevantShadowCandidates(searchableShadowCandidates, input);
    const mergedCandidates = new Map<string, MemoryCandidate>();
    for (const candidate of [...shadowCandidates, ...primary.candidates]) {
      const key = `${candidate.source}:${candidate.summary.toLowerCase()}`;
      if (!mergedCandidates.has(key)) {
        mergedCandidates.set(key, candidate);
      }
    }
    const rankedMergedCandidates = rankWorkspaceCandidates([...mergedCandidates.values()], input);
    clearMemorySearchFailureState();
    return {
      ...primary,
      candidatePoolSize: mergedCandidates.size,
      transportAttempted: true,
      healthGateActive: false,
      candidates: rankedMergedCandidates.slice(0, Math.max(1, input.limit)),
      shadowComparison: buildShadowComparison(primary.candidates, workspaceBaseline)
    };
  } catch (error) {
    const failure = classifyOpenClawMemorySearchError(error);
    recordMemorySearchFailure(failure.health, failure.detail);
    const cooldownUntil =
      memorySearchHealthGateState.cooldownUntilMs > Date.now()
        ? new Date(memorySearchHealthGateState.cooldownUntilMs).toISOString()
        : undefined;
    return {
      ...workspaceBaseline,
      requestedProvider: "openclaw_memory_search",
      resolvedProvider: "workspace_files",
      fallbackUsed: true,
      transportHealth: failure.health,
      transportAttempted: true,
      healthGateActive: false,
      ...(cooldownUntil ? { cooldownUntil } : {}),
      fallbackReason: failure.health,
      ...(failure.detail ? { fallbackDetail: failure.detail } : {}),
      shadowComparison: buildShadowComparison([], workspaceBaseline)
    };
  }
}
