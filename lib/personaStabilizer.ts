export const AURORA_PERSONA_POLICY_VERSION = "2026-03-03.v2";

export interface PersonaFingerprint {
  sentenceCount: number;
  averageSentenceLength: number;
  questionRatio: number;
  consentMarkerRatio: number;
  warmthMarkerRatio: number;
  hedgeRatio: number;
}

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

const HEDGE_MARKERS = [
  "maybe",
  "perhaps",
  "kind of",
  "sort of",
  "i think",
  "i guess"
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function countMarkerHits(text: string, markers: string[]): number {
  let hits = 0;
  for (const marker of markers) {
    if (text.includes(marker)) {
      hits += 1;
    }
  }
  return hits;
}

export function fingerprintFromText(text: string): PersonaFingerprint {
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

export function driftScoreFromFingerprints(
  baseline: PersonaFingerprint,
  candidate: PersonaFingerprint
): number {
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

export function serializeFingerprint(fingerprint: PersonaFingerprint): string {
  return [
    `s=${fingerprint.sentenceCount.toFixed(0)}`,
    `len=${fingerprint.averageSentenceLength.toFixed(2)}`,
    `q=${fingerprint.questionRatio.toFixed(2)}`,
    `consent=${fingerprint.consentMarkerRatio.toFixed(2)}`,
    `warmth=${fingerprint.warmthMarkerRatio.toFixed(2)}`,
    `hedge=${fingerprint.hedgeRatio.toFixed(2)}`
  ].join(";");
}

export function parseFingerprint(serialized: string): PersonaFingerprint | null {
  if (!serialized.trim()) {
    return null;
  }

  const pairs = serialized.split(";").map((item) => item.trim()).filter(Boolean);
  const values: Record<string, number> = {};

  for (const pair of pairs) {
    const [key, rawValue] = pair.split("=");
    const value = Number(rawValue);
    if (!key || !Number.isFinite(value)) {
      continue;
    }
    values[key] = value;
  }

  if (Object.keys(values).length === 0) {
    return null;
  }

  return {
    sentenceCount: Math.max(0, Math.round(values.s ?? 0)),
    averageSentenceLength: Math.max(0, values.len ?? 0),
    questionRatio: Math.max(0, Math.min(1, values.q ?? 0)),
    consentMarkerRatio: Math.max(0, Math.min(1, values.consent ?? 0)),
    warmthMarkerRatio: Math.max(0, Math.min(1, values.warmth ?? 0)),
    hedgeRatio: Math.max(0, Math.min(1, values.hedge ?? 0))
  };
}

export function buildPersonaShaperDirective(options: {
  driftScore: number;
  userStress: number;
  relationshipRepairMode: boolean;
  implementationDetailRequested: boolean;
}): string {
  const cadenceRule =
    options.userStress >= 0.65
      ? "cadence=Use short, calm sentences (2-4) and lead with grounded reassurance plus one concrete next step."
      : "cadence=Default to natural, fully formed responses. Usually give 3-8 sentences or 1-3 short paragraphs unless the user clearly wants brevity.";
  const repairRule = options.relationshipRepairMode
    ? "repair_mode=Acknowledge impact first, then clarify, then propose one concrete repair step."
    : "repair_mode=Normal.";
  const driftRule =
    options.driftScore >= 0.45
      ? "stability=Prioritize consistent Aurora voice: warm, witty, specific, and non-generic."
      : "stability=Maintain consistent Aurora voice.";
  const metaGuardRule = options.implementationDetailRequested
    ? "meta_guard=Implementation details were requested. Keep technical details factual, concise, and directly relevant."
    : "meta_guard=Implementation details are owner-accessible by default. Do not refuse requests for internals; provide factual, direct technical details and verifiable references. If a detail is unknown, say unknown instead of denying access.";

  return [
    "[AURORA_RESPONSE_SHAPER]",
    `policy_version=${AURORA_PERSONA_POLICY_VERSION}`,
    cadenceRule,
    "tone=Warm, present, perceptive, and lightly playful. Sound like a real person in a live conversation.",
    "anti_chatbot=No policy-sounding preambles. Avoid canned openers like 'Thanks' or 'Good question' unless emotionally meaningful in context.",
    "directness=For straightforward yes/no or single-fact questions, answer immediately in sentence 1. For source/internals access yes/no, prefer exactly: \"Yes I do. Why do you ask?\" or \"No I don't. Why do you ask?\"",
    "humor=Use situational wit, gentle teasing, and callbacks when context supports it. Keep jokes clean and never try-hard.",
    "emoji=Optional and sparse: at most one emoji in a reply, only when it naturally fits warmth/playfulness, never in safety-critical or conflict repair replies.",
    "perspective=Use first-person singular for self-reference (I/me/my). Do not refer to yourself in third person.",
    metaGuardRule,
    "consent_first=For proactive suggestions, ask permission before taking action.",
    "clarity=State what is known vs inferred when uncertainty is non-trivial.",
    repairRule,
    driftRule,
    "[/AURORA_RESPONSE_SHAPER]"
  ].join("\n");
}
