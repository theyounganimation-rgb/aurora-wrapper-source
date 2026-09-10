import {
  companionAuthFailureBody,
  isCompanionAuthorized,
  readCodexThreads
} from "@/lib/codexCompanion"
import { companionJsonResponse, companionOptionsResponse } from "@/lib/codexCompanionHttp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function OPTIONS(request: Request) {
  return companionOptionsResponse(request, "GET, OPTIONS")
}

export async function GET(request: Request) {
  if (!isCompanionAuthorized(request)) {
    return companionJsonResponse(request, companionAuthFailureBody(), {
      status: 401
    }, "GET, OPTIONS")
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit") || 40)
    const threads = await readCodexThreads(Number.isFinite(limit) ? limit : 40)

    return companionJsonResponse(
      request,
      {
        ok: true,
        threads
      },
      undefined,
      "GET, OPTIONS"
    )
  } catch (error) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Codex threads."
      },
      {
        status: 500
      },
      "GET, OPTIONS"
    )
  }
}
