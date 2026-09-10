import { NextResponse } from "next/server";
import { getCognitiveSnapshotReadOnly, persistEmbodimentState } from "@/lib/auroraCognition";
import { DEFAULT_AURORA_EMBODIMENT_STATE, DEFAULT_AURORA_STATE, type AuroraEmbodimentState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EmbodimentBody {
  embodiment?: unknown;
}

function isEmbodimentState(value: unknown): value is AuroraEmbodimentState {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET() {
  const safeCognitionSnapshot = async () => {
    try {
      return await getCognitiveSnapshotReadOnly();
    } catch {
      return DEFAULT_AURORA_STATE.cognition;
    }
  };

  const cognition = await safeCognitionSnapshot();
  return NextResponse.json({
    ok: true,
    embodiment: cognition.extensions?.embodiment ?? DEFAULT_AURORA_EMBODIMENT_STATE,
    cognition
  });
}

export async function POST(request: Request) {
  let body: EmbodimentBody;
  try {
    body = (await request.json()) as EmbodimentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isEmbodimentState(body.embodiment)) {
    return NextResponse.json({ error: "embodiment is required." }, { status: 400 });
  }

  const embodiment = await persistEmbodimentState(body.embodiment);
  return NextResponse.json({
    ok: true,
    embodiment: embodiment ?? DEFAULT_AURORA_EMBODIMENT_STATE
  });
}
