import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

export type CodexCompanionReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh"

type CodexCompanionPersonality = "friendly" | "pragmatic"
type CodexCompanionSpeed = "fast" | "standard"

type StoredThreadSettings = {
  model: string
  reasoningEffort: CodexCompanionReasoningEffort | null
}

type StoredSettings = {
  personalization: {
    personality: CodexCompanionPersonality
    customInstructions: string
  }
  general: {
    speed: CodexCompanionSpeed
  }
  threads: Record<string, StoredThreadSettings>
}

type UpdatePayload = {
  personalization?: {
    personality?: CodexCompanionPersonality
    customInstructions?: string
  }
  general?: {
    speed?: CodexCompanionSpeed
  }
  thread?: {
    threadId: string
    model?: string
    reasoningEffort?: CodexCompanionReasoningEffort | null
  }
}

const SETTINGS_ROOT = path.join(os.homedir(), ".openclaw", "codex-companion")
const SETTINGS_PATH = path.join(SETTINGS_ROOT, "settings.json")

const defaultSettings = (): StoredSettings => ({
  personalization: {
    personality: "friendly",
    customInstructions: ""
  },
  general: {
    speed: "standard"
  },
  threads: {}
})

async function ensureStorageDir() {
  await fs.mkdir(SETTINGS_ROOT, { recursive: true })
}

async function loadStoredSettings(): Promise<StoredSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    return {
      personalization: {
        personality: parsed.personalization?.personality === "pragmatic" ? "pragmatic" : "friendly",
        customInstructions:
          typeof parsed.personalization?.customInstructions === "string" ? parsed.personalization.customInstructions : ""
      },
      general: {
        speed: parsed.general?.speed === "fast" ? "fast" : "standard"
      },
      threads: parsed.threads && typeof parsed.threads === "object" ? parsed.threads : {}
    }
  } catch {
    return defaultSettings()
  }
}

async function saveStoredSettings(settings: StoredSettings) {
  await ensureStorageDir()
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2))
}

function threadSettingsPayload(threadId: string, settings: StoredSettings) {
  if (!threadId) {
    return null
  }

  const thread = settings.threads[threadId]
  return {
    threadId,
    model: thread?.model || "",
    reasoningEffort: thread?.reasoningEffort ?? null
  }
}

export async function readCodexCompanionSettings(selectedThreadId: string) {
  const settings = await loadStoredSettings()
  return {
    personalization: settings.personalization,
    general: settings.general,
    thread: threadSettingsPayload(selectedThreadId, settings)
  }
}

export async function updateCodexCompanionSettings(update: UpdatePayload) {
  const settings = await loadStoredSettings()

  if (update.personalization?.personality) {
    settings.personalization.personality = update.personalization.personality
  }

  if (update.personalization?.customInstructions !== undefined) {
    settings.personalization.customInstructions = update.personalization.customInstructions
  }

  if (update.general?.speed) {
    settings.general.speed = update.general.speed
  }

  if (update.thread?.threadId) {
    const threadId = update.thread.threadId.trim()
    if (threadId) {
      const current = settings.threads[threadId] ?? {
        model: "",
        reasoningEffort: null
      }

      if (update.thread.model !== undefined) {
        current.model = update.thread.model
      }
      if (update.thread.reasoningEffort !== undefined) {
        current.reasoningEffort = update.thread.reasoningEffort
      }

      settings.threads[threadId] = current
    }
  }

  await saveStoredSettings(settings)
  return {
    personalization: settings.personalization,
    general: settings.general,
    thread: update.thread?.threadId ? threadSettingsPayload(update.thread.threadId, settings) : null
  }
}
