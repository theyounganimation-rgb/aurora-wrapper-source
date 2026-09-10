import {
  companionAuthFailureBody,
  isCompanionAuthorized,
  readCodexTasks,
  spawnCodexTask
} from "@/lib/codexCompanion"
import { companionJsonResponse, companionOptionsResponse } from "@/lib/codexCompanionHttp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function OPTIONS(request: Request) {
  return companionOptionsResponse(request, "GET, POST, OPTIONS")
}

export async function GET(request: Request) {
  if (!isCompanionAuthorized(request)) {
    return companionJsonResponse(request, companionAuthFailureBody(), {
      status: 401
    })
  }

  try {
    const tasks = await readCodexTasks()
    return companionJsonResponse(
      request,
      {
        ok: true,
        tasks
      }
    )
  } catch (error) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Codex tasks."
      },
      {
        status: 500
      }
    )
  }
}

export async function POST(request: Request) {
  if (!isCompanionAuthorized(request)) {
    return companionJsonResponse(request, companionAuthFailureBody(), {
      status: 401
    })
  }

  try {
    const body = (await request.json()) as {
      action?: unknown
      deliveryMode?: unknown
      prompt?: unknown
      threadId?: unknown
    }

    const action = body.action === "interrupt" ? "interrupt" : "prompt"
    const deliveryMode =
      body.deliveryMode === "steer" || body.deliveryMode === "queue" ? body.deliveryMode : "default"
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
    const threadId = typeof body.threadId === "string" ? body.threadId.trim() : ""

    if (action === "interrupt" && !threadId) {
      return companionJsonResponse(
        request,
        {
          ok: false,
          error: "Thread id is required."
        },
        {
          status: 400
        }
      )
    }

    if (action === "prompt" && !prompt) {
      return companionJsonResponse(
        request,
        {
          ok: false,
          error: "Prompt is required."
        },
        {
          status: 400
        }
      )
    }

    const task = await spawnCodexTask({
      action,
      deliveryMode,
      prompt,
      threadId
    })

    return companionJsonResponse(
      request,
      {
        ok: true,
        task
      },
      {
        status: 202
      }
    )
  } catch (error) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to dispatch Codex task."
      },
      {
        status: 500
      }
    )
  }
}
