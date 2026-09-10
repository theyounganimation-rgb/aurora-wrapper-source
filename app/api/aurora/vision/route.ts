import { NextResponse } from "next/server";
import { maybeAnalyzeVisionObservation } from "@/lib/auroraVisionInference";
import { getCognitiveSnapshotReadOnly, persistVisionObservation } from "@/lib/auroraCognition";
import { type AuroraVisionObservationInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VisionBody {
  observation?: unknown;
}

function isVisionObservationInput(value: unknown): value is AuroraVisionObservationInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).observedAt === "string"
  );
}

function isCognitionLockBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed out waiting for cognition lock|cognition lock busy/i.test(message);
}

export async function GET() {
  const cognition = await getCognitiveSnapshotReadOnly();
  return NextResponse.json({
    ok: true,
    vision: cognition.extensions?.worldGrounding?.vision ?? null,
    cognition
  });
}

export async function POST(request: Request) {
  let body: VisionBody;
  try {
    body = (await request.json()) as VisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isVisionObservationInput(body.observation)) {
    return NextResponse.json({ error: "observation with observedAt is required." }, { status: 400 });
  }

  try {
    const analyzed = await maybeAnalyzeVisionObservation(body.observation);
    const cognition = await persistVisionObservation(analyzed.observation);
    return NextResponse.json({
      ok: true,
      accepted: true,
      analysis: {
        applied: analyzed.applied,
        skippedReason: analyzed.skippedReason ?? null,
        error: analyzed.error ?? null
      },
      vision: cognition.extensions?.worldGrounding?.vision ?? null,
      cognition
    });
  } catch (error) {
    if (isCognitionLockBusyError(error)) {
      const cognition = await getCognitiveSnapshotReadOnly();
      return NextResponse.json(
        {
          ok: true,
          accepted: false,
          busy: true,
          vision: cognition.extensions?.worldGrounding?.vision ?? null,
          cognition
        },
        { status: 202 }
      );
    }
    throw error;
  }
}
