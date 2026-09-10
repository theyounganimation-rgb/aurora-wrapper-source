import {
  companionAuthFailureBody,
  isCompanionAuthorized,
  readCodexTaskDetail
} from "@/lib/codexCompanion"
import { companionJsonResponse, companionOptionsResponse } from "@/lib/codexCompanionHttp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function OPTIONS(request: Request) {
  return companionOptionsResponse(request, "GET, OPTIONS")
}

export async function GET(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  if (!isCompanionAuthorized(request)) {
    return companionJsonResponse(request, companionAuthFailureBody(), {
      status: 401
    }, "GET, OPTIONS")
  }

  try {
    const detail = await readCodexTaskDetail(decodeURIComponent(params.taskId))
    if (!detail) {
      return companionJsonResponse(
        request,
        {
          ok: false,
          error: "Codex task not found."
        },
        {
          status: 404
        },
        "GET, OPTIONS"
      )
    }

    return companionJsonResponse(
      request,
      {
        ok: true,
        task: detail
      },
      undefined,
      "GET, OPTIONS"
    )
  } catch (error) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Codex task detail."
      },
      {
        status: 500
      },
      "GET, OPTIONS"
    )
  }
}
