import { NextResponse } from "next/server";
import { recordVoiceSynthesisEvent } from "@/lib/auroraCognition";
import type { CognitiveSnapshot } from "@/lib/types";
import { deriveVoiceProsodyProfile, segmentTextForVoice } from "@/lib/voicePresence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TtsRequestBody {
  text?: unknown;
  sessionId?: unknown;
  responseId?: unknown;
  complianceId?: unknown;
  voice?: unknown;
  cognition?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeCognition(value: unknown): CognitiveSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as CognitiveSnapshot;
}

async function safeRecordVoice(event: Parameters<typeof recordVoiceSynthesisEvent>[0]): Promise<void> {
  try {
    await recordVoiceSynthesisEvent(event);
  } catch {
    // Voice logging should not block synthesis delivery.
  }
}

async function synthesizeSegment(input: {
  text: string;
  voice: string;
  speed: number;
  style: string;
  model: string;
  apiKey: string;
  includeInstructions: boolean;
}): Promise<ArrayBuffer> {
  const body: Record<string, unknown> = {
    model: input.model,
    voice: input.voice,
    input: input.text,
    response_format: "mp3",
    speed: input.speed
  };

  if (input.includeInstructions) {
    body.instructions =
      input.style === "repair"
        ? "Speak warm, calm, and careful with extra clarity."
        : input.style === "grounded"
        ? "Speak steady and reassuring with gentle pacing."
        : input.style === "clear"
        ? "Speak precise and direct with crisp pacing."
        : input.style === "playful"
        ? "Speak light and bright without exaggeration."
        : "Speak natural and steady.";
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`TTS upstream failed (${response.status}): ${errorBody}`);
  }

  return response.arrayBuffer();
}

export async function POST(request: Request) {
  let body: TtsRequestBody;
  try {
    body = (await request.json()) as TtsRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = asText(body.text);
  if (!text) {
    return NextResponse.json({ error: "Field 'text' is required." }, { status: 400 });
  }

  const ttsEnabled = toBoolean(
    process.env.AURORA_TTS_ENABLED ?? process.env.NEXT_PUBLIC_AURORA_TTS_ENABLED,
    true
  );
  if (!ttsEnabled) {
    return NextResponse.json({ error: "TTS is disabled by configuration." }, { status: 409 });
  }

  const apiKey = asText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is missing for TTS." }, { status: 503 });
  }

  const model = envOrDefault(process.env.OPENAI_TTS_MODEL, "gpt-4o-mini-tts");
  const requestedVoice = asText(body.voice);
  const defaultVoice = envOrDefault(process.env.AURORA_TTS_VOICE, "alloy");
  const cognition = normalizeCognition(body.cognition);
  const profile = deriveVoiceProsodyProfile({
    cognition,
    preferredVoice: requestedVoice || defaultVoice
  });
  const segments = segmentTextForVoice(text, profile);
  if (segments.length === 0) {
    return NextResponse.json({ error: "No speakable text available after normalization." }, { status: 400 });
  }

  const sessionId = asText(body.sessionId);
  const responseId = asText(body.responseId);
  const complianceId = asText(body.complianceId);
  const includeInstructions = toBoolean(process.env.AURORA_TTS_INCLUDE_INSTRUCTIONS, false);
  const startedAt = Date.now();

  await safeRecordVoice({
    stage: "start",
    sessionId,
    responseId,
    complianceId,
    voice: profile.voice,
    style: profile.style,
    segmentCount: segments.length,
    text
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeLine = (value: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };

      writeLine({
        type: "start",
        voice: profile.voice,
        style: profile.style,
        segmentCount: segments.length,
        playbackRate: profile.playbackRate,
        sentencePauseMs: profile.sentencePauseMs
      });

      for (const segment of segments) {
        if (request.signal.aborted) {
          break;
        }

        try {
          const audioBuffer = await synthesizeSegment({
            text: segment.text,
            voice: profile.voice,
            speed: profile.apiSpeed,
            style: profile.style,
            model,
            apiKey,
            includeInstructions
          });
          const audioBase64 = Buffer.from(audioBuffer).toString("base64");
          writeLine({
            type: "chunk",
            index: segment.index,
            text: segment.text,
            audioBase64,
            playbackRate: segment.playbackRate,
            postPauseMs: segment.postPauseMs
          });

          if (
            segment.index === 0 ||
            segment.index === segments.length - 1 ||
            segment.index % 3 === 0
          ) {
            await safeRecordVoice({
              stage: "segment",
              sessionId,
              responseId,
              complianceId,
              voice: profile.voice,
              style: profile.style,
              segmentIndex: segment.index,
              segmentCount: segments.length,
              text: segment.text
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown TTS error.";
          await safeRecordVoice({
            stage: "error",
            sessionId,
            responseId,
            complianceId,
            voice: profile.voice,
            style: profile.style,
            error: message
          });
          writeLine({
            type: "error",
            error: message
          });
          controller.close();
          return;
        }
      }

      const latencyMs = Math.max(0, Date.now() - startedAt);
      await safeRecordVoice({
        stage: "complete",
        sessionId,
        responseId,
        complianceId,
        voice: profile.voice,
        style: profile.style,
        latencyMs,
        segmentCount: segments.length,
        text
      });
      writeLine({
        type: "done",
        latencyMs,
        segments: segments.length
      });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "x-aurora-tts-voice": profile.voice
    }
  });
}

