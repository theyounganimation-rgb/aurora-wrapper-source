import { NextResponse } from "next/server";
import { readCodiSnapshot } from "@/lib/codi/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await readCodiSnapshot(false);
    return NextResponse.json(
      {
        ok: true,
        ...snapshot
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read the live Codex mirror.";
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
