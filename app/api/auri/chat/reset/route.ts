import { NextResponse } from "next/server";
import { deleteAuriLifeWorkspace, sanitizeAuriLifeId } from "../runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(value: unknown, maxLength = 160): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  let lifeID = "";

  try {
    const body = (await request.json()) as Record<string, unknown>;
    lifeID = sanitizeAuriLifeId(asString(body.lifeID));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!lifeID) {
    return NextResponse.json({ error: "Expected a valid lifeID." }, { status: 400 });
  }

  await deleteAuriLifeWorkspace(lifeID);
  return NextResponse.json({ ok: true, lifeID });
}
