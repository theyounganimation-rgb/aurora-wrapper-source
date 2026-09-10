import { NextResponse } from "next/server";
import { runPersonaRegressionReport } from "@/lib/auroraCognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseForce(value: string | null | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) {
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = parseForce(searchParams.get("force"), true);
  const report = await runPersonaRegressionReport({ force });
  return NextResponse.json(
    {
      ok: true,
      report
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: Request) {
  let force = true;
  try {
    const body = (await request.json()) as { force?: unknown };
    if (typeof body.force === "boolean") {
      force = body.force;
    } else if (typeof body.force === "string") {
      force = parseForce(body.force, true);
    }
  } catch {
    // Use default `force=true` when no valid body is supplied.
  }

  const report = await runPersonaRegressionReport({ force });
  return NextResponse.json(
    {
      ok: true,
      report
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
