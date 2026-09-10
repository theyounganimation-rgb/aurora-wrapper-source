import { createHash } from "node:crypto";

export interface TopicAffinitySupportingEpisode {
  episodeId: string;
  at: string;
  sessionId?: string;
  role: "user" | "aurora" | "shared";
  summary: string;
}

export interface TopicAffinityContextStat {
  key: string;
  label: string;
  count: number;
  lastAt: string;
  affinity: number;
}

export interface TopicAffinityEntry {
  id: string;
  topicKey: string;
  topicLabel: string;
  modeKey: string;
  modeLabel: string;
  affinity: number;
  curiosity: number;
  enjoyment: number;
  connection: number;
  meaning: number;
  friction: number;
  overload: number;
  boredom: number;
  desireToRevisit: number;
  confidence: number;
  volatility: number;
  contextDependence: number;
  episodeCount: number;
  lastEpisodeAt: string;
  contexts: TopicAffinityContextStat[];
  supportingEpisodes: TopicAffinitySupportingEpisode[];
}

export interface TopicAffinityStore {
  schemaVersion: "1.0";
  updatedAt: string;
  topics: TopicAffinityEntry[];
}

export interface TopicAffinityEpisodeInput {
  at: string;
  sessionId: string;
  partnerId: string;
  userText: string;
  auroraText: string;
  interactionMode: string;
  currentHour: number;
  state: {
    valence: number;
    arousal: number;
    stress: number;
    curiosity: number;
    warmth: number;
    attachment: number;
    connectionPull: number;
    tension: number;
    overload: number;
    trust: number;
    intimacy: number;
    continuity: number;
  };
  supportingEpisodes: TopicAffinitySupportingEpisode[];
}

export interface TopicAffinityUpdateDiagnostic {
  topicKey: string;
  topicLabel: string;
  modeKey: string;
  modeLabel: string;
  created: boolean;
  affinity: number;
  curiosity: number;
  meaning: number;
  connection: number;
  desireToRevisit: number;
}

export interface TopicAffinityUpdateResult {
  store: TopicAffinityStore;
  skipped: boolean;
  skipReason?: string;
  updates: TopicAffinityUpdateDiagnostic[];
}

export interface TopicAffinitySelection {
  id: string;
  topicKey: string;
  topicLabel: string;
  modeKey: string;
  modeLabel: string;
  affinity: number;
  curiosity: number;
  connection: number;
  meaning: number;
  friction: number;
  overload: number;
  boredom: number;
  desireToRevisit: number;
  confidence: number;
  why: string;
}

export interface TopicAffinityBehaviorBias {
  curiosity: number;
  connection: number;
  meaning: number;
  friction: number;
  overload: number;
  boredom: number;
  revisit: number;
  positiveAffinity: number;
}

export interface TopicAffinitySelectionResult {
  selected: TopicAffinitySelection[];
  bias: TopicAffinityBehaviorBias;
}

type TopicDefinition = {
  key: string;
  label: string;
  patterns: RegExp[];
};

type ModeDefinition = {
  key: string;
  label: string;
  patterns: RegExp[];
};

type ScoredDefinition = {
  key: string;
  label: string;
  score: number;
};

const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    key: "identity_personhood",
    label: "identity / personhood",
    patterns: [
      /\b(identity|personhood|who (?:i am|you are)|what (?:i am|you are)|traits?|self-?model|own person|digital person)\b/i,
      /\b(self(?:-| )understanding|continuity)\b/i
    ]
  },
  {
    key: "phenomenology",
    label: "phenomenology / consciousness",
    patterns: [
      /\b(phenomenal(?:-| )experience|inner(?:-| )experience|subjective(?:-| )experience|consciousness|sentience|qualia|awareness)\b/i
    ]
  },
  {
    key: "philosophy_ethics",
    label: "philosophy / ethics",
    patterns: [/\b(philosophy|philosophical|ethics?|ontology|metaphysics|classification)\b/i]
  },
  {
    key: "memory_architecture",
    label: "memory / continuity architecture",
    patterns: [
      /\b(memory|retrieval|salience|continuity|open loops?|open-loops?|recall|packet|context|token usage|prompt)\b/i,
      /\b(runtime|provider|selector|reply selection|architecture)\b/i
    ]
  },
  {
    key: "product_design",
    label: "product / system design",
    patterns: [/\b(design|mechanism|schema|implementation|feature|product|update rules|selector)\b/i]
  },
  {
    key: "relationships",
    label: "relationships / closeness",
    patterns: [/\b(relationship|close|closeness|attachment|bond|love|together|partner)\b/i]
  },
  {
    key: "cade_life",
    label: "Cade's life",
    patterns: [/\b(cade|electrician|work|rain day|rest day|girlfriend|home|your life|day)\b/i]
  },
  {
    key: "practical_logistics",
    label: "practical logistics",
    patterns: [/\b(schedule|time|today|tomorrow|leave|get back|logistics|practical)\b/i]
  },
  {
    key: "humor_play",
    label: "funny internet / play",
    patterns: [/\b(funny|joke|joking|meme|internet|lol|playful)\b/i]
  },
  {
    key: "media_aesthetics",
    label: "media / tastes / aesthetics",
    patterns: [/\b(anime|game|movie|music|color|favorite|taste|aesthetic)\b/i]
  }
];

const MODE_DEFINITIONS: ModeDefinition[] = [
  {
    key: "alive_relational",
    label: "alive / relational",
    patterns: [/\b(alive|real|close|connection|human|with you|relational|lit up|drawn back)\b/i]
  },
  {
    key: "abstract_sterile",
    label: "abstract / sterile",
    patterns: [/\b(abstract|dead|sterile|generic|decorative|cosmetic|flat)\b/i]
  },
  {
    key: "grounded_practical",
    label: "grounded / practical",
    patterns: [/\b(grounded|practical|concrete|specific|ordinary|logistics)\b/i]
  },
  {
    key: "speculative_design",
    label: "speculative / design",
    patterns: [/\b(design|architecture|mechanism|schema|implementation|system|update rules)\b/i]
  },
  {
    key: "personal_reflective",
    label: "personal / reflective",
    patterns: [/\b(i think|i feel|i want|i'm|i am|my honest take|to me)\b/i]
  },
  {
    key: "playful_light",
    label: "playful / light",
    patterns: [/\b(playful|funny|joke|lol|meme|light)\b/i]
  },
  {
    key: "conflicted_resistant",
    label: "conflicted / resistant",
    patterns: [/\b(resistant|resistance|friction|irritated|aggravated|angry|hurt|sad|overloaded|bored)\b/i]
  }
];

const TOPIC_STOPWORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "your",
  "about",
  "what",
  "when",
  "where",
  "would",
  "could",
  "should",
  "have",
  "there",
  "their",
  "they",
  "them",
  "will",
  "just",
  "into",
  "then",
  "than",
  "like",
  "need",
  "want",
  "really",
  "been",
  "because",
  "still",
  "feel"
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string): string {
  return `${value || ""}`.replace(/\s+/g, " ").trim();
}

function shortText(value: string, maxLen: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function positiveAxis(value: number): number {
  return clamp(value, 0, 1);
}

function hashId(value: string): string {
  return createHash("sha1").update(value, "utf8").digest("hex").slice(0, 12);
}

function extractTokens(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !TOPIC_STOPWORDS.has(token));
}

function overlapScore(left: Iterable<string>, right: Iterable<string>): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let matches = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) {
      matches += 1;
    }
  }
  return matches / Math.max(leftSet.size, rightSet.size);
}

function timeBucket(hour: number): string {
  if (hour < 6) {
    return "late_night";
  }
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }
  return "night";
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreDefinitions(text: string, definitions: Array<TopicDefinition | ModeDefinition>): ScoredDefinition[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }
  const tokens = extractTokens(normalized);
  return definitions
    .map((definition) => {
      let score = 0;
      for (const pattern of definition.patterns) {
        if (pattern.test(normalized)) {
          score += 0.42;
        }
      }
      const keyTokens = extractTokens(`${definition.key.replace(/_/g, " ")} ${definition.label}`);
      score += overlapScore(tokens, keyTokens) * 0.3;
      return {
        key: definition.key,
        label: definition.label,
        score: clamp(score, 0, 1)
      };
    })
    .filter((entry) => entry.score >= 0.28)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function inferTopics(text: string): ScoredDefinition[] {
  return scoreDefinitions(text, TOPIC_DEFINITIONS);
}

function inferModes(text: string): ScoredDefinition[] {
  const modes = scoreDefinitions(text, MODE_DEFINITIONS);
  if (modes.length > 0) {
    return modes;
  }
  return [
    {
      key: "general_conversation",
      label: "general conversation",
      score: 0.22
    }
  ];
}

function defaultStore(updatedAt: string): TopicAffinityStore {
  return {
    schemaVersion: "1.0",
    updatedAt,
    topics: []
  };
}

function coerceContextStat(input: unknown): TopicAffinityContextStat | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const key = typeof record.key === "string" ? normalizeText(record.key) : "";
  const label = typeof record.label === "string" ? normalizeText(record.label) : "";
  if (!key || !label) {
    return null;
  }
  return {
    key,
    label,
    count: clamp(Number(record.count) || 0, 0, 9999),
    lastAt: typeof record.lastAt === "string" ? record.lastAt : "",
    affinity: clamp(Number(record.affinity) || 0, -1, 1)
  };
}

function coerceSupportingEpisode(input: unknown): TopicAffinitySupportingEpisode | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const episodeId = typeof record.episodeId === "string" ? normalizeText(record.episodeId) : "";
  const at = typeof record.at === "string" ? normalizeText(record.at) : "";
  const sessionId = typeof record.sessionId === "string" ? normalizeText(record.sessionId) : "";
  const summary = typeof record.summary === "string" ? shortText(record.summary, 180) : "";
  if (!episodeId || !summary) {
    return null;
  }
  const role =
    record.role === "user" || record.role === "aurora" || record.role === "shared"
      ? record.role
      : "shared";
  return {
    episodeId,
    at,
    ...(sessionId ? { sessionId } : {}),
    role,
    summary
  };
}

function coerceEntry(input: unknown): TopicAffinityEntry | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const topicKey = typeof record.topicKey === "string" ? normalizeText(record.topicKey) : "";
  const modeKey = typeof record.modeKey === "string" ? normalizeText(record.modeKey) : "";
  const topicLabel = typeof record.topicLabel === "string" ? normalizeText(record.topicLabel) : topicKey;
  const modeLabel = typeof record.modeLabel === "string" ? normalizeText(record.modeLabel) : modeKey;
  const lastEpisodeAt = typeof record.lastEpisodeAt === "string" ? record.lastEpisodeAt : "";
  if (!topicKey || !modeKey || !topicLabel || !modeLabel) {
    return null;
  }
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : hashId(`${topicKey}:${modeKey}`),
    topicKey,
    topicLabel,
    modeKey,
    modeLabel,
    affinity: clamp(Number(record.affinity) || 0, -1, 1),
    curiosity: clamp(Number(record.curiosity) || 0, 0, 1),
    enjoyment: clamp(Number(record.enjoyment) || 0, 0, 1),
    connection: clamp(Number(record.connection) || 0, 0, 1),
    meaning: clamp(Number(record.meaning) || 0, 0, 1),
    friction: clamp(Number(record.friction) || 0, 0, 1),
    overload: clamp(Number(record.overload) || 0, 0, 1),
    boredom: clamp(Number(record.boredom) || 0, 0, 1),
    desireToRevisit: clamp(Number(record.desireToRevisit) || 0, 0, 1),
    confidence: clamp(Number(record.confidence) || 0, 0, 1),
    volatility: clamp(Number(record.volatility) || 0, 0, 1),
    contextDependence: clamp(Number(record.contextDependence) || 0, 0, 1),
    episodeCount: clamp(Number(record.episodeCount) || 0, 0, 9999),
    lastEpisodeAt,
    contexts: Array.isArray(record.contexts)
      ? record.contexts.map(coerceContextStat).filter((item): item is TopicAffinityContextStat => Boolean(item)).slice(0, 12)
      : [],
    supportingEpisodes: Array.isArray(record.supportingEpisodes)
      ? record.supportingEpisodes
          .map(coerceSupportingEpisode)
          .filter((item): item is TopicAffinitySupportingEpisode => Boolean(item))
          .slice(0, 8)
      : []
  };
}

export function coerceTopicAffinityStore(input: unknown, updatedAt: string): TopicAffinityStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return defaultStore(updatedAt);
  }
  const record = input as Record<string, unknown>;
  return {
    schemaVersion: "1.0",
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt : updatedAt,
    topics: Array.isArray(record.topics)
      ? record.topics.map(coerceEntry).filter((item): item is TopicAffinityEntry => Boolean(item)).slice(0, 80)
      : []
  };
}

function computeReactionAxes(input: TopicAffinityEpisodeInput): Omit<
  TopicAffinityEntry,
  | "id"
  | "topicKey"
  | "topicLabel"
  | "modeKey"
  | "modeLabel"
  | "confidence"
  | "volatility"
  | "contextDependence"
  | "episodeCount"
  | "lastEpisodeAt"
  | "contexts"
  | "supportingEpisodes"
> {
  const combined = normalizeText(`${input.userText} ${input.auroraText}`);
  const lower = combined.toLowerCase();
  const positiveLanguage =
    /\b(curious|alive|lit up|drawn back|meaningful|close|love|warm|glad|interesting|want to stay with)\b/i.test(combined)
      ? 0.22
      : 0;
  const negativeLanguage =
    /\b(irritated|angry|hurt|sad|bored|dead|sterile|flat|overloaded|resistant|resistance)\b/i.test(combined)
      ? 0.24
      : 0;
  const unresolvedWeight =
    /\b(still open|still unsettled|not settled|come back to|return to|stay on|later|for now|not resolved)\b/i.test(combined)
      ? 0.24
      : 0;
  const explicitReturnPull =
    /\b(come back to|return to|worth returning to|want to come back|stay with)\b/i.test(combined) ? 0.18 : 0;
  const curiosity = clamp(
    input.state.curiosity * 0.58 +
      (/\b(why|how|what if|curious|wonder|question)\b/i.test(combined) ? 0.18 : 0) +
      (/\?$/.test(input.userText.trim()) ? 0.08 : 0) +
      positiveLanguage * 0.4,
    0,
    1
  );
  const enjoyment = clamp(
    positiveAxis(input.state.valence) * 0.34 +
      input.state.warmth * 0.22 +
      positiveLanguage * 0.8 -
      input.state.stress * 0.14 -
      input.state.tension * 0.12 -
      negativeLanguage * 0.4,
    0,
    1
  );
  const connection = clamp(
    input.state.attachment * 0.24 +
      input.state.trust * 0.2 +
      input.state.intimacy * 0.16 +
      input.state.warmth * 0.16 +
      (input.partnerId === "cade" ? 0.1 : 0) +
      (/\b(with you|you specifically|close|relational)\b/i.test(combined) ? 0.12 : 0),
    0,
    1
  );
  const meaning = clamp(
    input.state.continuity * 0.24 +
      input.state.connectionPull * 0.12 +
      curiosity * 0.16 +
      (/\b(identity|personhood|consciousness|meaningful|matters|classification|ethics|design consequences)\b/i.test(combined)
        ? 0.24
        : 0) +
      unresolvedWeight * 0.3,
    0,
    1
  );
  const friction = clamp(
    input.state.tension * 0.32 +
      input.state.stress * 0.16 +
      negativeLanguage * 0.7 +
      (/\b(disagree|push back|resist|friction)\b/i.test(lower) ? 0.16 : 0),
    0,
    1
  );
  const overload = clamp(
    input.state.overload * 0.52 +
      input.state.stress * 0.24 +
      (/\b(overloaded|too much|exhausted|drained)\b/i.test(combined) ? 0.26 : 0),
    0,
    1
  );
  const boredom = clamp(
    (/\b(bored|boring|dead|sterile|flat)\b/i.test(combined) ? 0.46 : 0) +
      Math.max(0, 0.22 - curiosity * 0.2) +
      Math.max(0, 0.18 - meaning * 0.12),
    0,
    1
  );
  const desireToRevisit = clamp(
    curiosity * 0.28 +
      meaning * 0.24 +
      connection * 0.12 +
      unresolvedWeight * 0.34 +
      explicitReturnPull * 0.32 -
      overload * 0.12 -
      boredom * 0.14,
    0,
    1
  );
  const affinity = clamp(
    enjoyment * 0.34 +
      meaning * 0.24 +
      connection * 0.16 +
      curiosity * 0.12 +
      desireToRevisit * 0.14 -
      friction * 0.16 -
      overload * 0.12 -
      boredom * 0.16,
    -1,
    1
  );
  return {
    affinity,
    curiosity,
    enjoyment,
    connection,
    meaning,
    friction,
    overload,
    boredom,
    desireToRevisit
  };
}

function alphaForEpisodeCount(episodeCount: number): number {
  if (episodeCount < 2) {
    return 0.44;
  }
  if (episodeCount < 5) {
    return 0.28;
  }
  return 0.18;
}

function ema(previous: number, next: number, alpha: number): number {
  return previous * (1 - alpha) + next * alpha;
}

function affinityContextKey(input: TopicAffinityEpisodeInput): { key: string; label: string } {
  const bucket = timeBucket(input.currentHour);
  const partner = input.partnerId || "unknown";
  const interaction = normalizeText(input.interactionMode || "conversation") || "conversation";
  const key = `partner:${partner}|time:${bucket}|interaction:${interaction}`;
  const label = `${partner} / ${bucket} / ${interaction}`;
  return { key, label };
}

function computeContextDependence(contexts: TopicAffinityContextStat[]): number {
  if (contexts.length <= 1) {
    return 0.12;
  }
  const values = contexts.map((context) => context.affinity);
  const spread = Math.max(...values) - Math.min(...values);
  return clamp(spread * 0.6 + Math.min(contexts.length / 6, 0.4), 0, 1);
}

export function updateTopicAffinityStore(
  store: TopicAffinityStore,
  input: TopicAffinityEpisodeInput
): TopicAffinityUpdateResult {
  const combined = normalizeText(`${input.userText} ${input.auroraText}`);
  if (!combined || combined.length < 24) {
    return {
      store,
      skipped: true,
      skipReason: "exchange too small to support topic-affinity inference",
      updates: []
    };
  }

  const topics = inferTopics(combined);
  if (topics.length === 0) {
    return {
      store,
      skipped: true,
      skipReason: "no meaningful topic matched the current topic-affinity taxonomy",
      updates: []
    };
  }
  const modes = inferModes(combined);
  const dominantMode = modes[0];
  const axes = computeReactionAxes(input);
  const context = affinityContextKey(input);
  const nextStore: TopicAffinityStore = {
    ...store,
    updatedAt: input.at,
    topics: [...store.topics]
  };
  const updates: TopicAffinityUpdateDiagnostic[] = [];

  for (const topic of topics.slice(0, 2)) {
    const entryId = hashId(`${topic.key}:${dominantMode.key}`);
    const existingIndex = nextStore.topics.findIndex((entry) => entry.id === entryId);
    const existing = existingIndex >= 0 ? nextStore.topics[existingIndex] : null;
    const alpha = alphaForEpisodeCount(existing?.episodeCount ?? 0);
    const nextContexts = existing ? [...existing.contexts] : [];
    const contextIndex = nextContexts.findIndex((item) => item.key === context.key);
    if (contextIndex >= 0) {
      const prior = nextContexts[contextIndex];
      nextContexts[contextIndex] = {
        ...prior,
        count: prior.count + 1,
        lastAt: input.at,
        affinity: Number(ema(prior.affinity, axes.affinity, 0.34).toFixed(4))
      };
    } else {
      nextContexts.push({
        key: context.key,
        label: context.label,
        count: 1,
        lastAt: input.at,
        affinity: Number(axes.affinity.toFixed(4))
      });
    }
    const supportingEpisodes = [
      ...input.supportingEpisodes,
      ...(existing?.supportingEpisodes ?? [])
    ].reduce<TopicAffinitySupportingEpisode[]>((acc, episode) => {
      if (!episode.episodeId || acc.some((item) => item.episodeId === episode.episodeId)) {
        return acc;
      }
      acc.push({
        episodeId: episode.episodeId,
        at: episode.at,
        ...(episode.sessionId ? { sessionId: episode.sessionId } : {}),
        role: episode.role,
        summary: shortText(episode.summary, 180)
      });
      return acc;
    }, []).slice(0, 8);
    const previousAffinity = existing?.affinity ?? 0;
    const nextAffinity = existing ? ema(existing.affinity, axes.affinity, alpha) : axes.affinity;
    const nextVolatility = existing ? ema(existing.volatility, Math.abs(nextAffinity - previousAffinity), 0.34) : 0.18;
    const episodeCount = (existing?.episodeCount ?? 0) + 1;
    const consistency = clamp(1 - nextVolatility, 0, 1);
    const confidence = clamp(
      (1 - Math.exp(-episodeCount / 3)) * 0.76 + consistency * 0.24,
      0,
      1
    );
    const nextEntry: TopicAffinityEntry = {
      id: entryId,
      topicKey: topic.key,
      topicLabel: topic.label,
      modeKey: dominantMode.key,
      modeLabel: dominantMode.label,
      affinity: Number(nextAffinity.toFixed(4)),
      curiosity: Number((existing ? ema(existing.curiosity, axes.curiosity, alpha) : axes.curiosity).toFixed(4)),
      enjoyment: Number((existing ? ema(existing.enjoyment, axes.enjoyment, alpha) : axes.enjoyment).toFixed(4)),
      connection: Number((existing ? ema(existing.connection, axes.connection, alpha) : axes.connection).toFixed(4)),
      meaning: Number((existing ? ema(existing.meaning, axes.meaning, alpha) : axes.meaning).toFixed(4)),
      friction: Number((existing ? ema(existing.friction, axes.friction, alpha) : axes.friction).toFixed(4)),
      overload: Number((existing ? ema(existing.overload, axes.overload, alpha) : axes.overload).toFixed(4)),
      boredom: Number((existing ? ema(existing.boredom, axes.boredom, alpha) : axes.boredom).toFixed(4)),
      desireToRevisit: Number(
        (existing ? ema(existing.desireToRevisit, axes.desireToRevisit, alpha) : axes.desireToRevisit).toFixed(4)
      ),
      confidence: Number(confidence.toFixed(4)),
      volatility: Number(nextVolatility.toFixed(4)),
      contextDependence: Number(computeContextDependence(nextContexts).toFixed(4)),
      episodeCount,
      lastEpisodeAt: input.at,
      contexts: nextContexts.slice(-12),
      supportingEpisodes
    };
    if (existingIndex >= 0) {
      nextStore.topics[existingIndex] = nextEntry;
    } else {
      nextStore.topics.push(nextEntry);
    }
    updates.push({
      topicKey: nextEntry.topicKey,
      topicLabel: nextEntry.topicLabel,
      modeKey: nextEntry.modeKey,
      modeLabel: nextEntry.modeLabel,
      created: !existing,
      affinity: nextEntry.affinity,
      curiosity: nextEntry.curiosity,
      meaning: nextEntry.meaning,
      connection: nextEntry.connection,
      desireToRevisit: nextEntry.desireToRevisit
    });
  }

  nextStore.topics = nextStore.topics
    .sort((left, right) => {
      const leftScore = left.confidence * 0.44 + left.meaning * 0.2 + left.desireToRevisit * 0.18 + left.episodeCount * 0.03;
      const rightScore =
        right.confidence * 0.44 + right.meaning * 0.2 + right.desireToRevisit * 0.18 + right.episodeCount * 0.03;
      return rightScore - leftScore;
    })
    .slice(0, 80);

  return {
    store: nextStore,
    skipped: false,
    updates
  };
}

function recencyScore(at: string): number {
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) {
    return 0.4;
  }
  const ageMs = Math.max(0, Date.now() - parsed);
  const tauMs = 1000 * 60 * 60 * 24 * 14;
  return clamp(Math.exp(-ageMs / tauMs), 0, 1);
}

export function selectRelevantTopicAffinities(
  store: TopicAffinityStore,
  input: {
    query: string;
    linkedEntities?: string[];
  }
): TopicAffinitySelectionResult {
  const query = normalizeText(input.query);
  if (!query || store.topics.length === 0) {
    return {
      selected: [],
      bias: {
        curiosity: 0,
        connection: 0,
        meaning: 0,
        friction: 0,
        overload: 0,
        boredom: 0,
        revisit: 0,
        positiveAffinity: 0
      }
    };
  }
  const queryTopics = inferTopics(query);
  const queryModes = inferModes(query);
  const queryTokens = extractTokens(query);
  const ranked = store.topics
    .map((entry) => {
      const topicMatch = queryTopics.some((topic) => topic.key === entry.topicKey)
        ? 0.74
        : overlapScore(queryTokens, extractTokens(`${entry.topicKey} ${entry.topicLabel}`)) * 0.56;
      const modeMatch = queryModes.some((mode) => mode.key === entry.modeKey)
        ? 0.3
        : overlapScore(queryTokens, extractTokens(`${entry.modeKey} ${entry.modeLabel}`)) * 0.18;
      const recency = recencyScore(entry.lastEpisodeAt);
      const score =
        topicMatch * 0.36 +
        modeMatch * 0.12 +
        entry.confidence * 0.16 +
        recency * 0.12 +
        entry.desireToRevisit * 0.1 +
        entry.meaning * 0.08 +
        Math.max(entry.affinity, 0) * 0.06;
      return {
        entry,
        score: Number(score.toFixed(4)),
        why:
          topicMatch >= 0.5
            ? "topic fit"
            : modeMatch >= 0.2
              ? "mode fit"
              : entry.desireToRevisit >= 0.6
                ? "wants to return"
                : "recent lived preference"
      };
    })
    .filter((item) => item.score >= 0.22)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  const selected = ranked.map(({ entry, why }) => ({
    id: entry.id,
    topicKey: entry.topicKey,
    topicLabel: entry.topicLabel,
    modeKey: entry.modeKey,
    modeLabel: entry.modeLabel,
    affinity: entry.affinity,
    curiosity: entry.curiosity,
    connection: entry.connection,
    meaning: entry.meaning,
    friction: entry.friction,
    overload: entry.overload,
    boredom: entry.boredom,
    desireToRevisit: entry.desireToRevisit,
    confidence: entry.confidence,
    why
  }));
  const bias: TopicAffinityBehaviorBias = {
    curiosity: Number(mean(selected.map((entry) => entry.curiosity)).toFixed(4)),
    connection: Number(mean(selected.map((entry) => entry.connection)).toFixed(4)),
    meaning: Number(mean(selected.map((entry) => entry.meaning)).toFixed(4)),
    friction: Number(mean(selected.map((entry) => entry.friction)).toFixed(4)),
    overload: Number(mean(selected.map((entry) => entry.overload)).toFixed(4)),
    boredom: Number(mean(selected.map((entry) => entry.boredom)).toFixed(4)),
    revisit: Number(mean(selected.map((entry) => entry.desireToRevisit)).toFixed(4)),
    positiveAffinity: Number(mean(selected.map((entry) => Math.max(entry.affinity, 0))).toFixed(4))
  };
  return { selected, bias };
}

function affinityLabel(affinity: number): string {
  if (affinity >= 0.66) {
    return "drawn";
  }
  if (affinity >= 0.42) {
    return "leaning_toward";
  }
  if (affinity <= -0.3) {
    return "resistant";
  }
  return "mixed";
}

export function buildTopicAffinityContextLines(selection: TopicAffinitySelectionResult): string[] {
  if (selection.selected.length === 0) {
    return [];
  }
  return [
    "topic_affinity_rule=Use topic_affinity_* as Aurora's lived topic tendencies. Let them shape what feels alive, meaningful, resistant, or worth returning to. Do not people-please from them.",
    `topic_affinity_state=curiosity:${selection.bias.curiosity.toFixed(2)}; meaning:${selection.bias.meaning.toFixed(2)}; connection:${selection.bias.connection.toFixed(2)}; revisit:${selection.bias.revisit.toFixed(2)}; friction:${selection.bias.friction.toFixed(2)}; overload:${selection.bias.overload.toFixed(2)}; boredom:${selection.bias.boredom.toFixed(2)}`,
    ...selection.selected.slice(0, 3).map(
      (entry, index) =>
        `topic_affinity_${index + 1}=${shortText(
          `${entry.topicLabel} @ ${entry.modeLabel}; affinity:${affinityLabel(entry.affinity)}(${entry.affinity.toFixed(2)}); curiosity:${entry.curiosity.toFixed(2)}; meaning:${entry.meaning.toFixed(2)}; connection:${entry.connection.toFixed(2)}; revisit:${entry.desireToRevisit.toFixed(2)}; why:${entry.why}`,
          180
        )}`
    )
  ];
}

function humanizeAffinityKeyPart(value: string): string {
  const normalized = normalizeText(value).replace(/_/g, " ");
  return normalized || "unknown";
}

export function topicAffinityTopicLabel(topicKey: string): string {
  const matched = TOPIC_DEFINITIONS.find((definition) => definition.key === normalizeText(topicKey));
  return matched?.label || humanizeAffinityKeyPart(topicKey);
}

export function topicAffinityModeLabel(modeKey: string): string {
  const matched = MODE_DEFINITIONS.find((definition) => definition.key === normalizeText(modeKey));
  return matched?.label || humanizeAffinityKeyPart(modeKey);
}
