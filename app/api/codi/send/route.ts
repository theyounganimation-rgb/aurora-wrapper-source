import { NextResponse } from "next/server";
import { sendToVisibleCodexThread } from "@/lib/codi/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body && typeof body === "object" && !Array.isArray(body) ? asString((body as Record<string, unknown>).text) : "";
  if (!text) {
    return NextResponse.json({ ok: false, error: "Field 'text' is required." }, { status: 400 });
  }

  try {
    const result = await sendToVisibleCodexThread(text);
    return NextResponse.json(
      {
        ok: true,
        ...result
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send to the visible Codex thread.";
    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }
}
