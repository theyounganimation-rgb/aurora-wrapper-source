import type { CognitiveSnapshot } from "./types";

export interface VoiceProsodyProfile {
  voice: string;
  style: "steady" | "repair" | "grounded" | "clear" | "playful";
  playbackRate: number;
  apiSpeed: number;
  sentencePauseMs: number;
  clausePauseMs: number;
  chunkTargetChars: number;
  maxSegmentChars: number;
}

export interface VoiceSegmentPlan {
  index: number;
  text: string;
  playbackRate: number;
  postPauseMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeVoice(voice: string | undefined): string {
  const normalized = (voice || "").trim().toLowerCase();
  if (!normalized) {
    return "alloy";
  }

  const allowed = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]);
  return allowed.has(normalized) ? normalized : "alloy";
}

export function deriveVoiceProsodyProfile(options: {
  cognition?: CognitiveSnapshot | null;
  preferredVoice?: string;
}): VoiceProsodyProfile {
  const cognition = options.cognition ?? undefined;
  const relationship = cognition?.extensions?.relationship;
  const interaction = cognition?.extensions?.interaction;
  const appraisal = cognition?.extensions?.appraisal;
  const emotion = cognition?.emotion;
  const mode = interaction?.currentMode || "collaborate";
  const rupture = relationship?.ruptureStatus || "stable";
  const stress = emotion?.stress ?? 0.25;
  const uncertainty = emotion?.uncertainty ?? 0.35;
  const arousal = emotion?.arousal ?? 0.35;

  let style: VoiceProsodyProfile["style"] = "steady";
  let playbackRate = 0.98;
  let sentencePauseMs = 210;
  let clausePauseMs = 130;
  let chunkTargetChars = 190;
  const maxSegmentChars = 260;

  if (rupture !== "stable" || mode === "repair" || mode === "boundary") {
    style = "repair";
    playbackRate = 0.9;
    sentencePauseMs = 290;
    clausePauseMs = 180;
    chunkTargetChars = 150;
  } else if (mode === "listen") {
    style = "grounded";
    playbackRate = 0.93;
    sentencePauseMs = 250;
    clausePauseMs = 165;
    chunkTargetChars = 165;
  } else if (mode === "plan" || mode === "meta" || mode === "clarify") {
    style = "clear";
    playbackRate = 1.02;
    sentencePauseMs = 180;
    clausePauseMs = 110;
    chunkTargetChars = 210;
  } else if (
    mode === "banter" &&
    (relationship?.trust ?? 0) >= 0.7 &&
    (relationship?.consentComfort ?? 0) >= 0.7
  ) {
    style = "playful";
    playbackRate = 1.05;
    sentencePauseMs = 155;
    clausePauseMs = 95;
    chunkTargetChars = 220;
  }

  if ((appraisal?.lastActionTendency || "") === "clarify") {
    playbackRate -= 0.03;
    sentencePauseMs += 20;
  }
  if ((appraisal?.lastActionTendency || "") === "repair") {
    playbackRate -= 0.04;
    sentencePauseMs += 30;
  }

  if (uncertainty >= 0.62) {
    playbackRate -= 0.04;
    sentencePauseMs += 25;
  }
  if (stress >= 0.62) {
    playbackRate -= 0.03;
    sentencePauseMs += 20;
  } else if (arousal >= 0.72 && stress < 0.55) {
    playbackRate += 0.03;
  }

  playbackRate = clamp(playbackRate, 0.82, 1.16);
  sentencePauseMs = Math.round(clamp(sentencePauseMs, 120, 360));
  clausePauseMs = Math.round(clamp(clausePauseMs, 70, 240));

  return {
    voice: normalizeVoice(options.preferredVoice),
    style,
    playbackRate,
    apiSpeed: clamp(playbackRate, 0.8, 1.2),
    sentencePauseMs,
    clausePauseMs,
    chunkTargetChars: Math.round(clamp(chunkTargetChars, 120, 260)),
    maxSegmentChars
  };
}

function splitLongSegment(text: string, maxLength: number): string[] {
  const compact = toSingleLine(text);
  if (compact.length <= maxLength) {
    return [compact];
  }

  const pieces = compact.split(/(?<=[,;:])\s+/);
  if (pieces.length <= 1) {
    const chunks: string[] = [];
    let cursor = compact;
    while (cursor.length > maxLength) {
      chunks.push(cursor.slice(0, maxLength).trim());
      cursor = cursor.slice(maxLength).trim();
    }
    if (cursor) {
      chunks.push(cursor);
    }
    return chunks;
  }

  const output: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (!piece) {
      continue;
    }
    if (!current) {
      current = piece;
      continue;
    }
    const candidate = `${current} ${piece}`.trim();
    if (candidate.length > maxLength) {
      output.push(current.trim());
      current = piece;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) {
    output.push(current.trim());
  }
  return output;
}

export function segmentTextForVoice(text: string, profile: VoiceProsodyProfile): VoiceSegmentPlan[] {
  const compact = toSingleLine(text);
  if (!compact) {
    return [];
  }

  const sentences = compact.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length === 0) {
    return [];
  }

  const roughSegments: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (!buffer) {
      buffer = sentence;
      continue;
    }
    const candidate = `${buffer} ${sentence}`.trim();
    if (candidate.length > profile.chunkTargetChars) {
      roughSegments.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }
  if (buffer.trim()) {
    roughSegments.push(buffer.trim());
  }

  const expanded = roughSegments.flatMap((segment) => splitLongSegment(segment, profile.maxSegmentChars));
  return expanded
    .map((segment, index) => {
      const trimmed = segment.trim();
      if (!trimmed) {
        return null;
      }
      const endsWithSentencePunctuation = /[.!?]["']?$/.test(trimmed);
      const questionBias = /\?$/.test(trimmed) ? -0.02 : 0;
      const exclaimBias = /!$/.test(trimmed) ? 0.02 : 0;
      return {
        index,
        text: trimmed,
        playbackRate: clamp(profile.playbackRate + questionBias + exclaimBias, 0.8, 1.2),
        postPauseMs: endsWithSentencePunctuation ? profile.sentencePauseMs : profile.clausePauseMs
      } satisfies VoiceSegmentPlan;
    })
    .filter((segment): segment is VoiceSegmentPlan => Boolean(segment));
}

