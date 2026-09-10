import {
  companionAuthFailureBody,
  isCompanionAuthorized
} from "@/lib/codexCompanion"
import {
  type CodexCompanionReasoningEffort,
  readCodexCompanionSettings,
  updateCodexCompanionSettings
} from "@/lib/codexCompanionSettings"
import { companionJsonResponse, companionOptionsResponse } from "@/lib/codexCompanionHttp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SettingsRequestBody = {
  personalization?: {
    personality?: unknown
    customInstructions?: unknown
  }
  general?: {
    speed?: unknown
  }
  thread?: {
    threadId?: unknown
    model?: unknown
    reasoningEffort?: unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isReasoningEffort(value: string): value is CodexCompanionReasoningEffort {
  return value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh"
}

export async function OPTIONS(request: Request) {
  return companionOptionsResponse(request, "GET, POST, OPTIONS")
}

export async function GET(request: Request) {
  if (!isCompanionAuthorized(request)) {
    return companionJsonResponse(request, companionAuthFailureBody(), { status: 401 }, "GET, POST, OPTIONS")
  }

  try {
    const { searchParams } = new URL(request.url)
    const selectedThreadId = searchParams.get("selectedThreadId") || ""
    const settings = await readCodexCompanionSettings(selectedThreadId)
    return companionJsonResponse(
      request,
      {
        ok: true,
        settings
      },
      undefined,
      "GET, POST, OPTIONS"
    )
  } catch (error) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Codey settings."
      },
      { status: 500 },
      "GET, POST, OPTIONS"
    )
  }
}

export async function POST(request: Request) {
  if (!isCompanionAuthorized(request)) {
    return companionJsonResponse(request, companionAuthFailureBody(), { status: 401 }, "GET, POST, OPTIONS")
  }

  let body: SettingsRequestBody | null = null
  try {
    body = (await request.json()) as SettingsRequestBody
  } catch {
    body = null
  }

  if (!isRecord(body)) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Settings payload must be a JSON object."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  const personalizationInput = isRecord(body.personalization) ? body.personalization : null
  const generalInput = isRecord(body.general) ? body.general : null
  const threadInput = isRecord(body.thread) ? body.thread : null

  const personality = asString(personalizationInput?.personality)
  if (personality && personality !== "friendly" && personality !== "pragmatic") {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Personality must be either friendly or pragmatic."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  const speed = asString(generalInput?.speed)
  if (speed && speed !== "fast" && speed !== "standard") {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Speed must be either fast or standard."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  const customInstructionsRaw = personalizationInput?.customInstructions
  if (customInstructionsRaw !== undefined && typeof customInstructionsRaw !== "string") {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Custom instructions must be a string."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  const threadId = asString(threadInput?.threadId)
  const threadModel = asString(threadInput?.model)
  const reasoningEffortRaw = threadInput?.reasoningEffort

  if ((threadModel || reasoningEffortRaw !== undefined) && !threadId) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Thread settings updates require a thread id."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  if (threadInput?.threadId !== undefined && typeof threadInput?.threadId !== "string") {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Thread id must be a string."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  if (threadInput?.model !== undefined && typeof threadInput?.model !== "string") {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Thread model must be a string."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  if (
    reasoningEffortRaw !== undefined &&
    reasoningEffortRaw !== null &&
    (typeof reasoningEffortRaw !== "string" || !isReasoningEffort(reasoningEffortRaw))
  ) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "Reasoning effort must be one of none, minimal, low, medium, high, or xhigh."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  const hasChanges =
    Boolean(personality) ||
    Boolean(speed) ||
    customInstructionsRaw !== undefined ||
    Boolean(threadModel) ||
    reasoningEffortRaw !== undefined

  if (!hasChanges) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: "No settings changes were provided."
      },
      { status: 400 },
      "GET, POST, OPTIONS"
    )
  }

  try {
    const settings = await updateCodexCompanionSettings({
      personalization: {
        personality: personality ? (personality as "friendly" | "pragmatic") : undefined,
        customInstructions:
          typeof customInstructionsRaw === "string" ? customInstructionsRaw : undefined
      },
      general: {
        speed: speed ? (speed as "fast" | "standard") : undefined
      },
      thread: threadId
        ? {
            threadId,
            model: threadModel || undefined,
            reasoningEffort:
              reasoningEffortRaw === undefined
                ? undefined
                : reasoningEffortRaw === null
                  ? null
                  : (reasoningEffortRaw as CodexCompanionReasoningEffort)
          }
        : undefined
    })

    return companionJsonResponse(
      request,
      {
        ok: true,
        settings
      },
      undefined,
      "GET, POST, OPTIONS"
    )
  } catch (error) {
    return companionJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save Codey settings."
      },
      { status: 500 },
      "GET, POST, OPTIONS"
    )
  }
}
