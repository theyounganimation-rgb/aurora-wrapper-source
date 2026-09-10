import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import type {
  CreateLoopInput,
  LoopMatchResult,
  OpenLoop,
  OpenLoopStatus,
  OpenLoopStore
} from "./schema";
import { DEFAULT_OPEN_LOOP_STORE } from "./schema";

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLine(text: string, maxLen: number): string {
  const normalized = `${text || ""}`.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function normalizeLoopFreeText(text: string, fallback: string, maxLen: number): string {
  const normalized = compactLine(text, maxLen);
  return normalized || fallback;
}

function normalizeOwnership(value: unknown, fallback: OpenLoop["ownership"] = "shared"): OpenLoop["ownership"] {
  return value === "aurora" || value === "shared" || value === "user" ? value : fallback;
}

function isGenericLoopTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    normalized.startsWith("resolve design thread:") ||
    normalized.startsWith("resolve open question:") ||
    normalized.startsWith("fix unresolved bug:") ||
    normalized.startsWith("follow through on aurora promise:")
  );
}

function mergeLoopTitle(current: string, incoming?: string): string {
  const next = incoming?.trim() || "";
  if (!next) {
    return current;
  }
  if (isGenericLoopTitle(next) && !isGenericLoopTitle(current)) {
    return current;
  }
  if (!isGenericLoopTitle(next) && isGenericLoopTitle(current)) {
    return next;
  }
  return next;
}

function mergeOwnership(current: OpenLoop["ownership"], incoming?: OpenLoop["ownership"]): OpenLoop["ownership"] {
  if (!incoming || incoming === current) {
    return current;
  }
  if (current === "aurora" || incoming === "aurora") {
    return "aurora";
  }
  if (current === "shared" || incoming === "shared") {
    return "shared";
  }
  return "user";
}

function normalizeLoopText(loop: Pick<OpenLoop, "title" | "whyItMatters" | "nextStep">): string {
  return [loop.title, loop.whyItMatters, loop.nextStep].filter(Boolean).join(" ");
}

function coerceOpenLoop(loop: Partial<OpenLoop> & Pick<OpenLoop, "id" | "title" | "type" | "status" | "priority" | "linkedEntities" | "lastTouchedAt" | "closureCondition">): OpenLoop {
  return {
    id: loop.id,
    title: compactLine(loop.title.trim(), 180),
    type: loop.type,
    status: loop.status,
    priority: clamp01(loop.priority),
    linkedEntities: [...new Set((loop.linkedEntities || []).map((entry) => entry.trim()).filter(Boolean))],
    lastTouchedAt: loop.lastTouchedAt,
    closureCondition: normalizeLoopFreeText(loop.closureCondition, "closed when the unresolved thread is honestly settled", 180),
    whyItMatters: normalizeLoopFreeText(loop.whyItMatters || "", "it still matters to Aurora's continuity and priorities", 220),
    nextStep: normalizeLoopFreeText(loop.nextStep || "", "revisit the live thread when it becomes active again", 180),
    ownership: normalizeOwnership(loop.ownership),
    aliveness: clamp01(typeof loop.aliveness === "number" ? loop.aliveness : loop.status === "resolved" ? 0.18 : Math.max(0.4, clamp01(loop.priority))),
    intentStrength: clamp01(typeof loop.intentStrength === "number" ? loop.intentStrength : Math.max(0.42, clamp01(loop.priority))),
    lastAdvancedAt:
      typeof loop.lastAdvancedAt === "string" && loop.lastAdvancedAt.trim()
        ? loop.lastAdvancedAt
        : loop.status === "resolved"
          ? loop.lastTouchedAt
          : null
  };
}

function tokenize(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1;
    }
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function entityOverlapScore(a: string[], b: string[]): number {
  const aa = new Set(a.map((x) => x.toLowerCase()));
  const bb = new Set(b.map((x) => x.toLowerCase()));
  return jaccard(aa, bb);
}

function titleSimilarity(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}

function makeLoopId(input: CreateLoopInput): string {
  const seed = `${input.type}:${normalizeText(input.title)}:${input.linkedEntities
    .map((entry) => entry.toLowerCase())
    .sort()
    .join("|")}`;
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12);
}

export async function loadOpenLoopStore(filePath: string): Promise<OpenLoopStore> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as OpenLoopStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.loops)) {
      throw new Error("Invalid open loop store");
    }
    return {
      version: 1,
      loops: parsed.loops
        .filter((loop): loop is OpenLoop => Boolean(loop && typeof loop === "object"))
        .map((loop) =>
          coerceOpenLoop(loop as OpenLoop)
        )
    };
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "ENOENT") {
      return DEFAULT_OPEN_LOOP_STORE;
    }
    throw error;
  }
}

export async function saveOpenLoopStore(filePath: string, store: OpenLoopStore): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

export function touchLoop(loop: OpenLoop, now = new Date()): OpenLoop {
  return {
    ...loop,
    lastTouchedAt: nowIso(now),
    aliveness: clamp01(loop.status === "resolved" ? loop.aliveness : loop.aliveness + 0.06)
  };
}

export function setLoopStatus(loop: OpenLoop, status: OpenLoopStatus, now = new Date()): OpenLoop {
  return {
    ...loop,
    status,
    lastTouchedAt: nowIso(now),
    aliveness: clamp01(status === "resolved" ? 0.16 : status === "watching" ? Math.min(loop.aliveness, 0.38) : loop.aliveness)
  };
}

export function resolveLoop(loop: OpenLoop, now = new Date()): OpenLoop {
  return {
    ...loop,
    status: "resolved",
    lastTouchedAt: nowIso(now),
    aliveness: 0.14,
    lastAdvancedAt: nowIso(now)
  };
}

export function findMatchingLoop(loops: OpenLoop[], input: CreateLoopInput): LoopMatchResult {
  let best: OpenLoop | null = null;
  let bestScore = 0;

  for (const loop of loops) {
    if (loop.status === "resolved") {
      continue;
    }
    if (loop.type !== input.type) {
      continue;
    }

    const entityScore = entityOverlapScore(loop.linkedEntities, input.linkedEntities);
    const titleScore = titleSimilarity(normalizeLoopText(loop), `${input.title} ${input.whyItMatters || ""} ${input.nextStep || ""}`);
    const score = entityScore * 0.58 + titleScore * 0.42;

    if (score > bestScore) {
      best = loop;
      bestScore = score;
    }
  }

  if (bestScore >= 0.55) {
    return { matched: best, score: bestScore };
  }

  return { matched: null, score: bestScore };
}

export function createLoop(input: CreateLoopInput, now = new Date()): OpenLoop {
  return coerceOpenLoop({
    id: makeLoopId(input),
    title: input.title.trim(),
    type: input.type,
    status: input.status ?? "open",
    priority: clamp01(input.priority),
    linkedEntities: [...new Set(input.linkedEntities.map((entry) => entry.trim()).filter(Boolean))],
    lastTouchedAt: nowIso(now),
    closureCondition: input.closureCondition.trim(),
    whyItMatters:
      input.whyItMatters || "it still matters to Aurora's continuity and priorities",
    nextStep:
      input.nextStep || "revisit the live thread when it becomes active again",
    ownership: input.ownership ?? "shared",
    aliveness: typeof input.aliveness === "number" ? input.aliveness : Math.max(0.46, clamp01(input.priority)),
    intentStrength: typeof input.intentStrength === "number" ? input.intentStrength : Math.max(0.44, clamp01(input.priority)),
    lastAdvancedAt: input.lastAdvancedAt ?? null
  });
}

export function upsertLoop(
  store: OpenLoopStore,
  input: CreateLoopInput,
  now = new Date()
): { store: OpenLoopStore; loop: OpenLoop; created: boolean } {
  const { matched } = findMatchingLoop(store.loops, input);

  if (matched) {
    const nextWhy = normalizeLoopFreeText(
      input.whyItMatters || matched.whyItMatters,
      matched.whyItMatters,
      220
    );
    const nextStep = normalizeLoopFreeText(
      input.nextStep || matched.nextStep,
      matched.nextStep,
      180
    );
    const advanced =
      normalizeText(nextStep).toLowerCase() !== normalizeText(matched.nextStep).toLowerCase();
    const updated: OpenLoop = coerceOpenLoop({
      ...matched,
      title: mergeLoopTitle(matched.title, input.title),
      linkedEntities: [
        ...new Set([...matched.linkedEntities, ...input.linkedEntities.map((entry) => entry.trim())])
      ],
      priority: Math.max(matched.priority, clamp01(input.priority)),
      closureCondition: input.closureCondition.trim() || matched.closureCondition,
      whyItMatters: nextWhy,
      nextStep,
      ownership: mergeOwnership(matched.ownership, input.ownership),
      aliveness: Math.max(matched.aliveness, clamp01(input.aliveness ?? matched.aliveness + 0.04)),
      intentStrength: Math.max(matched.intentStrength, clamp01(input.intentStrength ?? matched.intentStrength)),
      lastAdvancedAt: advanced ? nowIso(now) : matched.lastAdvancedAt,
      status: matched.status === "resolved" ? "open" : matched.status,
      lastTouchedAt: nowIso(now)
    });

    return {
      created: false,
      loop: updated,
      store: {
        ...store,
        loops: store.loops.map((loop) => (loop.id === matched.id ? updated : loop))
      }
    };
  }

  const createdLoop = createLoop(input, now);
  return {
    created: true,
    loop: createdLoop,
    store: {
      ...store,
      loops: [...store.loops, createdLoop]
    }
  };
}

export function updateLoop(
  store: OpenLoopStore,
  loopId: string,
  patch: Partial<Omit<OpenLoop, "id">>,
  now = new Date()
): OpenLoopStore {
  return {
    ...store,
    loops: store.loops.map((loop) =>
      loop.id === loopId
        ? coerceOpenLoop({
            ...loop,
            ...patch,
            priority: patch.priority == null ? loop.priority : clamp01(patch.priority),
            linkedEntities:
              patch.linkedEntities == null
                ? loop.linkedEntities
                : [...new Set(patch.linkedEntities)],
            lastTouchedAt: nowIso(now),
            lastAdvancedAt:
              patch.nextStep != null &&
              normalizeText(patch.nextStep).toLowerCase() !== normalizeText(loop.nextStep).toLowerCase()
                ? nowIso(now)
                : patch.lastAdvancedAt === undefined
                  ? loop.lastAdvancedAt
                  : patch.lastAdvancedAt
          })
        : loop
    )
  };
}

export function resolveLoopById(store: OpenLoopStore, loopId: string, now = new Date()): OpenLoopStore {
  return {
    ...store,
    loops: store.loops.map((loop) => (loop.id === loopId ? resolveLoop(loop, now) : loop))
  };
}

export function touchLoopById(store: OpenLoopStore, loopId: string, now = new Date()): OpenLoopStore {
  return {
    ...store,
    loops: store.loops.map((loop) => (loop.id === loopId ? touchLoop(loop, now) : loop))
  };
}

export function pruneResolvedLoops(
  store: OpenLoopStore,
  olderThanMs: number,
  now = new Date()
): OpenLoopStore {
  const cutoff = now.getTime() - olderThanMs;
  return {
    ...store,
    loops: store.loops.filter((loop) => {
      if (loop.status !== "resolved") {
        return true;
      }
      return new Date(loop.lastTouchedAt).getTime() >= cutoff;
    })
  };
}

export function demoteStaleLoopsToWatching(
  store: OpenLoopStore,
  staleMs: number,
  now = new Date()
): OpenLoopStore {
  const cutoff = now.getTime() - staleMs;
  return {
    ...store,
    loops: store.loops.map((loop) => {
      if (loop.status !== "open") {
        return loop;
      }
      if (loop.priority >= 0.6) {
        return loop;
      }
      if (loop.aliveness >= 0.52 || loop.intentStrength >= 0.72) {
        return loop;
      }
      if (new Date(loop.lastTouchedAt).getTime() >= cutoff) {
        return loop;
      }
      return coerceOpenLoop({
        ...loop,
        status: "watching",
        lastTouchedAt: nowIso(now),
        aliveness: Math.min(loop.aliveness, 0.34)
      });
    })
  };
}

export function mergeDuplicateLoops(store: OpenLoopStore): OpenLoopStore {
  const kept: OpenLoop[] = [];

  for (const loop of store.loops) {
    const match = kept.find((existing) => {
      if (existing.type !== loop.type) {
        return false;
      }
      if (existing.status === "resolved" && loop.status !== "resolved") {
        return false;
      }

      const entityScore = entityOverlapScore(existing.linkedEntities, loop.linkedEntities);
      const titleScore = titleSimilarity(normalizeLoopText(existing), normalizeLoopText(loop));
      const total = entityScore * 0.58 + titleScore * 0.42;

      return total >= 0.75;
    });

    if (!match) {
      kept.push({ ...loop });
      continue;
    }

    match.linkedEntities = [...new Set([...match.linkedEntities, ...loop.linkedEntities])];
    match.priority = Math.max(match.priority, loop.priority);
    match.intentStrength = Math.max(match.intentStrength, loop.intentStrength);
    match.aliveness = Math.max(match.aliveness, loop.aliveness);
    match.whyItMatters =
      normalizeText(loop.whyItMatters).length > normalizeText(match.whyItMatters).length ? loop.whyItMatters : match.whyItMatters;
    match.nextStep =
      normalizeText(loop.nextStep).length > normalizeText(match.nextStep).length ? loop.nextStep : match.nextStep;
    match.lastAdvancedAt =
      !match.lastAdvancedAt || (loop.lastAdvancedAt && new Date(loop.lastAdvancedAt) > new Date(match.lastAdvancedAt))
        ? loop.lastAdvancedAt
        : match.lastAdvancedAt;
    match.lastTouchedAt =
      new Date(match.lastTouchedAt) > new Date(loop.lastTouchedAt) ? match.lastTouchedAt : loop.lastTouchedAt;

    if (match.status === "watching" && loop.status === "open") {
      match.status = "open";
    }
  }

  return {
    ...store,
    loops: kept
  };
}

export function runHeartbeatLoopMaintenance(store: OpenLoopStore, now = new Date()): OpenLoopStore {
  let next = mergeDuplicateLoops(store);
  next = demoteStaleLoopsToWatching(next, 1000 * 60 * 60 * 24 * 3, now);
  next = pruneResolvedLoops(next, 1000 * 60 * 60 * 24 * 7, now);
  return next;
}
