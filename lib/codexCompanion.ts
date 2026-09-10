import { randomUUID, timingSafeEqual } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { readCodexCompanionSettings } from "@/lib/codexCompanionSettings"

type CodexTaskAction = "prompt" | "interrupt"
type CodexTaskDeliveryMode = "default" | "steer" | "queue"

type StoredCodexTask = {
  id: string
  action: CodexTaskAction
  deliveryMode: CodexTaskDeliveryMode
  prompt: string
  threadId: string
  status: "queued"
  createdAt: string
  updatedAt: string
}

const COMPANION_ROOT = path.join(os.homedir(), ".openclaw", "codex-companion")
const TASKS_PATH = path.join(COMPANION_ROOT, "tasks.json")

function authToken(): string {
  return (process.env.CODEX_COMPANION_TOKEN || process.env.CODEY_COMPANION_TOKEN || "").trim()
}

async function ensureStorageDir() {
  await fs.mkdir(COMPANION_ROOT, { recursive: true })
}

async function loadTasks(): Promise<StoredCodexTask[]> {
  try {
    const raw = await fs.readFile(TASKS_PATH, "utf8")
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredCodexTask[]) : []
  } catch {
    return []
  }
}

async function saveTasks(tasks: StoredCodexTask[]) {
  await ensureStorageDir()
  await fs.writeFile(TASKS_PATH, JSON.stringify(tasks.slice(0, 200), null, 2))
}

function timingSafeMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isCompanionAuthorized(request: Request): boolean {
  const expected = authToken()
  if (!expected) {
    return true
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || ""
  const headerToken = request.headers.get("x-codex-companion-token")?.trim() || ""
  return timingSafeMatch(bearer, expected) || timingSafeMatch(headerToken, expected)
}

export function companionAuthFailureBody() {
  return {
    ok: false,
    error: "Unauthorized."
  }
}

export async function readCodexTasks() {
  return loadTasks()
}

export async function readCodexTaskDetail(taskId: string) {
  const tasks = await loadTasks()
  return tasks.find((task) => task.id === taskId) ?? null
}

export async function spawnCodexTask(input: {
  action: CodexTaskAction
  deliveryMode: CodexTaskDeliveryMode
  prompt: string
  threadId: string
}) {
  const now = new Date().toISOString()
  const task: StoredCodexTask = {
    id: randomUUID(),
    action: input.action,
    deliveryMode: input.deliveryMode,
    prompt: input.prompt,
    threadId: input.threadId,
    status: "queued",
    createdAt: now,
    updatedAt: now
  }

  const tasks = await loadTasks()
  tasks.unshift(task)
  await saveTasks(tasks)
  return task
}

export async function readCodexThreads(limit: number) {
  const tasks = await loadTasks()
  const seen = new Map<string, { id: string; title: string; updatedAt: string }>()

  for (const task of tasks) {
    if (!task.threadId) {
      continue
    }
    if (!seen.has(task.threadId)) {
      seen.set(task.threadId, {
        id: task.threadId,
        title: `Thread ${task.threadId.slice(0, 8)}`,
        updatedAt: task.updatedAt
      })
    }
  }

  return Array.from(seen.values()).slice(0, Math.max(0, limit))
}

export async function readCodexThreadDetail(threadId: string) {
  if (!threadId) {
    return null
  }

  const tasks = await loadTasks()
  const matchingTasks = tasks.filter((task) => task.threadId === threadId)
  const settings = await readCodexCompanionSettings(threadId)

  if (!matchingTasks.length && !settings.thread) {
    return null
  }

  return {
    id: threadId,
    title: `Thread ${threadId.slice(0, 8)}`,
    updatedAt: matchingTasks[0]?.updatedAt ?? new Date().toISOString(),
    tasks: matchingTasks,
    settings
  }
}

export async function buildCodexCompanionBootstrap(selectedThreadId: string) {
  const [threads, tasks, settings] = await Promise.all([
    readCodexThreads(40),
    readCodexTasks(),
    readCodexCompanionSettings(selectedThreadId)
  ])

  return {
    selectedThreadId,
    threads,
    tasks,
    settings
  }
}
