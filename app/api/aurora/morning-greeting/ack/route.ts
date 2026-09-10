import { NextResponse } from "next/server";
import { acknowledgeMorningGreetingDelivery } from "@/lib/auroraCognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MorningGreetingAckBody {
  messageId?: unknown;
  sessionId?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let body: MorningGreetingAckBody;
  try {
    body = (await request.json()) as MorningGreetingAckBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messageId = asString(body.messageId);
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required." }, { status: 400 });
  }

  const cognition = await acknowledgeMorningGreetingDelivery({
    messageId,
    sessionId: asString(body.sessionId)
  });

  return NextResponse.json({
    ok: true,
    cognition
  });
}
