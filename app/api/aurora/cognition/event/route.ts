import { NextResponse } from "next/server";
import {
  normalizeConversationEventIngress,
  recordConversationEvent,
  type ConversationEvent
} from "@/lib/auroraCognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EventBody {
  type?: unknown;
  source?: unknown;
  trigger?: unknown;
  userText?: unknown;
  auroraText?: unknown;
  sessionId?: unknown;
  partnerId?: unknown;
  speakerName?: unknown;
  responseId?: unknown;
  complianceId?: unknown;
  latencyMs?: unknown;
  error?: unknown;
  introspection?: {
    chunkCount?: unknown;
    averageChunkLength?: unknown;
    lexicalDiversity?: unknown;
    modelConfidence?: unknown;
    candidateDiversity?: unknown;
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeEvent(input: EventBody): ConversationEvent {
  const type = asString(input.type);
  const source = asString(input.source);
  const trigger = asString(input.trigger);
  const userText = asString(input.userText);
  const auroraText = asString(input.auroraText);
  const sourceNormalization = normalizeConversationEventIngress({
    type: type === "send_error" ? "send_error" : "conversation_turn",
    rawSource: source,
    trigger,
    userText,
    auroraText
  });

  return {
    type: type === "send_error" ? "send_error" : "conversation_turn",
    source: sourceNormalization.source,
    rawSource: sourceNormalization.rawSource ?? undefined,
    trigger,
    userText,
    auroraText,
    sessionId: asString(input.sessionId),
    partnerId: asString(input.partnerId),
    speakerName: asString(input.speakerName),
    responseId: asString(input.responseId),
    complianceId: asString(input.complianceId),
    latencyMs: asNumber(input.latencyMs),
    error: asString(input.error),
    introspection: input.introspection
      ? {
          chunkCount: asNumber(input.introspection.chunkCount),
          averageChunkLength: asNumber(input.introspection.averageChunkLength),
          lexicalDiversity: asNumber(input.introspection.lexicalDiversity),
          modelConfidence: asNumber(input.introspection.modelConfidence),
          candidateDiversity: asNumber(input.introspection.candidateDiversity)
        }
      : undefined
  };
}

export async function POST(request: Request) {
  let body: EventBody;
  try {
    body = (await request.json()) as EventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const event = normalizeEvent(body);
  if (event.type === "conversation_turn" && !event.userText && !event.auroraText) {
    return NextResponse.json({ error: "At least one of userText or auroraText is required." }, { status: 400 });
  }

  const cognition = await recordConversationEvent(event);
  return NextResponse.json({
    ok: true,
    cognition
  });
}
