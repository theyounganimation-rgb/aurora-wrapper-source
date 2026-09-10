import {
  buildCodexCompanionBootstrap,
  companionAuthFailureBody,
  isCompanionAuthorized
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
    const selectedThreadId = searchParams.get("selectedThreadId") || ""
    const payload = await buildCodexCompanionBootstrap(selectedThreadId)
    return companionJsonResponse(
      request,
      {
        ok: true,
        ...payload
      },
      undefined,
      "GET, OPTIONS"
    )
  } catch (error) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Codey status."
      },
      {
        status: 500
      },
      "GET, OPTIONS"
    )
  }
}
