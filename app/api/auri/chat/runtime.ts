import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type AuriLifeMemoryEvent = {
  key: string;
  kind: string;
  summary: string;
  date: string;
};

export type AuriLifeMemoryChat = {
  role: "user" | "assistant";
  text: string;
  date: string;
};

export type AuriLifeMemoryFactKind =
  | "favorite"
  | "likes"
  | "dislikes"
  | "interest"
  | "preference"
  | "location"
  | "origin"
  | "work"
  | "pet";

export type AuriLifeMemoryFact = {
  key: string;
  kind: AuriLifeMemoryFactKind;
  topic: string;
  statement: string;
  sourceText: string;
  firstLearnedAt: string;
  lastConfirmedAt: string;
  mentions: number;
};

export type AuriLifeMemorySituationKind =
  | "stress"
  | "upcoming_event"
  | "ongoing_challenge"
  | "recent_win"
  | "support_need"
  | "health_worry";

export type AuriLifeMemorySituation = {
  key: string;
  kind: AuriLifeMemorySituationKind;
  topic: string;
  statement: string;
  sourceText: string;
  firstLearnedAt: string;
  lastUpdatedAt: string;
  mentions: number;
};

export type AuriLifeMemoryHumanProfile = {
  fullName: string;
  pronouns: string;
  birthday: {
    month: number;
    day: number;
    year: number;
  };
  coreValues: string[];
  interests: string[];
};

export type AuriLifeMemoryRelationshipKind = "friendship" | "romance" | "negative";

export type AuriLifeMemoryRelationshipStatus = {
  id: string;
  title: string;
  subtitle: string;
  kind: AuriLifeMemoryRelationshipKind;
  progress: number;
  friendship: number;
  romance: number;
  tension: number;
};

export type AuriLifeMemory = {
  version: 1;
  lifeId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastKnownName: string;
  humanName: string | null;
  humanProfile: AuriLifeMemoryHumanProfile | null;
  relationshipStatus: AuriLifeMemoryRelationshipStatus | null;
  totalTurns: number;
  durableFacts: AuriLifeMemoryFact[];
  situationalMemories: AuriLifeMemorySituation[];
  careMoments: AuriLifeMemoryEvent[];
  chatMoments: AuriLifeMemoryChat[];
};

const MAX_CARE_MOMENTS = 48;
const MAX_CHAT_MOMENTS = 64;
const MAX_DURABLE_FACTS = 48;
const MAX_SITUATIONAL_MEMORIES = 24;

function trimmedEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeHumanName(value: string): string | null {
  const normalized = normalizeText(value, 32);
  if (!normalized) {
    return null;
  }

  const pieces = normalized.split(" ").filter(Boolean);
  if (pieces.length === 0 || pieces.length > 3) {
    return null;
  }

  if (!/^[A-Za-z][A-Za-z' -]{0,31}$/.test(normalized)) {
    return null;
  }

  return normalized.replace(/\b([a-z])([a-z']*)/g, (_, first: string, rest: string) => `${first.toUpperCase()}${rest}`);
}

function firstNameFromFullName(value: string): string | null {
  const first = normalizeText(value, 60).split(" ").find(Boolean);
  if (!first) {
    return null;
  }

  const normalizedFirst = normalizeHumanName(first);
  return normalizedFirst || normalizeText(first, 32) || null;
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => normalizeText(typeof entry === "string" ? entry : "", maxLength)).filter(Boolean))].slice(
    0,
    maxItems
  );
}

function normalizeHumanProfile(value: unknown): AuriLifeMemoryHumanProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fullName = normalizeText(typeof record.fullName === "string" ? record.fullName : "", 60);
  const pronouns = normalizeText(typeof record.pronouns === "string" ? record.pronouns : "", 40);
  if (!fullName || !pronouns) {
    return null;
  }

  const birthdayRecord =
    record.birthday && typeof record.birthday === "object" && !Array.isArray(record.birthday)
      ? (record.birthday as Record<string, unknown>)
      : null;

  return {
    fullName,
    pronouns,
    birthday: {
      month: Math.max(1, Math.min(12, Number(birthdayRecord?.month) || 1)),
      day: Math.max(1, Math.min(31, Number(birthdayRecord?.day) || 1)),
      year: Math.max(1900, Math.min(2100, Number(birthdayRecord?.year) || 2000))
    },
    coreValues: normalizeStringArray(record.coreValues, 24, 40),
    interests: normalizeStringArray(record.interests, 32, 40)
  };
}

function normalizeRelationshipStatus(value: unknown): AuriLifeMemoryRelationshipStatus | null {
  const defaultRelationship = createDefaultRelationshipStatus();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultRelationship;
  }

  const record = value as Record<string, unknown>;
  const hasDynamicFields =
    typeof record.kind === "string" ||
    typeof record.progress === "number" ||
    typeof record.friendship === "number" ||
    typeof record.bond === "number" ||
    typeof record.romance === "number" ||
    typeof record.tension === "number" ||
    typeof record.strain === "number";

  if (!hasDynamicFields) {
    return defaultRelationship;
  }

  const kind = normalizeRelationshipKind(record.kind);
  const friendship = normalizeUnit(
    typeof record.friendship === "number" ? record.friendship : record.bond,
    defaultRelationship.friendship
  );
  const romance = normalizeUnit(record.romance, defaultRelationship.romance);
  const tension = normalizeUnit(
    typeof record.tension === "number" ? record.tension : record.strain,
    defaultRelationship.tension
  );
  const dominantProgress = normalizeUnit(record.progress, dominantRelationshipProgress(kind, friendship, romance, tension));
  const descriptor = describeRelationshipState(kind, dominantProgress);

  return {
    id: normalizeText(typeof record.id === "string" ? record.id : defaultRelationship.id, 40) || defaultRelationship.id,
    title: normalizeText(typeof record.title === "string" ? record.title : descriptor.title, 40) || descriptor.title,
    subtitle:
      normalizeText(typeof record.subtitle === "string" ? record.subtitle : descriptor.subtitle, 120) || descriptor.subtitle,
    kind,
    progress: dominantProgress,
    friendship,
    romance,
    tension
  };
}

function normalizeIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const candidate = new Date(trimmed);
  if (Number.isNaN(candidate.getTime())) {
    return "";
  }

  return candidate.toISOString();
}

function normalizeFactTopic(value: string): string {
  return normalizeText(value, 80)
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function indefiniteArticleFor(value: string): "a" | "an" {
  const normalized = normalizeText(value, 32).toLowerCase();
  return /^[aeiou]/.test(normalized) ? "an" : "a";
}

function slugifyFactKeyPart(value: string): string {
  return normalizeFactTopic(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeFactKind(value: unknown): AuriLifeMemoryFactKind {
  const normalized = normalizeText(typeof value === "string" ? value : "", 24).toLowerCase();
  switch (normalized) {
    case "favorite":
    case "likes":
    case "dislikes":
    case "interest":
    case "preference":
    case "location":
    case "origin":
    case "work":
    case "pet":
      return normalized;
    default:
      return "preference";
  }
}

function normalizeRelationshipKind(value: unknown): AuriLifeMemoryRelationshipKind {
  const normalized = normalizeText(typeof value === "string" ? value : "", 24).toLowerCase();
  switch (normalized) {
    case "romantic":
    case "romance":
    case "negative":
      return normalized === "romantic" ? "romance" : normalized;
    default:
      return "friendship";
  }
}

function normalizeUnit(value: unknown, fallback: number): number {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, candidate));
}

function dominantRelationshipProgress(
  kind: AuriLifeMemoryRelationshipKind,
  friendship: number,
  romance: number,
  tension: number
): number {
  switch (kind) {
    case "romance":
      return romance;
    case "negative":
      return tension;
    default:
      return friendship;
  }
}

function describeRelationshipState(
  kind: AuriLifeMemoryRelationshipKind,
  progress: number
): { title: string; subtitle: string } {
  const boundedProgress = Math.max(0, Math.min(1, progress));
  switch (kind) {
    case "romance":
      if (boundedProgress < 0.18) {
        return { title: "Crush", subtitle: "There is a spark in the air." };
      }
      if (boundedProgress < 0.38) {
        return { title: "Flirting", subtitle: "Playful, interested, and testing the waters." };
      }
      if (boundedProgress < 0.63) {
        return { title: "Dating", subtitle: "Clearly mutual and growing." };
      }
      if (boundedProgress < 0.84) {
        return { title: "Committed", subtitle: "Serious, steady, and emotionally tied in." };
      }
      return { title: "Deep Bond", subtitle: "Strong, lasting, and intimate." };
    case "negative":
      if (boundedProgress < 0.34) {
        return { title: "Tense", subtitle: "Something feels hurt and guarded between them." };
      }
      if (boundedProgress < 0.67) {
        return { title: "Strained", subtitle: "The connection feels bruised and needs repair." };
      }
      return { title: "Hostile", subtitle: "Very strained and ready to snap." };
    default:
      if (boundedProgress < 0.18) {
        return { title: "Acquaintances", subtitle: "Just getting to know each other." };
      }
      if (boundedProgress < 0.38) {
        return { title: "New Friend", subtitle: "A little warmer and more familiar." };
      }
      if (boundedProgress < 0.63) {
        return { title: "Friend", subtitle: "Comfortable and steady." };
      }
      if (boundedProgress < 0.84) {
        return { title: "Good Friends", subtitle: "Close, easy, and familiar." };
      }
      return { title: "Best Friend", subtitle: "Very close and deeply trusted." };
  }
}

export function createDefaultRelationshipStatus(): AuriLifeMemoryRelationshipStatus {
  const kind: AuriLifeMemoryRelationshipKind = "friendship";
  const progress = 0.06;
  const descriptor = describeRelationshipState(kind, progress);
  return {
    id: "acquaintances",
    title: descriptor.title,
    subtitle: descriptor.subtitle,
    kind,
    progress,
    friendship: progress,
    romance: 0,
    tension: 0
  };
}

export function normalizeAuriRelationshipStatus(value: unknown): AuriLifeMemoryRelationshipStatus {
  return normalizeRelationshipStatus(value) ?? createDefaultRelationshipStatus();
}

export function formatAuriRelationshipStatus(status: AuriLifeMemoryRelationshipStatus | null | undefined): string {
  const resolved = status ?? createDefaultRelationshipStatus();
  return `${resolved.title} (${resolved.kind}; friendship ${Math.round(resolved.friendship * 100)}%; romance ${Math.round(
    resolved.romance * 100
  )}%; tension ${Math.round(resolved.tension * 100)}%)`;
}

export function evolveAuriRelationshipStatus(
  status: AuriLifeMemoryRelationshipStatus | null | undefined,
  message: string
): AuriLifeMemoryRelationshipStatus {
  const current = normalizeAuriRelationshipStatus(status);
  const normalizedMessage = normalizeText(message, 240).toLowerCase();
  if (!normalizedMessage) {
    return current;
  }

  const containsAny = (phrases: string[]): boolean => phrases.some((phrase) => normalizedMessage.includes(phrase));
  const negativityScore = containsAny([
    "hate you",
    "hate this",
    "shut up",
    "go away",
    "leave me alone",
    "idiot",
    "stupid",
    "dumb",
    "ugly",
    "gross",
    "annoying",
    "awful",
    "terrible",
    "worst",
    "sucks",
    "you suck",
    "mad at you",
    "i'm mad",
    "im mad",
    "i am mad",
    "not like you",
    "don't like you",
    "dont like you"
  ])
    ? 1
    : 0;
  const romanceScore = containsAny([
    "crush",
    "date",
    "dating",
    "flirt",
    "flirting",
    "romantic",
    "boyfriend",
    "girlfriend",
    "husband",
    "wife",
    "kiss",
    "love you",
    "i love you",
    "deep bond",
    "be mine",
    "relationship"
  ])
    ? 1
    : 0;
  const warmthScore = containsAny([
    "thanks",
    "thank you",
    "care about you",
    "you matter",
    "i miss you",
    "miss you",
    "proud of you",
    "best friend",
    "friend",
    "sweet",
    "cute",
    "pretty",
    "beautiful",
    "love you",
    "hug"
  ])
    ? 1
    : 0;

  let friendship = current.friendship;
  let romance = current.romance;
  let tension = current.tension;
  let kind = current.kind;
  let progress = current.progress;

  if (negativityScore > 0) {
    tension = Math.min(1, tension + 0.18);
    friendship = Math.max(0, friendship - 0.10);
    romance = Math.max(0, romance - 0.06);
  }

  if (romanceScore > 0) {
    kind = "romance";
    romance = Math.min(1, Math.max(romance, current.kind === "romance" ? current.progress : 0.12) + 0.08);
    friendship = Math.min(1, friendship + 0.02);
    tension = Math.max(0, tension - 0.04);
  } else if (warmthScore > 0) {
    if (kind === "negative" && tension < 0.45) {
      kind = "friendship";
    }
    friendship = Math.min(1, friendship + 0.06);
    tension = Math.max(0, tension - 0.05);
  }

  if (kind === "friendship" && romance >= 0.42 && romance > friendship) {
    kind = "romance";
  }
  if (tension >= 0.62 && friendship < 0.34 && romance < 0.34) {
    kind = "negative";
  } else if (kind === "negative" && tension < 0.38 && friendship >= 0.30) {
    kind = romance > friendship ? "romance" : "friendship";
  }

  switch (kind) {
    case "romance":
      progress = romance;
      break;
    case "negative":
      progress = tension;
      break;
    default:
      progress = friendship;
      break;
  }

  const descriptor = describeRelationshipState(kind, progress);
  return {
    id: current.id || "acquaintances",
    title: descriptor.title,
    subtitle: descriptor.subtitle,
    kind,
    progress,
    friendship: Math.max(0, Math.min(1, friendship)),
    romance: Math.max(0, Math.min(1, romance)),
    tension: Math.max(0, Math.min(1, tension))
  };
}

function normalizeFact(raw: unknown): AuriLifeMemoryFact | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const key = normalizeText(typeof record.key === "string" ? record.key : "", 120);
  const topic = normalizeFactTopic(typeof record.topic === "string" ? record.topic : "");
  const statement = normalizeText(typeof record.statement === "string" ? record.statement : "", 180);
  const sourceText = normalizeText(typeof record.sourceText === "string" ? record.sourceText : "", 180);
  if (!key || !topic || !statement) {
    return null;
  }

  const firstLearnedAt = normalizeIsoDate(typeof record.firstLearnedAt === "string" ? record.firstLearnedAt : "") || new Date().toISOString();
  const lastConfirmedAt = normalizeIsoDate(typeof record.lastConfirmedAt === "string" ? record.lastConfirmedAt : "") || firstLearnedAt;
  const mentions =
    typeof record.mentions === "number" && Number.isFinite(record.mentions)
      ? Math.max(1, Math.round(record.mentions))
      : 1;

  return {
    key,
    kind: normalizeFactKind(record.kind),
    topic,
    statement,
    sourceText,
    firstLearnedAt,
    lastConfirmedAt,
    mentions
  };
}

function normalizeSituationKind(value: unknown): AuriLifeMemorySituationKind {
  const normalized = normalizeText(typeof value === "string" ? value : "", 32).toLowerCase();
  switch (normalized) {
    case "stress":
    case "upcoming_event":
    case "ongoing_challenge":
    case "recent_win":
    case "support_need":
    case "health_worry":
      return normalized;
    default:
      return "ongoing_challenge";
  }
}

function normalizeSituation(raw: unknown): AuriLifeMemorySituation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const key = normalizeText(typeof record.key === "string" ? record.key : "", 120);
  const topic = normalizeFactTopic(typeof record.topic === "string" ? record.topic : "");
  const statement = normalizeText(typeof record.statement === "string" ? record.statement : "", 200);
  const sourceText = normalizeText(typeof record.sourceText === "string" ? record.sourceText : "", 200);
  if (!key || !topic || !statement) {
    return null;
  }

  const firstLearnedAt = normalizeIsoDate(typeof record.firstLearnedAt === "string" ? record.firstLearnedAt : "") || new Date().toISOString();
  const lastUpdatedAt =
    normalizeIsoDate(typeof record.lastUpdatedAt === "string" ? record.lastUpdatedAt : "") || firstLearnedAt;
  const mentions =
    typeof record.mentions === "number" && Number.isFinite(record.mentions)
      ? Math.max(1, Math.round(record.mentions))
      : 1;

  return {
    key,
    kind: normalizeSituationKind(record.kind),
    topic,
    statement,
    sourceText,
    firstLearnedAt,
    lastUpdatedAt,
    mentions
  };
}

function cleanFactFragment(value: string): string {
  return normalizeFactTopic(value)
    .replace(/^(?:that|about|like|to)\s+/i, "")
    .trim();
}

function cleanSituationFragment(value: string): string {
  return normalizeFactTopic(value)
    .replace(/^(?:that|about|around|with|over|for|because of|from)\s+/i, "")
    .trim();
}

function shouldIgnoreFactTopic(topic: string): boolean {
  const normalized = topic.toLowerCase();
  if (!normalized || normalized.length < 2) {
    return true;
  }

  const blockedStarts = [
    "you",
    "u",
    "it",
    "this",
    "that",
    "me",
    "us",
    "we",
    "myself",
    "your"
  ];

  if (blockedStarts.some((entry) => normalized === entry || normalized.startsWith(`${entry} `))) {
    return true;
  }

  if (/^(?:being|talking|chatting|hanging)\b/.test(normalized)) {
    return true;
  }

  return false;
}

type DurableFactCandidate = {
  key: string;
  kind: AuriLifeMemoryFactKind;
  topic: string;
  statement: string;
  sourceText: string;
};

type SituationalMemoryCandidate = {
  key: string;
  kind: AuriLifeMemorySituationKind;
  topic: string;
  statement: string;
  sourceText: string;
};

function buildFactCandidate(
  kind: AuriLifeMemoryFactKind,
  key: string,
  topic: string,
  statement: string,
  sourceText: string
): DurableFactCandidate | null {
  const normalizedTopic = cleanFactFragment(topic);
  const normalizedStatement = normalizeText(statement, 180);
  const normalizedSource = normalizeText(sourceText, 180);
  if (!normalizedTopic || !normalizedStatement || shouldIgnoreFactTopic(normalizedTopic)) {
    return null;
  }

  return {
    key: normalizeText(key, 120),
    kind,
    topic: normalizedTopic,
    statement: normalizedStatement,
    sourceText: normalizedSource
  };
}

function buildSituationCandidate(
  kind: AuriLifeMemorySituationKind,
  key: string,
  topic: string,
  statement: string,
  sourceText: string
): SituationalMemoryCandidate | null {
  const normalizedTopic = cleanSituationFragment(topic);
  const normalizedStatement = normalizeText(statement, 200);
  const normalizedSource = normalizeText(sourceText, 200);
  if (!normalizedTopic || !normalizedStatement || shouldIgnoreFactTopic(normalizedTopic)) {
    return null;
  }

  return {
    key: normalizeText(key, 120),
    kind,
    topic: normalizedTopic,
    statement: normalizedStatement,
    sourceText: normalizedSource
  };
}

function extractDurableFactCandidates(message: string): DurableFactCandidate[] {
  const trimmed = normalizeText(message, 320);
  if (!trimmed) {
    return [];
  }

  const candidates = new Map<string, DurableFactCandidate>();
  const register = (candidate: DurableFactCandidate | null) => {
    if (!candidate?.key) {
      return;
    }
    candidates.set(candidate.key, candidate);
  };

  const favoriteMatch = trimmed.match(/\bmy favorite ([a-z][a-z0-9'& /-]{0,24}) is ([^.?!]{1,90})/i);
  if (favoriteMatch) {
    const subject = cleanFactFragment(favoriteMatch[1]).toLowerCase();
    const value = cleanFactFragment(favoriteMatch[2]);
    const subjectKey = slugifyFactKeyPart(subject);
    if (subjectKey && value) {
      register(
        buildFactCandidate(
          "favorite",
          `favorite:${subjectKey}`,
          `${subject} ${value}`,
          `Their favorite ${subject} is ${value}.`,
          trimmed
        )
      );
    }
  }

  const loveLikeMatch = trimmed.match(/\bi (?:really |absolutely |honestly |definitely )?(love|like|enjoy)\s+([^.?!]{2,100})/i);
  if (loveLikeMatch) {
    const verb = loveLikeMatch[1].toLowerCase();
    const object = cleanFactFragment(loveLikeMatch[2]);
    const topicKey = slugifyFactKeyPart(object);
    if (topicKey && !shouldIgnoreFactTopic(object) && !/\b(?:because|when)\b/i.test(object)) {
      register(
        buildFactCandidate(
          "likes",
          `preference:${topicKey}`,
          object,
          `They ${verb} ${object}.`,
          trimmed
        )
      );
    }
  }

  const dislikeMatch = trimmed.match(/\bi (?:(?:really )?(?:hate|dislike)|do not like|don't like|cant stand|can't stand)\s+([^.?!]{2,100})/i);
  if (dislikeMatch) {
    const object = cleanFactFragment(dislikeMatch[1]);
    const topicKey = slugifyFactKeyPart(object);
    if (topicKey && !shouldIgnoreFactTopic(object)) {
      register(
        buildFactCandidate(
          "dislikes",
          `preference:${topicKey}`,
          object,
          `They don't like ${object}.`,
          trimmed
        )
      );
    }
  }

  const interestMatch = trimmed.match(/\bi(?:'m| am) (?:really )?(?:into|interested in|a huge fan of)\s+([^.?!]{2,100})/i);
  if (interestMatch) {
    const object = cleanFactFragment(interestMatch[1]);
    const topicKey = slugifyFactKeyPart(object);
    if (topicKey && !shouldIgnoreFactTopic(object)) {
      register(
        buildFactCandidate(
          "interest",
          `interest:${topicKey}`,
          object,
          `They're into ${object}.`,
          trimmed
        )
      );
    }
  }

  const preferMatch = trimmed.match(/\bi prefer\s+([^.?!]{2,60})(?:\s+over\s+([^.?!]{2,60}))?/i);
  if (preferMatch) {
    const preferred = cleanFactFragment(preferMatch[1]);
    const over = cleanFactFragment(preferMatch[2] || "");
    const topicKey = slugifyFactKeyPart(preferred || over);
    if (topicKey && preferred) {
      const statement = over ? `They prefer ${preferred} over ${over}.` : `They prefer ${preferred}.`;
      register(buildFactCandidate("preference", `preference:${topicKey}`, over ? `${preferred} over ${over}` : preferred, statement, trimmed));
    }
  }

  const liveInMatch = trimmed.match(/\bi live in\s+([a-z][a-z0-9' .-]{1,60})/i);
  if (liveInMatch) {
    const place = cleanFactFragment(liveInMatch[1]);
    if (place) {
      register(buildFactCandidate("location", "location:home", place, `They live in ${place}.`, trimmed));
    }
  }

  const fromMatch = trimmed.match(/\bi(?:'m| am| come) from\s+([a-z][a-z0-9' .-]{1,60})/i);
  if (fromMatch) {
    const place = cleanFactFragment(fromMatch[1]);
    if (place) {
      register(buildFactCandidate("origin", "origin:home", place, `They're from ${place}.`, trimmed));
    }
  }

  const workAsMatch = trimmed.match(/\bi work as\s+(?:a|an)?\s*([a-z][a-z0-9' -]{1,50})/i);
  if (workAsMatch) {
    const role = cleanFactFragment(workAsMatch[1]);
    if (role) {
      register(buildFactCandidate("work", "work:role", role, `They work as ${role}.`, trimmed));
    }
  }

  const workInMatch = trimmed.match(/\bi work in\s+([a-z][a-z0-9' -]{1,50})/i);
  if (workInMatch) {
    const field = cleanFactFragment(workInMatch[1]);
    if (field) {
      register(buildFactCandidate("work", "work:field", field, `They work in ${field}.`, trimmed));
    }
  }

  const jobIsMatch = trimmed.match(/\bmy job is\s+(?:a|an)?\s*([a-z][a-z0-9' -]{1,50})/i);
  if (jobIsMatch) {
    const role = cleanFactFragment(jobIsMatch[1]);
    if (role) {
      register(buildFactCandidate("work", "work:role", role, `Their job is ${role}.`, trimmed));
    }
  }

  const namedPetMatch = trimmed.match(/\bi have\s+(?:a|an)\s+(dog|cat|rabbit|bunny|bird|hamster|fish|turtle|ferret|lizard)\s+named\s+([a-z][a-z' -]{0,30})/i);
  if (namedPetMatch) {
    const animal = cleanFactFragment(namedPetMatch[1]).toLowerCase();
    const petName = cleanFactFragment(namedPetMatch[2]);
    const keyPart = slugifyFactKeyPart(`${animal}-${petName}`);
    if (animal && petName && keyPart) {
      register(
        buildFactCandidate(
          "pet",
          `pet:${keyPart}`,
          `${animal} ${petName}`,
          `They have a ${animal} named ${petName}.`,
          trimmed
        )
      );
    }
  }

  const petMatch = trimmed.match(/\bi have\s+(?:a|an)\s+(dog|cat|rabbit|bunny|bird|hamster|fish|turtle|ferret|lizard)\b/i);
  if (petMatch) {
    const animal = cleanFactFragment(petMatch[1]).toLowerCase();
    if (animal) {
      register(buildFactCandidate("pet", `pet:${animal}`, animal, `They have a ${animal}.`, trimmed));
    }
  }

  return [...candidates.values()].slice(0, 6);
}

function extractSituationalMemoryCandidates(message: string): SituationalMemoryCandidate[] {
  const trimmed = normalizeText(message, 360);
  if (!trimmed) {
    return [];
  }

  const candidates = new Map<string, SituationalMemoryCandidate>();
  const register = (candidate: SituationalMemoryCandidate | null) => {
    if (!candidate?.key) {
      return;
    }
    candidates.set(candidate.key, candidate);
  };

  const roughPeriodMatch = trimmed.match(
    /\bi(?:'ve| have| had)?\s*(?:been\s+)?(?:having\s+)?(?:a\s+)?(rough|hard|bad|stressful|exhausting|long)\s+(day|week|month)(?:\s+(?:at|with|because of|from)\s+([^.?!]{2,90}))?/i
  );
  if (roughPeriodMatch) {
    const tone = roughPeriodMatch[1].toLowerCase();
    const period = cleanSituationFragment(roughPeriodMatch[2]).toLowerCase();
    const cause = cleanSituationFragment(roughPeriodMatch[3] || "");
    const topic = cause ? `${tone} ${period} with ${cause}` : `${tone} ${period}`;
    const keyPart = slugifyFactKeyPart(cause || `${tone}-${period}`);
    if (keyPart) {
      const statement = cause
        ? `They've been having a ${tone} ${period} with ${cause}.`
        : `They've been having a ${tone} ${period}.`;
      register(buildSituationCandidate("ongoing_challenge", `situation:${keyPart}`, topic, statement, trimmed));
    }
  }

  const stressMatch = trimmed.match(
    /\bi(?:'ve| have)?\s*been\s+(stressed|anxious|overwhelmed|burned out|exhausted|worried)(?:\s+(?:about|over|because of)\s+([^.?!]{2,100}))?(?:\s+lately)?/i
  );
  if (stressMatch) {
    const feeling = cleanSituationFragment(stressMatch[1]).toLowerCase();
    const cause = cleanSituationFragment(stressMatch[2] || "");
    const keyPart = slugifyFactKeyPart(cause || feeling);
    if (keyPart) {
      const statement = cause
        ? `They've been feeling ${feeling} about ${cause}.`
        : `They've been feeling ${feeling} lately.`;
      register(buildSituationCandidate("stress", `stress:${keyPart}`, cause || feeling, statement, trimmed));
    }
  }

  const upcomingHaveMatch = trimmed.match(
    /\bi(?:'ve got| have| got)\s+(?:an?|the)?\s*(exam|test|quiz|interview|presentation|meeting|deadline|appointment|wedding|trip|concert|class|shift|flight)\s+(tomorrow|tonight|this weekend|this week|next week|next month|on [^.?!]{2,30})/i
  );
  if (upcomingHaveMatch) {
    const eventName = cleanSituationFragment(upcomingHaveMatch[1]).toLowerCase();
    const timing = cleanSituationFragment(upcomingHaveMatch[2]).toLowerCase();
    const keyPart = slugifyFactKeyPart(`${eventName}-${timing}`);
    if (keyPart) {
      register(
        buildSituationCandidate(
          "upcoming_event",
          `event:${keyPart}`,
          `${eventName} ${timing}`,
          `They have ${indefiniteArticleFor(eventName)} ${eventName} ${timing}.`,
          trimmed
        )
      );
    }
  }

  const goingToMatch = trimmed.match(
    /\bi(?:'m| am)(?:\s+going\s+to|\s+headed\s+to)\s+([^.?!]{2,100})\s+(tomorrow|tonight|this weekend|this week|next week|next month|on [^.?!]{2,30})/i
  );
  if (goingToMatch) {
    const eventName = cleanSituationFragment(goingToMatch[1]);
    const timing = cleanSituationFragment(goingToMatch[2]).toLowerCase();
    const keyPart = slugifyFactKeyPart(`${eventName}-${timing}`);
    if (keyPart) {
      register(
        buildSituationCandidate(
          "upcoming_event",
          `event:${keyPart}`,
          `${eventName} ${timing}`,
          `They're going to ${eventName} ${timing}.`,
          trimmed
        )
      );
    }
  }

  const lovedOneConcernMatch = trimmed.match(
    /\bmy\s+([a-z][a-z' -]{1,30})\s+is\s+(sick|ill|in the hospital|not doing well|having surgery|hurt|injured)\b/i
  );
  if (lovedOneConcernMatch) {
    const subject = cleanSituationFragment(lovedOneConcernMatch[1]).toLowerCase();
    const condition = cleanSituationFragment(lovedOneConcernMatch[2]).toLowerCase();
    const keyPart = slugifyFactKeyPart(`${subject}-${condition}`);
    if (keyPart) {
      register(
        buildSituationCandidate(
          "health_worry",
          `concern:${keyPart}`,
          `${subject} ${condition}`,
          `Their ${subject} is ${condition}.`,
          trimmed
        )
      );
    }
  }

  const supportNeedMatch = trimmed.match(
    /\bi(?:\s+could\s+really\s+use|\s+need)\s+(?:some\s+)?(support|help|luck|encouragement|a break|rest)\b(?:\s+(?:with|for)\s+([^.?!]{2,90}))?/i
  );
  if (supportNeedMatch) {
    const need = cleanSituationFragment(supportNeedMatch[1]).toLowerCase();
    const cause = cleanSituationFragment(supportNeedMatch[2] || "");
    const keyPart = slugifyFactKeyPart(cause || need);
    if (keyPart) {
      const statement = cause
        ? `They need ${need} for ${cause}.`
        : `They need ${need} right now.`;
      register(buildSituationCandidate("support_need", `support:${keyPart}`, cause || need, statement, trimmed));
    }
  }

  const recentWinMatch = trimmed.match(
    /\bi(?:\s+just)?\s*(got|landed|passed|finished|won)\s+([^.?!]{2,100})/i
  );
  if (recentWinMatch) {
    const verb = cleanSituationFragment(recentWinMatch[1]).toLowerCase();
    const thing = cleanSituationFragment(recentWinMatch[2]);
    const keyPart = slugifyFactKeyPart(thing);
    if (keyPart && thing && !/\b(?:you|this|that)\b/i.test(thing)) {
      register(
        buildSituationCandidate(
          "recent_win",
          `win:${keyPart}`,
          thing,
          `They ${verb} ${thing}.`,
          trimmed
        )
      );
    }
  }

  return [...candidates.values()].slice(0, 5);
}

export function sanitizeAuriLifeId(value: string): string {
  const normalized = value.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 80);
}

export function resolveAuriTemplateWorkspaceDir(): string {
  return path.join(process.cwd(), "ios", "Auri", "agent-workspace");
}

export function resolveAuriRuntimeRoot(): string {
  const configuredRoot = trimmedEnv(process.env.AURI_AGENT_WORKSPACE_ROOT);
  if (configuredRoot) {
    return configuredRoot;
  }

  return path.join(os.homedir(), ".openclaw", "auri-chat");
}

export function resolveAuriLifeWorkspaceDir(lifeId: string): string {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  return path.join(resolveAuriRuntimeRoot(), "lives", sanitizedLifeId || "unknown-life");
}

function memoryJsonPath(lifeId: string): string {
  return path.join(resolveAuriLifeWorkspaceDir(lifeId), "memory.json");
}

async function ensureLifeWorkspaceDir(lifeId: string): Promise<string> {
  const workspaceDir = resolveAuriLifeWorkspaceDir(lifeId);
  await fs.mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

function createBlankMemory(lifeId: string, name: string): AuriLifeMemory {
  const now = new Date().toISOString();
  return {
    version: 1,
    lifeId: sanitizeAuriLifeId(lifeId) || "unknown-life",
    firstSeenAt: now,
    lastSeenAt: now,
    lastKnownName: normalizeText(name || "Auri", 60) || "Auri",
    humanName: null,
    humanProfile: null,
    relationshipStatus: null,
    totalTurns: 0,
    durableFacts: [],
    situationalMemories: [],
    careMoments: [],
    chatMoments: []
  };
}

function normalizeMemory(raw: unknown, fallbackLifeId: string, fallbackName: string): AuriLifeMemory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createBlankMemory(fallbackLifeId, fallbackName);
  }

  const record = raw as Record<string, unknown>;
  const lifeId = sanitizeAuriLifeId(typeof record.lifeId === "string" ? record.lifeId : fallbackLifeId) || "unknown-life";
  const firstSeenAt = normalizeIsoDate(typeof record.firstSeenAt === "string" ? record.firstSeenAt : "") || new Date().toISOString();
  const lastSeenAt = normalizeIsoDate(typeof record.lastSeenAt === "string" ? record.lastSeenAt : "") || firstSeenAt;
  const lastKnownName = normalizeText(typeof record.lastKnownName === "string" ? record.lastKnownName : fallbackName || "Auri", 60) || "Auri";
  const humanProfile = normalizeHumanProfile(record.humanProfile);
  const humanName =
    (typeof record.humanName === "string" ? normalizeHumanName(record.humanName) : null) ||
    (humanProfile ? firstNameFromFullName(humanProfile.fullName) : null);
  const relationshipStatus = normalizeRelationshipStatus(record.relationshipStatus);
  const totalTurns = typeof record.totalTurns === "number" && Number.isFinite(record.totalTurns) ? Math.max(0, Math.round(record.totalTurns)) : 0;
  const durableFacts = Array.isArray(record.durableFacts)
    ? record.durableFacts
        .map(normalizeFact)
        .filter((entry): entry is AuriLifeMemoryFact => entry !== null)
        .slice(-MAX_DURABLE_FACTS)
    : [];
  const situationalMemories = Array.isArray(record.situationalMemories)
    ? record.situationalMemories
        .map(normalizeSituation)
        .filter((entry): entry is AuriLifeMemorySituation => entry !== null)
        .slice(-MAX_SITUATIONAL_MEMORIES)
    : [];

  const careMoments = Array.isArray(record.careMoments)
    ? record.careMoments
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }

          const candidate = entry as Record<string, unknown>;
          const key = normalizeText(typeof candidate.key === "string" ? candidate.key : "", 220);
          const kind = normalizeText(typeof candidate.kind === "string" ? candidate.kind : "note", 40) || "note";
          const summary = normalizeText(typeof candidate.summary === "string" ? candidate.summary : "", 240);
          const date = normalizeIsoDate(typeof candidate.date === "string" ? candidate.date : "");
          if (!summary) {
            return null;
          }

          return {
            key: key || `${kind}|${summary}|${date}`,
            kind,
            summary,
            date
          } satisfies AuriLifeMemoryEvent;
        })
        .filter((entry): entry is AuriLifeMemoryEvent => entry !== null && entry.kind !== "discipline")
        .slice(-MAX_CARE_MOMENTS)
    : [];

  const chatMoments = Array.isArray(record.chatMoments)
    ? record.chatMoments
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }

          const candidate = entry as Record<string, unknown>;
          const role = candidate.role === "assistant" ? "assistant" : candidate.role === "user" ? "user" : null;
          const text = normalizeText(typeof candidate.text === "string" ? candidate.text : "", 320);
          const date = normalizeIsoDate(typeof candidate.date === "string" ? candidate.date : "");
          if (!role || !text) {
            return null;
          }

          return {
            role,
            text,
            date
          } satisfies AuriLifeMemoryChat;
        })
        .filter((entry): entry is AuriLifeMemoryChat => entry !== null)
        .slice(-MAX_CHAT_MOMENTS)
    : [];

  return {
    version: 1,
    lifeId,
    firstSeenAt,
    lastSeenAt,
    lastKnownName,
    humanName,
    humanProfile,
    relationshipStatus,
    totalTurns,
    durableFacts,
    situationalMemories,
    careMoments,
    chatMoments
  };
}

export async function loadAuriLifeMemory(lifeId: string, name: string): Promise<AuriLifeMemory> {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  const fallback = createBlankMemory(sanitizedLifeId, name);
  if (!sanitizedLifeId) {
    return fallback;
  }

  await ensureLifeWorkspaceDir(sanitizedLifeId);

  try {
    const raw = await fs.readFile(memoryJsonPath(sanitizedLifeId), "utf8");
    return normalizeMemory(JSON.parse(raw), sanitizedLifeId, name);
  } catch {
    return fallback;
  }
}

export async function saveAuriLifeMemory(memory: AuriLifeMemory): Promise<void> {
  const sanitizedLifeId = sanitizeAuriLifeId(memory.lifeId);
  if (!sanitizedLifeId) {
    return;
  }

  await ensureLifeWorkspaceDir(sanitizedLifeId);
  await fs.writeFile(memoryJsonPath(sanitizedLifeId), `${JSON.stringify(memory, null, 2)}\n`, "utf8");
}

export async function writeAuriLifeWorkspaceFiles(
  lifeId: string,
  files: Record<string, string>
): Promise<void> {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  if (!sanitizedLifeId) {
    return;
  }

  const workspaceDir = await ensureLifeWorkspaceDir(sanitizedLifeId);
  await Promise.all(
    Object.entries(files).map(async ([filename, contents]) => {
      if (!filename.trim()) {
        return;
      }

      await fs.writeFile(path.join(workspaceDir, filename), `${contents.trim()}\n`, "utf8");
    })
  );
}

export async function deleteAuriLifeWorkspace(lifeId: string): Promise<void> {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  if (!sanitizedLifeId) {
    return;
  }

  await fs.rm(resolveAuriLifeWorkspaceDir(sanitizedLifeId), { recursive: true, force: true });
}

export function rememberAuriCare(
  memory: AuriLifeMemory,
  events: Array<{ kind: string; summary: string; date: string }>
): AuriLifeMemory {
  const existingKeys = new Set(memory.careMoments.map((entry) => entry.key));
  const nextCareMoments = [...memory.careMoments];

  for (const event of events) {
    const kind = normalizeText(event.kind || "note", 40) || "note";
    if (kind === "discipline" || kind === "message" || kind === "reply") {
      continue;
    }
    const summary = normalizeText(event.summary || "", 240);
    const date = normalizeIsoDate(event.date || "");
    if (!summary) {
      continue;
    }

    const key = `${kind}|${summary}|${date}`;
    if (existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);
    nextCareMoments.push({ key, kind, summary, date });
  }

  memory.careMoments = nextCareMoments.slice(-MAX_CARE_MOMENTS);
  memory.lastSeenAt = new Date().toISOString();
  return memory;
}

export function rememberAuriConversationTurn(
  memory: AuriLifeMemory,
  userMessage: string,
  reply: string,
  timestamp: string
): AuriLifeMemory {
  const normalizedTimestamp = normalizeIsoDate(timestamp) || new Date().toISOString();
  const nextChatMoments = [...memory.chatMoments];
  const trimmedUserMessage = normalizeText(userMessage, 320);
  const trimmedReply = normalizeText(reply, 320);

  if (trimmedUserMessage) {
    nextChatMoments.push({
      role: "user",
      text: trimmedUserMessage,
      date: normalizedTimestamp
    });
  }

  if (trimmedReply) {
    nextChatMoments.push({
      role: "assistant",
      text: trimmedReply,
      date: normalizedTimestamp
    });
  }

  memory.chatMoments = nextChatMoments.slice(-MAX_CHAT_MOMENTS);
  memory.totalTurns += 1;
  memory.lastSeenAt = normalizedTimestamp;
  return memory;
}

export function rememberAuriDurableFacts(
  memory: AuriLifeMemory,
  message: string,
  timestamp: string
): AuriLifeMemory {
  const normalizedTimestamp = normalizeIsoDate(timestamp) || new Date().toISOString();
  const extractedFacts = extractDurableFactCandidates(message);
  if (!extractedFacts.length) {
    return memory;
  }

  const nextFacts = [...memory.durableFacts];
  for (const fact of extractedFacts) {
    const existingIndex = nextFacts.findIndex((entry) => entry.key === fact.key);
    if (existingIndex >= 0) {
      const existing = nextFacts[existingIndex];
      nextFacts[existingIndex] = {
        ...existing,
        kind: fact.kind,
        topic: fact.topic,
        statement: fact.statement,
        sourceText: fact.sourceText,
        lastConfirmedAt: normalizedTimestamp,
        mentions: existing.mentions + 1
      };
    } else {
      nextFacts.push({
        key: fact.key,
        kind: fact.kind,
        topic: fact.topic,
        statement: fact.statement,
        sourceText: fact.sourceText,
        firstLearnedAt: normalizedTimestamp,
        lastConfirmedAt: normalizedTimestamp,
        mentions: 1
      });
    }
  }

  memory.durableFacts = nextFacts.slice(-MAX_DURABLE_FACTS);
  memory.lastSeenAt = normalizedTimestamp;
  return memory;
}

export function rememberAuriSituations(
  memory: AuriLifeMemory,
  message: string,
  timestamp: string
): AuriLifeMemory {
  const normalizedTimestamp = normalizeIsoDate(timestamp) || new Date().toISOString();
  const extractedSituations = extractSituationalMemoryCandidates(message);
  if (!extractedSituations.length) {
    return memory;
  }

  const nextSituations = [...memory.situationalMemories];
  for (const situation of extractedSituations) {
    const existingIndex = nextSituations.findIndex((entry) => entry.key === situation.key);
    if (existingIndex >= 0) {
      const existing = nextSituations[existingIndex];
      nextSituations[existingIndex] = {
        ...existing,
        kind: situation.kind,
        topic: situation.topic,
        statement: situation.statement,
        sourceText: situation.sourceText,
        lastUpdatedAt: normalizedTimestamp,
        mentions: existing.mentions + 1
      };
    } else {
      nextSituations.push({
        key: situation.key,
        kind: situation.kind,
        topic: situation.topic,
        statement: situation.statement,
        sourceText: situation.sourceText,
        firstLearnedAt: normalizedTimestamp,
        lastUpdatedAt: normalizedTimestamp,
        mentions: 1
      });
    }
  }

  memory.situationalMemories = nextSituations.slice(-MAX_SITUATIONAL_MEMORIES);
  memory.lastSeenAt = normalizedTimestamp;
  return memory;
}

export function renderAuriLifeMemoryMarkdown(memory: AuriLifeMemory): string {
  const durableFactLines = memory.durableFacts.length
    ? memory.durableFacts
        .slice(-16)
        .map((fact) => `- ${fact.statement} [${fact.kind}; mentions=${fact.mentions}]`)
        .join("\n")
    : "- none recorded yet";
  const situationLines = memory.situationalMemories.length
    ? memory.situationalMemories
        .slice(-12)
        .map((situation) => `- ${situation.statement} [${situation.kind}; mentions=${situation.mentions}]`)
        .join("\n")
    : "- none recorded yet";
  const visibleCareMoments = memory.careMoments.filter((event) => event.kind !== "discipline");
  const careLines = visibleCareMoments.length
    ? visibleCareMoments
        .slice(-12)
        .map((event) => `- ${event.kind}: ${event.summary}${event.date ? ` (${event.date})` : ""}`)
        .join("\n")
    : "- none recorded yet";

  const chatLines = memory.chatMoments.length
    ? memory.chatMoments
        .slice(-12)
        .map((entry) => `- ${entry.role === "assistant" ? memory.lastKnownName : memory.humanName || "User"}: ${entry.text}`)
        .join("\n")
    : "- none recorded yet";

  return [
    "# MEMORY.md",
    "",
    `Life ID: ${memory.lifeId}`,
    `Current name: ${memory.lastKnownName}`,
    `Human name: ${memory.humanName || "unknown"}`,
    `Human full name: ${memory.humanProfile?.fullName || "unknown"}`,
    `Pronouns: ${memory.humanProfile?.pronouns || "unknown"}`,
    `Birthday: ${
      memory.humanProfile
        ? `${memory.humanProfile.birthday.month}/${memory.humanProfile.birthday.day}/${memory.humanProfile.birthday.year}`
        : "unknown"
    }`,
    `Relationship state: ${formatAuriRelationshipStatus(memory.relationshipStatus)}`,
    `Core values: ${memory.humanProfile?.coreValues.length ? memory.humanProfile.coreValues.join(", ") : "unknown"}`,
    `Interests: ${memory.humanProfile?.interests.length ? memory.humanProfile.interests.join(", ") : "unknown"}`,
    `First seen: ${memory.firstSeenAt}`,
    `Last seen: ${memory.lastSeenAt}`,
    `Total chat turns this life: ${memory.totalTurns}`,
    "",
    "Durable human facts from conversation:",
    durableFactLines,
    "",
    "Situational human context from conversation:",
    situationLines,
    "",
    "Durable care memories:",
    careLines,
    "",
    "Durable conversation beats:",
    chatLines
  ].join("\n");
}
