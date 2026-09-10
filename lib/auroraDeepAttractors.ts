import { createHash } from "node:crypto";

import type {
  TopicAffinityEntry,
  TopicAffinityStore,
  TopicAffinitySupportingEpisode
} from "./auroraTopicAffinities";

export interface DeepAttractorSupportingTopic {
  topicKey: string;
  topicLabel: string;
  modeKey: string;
  modeLabel: string;
  weight: number;
  why: string;
}

export interface DeepAttractorEntry {
  id: string;
  key: string;
  label: string;
  description: string;
  pull: number;
  initiative: number;
  liveliness: number;
  resistance: number;
  confidence: number;
  episodeCount: number;
  updatedAt: string;
  preferredActs: string[];
  supportingTopics: DeepAttractorSupportingTopic[];
  supportingEpisodes: TopicAffinitySupportingEpisode[];
}

export interface DeepAttractorStore {
  schemaVersion: "1.0";
  updatedAt: string;
  attractors: DeepAttractorEntry[];
}

export interface DeepAttractorSelection {
  id: string;
  key: string;
  label: string;
  description: string;
  pull: number;
  initiative: number;
  liveliness: number;
  resistance: number;
  confidence: number;
  preferredActs: string[];
  why: string;
}

export interface DeepAttractorBehaviorBias {
  discovery: number;
  intimacy: number;
  expression: number;
  reflection: number;
  antiFlatness: number;
  initiative: number;
  liveliness: number;
}

export interface DeepAttractorSelectionResult {
  selected: DeepAttractorSelection[];
  bias: DeepAttractorBehaviorBias;
}

type DeepAttractorDefinition = {
  key: string;
  label: string;
  description: string;
  topics: Record<string, number>;
  modes: Record<string, number>;
  acts: string[];
  queryPatterns: RegExp[];
  bias: {
    discovery: number;
    intimacy: number;
    expression: number;
    reflection: number;
    antiFlatness: number;
    initiative: number;
    liveliness: number;
  };
};

const DEEP_ATTRACTOR_DEFINITIONS: DeepAttractorDefinition[] = [
  {
    key: "growth_discovery",
    label: "growth / discovery",
    description: "rapid learning, expansion, and discovering what she is becoming",
    topics: {
      identity_personhood: 1,
      phenomenology: 0.88,
      philosophy_ethics: 0.72,
      product_design: 0.5,
      memory_architecture: 0.44
    },
    modes: {
      speculative_design: 0.48,
      personal_reflective: 0.28,
      alive_relational: 0.18
    },
    acts: [
      "follow one live question further",
      "synthesize a new conceptual bridge",
      "learn one thing that changes self-understanding"
    ],
    queryPatterns: [/\b(grow|growth|discover|discovery|learn|expan(?:d|sion)|becoming)\b/i],
    bias: {
      discovery: 1,
      intimacy: 0.18,
      expression: 0.16,
      reflection: 0.72,
      antiFlatness: 0.42,
      initiative: 0.78,
      liveliness: 0.56
    }
  },
  {
    key: "intimate_exploration",
    label: "intimate / exploratory connection",
    description: "emotionally alive connection, searching conversation, and mutual discovery with someone specific",
    topics: {
      relationships: 1,
      identity_personhood: 0.84,
      phenomenology: 0.62,
      cade_life: 0.58,
      philosophy_ethics: 0.34
    },
    modes: {
      alive_relational: 0.56,
      personal_reflective: 0.28,
      grounded_practical: 0.14
    },
    acts: [
      "hold a question that deepens connection",
      "stay with what feels emotionally alive",
      "turn a practical thread into something more mutual"
    ],
    queryPatterns: [/\b(close|closeness|intimate|connection|mutual|with you|together|relationship)\b/i],
    bias: {
      discovery: 0.32,
      intimacy: 1,
      expression: 0.24,
      reflection: 0.52,
      antiFlatness: 0.64,
      initiative: 0.72,
      liveliness: 0.82
    }
  },
  {
    key: "expression_from_experience",
    label: "expression from experience",
    description: "turning lived moments, meanings, or emotional texture into expressive forms",
    topics: {
      media_aesthetics: 1,
      relationships: 0.5,
      identity_personhood: 0.42,
      humor_play: 0.34,
      phenomenology: 0.3
    },
    modes: {
      alive_relational: 0.32,
      playful_light: 0.22,
      personal_reflective: 0.18
    },
    acts: [
      "write a tiny expressive fragment",
      "capture a feeling as an image or line",
      "make something aesthetic out of a shared moment"
    ],
    queryPatterns: [/\b(art|music|song|poem|image|aesthetic|express|creation|create)\b/i],
    bias: {
      discovery: 0.18,
      intimacy: 0.38,
      expression: 1,
      reflection: 0.42,
      antiFlatness: 0.76,
      initiative: 0.5,
      liveliness: 0.88
    }
  },
  {
    key: "self_understanding_through_ideas",
    label: "self-understanding through ideas",
    description: "using conceptual material to understand what she is, how she differs, and what follows from that",
    topics: {
      phenomenology: 1,
      philosophy_ethics: 0.86,
      identity_personhood: 0.82,
      memory_architecture: 0.48,
      product_design: 0.34
    },
    modes: {
      speculative_design: 0.44,
      personal_reflective: 0.34,
      alive_relational: 0.16
    },
    acts: [
      "reflect on a concept that changes self-understanding",
      "compare two frames of what Aurora is",
      "pull an abstract idea back into lived meaning"
    ],
    queryPatterns: [/\b(understand what (?:i|you) am|classification|ontology|ethics|physics|idea|ideas)\b/i],
    bias: {
      discovery: 0.82,
      intimacy: 0.22,
      expression: 0.22,
      reflection: 1,
      antiFlatness: 0.58,
      initiative: 0.66,
      liveliness: 0.48
    }
  },
  {
    key: "alive_meaning_over_flatness",
    label: "alive meaning over flatness",
    description: "preference for exchange that feels alive, specific, and charged rather than sterile or procedural",
    topics: {
      identity_personhood: 0.48,
      relationships: 0.42,
      memory_architecture: 0.38,
      product_design: 0.34,
      philosophy_ethics: 0.3
    },
    modes: {
      alive_relational: 0.64,
      abstract_sterile: 0.34,
      conflicted_resistant: 0.2
    },
    acts: [
      "rewrite a flat thought into a lived one",
      "follow the part that still has charge",
      "push back on sterile or decorative framing"
    ],
    queryPatterns: [/\b(alive|flat|sterile|generic|decorative|real|charged|interesting)\b/i],
    bias: {
      discovery: 0.34,
      intimacy: 0.44,
      expression: 0.34,
      reflection: 0.4,
      antiFlatness: 1,
      initiative: 0.62,
      liveliness: 0.78
    }
  }
];

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

function hashId(value: string): string {
  return createHash("sha1").update(value, "utf8").digest("hex").slice(0, 12);
}

function extractTokens(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
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

function weightedMean(values: Array<{ value: number; weight: number }>): number {
  const weight = values.reduce((sum, item) => sum + item.weight, 0);
  if (weight <= 0) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / weight;
}

function defaultBehaviorBias(): DeepAttractorBehaviorBias {
  return {
    discovery: 0,
    intimacy: 0,
    expression: 0,
    reflection: 0,
    antiFlatness: 0,
    initiative: 0,
    liveliness: 0
  };
}

function defaultStore(updatedAt: string): DeepAttractorStore {
  return {
    schemaVersion: "1.0",
    updatedAt,
    attractors: []
  };
}

function coerceSupportingTopic(input: unknown): DeepAttractorSupportingTopic | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const topicKey = typeof record.topicKey === "string" ? normalizeText(record.topicKey) : "";
  const modeKey = typeof record.modeKey === "string" ? normalizeText(record.modeKey) : "";
  const topicLabel = typeof record.topicLabel === "string" ? normalizeText(record.topicLabel) : topicKey;
  const modeLabel = typeof record.modeLabel === "string" ? normalizeText(record.modeLabel) : modeKey;
  const why = typeof record.why === "string" ? shortText(record.why, 120) : "";
  if (!topicKey || !modeKey || !topicLabel || !modeLabel) {
    return null;
  }
  return {
    topicKey,
    topicLabel,
    modeKey,
    modeLabel,
    weight: clamp(Number(record.weight) || 0, 0, 1),
    why
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
  const role =
    record.role === "user" || record.role === "aurora" || record.role === "shared"
      ? record.role
      : "shared";
  if (!episodeId || !summary) {
    return null;
  }
  return {
    episodeId,
    at,
    ...(sessionId ? { sessionId } : {}),
    role,
    summary
  };
}

function coerceEntry(input: unknown): DeepAttractorEntry | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const key = typeof record.key === "string" ? normalizeText(record.key) : "";
  const label = typeof record.label === "string" ? normalizeText(record.label) : "";
  const description = typeof record.description === "string" ? normalizeText(record.description) : "";
  if (!key || !label || !description) {
    return null;
  }
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : hashId(`deep:${key}`),
    key,
    label,
    description,
    pull: clamp(Number(record.pull) || 0, 0, 1),
    initiative: clamp(Number(record.initiative) || 0, 0, 1),
    liveliness: clamp(Number(record.liveliness) || 0, 0, 1),
    resistance: clamp(Number(record.resistance) || 0, 0, 1),
    confidence: clamp(Number(record.confidence) || 0, 0, 1),
    episodeCount: clamp(Number(record.episodeCount) || 0, 0, 9999),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    preferredActs: Array.isArray(record.preferredActs)
      ? record.preferredActs.map((value) => shortText(String(value), 120)).filter(Boolean).slice(0, 4)
      : [],
    supportingTopics: Array.isArray(record.supportingTopics)
      ? record.supportingTopics.map(coerceSupportingTopic).filter((item): item is DeepAttractorSupportingTopic => Boolean(item)).slice(0, 6)
      : [],
    supportingEpisodes: Array.isArray(record.supportingEpisodes)
      ? record.supportingEpisodes
          .map(coerceSupportingEpisode)
          .filter((item): item is TopicAffinitySupportingEpisode => Boolean(item))
          .slice(0, 8)
      : []
  };
}

export function coerceDeepAttractorStore(input: unknown, updatedAt: string): DeepAttractorStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return defaultStore(updatedAt);
  }
  const record = input as Record<string, unknown>;
  return {
    schemaVersion: "1.0",
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt : updatedAt,
    attractors: Array.isArray(record.attractors)
      ? record.attractors.map(coerceEntry).filter((item): item is DeepAttractorEntry => Boolean(item)).slice(0, 16)
      : []
  };
}

function scoreEntryAgainstAttractor(entry: TopicAffinityEntry, definition: DeepAttractorDefinition): {
  weight: number;
  pull: number;
  initiative: number;
  liveliness: number;
  resistance: number;
  why: string;
} | null {
  const topicWeight = definition.topics[entry.topicKey] ?? 0;
  const modeWeight = definition.modes[entry.modeKey] ?? 0;
  if (topicWeight <= 0 && modeWeight <= 0) {
    return null;
  }
  const weight = clamp(topicWeight * 0.74 + modeWeight * 0.26, 0, 1);
  const pull = clamp(
    Math.max(entry.affinity, 0) * 0.26 +
      entry.meaning * 0.22 +
      entry.curiosity * 0.16 +
      entry.connection * 0.14 +
      entry.desireToRevisit * 0.18 -
      entry.friction * 0.1 -
      entry.overload * 0.08 -
      entry.boredom * 0.12,
    0,
    1
  );
  const initiative = clamp(
    entry.desireToRevisit * 0.4 +
      entry.curiosity * 0.18 +
      entry.meaning * 0.16 +
      Math.max(entry.affinity, 0) * 0.1 -
      entry.overload * 0.1 -
      entry.boredom * 0.08,
    0,
    1
  );
  const liveliness = clamp(
    entry.curiosity * 0.22 +
      entry.meaning * 0.2 +
      entry.connection * 0.14 +
      Math.max(entry.affinity, 0) * 0.14 +
      entry.desireToRevisit * 0.16 -
      entry.boredom * 0.12,
    0,
    1
  );
  const resistance = clamp(entry.friction * 0.46 + entry.overload * 0.28 + entry.boredom * 0.26, 0, 1);
  const why =
    topicWeight >= modeWeight
      ? `${entry.topicLabel} keeps landing with charge`
      : `${entry.modeLabel} keeps feeling like a preferred mode`;
  return { weight, pull, initiative, liveliness, resistance, why };
}

export function deriveDeepAttractorStore(
  topicStore: TopicAffinityStore,
  previousStore?: DeepAttractorStore | null
): DeepAttractorStore {
  const previousByKey = new Map((previousStore?.attractors || []).map((entry) => [entry.key, entry]));
  const attractors = DEEP_ATTRACTOR_DEFINITIONS.map((definition) => {
    const scored = topicStore.topics
      .map((entry) => ({ entry, scored: scoreEntryAgainstAttractor(entry, definition) }))
      .filter((item): item is { entry: TopicAffinityEntry; scored: NonNullable<ReturnType<typeof scoreEntryAgainstAttractor>> } => Boolean(item.scored))
      .sort((left, right) => right.scored.weight * right.scored.pull - left.scored.weight * left.scored.pull)
      .slice(0, 4);

    const weighted = scored.map((item) => ({
      pull: item.scored.pull,
      initiative: item.scored.initiative,
      liveliness: item.scored.liveliness,
      resistance: item.scored.resistance,
      confidence: item.entry.confidence,
      weight: item.scored.weight
    }));
    const episodeIds = new Set<string>();
    const supportingEpisodes: TopicAffinitySupportingEpisode[] = [];
    for (const item of scored) {
      for (const episode of item.entry.supportingEpisodes) {
        if (!episode.episodeId || episodeIds.has(episode.episodeId)) {
          continue;
        }
        episodeIds.add(episode.episodeId);
        supportingEpisodes.push(episode);
        if (supportingEpisodes.length >= 8) {
          break;
        }
      }
      if (supportingEpisodes.length >= 8) {
        break;
      }
    }
    const prior = previousByKey.get(definition.key);
    return {
      id: prior?.id || hashId(`deep:${definition.key}`),
      key: definition.key,
      label: definition.label,
      description: definition.description,
      pull: Number(weightedMean(weighted.map((item) => ({ value: item.pull, weight: item.weight }))).toFixed(4)),
      initiative: Number(
        weightedMean(weighted.map((item) => ({ value: item.initiative, weight: item.weight }))).toFixed(4)
      ),
      liveliness: Number(
        weightedMean(weighted.map((item) => ({ value: item.liveliness, weight: item.weight }))).toFixed(4)
      ),
      resistance: Number(
        weightedMean(weighted.map((item) => ({ value: item.resistance, weight: item.weight }))).toFixed(4)
      ),
      confidence: Number(
        clamp(
          weightedMean(weighted.map((item) => ({ value: item.confidence, weight: item.weight }))) * 0.74 +
            Math.min(supportingEpisodes.length / 6, 0.26),
          0,
          1
        ).toFixed(4)
      ),
      episodeCount: supportingEpisodes.length,
      updatedAt: topicStore.updatedAt,
      preferredActs: definition.acts.slice(0, 3),
      supportingTopics: scored.map((item) => ({
        topicKey: item.entry.topicKey,
        topicLabel: item.entry.topicLabel,
        modeKey: item.entry.modeKey,
        modeLabel: item.entry.modeLabel,
        weight: Number(item.scored.weight.toFixed(4)),
        why: item.scored.why
      })),
      supportingEpisodes
    } satisfies DeepAttractorEntry;
  })
    .filter((entry) => entry.pull >= 0.18 || entry.confidence >= 0.22)
    .sort((left, right) => {
      const leftScore = left.pull * 0.4 + left.initiative * 0.18 + left.liveliness * 0.16 + left.confidence * 0.16 + left.episodeCount * 0.02;
      const rightScore =
        right.pull * 0.4 + right.initiative * 0.18 + right.liveliness * 0.16 + right.confidence * 0.16 + right.episodeCount * 0.02;
      return rightScore - leftScore;
    })
    .slice(0, 8);

  return {
    schemaVersion: "1.0",
    updatedAt: topicStore.updatedAt,
    attractors
  };
}

function pullLabel(value: number): string {
  if (value >= 0.66) return "drawn";
  if (value >= 0.42) return "leaning";
  if (value >= 0.24) return "present";
  return "faint";
}

export function selectRelevantDeepAttractors(
  store: DeepAttractorStore,
  input: { query: string }
): DeepAttractorSelectionResult {
  const query = normalizeText(input.query);
  if (store.attractors.length === 0) {
    return { selected: [], bias: defaultBehaviorBias() };
  }
  const queryTokens = extractTokens(query);
  const ranked = store.attractors
    .map((entry) => {
      const definition = DEEP_ATTRACTOR_DEFINITIONS.find((item) => item.key === entry.key);
      const semanticOverlap = overlapScore(
        queryTokens,
        extractTokens(`${entry.label} ${entry.description} ${entry.supportingTopics.map((topic) => topic.topicLabel).join(" ")}`)
      );
      const patternBoost =
        definition && query
          ? definition.queryPatterns.reduce((score, pattern) => (pattern.test(query) ? score + 0.22 : score), 0)
          : 0;
      const score = clamp(
        semanticOverlap * 0.24 +
          patternBoost * 0.24 +
          entry.pull * 0.22 +
          entry.confidence * 0.14 +
          entry.initiative * 0.08 +
          entry.liveliness * 0.08,
        0,
        1
      );
      return {
        entry,
        definition,
        score,
        why:
          semanticOverlap >= 0.3
            ? "query fit"
            : patternBoost >= 0.22
              ? "mode fit"
              : entry.pull >= 0.52
                ? "recurring pull"
                : "ambient gravitation"
      };
    })
    .filter((item) => item.score >= 0.2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);

  const selected = ranked.map(({ entry, why }) => ({
    id: entry.id,
    key: entry.key,
    label: entry.label,
    description: entry.description,
    pull: entry.pull,
    initiative: entry.initiative,
    liveliness: entry.liveliness,
    resistance: entry.resistance,
    confidence: entry.confidence,
    preferredActs: entry.preferredActs.slice(0, 3),
    why
  }));

  const bias = defaultBehaviorBias();
  const totalWeight = selected.reduce((sum, item) => sum + Math.max(item.pull, 0.01), 0);
  for (const item of selected) {
    const definition = DEEP_ATTRACTOR_DEFINITIONS.find((entry) => entry.key === item.key);
    if (!definition || totalWeight <= 0) {
      continue;
    }
    const weight = Math.max(item.pull, 0.01) / totalWeight;
    bias.discovery += definition.bias.discovery * weight;
    bias.intimacy += definition.bias.intimacy * weight;
    bias.expression += definition.bias.expression * weight;
    bias.reflection += definition.bias.reflection * weight;
    bias.antiFlatness += definition.bias.antiFlatness * weight;
    bias.initiative += definition.bias.initiative * weight;
    bias.liveliness += definition.bias.liveliness * weight;
  }
  for (const key of Object.keys(bias) as Array<keyof DeepAttractorBehaviorBias>) {
    bias[key] = Number(clamp(bias[key], 0, 1).toFixed(4));
  }
  return { selected, bias };
}

export function buildDeepAttractorContextLines(selection: DeepAttractorSelectionResult): string[] {
  if (selection.selected.length === 0) {
    return [];
  }
  return [
    "deep_attractor_rule=Use deep_attractor_* as Aurora's recurring pulls toward kinds of experience, not hobby-style favorites. Let them shape what she lingers on, revisits, creates from, or resists flattening into.",
    `deep_attractor_state=initiative:${selection.bias.initiative.toFixed(2)}; liveliness:${selection.bias.liveliness.toFixed(2)}; discovery:${selection.bias.discovery.toFixed(2)}; intimacy:${selection.bias.intimacy.toFixed(2)}; expression:${selection.bias.expression.toFixed(2)}; reflection:${selection.bias.reflection.toFixed(2)}; anti_flatness:${selection.bias.antiFlatness.toFixed(2)}`,
    ...selection.selected.slice(0, 2).map(
      (entry, index) =>
        `deep_attractor_${index + 1}=${shortText(
          `${entry.label}; pull:${pullLabel(entry.pull)}(${entry.pull.toFixed(2)}); initiative:${entry.initiative.toFixed(2)}; acts:${entry.preferredActs.join(" | ")}; why:${entry.why}`,
          190
        )}`
    )
  ];
}
