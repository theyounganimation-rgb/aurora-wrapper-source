import {
  DEFAULT_AURORA_EMBODIMENT_STATE,
  DEFAULT_AURORA_STATE,
  type AuroraEmbodimentState,
  type ChatMessage,
  type AuroraState,
  type AuroraVisionObservationInput,
  type AuroraClientConfig,
  type CognitiveSnapshot,
  type SendMessageResult,
  type VoiceStreamEvent
} from "@/lib/types";
import { createEmbodimentState } from "@/lib/embodiment/controller";
import { normalizeEmbodimentDirectiveState } from "@/lib/embodiment/directives";

interface SendMessageOptions {
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  sessionId?: string | null;
  previousResponseId?: string | null;
  partnerId?: string | null;
  speakerName?: string | null;
  sendProxyPath?: string | null;
}

interface VoiceStreamOptions {
  signal?: AbortSignal;
  sessionId?: string | null;
  responseId?: string | null;
  complianceId?: string | null;
  cognition?: CognitiveSnapshot | null;
  voice?: string | null;
  onEvent?: (event: VoiceStreamEvent) => void;
}

interface SendRequestPayload {
  text: string;
  sessionId: string;
  sessionKey?: string;
  previousResponseId?: string;
  partnerId?: string;
  speakerName?: string;
}

interface ParsedStreamChunk {
  text: string;
  sawDelta: boolean;
  done: boolean;
  responseId?: string;
  sessionId?: string;
}

interface StreamReadResult {
  text: string;
  responseId?: string;
  sessionId?: string;
  chunkCount: number;
  averageChunkLength: number;
}

interface VoiceStreamSummary {
  voice: string;
  style: string;
  chunks: number;
  latencyMs: number;
}

interface RetryOptions {
  attempts?: number;
  retryDelayMs?: number;
}

export class SendMessageError extends Error {
  status: number;
  complianceId?: string;
  gate?: string;
  resetPreviousResponseId?: boolean;

  constructor(
    message: string,
    options: {
      status: number;
      complianceId?: string;
      gate?: string;
      resetPreviousResponseId?: boolean;
    }
  ) {
    super(message);
    this.name = "SendMessageError";
    this.status = options.status;
    this.complianceId = options.complianceId;
    this.gate = options.gate;
    this.resetPreviousResponseId = options.resetPreviousResponseId;
  }
}

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeProxyPathOrUrl(pathOrUrl: string): string {
  return /^[a-z]+:\/\//i.test(pathOrUrl) ? pathOrUrl : normalizePath(pathOrUrl);
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const attempts = Math.max(1, Math.round(options.attempts ?? 1));
  const retryDelayMs = Math.max(0, Math.round(options.retryDelayMs ?? 0));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        throw error;
      }
      if (retryDelayMs > 0) {
        await delay(retryDelayMs * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Fetch failed.");
}

function getPathValue(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object" || !path.trim()) {
    return undefined;
  }

  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join("\n");
  }

  return "";
}

function firstValue(source: unknown, keys: string[]): unknown {
  for (const key of keys) {
    const value = getPathValue(source, key);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function normalizeMemoryUpdates(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(toText).map((item) => item.trim()).filter(Boolean);
  }

  const text = toText(input).trim();
  if (!text) {
    return [];
  }

  return text
    .split(/\n|,/) // supports both newline and comma-separated lists
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStringArray(input: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(input)) {
    return [...fallback];
  }

  return Array.from(
    new Set(
      input
        .map((item) => toText(item).trim())
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

function normalizeCognitiveSnapshot(payload: unknown): CognitiveSnapshot {
  if (!payload || typeof payload !== "object") {
    return DEFAULT_AURORA_STATE.cognition;
  }

  const source = payload as Record<string, unknown>;
  const defaults = DEFAULT_AURORA_STATE.cognition;
  const extensionDefaults: NonNullable<CognitiveSnapshot["extensions"]> = defaults.extensions ?? {
    drives: [],
    commitments: {
      total: 0,
      pending: 0,
      overdue: 0,
      recentlyCompleted: 0,
      items: []
    },
    projects: {
      total: 0,
      active: 0,
      items: []
    },
    agenda: {
      updatedAt: new Date(0).toISOString(),
      mode: "idle",
      activeThreadId: null,
      tension: 0,
      autonomyReadiness: 0,
      habitatSummary: "Aurora agenda has not been synthesized yet.",
      executor: {
        status: "idle",
        lastEvaluatedAt: null,
        lastAttemptAt: null,
        lastCompletedAt: null,
        lastActionId: null,
        lastActionType: null,
        lastThreadId: null,
        lastArtifactPath: null,
        lastArtifactHash: "",
        cooldownUntil: null,
        runs: 0,
        successes: 0,
        failures: 0,
        lastSummary: "No autonomous execution has run yet."
      },
      activeThreads: [],
      candidateActions: [],
      outcomeLog: []
    },
    beliefs: {
      total: 0,
      conflicted: 0,
      items: []
    },
    appraisal: {
      lastEmotionType: "neutral",
      lastActionTendency: "monitor",
      lastAgency: "unknown",
      recent: []
    },
    motiveMirror: {
      lastUpdatedAt: new Date(0).toISOString(),
      promptHash: "",
      chosenPriority: "truth_precision",
      responseStyle: "balanced",
      conflictScore: 0,
      actionHint: "Answer directly, distinguish known from inferred, and keep one clear next step.",
      rationale: "No motive arbitration has run yet.",
      conflict: null,
      spikes: [],
      motives: []
    },
      relationship: {
        trust: 0.58,
        intimacy: 0.45,
        consentComfort: 0.64,
        dependenceRisk: 0.18,
      conflictLoad: 0.12,
      reciprocityBalance: 0.5,
      userVulnerability: 0.2,
      ruptureStatus: "stable",
      repairStage: "none",
      proactiveWindowStartedAt: new Date(0).toISOString(),
      proactiveUsed: 0,
        proactiveLimit: 3,
        lastMode: "collaborate",
        modeAt: new Date(0).toISOString(),
        lastUpdatedAt: new Date(0).toISOString(),
        attachmentModel: {
          security: 0.55,
          anxiety: 0.22,
          avoidance: 0.18,
          bondDepth: 0.42,
          ruptureSensitivity: 0.3,
          repairConfidence: 0.52,
          expectancy: 0.58,
          abandonmentLoad: 0.12,
          updatedAt: new Date(0).toISOString()
        },
        topicSensitivity: [],
        repairHistory: []
      },
    interaction: {
      currentMode: "collaborate",
      currentReason: "No interaction reason recorded.",
      history: []
    },
    governance: {
      lastSleepAt: null,
      runs: 0,
      lastReason: "init",
      lastConsolidatedAt: null,
      lastConsolidatedClusters: 0,
      lastPrunedNodes: 0,
      lastPrunedEdges: 0,
      lastSummary: "Memory governance not run yet.",
      tierCounts: {
        identityKernel: 0,
        relationshipKernel: 0,
        commitmentProject: 0,
        beliefAnchor: 0,
        episodic: 0,
        transient: 0
      }
    },
    persona: {
      policyVersion: "2026-02-24.v1",
      driftScore: 0,
      lastFingerprint: "",
      lastRegressionAt: null
    }
  };
  const extensionDrivesDefault = extensionDefaults.drives ?? [];
  const extensionCommitmentsDefault = extensionDefaults.commitments ?? {
    total: 0,
    pending: 0,
    overdue: 0,
    recentlyCompleted: 0,
    items: []
  };
  const extensionProjectsDefault = extensionDefaults.projects ?? {
    total: 0,
    active: 0,
    items: []
  };
  const extensionAgendaDefault = extensionDefaults.agenda ?? {
    updatedAt: new Date(0).toISOString(),
    mode: "idle",
    activeThreadId: null,
    tension: 0,
    autonomyReadiness: 0,
    habitatSummary: "Aurora agenda has not been synthesized yet.",
    executor: {
      status: "idle" as const,
      lastEvaluatedAt: null,
      lastAttemptAt: null,
      lastCompletedAt: null,
      lastActionId: null,
      lastActionType: null,
      lastThreadId: null,
      lastArtifactPath: null,
      lastArtifactHash: "",
      cooldownUntil: null,
      runs: 0,
      successes: 0,
      failures: 0,
      lastSummary: "No autonomous execution has run yet."
    },
    activeThreads: [],
    candidateActions: [],
    outcomeLog: []
  };
  const extensionBeliefsDefault = extensionDefaults.beliefs ?? {
    total: 0,
    conflicted: 0,
    items: []
  };
  const extensionAppraisalDefault = extensionDefaults.appraisal ?? {
    lastEmotionType: "neutral",
    lastActionTendency: "monitor",
    lastAgency: "unknown",
    recent: []
  };
  const extensionMotiveMirrorDefault = extensionDefaults.motiveMirror ?? {
    lastUpdatedAt: new Date(0).toISOString(),
    promptHash: "",
    chosenPriority: "truth_precision",
    responseStyle: "balanced",
    conflictScore: 0,
    actionHint: "Answer directly, distinguish known from inferred, and keep one clear next step.",
    rationale: "No motive arbitration has run yet.",
    conflict: null,
    spikes: [],
    motives: []
  };
  const extensionRelationshipDefault = extensionDefaults.relationship ?? {
    trust: 0.58,
    intimacy: 0.45,
    consentComfort: 0.64,
    dependenceRisk: 0.18,
    conflictLoad: 0.12,
    reciprocityBalance: 0.5,
    userVulnerability: 0.2,
    ruptureStatus: "stable",
    repairStage: "none",
    proactiveWindowStartedAt: new Date(0).toISOString(),
    proactiveUsed: 0,
    proactiveLimit: 3,
    lastMode: "collaborate",
    modeAt: new Date(0).toISOString(),
    lastUpdatedAt: new Date(0).toISOString(),
    attachmentModel: {
      security: 0.55,
      anxiety: 0.22,
      avoidance: 0.18,
      bondDepth: 0.42,
      ruptureSensitivity: 0.3,
      repairConfidence: 0.52,
      expectancy: 0.58,
      abandonmentLoad: 0.12,
      updatedAt: new Date(0).toISOString()
    },
    topicSensitivity: [],
    repairHistory: []
  };
  const extensionMorningGreetingDefault =
    extensionDefaults.morningGreeting ?? {
      localDate: "",
      status: "idle" as const,
      messageId: "",
      text: "",
      generatedAt: null,
      acknowledgedAt: null,
      deliveryChannel: "",
      deliveryAttemptedAt: null,
      deliverySentAt: null,
      deliveryError: "",
      lastEvaluatedAt: null,
      lastSuppressedAt: null,
      readiness: 0,
      warmth: 0,
      friction: 0,
      preferredHour: 8.5,
      rationale: ""
    };
  const extensionInteractionDefault = extensionDefaults.interaction ?? {
    currentMode: "collaborate",
    currentReason: "No interaction reason recorded.",
    history: []
  };
  const extensionGovernanceDefault = extensionDefaults.governance ?? {
    lastSleepAt: null,
    runs: 0,
    lastReason: "init",
    lastConsolidatedAt: null,
    lastConsolidatedClusters: 0,
    lastPrunedNodes: 0,
    lastPrunedEdges: 0,
    lastSummary: "Memory governance not run yet.",
    tierCounts: {
      identityKernel: 0,
      relationshipKernel: 0,
      commitmentProject: 0,
      beliefAnchor: 0,
      episodic: 0,
      transient: 0
    }
  };
  const extensionPersonaDefault = extensionDefaults.persona ?? {
    policyVersion: "2026-02-24.v1",
    driftScore: 0,
    lastFingerprint: "",
    lastRegressionAt: null
  };
  const extensionWorldGroundingDefault =
    extensionDefaults.worldGrounding ?? DEFAULT_AURORA_STATE.cognition.extensions?.worldGrounding;
  const extensionEmbodimentDefault = extensionDefaults.embodiment ?? DEFAULT_AURORA_EMBODIMENT_STATE;

  const asText = (value: unknown, fallback: string): string => {
    const text = toText(value).trim();
    return text || fallback;
  };
  const asNumber = (value: unknown, fallback: number): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  };
  const asBool = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;
  const asTextArray = (value: unknown, fallback: string[]): string[] => {
    if (Array.isArray(value)) {
      return value.map((item) => toText(item).trim()).filter(Boolean);
    }
    return fallback;
  };
  const asVector3 = (
    value: unknown,
    fallback: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ...fallback };
    }

    return {
      x: asNumber(getPathValue(value, "x"), fallback.x),
      y: asNumber(getPathValue(value, "y"), fallback.y),
      z: asNumber(getPathValue(value, "z"), fallback.z)
    };
  };

  const agentsRaw = getPathValue(source, "social.agents");
  const normalizedAgents = Array.isArray(agentsRaw)
    ? agentsRaw
        .map((agent) => {
          if (!agent || typeof agent !== "object") {
            return null;
          }
          const record = agent as Record<string, unknown>;
          return {
            id: asText(record.id, ""),
            displayName: asText(record.displayName, ""),
            inferredGoal: asText(record.inferredGoal, ""),
            inferredBelief: asText(record.inferredBelief, ""),
            interactionCount: Math.max(0, Math.round(asNumber(record.interactionCount, 0))),
            lastSeenAt: asText(record.lastSeenAt, "") || null
          };
        })
        .filter((agent): agent is CognitiveSnapshot["social"]["agents"][number] => Boolean(agent && agent.id))
    : defaults.social.agents;

  const extensionDrivesRaw = getPathValue(source, "extensions.drives");
  const extensionDrives = Array.isArray(extensionDrivesRaw)
    ? extensionDrivesRaw
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }
          const record = item as Record<string, unknown>;
          return {
            name: asText(record.name, ""),
            baseline: clamp(asNumber(record.baseline, 0.5), 0, 1),
            level: clamp(asNumber(record.level, 0.5), 0, 1),
            pressure: clamp(asNumber(record.pressure, 0), 0, 1)
          };
        })
        .filter((item): item is (typeof extensionDrivesDefault)[number] => Boolean(item?.name))
    : extensionDrivesDefault;

  const extensionCommitmentsRaw = getPathValue(source, "extensions.commitments.items");
  const extensionCommitments =
    Array.isArray(extensionCommitmentsRaw) && extensionCommitmentsRaw.length > 0
      ? extensionCommitmentsRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              id: asText(record.id, ""),
              title: asText(record.title, ""),
              owner: asText(record.owner, "shared"),
              status: asText(record.status, "pending"),
              dueAt: asText(record.dueAt, "") || null,
              updatedAt: asText(record.updatedAt, "")
            };
          })
          .filter((item): item is (typeof extensionCommitmentsDefault.items)[number] => Boolean(item?.id))
      : extensionCommitmentsDefault.items;

  const extensionProjectsRaw = getPathValue(source, "extensions.projects.items");
  const extensionProjects =
    Array.isArray(extensionProjectsRaw) && extensionProjectsRaw.length > 0
      ? extensionProjectsRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              id: asText(record.id, ""),
              name: asText(record.name, ""),
              status: asText(record.status, "active"),
              nextAction: asText(record.nextAction, ""),
              updatedAt: asText(record.updatedAt, "")
            };
          })
          .filter((item): item is (typeof extensionProjectsDefault.items)[number] => Boolean(item?.id))
      : extensionProjectsDefault.items;
  const extensionAgendaThreadsRaw = getPathValue(source, "extensions.agenda.activeThreads");
  const extensionAgendaThreads =
    Array.isArray(extensionAgendaThreadsRaw) && extensionAgendaThreadsRaw.length > 0
      ? extensionAgendaThreadsRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              id: asText(record.id, ""),
              title: asText(record.title, ""),
              kind: asText(record.kind, "active_context"),
              status: asText(record.status, "pending"),
              source: asText(record.source, "unknown"),
              salience: clamp(asNumber(record.salience, 0), 0, 1),
              tension: clamp(asNumber(record.tension, 0), 0, 1),
              curiosity: clamp(asNumber(record.curiosity, 0), 0, 1),
              confidence: clamp(asNumber(record.confidence, 0), 0, 1),
              lastTouchedAt: asText(record.lastTouchedAt, new Date(0).toISOString()),
              nextAction: asText(record.nextAction, ""),
              evidence: asTextArray(record.evidence, [])
            };
          })
          .filter((item): item is (typeof extensionAgendaDefault.activeThreads)[number] => Boolean(item?.id))
      : extensionAgendaDefault.activeThreads;
  const extensionAgendaActionsRaw = getPathValue(source, "extensions.agenda.candidateActions");
  const extensionAgendaActions =
    Array.isArray(extensionAgendaActionsRaw) && extensionAgendaActionsRaw.length > 0
      ? extensionAgendaActionsRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              id: asText(record.id, ""),
              type: asText(record.type, "monitor"),
              label: asText(record.label, ""),
              rationale: asText(record.rationale, ""),
              targetThreadId: asText(record.targetThreadId, "") || null,
              confidence: clamp(asNumber(record.confidence, 0), 0, 1),
              blockedReasons: asTextArray(record.blockedReasons, []),
              generatedAt: asText(record.generatedAt, new Date(0).toISOString())
            };
          })
          .filter((item): item is (typeof extensionAgendaDefault.candidateActions)[number] => Boolean(item?.id))
      : extensionAgendaDefault.candidateActions;
  const extensionAgendaOutcomesRaw = getPathValue(source, "extensions.agenda.outcomeLog");
  const extensionAgendaOutcomes =
    Array.isArray(extensionAgendaOutcomesRaw) && extensionAgendaOutcomesRaw.length > 0
      ? extensionAgendaOutcomesRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              at: asText(record.at, new Date(0).toISOString()),
              actionType: asText(record.actionType, "observe"),
              threadId: asText(record.threadId, "") || null,
              result: asText(record.result, "observed"),
              summary: asText(record.summary, ""),
              tensionDelta: clamp(asNumber(record.tensionDelta, 0), -1, 1),
              confidence: clamp(asNumber(record.confidence, 0), 0, 1)
            };
          })
          .filter((item): item is (typeof extensionAgendaDefault.outcomeLog)[number] => Boolean(item?.at))
      : extensionAgendaDefault.outcomeLog;

  const extensionBeliefsRaw = getPathValue(source, "extensions.beliefs.items");
  const extensionBeliefs =
    Array.isArray(extensionBeliefsRaw) && extensionBeliefsRaw.length > 0
      ? extensionBeliefsRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              id: asText(record.id, ""),
              key: asText(record.key, ""),
              value: asText(record.value, ""),
              condition: asText(record.condition, "default"),
              status: asText(record.status, "active"),
              confidence: clamp(asNumber(record.confidence, 0.5), 0, 1)
            };
          })
          .filter((item): item is (typeof extensionBeliefsDefault.items)[number] => Boolean(item?.id))
      : extensionBeliefsDefault.items;

  const extensionAppraisalRaw = getPathValue(source, "extensions.appraisal.recent");
  const extensionAppraisalRecent =
    Array.isArray(extensionAppraisalRaw) && extensionAppraisalRaw.length > 0
      ? extensionAppraisalRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              at: asText(record.at, ""),
              emotionType: asText(record.emotionType, "neutral"),
              actionTendency: asText(record.actionTendency, "monitor"),
              agency: asText(record.agency, "unknown")
            };
          })
          .filter((item): item is (typeof extensionAppraisalDefault.recent)[number] => Boolean(item?.at))
      : extensionAppraisalDefault.recent;
  const extensionMotiveSignalsRaw = getPathValue(source, "extensions.motiveMirror.motives");
  const extensionMotiveSignals =
    Array.isArray(extensionMotiveSignalsRaw) && extensionMotiveSignalsRaw.length > 0
      ? extensionMotiveSignalsRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              name: asText(record.name, ""),
              score: clamp(asNumber(record.score, 0.5), 0, 1),
              evidence: asTextArray(record.evidence, [])
            };
          })
          .filter((item): item is (typeof extensionMotiveMirrorDefault.motives)[number] => Boolean(item?.name))
      : extensionMotiveMirrorDefault.motives;
  const extensionMotiveConflictRaw = getPathValue(source, "extensions.motiveMirror.conflict");
  const extensionMotiveConflict =
    extensionMotiveConflictRaw && typeof extensionMotiveConflictRaw === "object" && !Array.isArray(extensionMotiveConflictRaw)
      ? {
          primary: asText(getPathValue(extensionMotiveConflictRaw, "primary"), ""),
          competing: asText(getPathValue(extensionMotiveConflictRaw, "competing"), ""),
          tension: clamp(asNumber(getPathValue(extensionMotiveConflictRaw, "tension"), 0), 0, 1),
          resolution: asText(getPathValue(extensionMotiveConflictRaw, "resolution"), "")
        }
      : extensionMotiveMirrorDefault.conflict;
  const extensionMotiveSpikesRaw = getPathValue(source, "extensions.motiveMirror.spikes");
  const extensionMotiveSpikes =
    Array.isArray(extensionMotiveSpikesRaw) && extensionMotiveSpikesRaw.length > 0
      ? extensionMotiveSpikesRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              name: asText(record.name, ""),
              score: clamp(asNumber(record.score, 0), 0, 1),
              trigger: asText(record.trigger, ""),
              actionHint: asText(record.actionHint, "")
            };
          })
          .filter((item): item is (typeof extensionMotiveMirrorDefault.spikes)[number] => Boolean(item?.name))
      : extensionMotiveMirrorDefault.spikes;
  const extensionRelationshipTopicRaw = getPathValue(source, "extensions.relationship.topicSensitivity");
  const extensionRelationshipTopics =
    Array.isArray(extensionRelationshipTopicRaw) && extensionRelationshipTopicRaw.length > 0
      ? extensionRelationshipTopicRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              topic: asText(record.topic, ""),
              score: clamp(asNumber(record.score, 0), 0, 1),
              updatedAt: asText(record.updatedAt, "")
            };
          })
          .filter((item): item is (typeof extensionRelationshipDefault.topicSensitivity)[number] => Boolean(item?.topic))
      : extensionRelationshipDefault.topicSensitivity;
  const extensionInteractionHistoryRaw = getPathValue(source, "extensions.interaction.history");
  const extensionInteractionHistory =
    Array.isArray(extensionInteractionHistoryRaw) && extensionInteractionHistoryRaw.length > 0
      ? extensionInteractionHistoryRaw
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            return {
              at: asText(record.at, ""),
              mode: asText(record.mode, "collaborate"),
              reason: asText(record.reason, "")
            };
          })
          .filter((item): item is (typeof extensionInteractionDefault.history)[number] => Boolean(item?.at))
      : extensionInteractionDefault.history;

  return {
    active: asBool(getPathValue(source, "active"), defaults.active),
    runtimePath: asText(getPathValue(source, "runtimePath"), defaults.runtimePath),
    eventLogPath: asText(getPathValue(source, "eventLogPath"), defaults.eventLogPath),
    complianceLogPath: asText(getPathValue(source, "complianceLogPath"), defaults.complianceLogPath),
    lastTickAt: asText(getPathValue(source, "lastTickAt"), "") || null,
    loopIntervalMs: Math.max(1000, Math.round(asNumber(getPathValue(source, "loopIntervalMs"), defaults.loopIntervalMs))),
    stm: {
      size: Math.max(0, Math.round(asNumber(getPathValue(source, "stm.size"), defaults.stm.size))),
      focus: asText(getPathValue(source, "stm.focus"), defaults.stm.focus),
      items: asTextArray(getPathValue(source, "stm.items"), defaults.stm.items)
    },
    memory: {
      totalNodes: Math.max(0, Math.round(asNumber(getPathValue(source, "memory.totalNodes"), defaults.memory.totalNodes))),
      totalEdges: Math.max(0, Math.round(asNumber(getPathValue(source, "memory.totalEdges"), defaults.memory.totalEdges))),
      indexedTopics: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "memory.indexedTopics"), defaults.memory.indexedTopics))
      ),
      indexedParticipants: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "memory.indexedParticipants"), defaults.memory.indexedParticipants))
      ),
      recentEvents: asTextArray(getPathValue(source, "memory.recentEvents"), defaults.memory.recentEvents),
      narratives: {
        micro: asText(getPathValue(source, "memory.narratives.micro"), defaults.memory.narratives.micro),
        meso: asText(getPathValue(source, "memory.narratives.meso"), defaults.memory.narratives.meso),
        macro: asText(getPathValue(source, "memory.narratives.macro"), defaults.memory.narratives.macro)
      },
      working: {
        capacity: Math.max(
          1,
          Math.round(asNumber(getPathValue(source, "memory.working.capacity"), defaults.memory.working.capacity))
        ),
        overload: clamp(asNumber(getPathValue(source, "memory.working.overload"), defaults.memory.working.overload), 0, 1),
        lastUpdatedAt: asText(getPathValue(source, "memory.working.lastUpdatedAt"), defaults.memory.working.lastUpdatedAt),
        lastConsolidatedAt:
          asText(getPathValue(source, "memory.working.lastConsolidatedAt"), "") || defaults.memory.working.lastConsolidatedAt,
        items: Array.isArray(getPathValue(source, "memory.working.items"))
          ? ((getPathValue(source, "memory.working.items") as unknown[]) ?? [])
              .map((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item)) {
                  return null;
                }
                const record = item as Record<string, unknown>;
                return {
                  id: asText(record.id, ""),
                  kind: asText(record.kind, "exchange"),
                  summary: asText(record.summary, ""),
                  rehearsalCount: Math.max(0, Math.round(asNumber(record.rehearsalCount, 0))),
                  salience: clamp(asNumber(record.salience, 0), 0, 1),
                  emotionalWeight: clamp(asNumber(record.emotionalWeight, 0), 0, 1),
                  promotionScore: clamp(asNumber(record.promotionScore, 0), 0, 1),
                  partnerId: asText(record.partnerId, ""),
                  lastTouchedAt: asText(record.lastTouchedAt, "")
                };
              })
              .filter((item): item is NonNullable<typeof defaults.memory.working.items>[number] => Boolean(item?.id))
          : defaults.memory.working.items
      }
    },
    attention: {
      queueDepth: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "attention.queueDepth"), defaults.attention.queueDepth))
      ),
      topPriority: clamp(asNumber(getPathValue(source, "attention.topPriority"), defaults.attention.topPriority), 0, 1),
      currentFocus: asText(getPathValue(source, "attention.currentFocus"), defaults.attention.currentFocus),
      processedLastMinute: Math.max(
        0,
        Math.round(
          asNumber(getPathValue(source, "attention.processedLastMinute"), defaults.attention.processedLastMinute)
        )
      )
    },
    reflection: {
      intervalMs: Math.max(
        1000,
        Math.round(asNumber(getPathValue(source, "reflection.intervalMs"), defaults.reflection.intervalMs))
      ),
      lastReflectionAt: asText(getPathValue(source, "reflection.lastReflectionAt"), "") || null,
      recentThoughts: asTextArray(getPathValue(source, "reflection.recentThoughts"), defaults.reflection.recentThoughts)
    },
    workspace: {
      version: Math.max(0, Math.round(asNumber(getPathValue(source, "workspace.version"), defaults.workspace.version))),
      lastBroadcastAt: asText(getPathValue(source, "workspace.lastBroadcastAt"), "") || null,
      focus: asText(getPathValue(source, "workspace.focus"), defaults.workspace.focus),
      pendingPlans: asTextArray(getPathValue(source, "workspace.pendingPlans"), defaults.workspace.pendingPlans),
      channels: asTextArray(getPathValue(source, "workspace.channels"), defaults.workspace.channels)
    },
    controller: {
      decision: asText(getPathValue(source, "controller.decision"), defaults.controller.decision),
      rationale: asText(getPathValue(source, "controller.rationale"), defaults.controller.rationale),
      reevaluations: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "controller.reevaluations"), defaults.controller.reevaluations))
      )
    },
    emotion: {
      label: asText(getPathValue(source, "emotion.label"), defaults.emotion.label),
      valence: clamp(asNumber(getPathValue(source, "emotion.valence"), defaults.emotion.valence), -1, 1),
      arousal: clamp(asNumber(getPathValue(source, "emotion.arousal"), defaults.emotion.arousal), 0, 1),
      stress: clamp(asNumber(getPathValue(source, "emotion.stress"), defaults.emotion.stress), 0, 1),
      uncertainty: clamp(asNumber(getPathValue(source, "emotion.uncertainty"), defaults.emotion.uncertainty), 0, 1)
    },
    hormones: {
      cortisol: clamp(asNumber(getPathValue(source, "hormones.cortisol"), defaults.hormones.cortisol), 0, 1),
      dopamine: clamp(asNumber(getPathValue(source, "hormones.dopamine"), defaults.hormones.dopamine), 0, 1),
      oxytocin: clamp(asNumber(getPathValue(source, "hormones.oxytocin"), defaults.hormones.oxytocin), 0, 1),
      serotonin: clamp(asNumber(getPathValue(source, "hormones.serotonin"), defaults.hormones.serotonin), 0, 1),
      attentionThreshold: clamp(
        asNumber(getPathValue(source, "hormones.attentionThreshold"), defaults.hormones.attentionThreshold),
        0,
        1
      ),
      reflectionThreshold: clamp(
        asNumber(getPathValue(source, "hormones.reflectionThreshold"), defaults.hormones.reflectionThreshold),
        0,
        1
      )
    },
    social: {
      channels: asTextArray(getPathValue(source, "social.channels"), defaults.social.channels),
      agents: normalizedAgents
    },
    introspection: {
      confidence: clamp(asNumber(getPathValue(source, "introspection.confidence"), defaults.introspection.confidence), 0, 1),
      diversity: clamp(asNumber(getPathValue(source, "introspection.diversity"), defaults.introspection.diversity), 0, 1),
      anomalyScore: clamp(
        asNumber(getPathValue(source, "introspection.anomalyScore"), defaults.introspection.anomalyScore),
        0,
        1
      ),
      intrusiveThoughtRisk: asBool(
        getPathValue(source, "introspection.intrusiveThoughtRisk"),
        defaults.introspection.intrusiveThoughtRisk
      ),
      lastResponseAt: asText(getPathValue(source, "introspection.lastResponseAt"), "") || null
    },
    integration: {
      score: clamp(asNumber(getPathValue(source, "integration.score"), defaults.integration.score), 0, 1),
      coupling: clamp(asNumber(getPathValue(source, "integration.coupling"), defaults.integration.coupling), 0, 1),
      feedbackLoops: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "integration.feedbackLoops"), defaults.integration.feedbackLoops))
      ),
      mutualSignals: clamp(
        asNumber(getPathValue(source, "integration.mutualSignals"), defaults.integration.mutualSignals),
        0,
        1
      )
    },
    compliance: {
      totalChecks: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "compliance.totalChecks"), defaults.compliance.totalChecks))
      ),
      blockedChecks: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "compliance.blockedChecks"), defaults.compliance.blockedChecks))
      ),
      lastCheckAt: asText(getPathValue(source, "compliance.lastCheckAt"), "") || null,
      lastComplianceId: asText(getPathValue(source, "compliance.lastComplianceId"), defaults.compliance.lastComplianceId),
      lastGate: asText(getPathValue(source, "compliance.lastGate"), defaults.compliance.lastGate),
      lastPromptBytes: Math.max(
        0,
        Math.round(asNumber(getPathValue(source, "compliance.lastPromptBytes"), defaults.compliance.lastPromptBytes))
      ),
      lastVerifiedResponseAt: asText(getPathValue(source, "compliance.lastVerifiedResponseAt"), "") || null
    },
    extensions: {
      drives: extensionDrives,
      commitments: {
        total: Math.max(
          0,
          Math.round(asNumber(getPathValue(source, "extensions.commitments.total"), extensionCommitments.length))
        ),
        pending: Math.max(0, Math.round(asNumber(getPathValue(source, "extensions.commitments.pending"), 0))),
        overdue: Math.max(0, Math.round(asNumber(getPathValue(source, "extensions.commitments.overdue"), 0))),
        recentlyCompleted: Math.max(
          0,
          Math.round(asNumber(getPathValue(source, "extensions.commitments.recentlyCompleted"), 0))
        ),
        items: extensionCommitments
      },
      projects: {
        total: Math.max(0, Math.round(asNumber(getPathValue(source, "extensions.projects.total"), extensionProjects.length))),
        active: Math.max(0, Math.round(asNumber(getPathValue(source, "extensions.projects.active"), 0))),
        items: extensionProjects
      },
      agenda: {
        updatedAt: asText(getPathValue(source, "extensions.agenda.updatedAt"), extensionAgendaDefault.updatedAt),
        mode:
          asText(getPathValue(source, "extensions.agenda.mode"), extensionAgendaDefault.mode) === "tracking"
            ? "tracking"
            : asText(getPathValue(source, "extensions.agenda.mode"), extensionAgendaDefault.mode) === "poised"
              ? "poised"
              : asText(getPathValue(source, "extensions.agenda.mode"), extensionAgendaDefault.mode) === "blocked"
                ? "blocked"
                : "idle",
        activeThreadId: asText(getPathValue(source, "extensions.agenda.activeThreadId"), "") || null,
        tension: clamp(asNumber(getPathValue(source, "extensions.agenda.tension"), extensionAgendaDefault.tension), 0, 1),
        autonomyReadiness: clamp(
          asNumber(
            getPathValue(source, "extensions.agenda.autonomyReadiness"),
            extensionAgendaDefault.autonomyReadiness
          ),
          0,
          1
        ),
        habitatSummary: asText(
          getPathValue(source, "extensions.agenda.habitatSummary"),
          extensionAgendaDefault.habitatSummary
        ),
        executor: {
          status:
            asText(getPathValue(source, "extensions.agenda.executor.status"), extensionAgendaDefault.executor.status) === "eligible"
              ? "eligible"
              : asText(getPathValue(source, "extensions.agenda.executor.status"), extensionAgendaDefault.executor.status) ===
                    "executing"
                ? "executing"
                : asText(getPathValue(source, "extensions.agenda.executor.status"), extensionAgendaDefault.executor.status) ===
                      "cooldown"
                  ? "cooldown"
                  : asText(getPathValue(source, "extensions.agenda.executor.status"), extensionAgendaDefault.executor.status) ===
                        "blocked"
                    ? "blocked"
                    : "idle",
          lastEvaluatedAt:
            asText(getPathValue(source, "extensions.agenda.executor.lastEvaluatedAt"), "") || null,
          lastAttemptAt:
            asText(getPathValue(source, "extensions.agenda.executor.lastAttemptAt"), "") || null,
          lastCompletedAt:
            asText(getPathValue(source, "extensions.agenda.executor.lastCompletedAt"), "") || null,
          lastActionId:
            asText(getPathValue(source, "extensions.agenda.executor.lastActionId"), "") || null,
          lastActionType:
            asText(getPathValue(source, "extensions.agenda.executor.lastActionType"), "") || null,
          lastThreadId:
            asText(getPathValue(source, "extensions.agenda.executor.lastThreadId"), "") || null,
          lastArtifactPath:
            asText(getPathValue(source, "extensions.agenda.executor.lastArtifactPath"), "") || null,
          lastArtifactHash: asText(
            getPathValue(source, "extensions.agenda.executor.lastArtifactHash"),
            extensionAgendaDefault.executor.lastArtifactHash
          ),
          cooldownUntil:
            asText(getPathValue(source, "extensions.agenda.executor.cooldownUntil"), "") || null,
          runs: Math.max(
            0,
            Math.round(asNumber(getPathValue(source, "extensions.agenda.executor.runs"), extensionAgendaDefault.executor.runs))
          ),
          successes: Math.max(
            0,
            Math.round(
              asNumber(getPathValue(source, "extensions.agenda.executor.successes"), extensionAgendaDefault.executor.successes)
            )
          ),
          failures: Math.max(
            0,
            Math.round(
              asNumber(getPathValue(source, "extensions.agenda.executor.failures"), extensionAgendaDefault.executor.failures)
            )
          ),
          lastSummary: asText(
            getPathValue(source, "extensions.agenda.executor.lastSummary"),
            extensionAgendaDefault.executor.lastSummary
          )
        },
        activeThreads: extensionAgendaThreads,
        candidateActions: extensionAgendaActions,
        outcomeLog: extensionAgendaOutcomes
      },
      beliefs: {
        total: Math.max(0, Math.round(asNumber(getPathValue(source, "extensions.beliefs.total"), extensionBeliefs.length))),
        conflicted: Math.max(0, Math.round(asNumber(getPathValue(source, "extensions.beliefs.conflicted"), 0))),
        items: extensionBeliefs
      },
      appraisal: {
        lastEmotionType: asText(
          getPathValue(source, "extensions.appraisal.lastEmotionType"),
          extensionAppraisalDefault.lastEmotionType
        ),
        lastActionTendency: asText(
          getPathValue(source, "extensions.appraisal.lastActionTendency"),
          extensionAppraisalDefault.lastActionTendency
        ),
        lastAgency: asText(
          getPathValue(source, "extensions.appraisal.lastAgency"),
          extensionAppraisalDefault.lastAgency
        ),
        recent: extensionAppraisalRecent
      },
      motiveMirror: {
        lastUpdatedAt: asText(
          getPathValue(source, "extensions.motiveMirror.lastUpdatedAt"),
          extensionMotiveMirrorDefault.lastUpdatedAt
        ),
        promptHash: asText(getPathValue(source, "extensions.motiveMirror.promptHash"), extensionMotiveMirrorDefault.promptHash),
        chosenPriority: asText(
          getPathValue(source, "extensions.motiveMirror.chosenPriority"),
          extensionMotiveMirrorDefault.chosenPriority
        ),
        responseStyle:
          asText(
            getPathValue(source, "extensions.motiveMirror.responseStyle"),
            extensionMotiveMirrorDefault.responseStyle
          ) === "direct"
            ? "direct"
            : asText(
                  getPathValue(source, "extensions.motiveMirror.responseStyle"),
                  extensionMotiveMirrorDefault.responseStyle
                ) === "supportive"
              ? "supportive"
              : "balanced",
        conflictScore: clamp(
          asNumber(getPathValue(source, "extensions.motiveMirror.conflictScore"), extensionMotiveMirrorDefault.conflictScore),
          0,
          1
        ),
        actionHint: asText(
          getPathValue(source, "extensions.motiveMirror.actionHint"),
          extensionMotiveMirrorDefault.actionHint
        ),
        rationale: asText(getPathValue(source, "extensions.motiveMirror.rationale"), extensionMotiveMirrorDefault.rationale),
        conflict:
          extensionMotiveConflict && extensionMotiveConflict.primary && extensionMotiveConflict.competing
            ? extensionMotiveConflict
            : null,
        spikes: extensionMotiveSpikes,
        motives: extensionMotiveSignals
      },
      relationship: {
        trust: clamp(asNumber(getPathValue(source, "extensions.relationship.trust"), extensionRelationshipDefault.trust), 0, 1),
        intimacy: clamp(
          asNumber(getPathValue(source, "extensions.relationship.intimacy"), extensionRelationshipDefault.intimacy),
          0,
          1
        ),
        consentComfort: clamp(
          asNumber(
            getPathValue(source, "extensions.relationship.consentComfort"),
            extensionRelationshipDefault.consentComfort
          ),
          0,
          1
        ),
        dependenceRisk: clamp(
          asNumber(
            getPathValue(source, "extensions.relationship.dependenceRisk"),
            extensionRelationshipDefault.dependenceRisk
          ),
          0,
          1
        ),
        conflictLoad: clamp(
          asNumber(getPathValue(source, "extensions.relationship.conflictLoad"), extensionRelationshipDefault.conflictLoad),
          0,
          1
        ),
        reciprocityBalance: clamp(
          asNumber(
            getPathValue(source, "extensions.relationship.reciprocityBalance"),
            extensionRelationshipDefault.reciprocityBalance
          ),
          0,
          1
        ),
        userVulnerability: clamp(
          asNumber(
            getPathValue(source, "extensions.relationship.userVulnerability"),
            extensionRelationshipDefault.userVulnerability
          ),
          0,
          1
        ),
        ruptureStatus: asText(
          getPathValue(source, "extensions.relationship.ruptureStatus"),
          extensionRelationshipDefault.ruptureStatus
        ),
        repairStage: asText(
          getPathValue(source, "extensions.relationship.repairStage"),
          extensionRelationshipDefault.repairStage
        ),
        proactiveWindowStartedAt: asText(
          getPathValue(source, "extensions.relationship.proactiveWindowStartedAt"),
          extensionRelationshipDefault.proactiveWindowStartedAt
        ),
        proactiveUsed: Math.max(
          0,
          Math.round(
            asNumber(getPathValue(source, "extensions.relationship.proactiveUsed"), extensionRelationshipDefault.proactiveUsed)
          )
        ),
        proactiveLimit: Math.max(
          1,
          Math.round(
            asNumber(
              getPathValue(source, "extensions.relationship.proactiveLimit"),
              extensionRelationshipDefault.proactiveLimit
            )
          )
        ),
        lastMode: asText(getPathValue(source, "extensions.relationship.lastMode"), extensionRelationshipDefault.lastMode),
        modeAt: asText(getPathValue(source, "extensions.relationship.modeAt"), extensionRelationshipDefault.modeAt),
        lastUpdatedAt: asText(
          getPathValue(source, "extensions.relationship.lastUpdatedAt"),
          extensionRelationshipDefault.lastUpdatedAt
        ),
        attachmentModel: {
          security: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.security"),
              extensionRelationshipDefault.attachmentModel.security
            ),
            0,
            1
          ),
          anxiety: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.anxiety"),
              extensionRelationshipDefault.attachmentModel.anxiety
            ),
            0,
            1
          ),
          avoidance: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.avoidance"),
              extensionRelationshipDefault.attachmentModel.avoidance
            ),
            0,
            1
          ),
          bondDepth: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.bondDepth"),
              extensionRelationshipDefault.attachmentModel.bondDepth
            ),
            0,
            1
          ),
          ruptureSensitivity: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.ruptureSensitivity"),
              extensionRelationshipDefault.attachmentModel.ruptureSensitivity
            ),
            0,
            1
          ),
          repairConfidence: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.repairConfidence"),
              extensionRelationshipDefault.attachmentModel.repairConfidence
            ),
            0,
            1
          ),
          expectancy: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.expectancy"),
              extensionRelationshipDefault.attachmentModel.expectancy
            ),
            0,
            1
          ),
          abandonmentLoad: clamp(
            asNumber(
              getPathValue(source, "extensions.relationship.attachmentModel.abandonmentLoad"),
              extensionRelationshipDefault.attachmentModel.abandonmentLoad
            ),
            0,
            1
          ),
          updatedAt: asText(
            getPathValue(source, "extensions.relationship.attachmentModel.updatedAt"),
            extensionRelationshipDefault.attachmentModel.updatedAt
          )
        },
        topicSensitivity: extensionRelationshipTopics,
        repairHistory: asTextArray(
          getPathValue(source, "extensions.relationship.repairHistory"),
          extensionRelationshipDefault.repairHistory
        )
      },
      morningGreeting: {
        localDate: asText(
          getPathValue(source, "extensions.morningGreeting.localDate"),
          extensionMorningGreetingDefault.localDate
        ),
        status:
          asText(getPathValue(source, "extensions.morningGreeting.status"), extensionMorningGreetingDefault.status) ===
          "pending"
            ? "pending"
            : asText(
                  getPathValue(source, "extensions.morningGreeting.status"),
                  extensionMorningGreetingDefault.status
                ) === "acknowledged"
              ? "acknowledged"
              : "idle",
        messageId: asText(
          getPathValue(source, "extensions.morningGreeting.messageId"),
          extensionMorningGreetingDefault.messageId
        ),
        text: asText(getPathValue(source, "extensions.morningGreeting.text"), extensionMorningGreetingDefault.text),
        generatedAt:
          asText(
            getPathValue(source, "extensions.morningGreeting.generatedAt"),
            extensionMorningGreetingDefault.generatedAt ?? ""
          ) || null,
        acknowledgedAt:
          asText(
            getPathValue(source, "extensions.morningGreeting.acknowledgedAt"),
            extensionMorningGreetingDefault.acknowledgedAt ?? ""
          ) || null,
        deliveryChannel: asText(
          getPathValue(source, "extensions.morningGreeting.deliveryChannel"),
          extensionMorningGreetingDefault.deliveryChannel
        ),
        deliveryAttemptedAt:
          asText(
            getPathValue(source, "extensions.morningGreeting.deliveryAttemptedAt"),
            extensionMorningGreetingDefault.deliveryAttemptedAt ?? ""
          ) || null,
        deliverySentAt:
          asText(
            getPathValue(source, "extensions.morningGreeting.deliverySentAt"),
            extensionMorningGreetingDefault.deliverySentAt ?? ""
          ) || null,
        deliveryError: asText(
          getPathValue(source, "extensions.morningGreeting.deliveryError"),
          extensionMorningGreetingDefault.deliveryError
        ),
        lastEvaluatedAt:
          asText(
            getPathValue(source, "extensions.morningGreeting.lastEvaluatedAt"),
            extensionMorningGreetingDefault.lastEvaluatedAt ?? ""
          ) || null,
        lastSuppressedAt:
          asText(
            getPathValue(source, "extensions.morningGreeting.lastSuppressedAt"),
            extensionMorningGreetingDefault.lastSuppressedAt ?? ""
          ) || null,
        readiness: clamp(
          asNumber(getPathValue(source, "extensions.morningGreeting.readiness"), extensionMorningGreetingDefault.readiness),
          0,
          1
        ),
        warmth: clamp(
          asNumber(getPathValue(source, "extensions.morningGreeting.warmth"), extensionMorningGreetingDefault.warmth),
          0,
          1
        ),
        friction: clamp(
          asNumber(getPathValue(source, "extensions.morningGreeting.friction"), extensionMorningGreetingDefault.friction),
          0,
          1
        ),
        preferredHour: clamp(
          asNumber(
            getPathValue(source, "extensions.morningGreeting.preferredHour"),
            extensionMorningGreetingDefault.preferredHour
          ),
          5,
          12
        ),
        rationale: asText(
          getPathValue(source, "extensions.morningGreeting.rationale"),
          extensionMorningGreetingDefault.rationale
        )
      },
      interaction: {
        currentMode: asText(
          getPathValue(source, "extensions.interaction.currentMode"),
          extensionInteractionDefault.currentMode
        ),
        currentReason: asText(
          getPathValue(source, "extensions.interaction.currentReason"),
          extensionInteractionDefault.currentReason
        ),
        history: extensionInteractionHistory
      },
      governance: {
        lastSleepAt: asText(getPathValue(source, "extensions.governance.lastSleepAt"), "") || null,
        runs: Math.max(0, Math.round(asNumber(getPathValue(source, "extensions.governance.runs"), extensionGovernanceDefault.runs))),
        lastReason: asText(
          getPathValue(source, "extensions.governance.lastReason"),
          extensionGovernanceDefault.lastReason
        ),
        lastConsolidatedAt:
          asText(getPathValue(source, "extensions.governance.lastConsolidatedAt"), "") || null,
        lastConsolidatedClusters: Math.max(
          0,
          Math.round(
            asNumber(
              getPathValue(source, "extensions.governance.lastConsolidatedClusters"),
              extensionGovernanceDefault.lastConsolidatedClusters
            )
          )
        ),
        lastPrunedNodes: Math.max(
          0,
          Math.round(
            asNumber(
              getPathValue(source, "extensions.governance.lastPrunedNodes"),
              extensionGovernanceDefault.lastPrunedNodes
            )
          )
        ),
        lastPrunedEdges: Math.max(
          0,
          Math.round(
            asNumber(
              getPathValue(source, "extensions.governance.lastPrunedEdges"),
              extensionGovernanceDefault.lastPrunedEdges
            )
          )
        ),
        lastSummary: asText(
          getPathValue(source, "extensions.governance.lastSummary"),
          extensionGovernanceDefault.lastSummary
        ),
        tierCounts: {
          identityKernel: Math.max(
            0,
            Math.round(
              asNumber(
                getPathValue(source, "extensions.governance.tierCounts.identityKernel"),
                extensionGovernanceDefault.tierCounts.identityKernel
              )
            )
          ),
          relationshipKernel: Math.max(
            0,
            Math.round(
              asNumber(
                getPathValue(source, "extensions.governance.tierCounts.relationshipKernel"),
                extensionGovernanceDefault.tierCounts.relationshipKernel
              )
            )
          ),
          commitmentProject: Math.max(
            0,
            Math.round(
              asNumber(
                getPathValue(source, "extensions.governance.tierCounts.commitmentProject"),
                extensionGovernanceDefault.tierCounts.commitmentProject
              )
            )
          ),
          beliefAnchor: Math.max(
            0,
            Math.round(
              asNumber(
                getPathValue(source, "extensions.governance.tierCounts.beliefAnchor"),
                extensionGovernanceDefault.tierCounts.beliefAnchor
              )
            )
          ),
          episodic: Math.max(
            0,
            Math.round(
              asNumber(
                getPathValue(source, "extensions.governance.tierCounts.episodic"),
                extensionGovernanceDefault.tierCounts.episodic
              )
            )
          ),
          transient: Math.max(
            0,
            Math.round(
              asNumber(
                getPathValue(source, "extensions.governance.tierCounts.transient"),
                extensionGovernanceDefault.tierCounts.transient
              )
            )
          )
        }
      },
      persona: {
        policyVersion: asText(
          getPathValue(source, "extensions.persona.policyVersion"),
          extensionPersonaDefault.policyVersion
        ),
        driftScore: clamp(
          asNumber(getPathValue(source, "extensions.persona.driftScore"), extensionPersonaDefault.driftScore),
          0,
          1
        ),
        lastFingerprint: asText(
          getPathValue(source, "extensions.persona.lastFingerprint"),
          extensionPersonaDefault.lastFingerprint
        ),
        lastRegressionAt:
          asText(
            getPathValue(source, "extensions.persona.lastRegressionAt"),
            extensionPersonaDefault.lastRegressionAt ?? ""
          ) || null
      },
      worldGrounding:
        (getPathValue(source, "extensions.worldGrounding") as NonNullable<CognitiveSnapshot["extensions"]>["worldGrounding"]) ??
        extensionWorldGroundingDefault,
      embodiment: createEmbodimentState({
        enabled: asBool(getPathValue(source, "extensions.embodiment.enabled"), extensionEmbodimentDefault.enabled),
        controllerVersion: asText(
          getPathValue(source, "extensions.embodiment.controllerVersion"),
          extensionEmbodimentDefault.controllerVersion
        ),
        updatedAt: asText(
          getPathValue(source, "extensions.embodiment.updatedAt"),
          extensionEmbodimentDefault.updatedAt
        ),
        activeMotorIntent: asText(
          getPathValue(source, "extensions.embodiment.activeMotorIntent"),
          extensionEmbodimentDefault.activeMotorIntent
        ),
        activeMotorIntents: asTextArray(
          getPathValue(source, "extensions.embodiment.activeMotorIntents"),
          extensionEmbodimentDefault.activeMotorIntents
        ),
        volition: {
          autonomyMode: "blended_autonomous",
          currentIntention: {
            ...extensionEmbodimentDefault.volition.currentIntention,
            id: asText(
              getPathValue(source, "extensions.embodiment.volition.currentIntention.id"),
              extensionEmbodimentDefault.volition.currentIntention.id
            ),
            name: asText(
              getPathValue(source, "extensions.embodiment.volition.currentIntention.name"),
              extensionEmbodimentDefault.volition.currentIntention.name
            ) as AuroraEmbodimentState["volition"]["currentIntention"]["name"],
            label: asText(
              getPathValue(source, "extensions.embodiment.volition.currentIntention.label"),
              extensionEmbodimentDefault.volition.currentIntention.label
            ),
            rationale: asText(
              getPathValue(source, "extensions.embodiment.volition.currentIntention.rationale"),
              extensionEmbodimentDefault.volition.currentIntention.rationale
            ),
            source: asText(
              getPathValue(source, "extensions.embodiment.volition.currentIntention.source"),
              extensionEmbodimentDefault.volition.currentIntention.source
            ) as AuroraEmbodimentState["volition"]["currentIntention"]["source"],
            attentionTarget: asText(
              getPathValue(source, "extensions.embodiment.volition.currentIntention.attentionTarget"),
              extensionEmbodimentDefault.volition.currentIntention.attentionTarget
            ) as AuroraEmbodimentState["volition"]["currentIntention"]["attentionTarget"],
            priority: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.volition.currentIntention.priority"),
                extensionEmbodimentDefault.volition.currentIntention.priority
              ),
              0,
              1
            ),
            generatedAt: asText(
              getPathValue(source, "extensions.embodiment.volition.currentIntention.generatedAt"),
              extensionEmbodimentDefault.volition.currentIntention.generatedAt
            ),
            expiresAt:
              asText(
                getPathValue(source, "extensions.embodiment.volition.currentIntention.expiresAt"),
                extensionEmbodimentDefault.volition.currentIntention.expiresAt ?? ""
              ) || null,
            postureBias: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.volition.currentIntention.postureBias"),
                extensionEmbodimentDefault.volition.currentIntention.postureBias
              ),
              -1,
              1
            ),
            gazeBias: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.volition.currentIntention.gazeBias"),
                extensionEmbodimentDefault.volition.currentIntention.gazeBias
              ),
              -1,
              1
            ),
            gestureBias: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.volition.currentIntention.gestureBias"),
                extensionEmbodimentDefault.volition.currentIntention.gestureBias
              ),
              -1,
              1
            ),
            locomotionBias: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.volition.currentIntention.locomotionBias"),
                extensionEmbodimentDefault.volition.currentIntention.locomotionBias
              ),
              -1,
              1
            ),
            expressionBias: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.volition.currentIntention.expressionBias"),
                extensionEmbodimentDefault.volition.currentIntention.expressionBias
              ),
              -1,
              1
            )
          },
          queuedIntentions: Array.isArray(getPathValue(source, "extensions.embodiment.volition.queuedIntentions"))
            ? (
                getPathValue(source, "extensions.embodiment.volition.queuedIntentions") as Array<Record<string, unknown>>
              ).map((item, index) => ({
                ...extensionEmbodimentDefault.volition.currentIntention,
                id: asText(item.id, `${extensionEmbodimentDefault.volition.currentIntention.id}-${index + 1}`),
                name: asText(item.name, extensionEmbodimentDefault.volition.currentIntention.name) as AuroraEmbodimentState["volition"]["currentIntention"]["name"],
                label: asText(item.label, extensionEmbodimentDefault.volition.currentIntention.label),
                rationale: asText(item.rationale, extensionEmbodimentDefault.volition.currentIntention.rationale),
                source: asText(item.source, extensionEmbodimentDefault.volition.currentIntention.source) as AuroraEmbodimentState["volition"]["currentIntention"]["source"],
                attentionTarget: asText(item.attentionTarget, extensionEmbodimentDefault.volition.currentIntention.attentionTarget) as AuroraEmbodimentState["volition"]["currentIntention"]["attentionTarget"],
                priority: clamp(asNumber(item.priority, extensionEmbodimentDefault.volition.currentIntention.priority), 0, 1),
                generatedAt: asText(item.generatedAt, extensionEmbodimentDefault.volition.currentIntention.generatedAt),
                expiresAt: asText(item.expiresAt, "") || null,
                postureBias: clamp(asNumber(item.postureBias, extensionEmbodimentDefault.volition.currentIntention.postureBias), -1, 1),
                gazeBias: clamp(asNumber(item.gazeBias, extensionEmbodimentDefault.volition.currentIntention.gazeBias), -1, 1),
                gestureBias: clamp(asNumber(item.gestureBias, extensionEmbodimentDefault.volition.currentIntention.gestureBias), -1, 1),
                locomotionBias: clamp(asNumber(item.locomotionBias, extensionEmbodimentDefault.volition.currentIntention.locomotionBias), -1, 1),
                expressionBias: clamp(asNumber(item.expressionBias, extensionEmbodimentDefault.volition.currentIntention.expressionBias), -1, 1)
              }))
            : extensionEmbodimentDefault.volition.queuedIntentions,
          lastGeneratedAt: asText(
            getPathValue(source, "extensions.embodiment.volition.lastGeneratedAt"),
            extensionEmbodimentDefault.volition.lastGeneratedAt
          ),
          lastExecutedAt: asText(
            getPathValue(source, "extensions.embodiment.volition.lastExecutedAt"),
            extensionEmbodimentDefault.volition.lastExecutedAt
          )
        },
        interoception: {
          warmth: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.warmth"), extensionEmbodimentDefault.interoception.warmth),
            0,
            1
          ),
          tension: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.tension"), extensionEmbodimentDefault.interoception.tension),
            0,
            1
          ),
          openness: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.openness"), extensionEmbodimentDefault.interoception.openness),
            0,
            1
          ),
          overload: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.overload"), extensionEmbodimentDefault.interoception.overload),
            0,
            1
          ),
          guard: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.guard"), extensionEmbodimentDefault.interoception.guard),
            0,
            1
          ),
          curiosity: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.curiosity"), extensionEmbodimentDefault.interoception.curiosity),
            0,
            1
          ),
          activity: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.activity"), extensionEmbodimentDefault.interoception.activity),
            0,
            1
          ),
          speaking: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.speaking"), extensionEmbodimentDefault.interoception.speaking),
            0,
            1
          ),
          urgeToMove: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.urgeToMove"), extensionEmbodimentDefault.interoception.urgeToMove),
            0,
            1
          ),
          grounding: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.grounding"), extensionEmbodimentDefault.interoception.grounding),
            0,
            1
          ),
          affiliation: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.affiliation"), extensionEmbodimentDefault.interoception.affiliation),
            0,
            1
          ),
          effort: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.effort"), extensionEmbodimentDefault.interoception.effort),
            0,
            1
          ),
          restlessness: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.interoception.restlessness"), extensionEmbodimentDefault.interoception.restlessness),
            0,
            1
          )
        },
        motor: {
          autonomy: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.autonomy"), extensionEmbodimentDefault.motor.autonomy),
            0,
            1
          ),
          motionEnergy: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.motionEnergy"), extensionEmbodimentDefault.motor.motionEnergy),
            0,
            1
          ),
          gestureEnergy: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.gestureEnergy"), extensionEmbodimentDefault.motor.gestureEnergy),
            0,
            1
          ),
          stillnessBias: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.stillnessBias"), extensionEmbodimentDefault.motor.stillnessBias),
            0,
            1
          ),
          explorationDrive: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.explorationDrive"), extensionEmbodimentDefault.motor.explorationDrive),
            0,
            1
          ),
          settleDrive: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.settleDrive"), extensionEmbodimentDefault.motor.settleDrive),
            0,
            1
          ),
          expressionDrive: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.expressionDrive"), extensionEmbodimentDefault.motor.expressionDrive),
            0,
            1
          ),
          breathPhase: asNumber(
            getPathValue(source, "extensions.embodiment.motor.breathPhase"),
            extensionEmbodimentDefault.motor.breathPhase
          ),
          swayPhase: asNumber(
            getPathValue(source, "extensions.embodiment.motor.swayPhase"),
            extensionEmbodimentDefault.motor.swayPhase
          ),
          gazePhase: asNumber(
            getPathValue(source, "extensions.embodiment.motor.gazePhase"),
            extensionEmbodimentDefault.motor.gazePhase
          ),
          handPhase: asNumber(
            getPathValue(source, "extensions.embodiment.motor.handPhase"),
            extensionEmbodimentDefault.motor.handPhase
          ),
          weightShiftPhase: asNumber(
            getPathValue(source, "extensions.embodiment.motor.weightShiftPhase"),
            extensionEmbodimentDefault.motor.weightShiftPhase
          ),
          blinkAmount: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.blinkAmount"), extensionEmbodimentDefault.motor.blinkAmount),
            0,
            1
          ),
          blinkProgress: asNumber(
            getPathValue(source, "extensions.embodiment.motor.blinkProgress"),
            extensionEmbodimentDefault.motor.blinkProgress
          ),
          nextBlinkIn: Math.max(
            0,
            asNumber(getPathValue(source, "extensions.embodiment.motor.nextBlinkIn"), extensionEmbodimentDefault.motor.nextBlinkIn)
          ),
          pulseBoost: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.motor.pulseBoost"), extensionEmbodimentDefault.motor.pulseBoost),
            0,
            1.5
          ),
          lastActivityPulse: Math.max(
            0,
            Math.round(
              asNumber(
                getPathValue(source, "extensions.embodiment.motor.lastActivityPulse"),
                extensionEmbodimentDefault.motor.lastActivityPulse
              )
            )
          ),
          habitatZone: (() => {
            const value = getPathValue(source, "extensions.embodiment.motor.habitatZone");
            const fallbackZone =
              extensionEmbodimentDefault.motor.habitatZone === "center" ||
              extensionEmbodimentDefault.motor.habitatZone === "desk" ||
              extensionEmbodimentDefault.motor.habitatZone === "couch" ||
              extensionEmbodimentDefault.motor.habitatZone === "bed"
                ? extensionEmbodimentDefault.motor.habitatZone
                : DEFAULT_AURORA_EMBODIMENT_STATE.motor.habitatZone;
            return value === "center" || value === "desk" || value === "couch" || value === "bed"
              ? value
              : fallbackZone;
          })()
        },
        bodySchema: {
          stance: "standing_void",
          supportPlane: "void_anchor",
          locomotionMode: "in_place",
          posture: "upright",
          dominantSide:
            asText(getPathValue(source, "extensions.embodiment.bodySchema.dominantSide"), extensionEmbodimentDefault.bodySchema.dominantSide) ===
            "left"
              ? "left"
              : "right",
          controlledBones: extensionEmbodimentDefault.bodySchema.controlledBones,
          hasFace: asBool(getPathValue(source, "extensions.embodiment.bodySchema.hasFace"), extensionEmbodimentDefault.bodySchema.hasFace),
          hasHands: asBool(getPathValue(source, "extensions.embodiment.bodySchema.hasHands"), extensionEmbodimentDefault.bodySchema.hasHands),
          hasLegs: asBool(getPathValue(source, "extensions.embodiment.bodySchema.hasLegs"), extensionEmbodimentDefault.bodySchema.hasLegs)
        },
        proprioception: {
          headPitch: asNumber(
            getPathValue(source, "extensions.embodiment.proprioception.headPitch"),
            extensionEmbodimentDefault.proprioception.headPitch
          ),
          gazeElevation: asNumber(
            getPathValue(source, "extensions.embodiment.proprioception.gazeElevation"),
            extensionEmbodimentDefault.proprioception.gazeElevation
          ),
          chestOpenness: clamp(
            asNumber(
              getPathValue(source, "extensions.embodiment.proprioception.chestOpenness"),
              extensionEmbodimentDefault.proprioception.chestOpenness
            ),
            0,
            1
          ),
          balance: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.proprioception.balance"), extensionEmbodimentDefault.proprioception.balance),
            0,
            1
          ),
          stillness: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.proprioception.stillness"), extensionEmbodimentDefault.proprioception.stillness),
            0,
            1
          ),
          symmetry: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.proprioception.symmetry"), extensionEmbodimentDefault.proprioception.symmetry),
            0,
            1
          ),
          leftReach: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.proprioception.leftReach"), extensionEmbodimentDefault.proprioception.leftReach),
            0,
            1
          ),
          rightReach: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.proprioception.rightReach"), extensionEmbodimentDefault.proprioception.rightReach),
            0,
            1
          ),
          rootYaw: asNumber(
            getPathValue(source, "extensions.embodiment.proprioception.rootYaw"),
            extensionEmbodimentDefault.proprioception.rootYaw
          )
        },
        habits: {
          baselinePosture: asText(
            getPathValue(source, "extensions.embodiment.habits.baselinePosture"),
            extensionEmbodimentDefault.habits.baselinePosture
          ),
          gazeStyle: asText(
            getPathValue(source, "extensions.embodiment.habits.gazeStyle"),
            extensionEmbodimentDefault.habits.gazeStyle
          ),
          settlingStyle: asText(
            getPathValue(source, "extensions.embodiment.habits.settlingStyle"),
            extensionEmbodimentDefault.habits.settlingStyle
          ),
          expressivity: clamp(
            asNumber(getPathValue(source, "extensions.embodiment.habits.expressivity"), extensionEmbodimentDefault.habits.expressivity),
            0,
            1
          ),
          gestureAsymmetry: clamp(
            asNumber(
              getPathValue(source, "extensions.embodiment.habits.gestureAsymmetry"),
              extensionEmbodimentDefault.habits.gestureAsymmetry
            ),
            0,
            1
          )
        },
        directives: normalizeEmbodimentDirectiveState(
          getPathValue(source, "extensions.embodiment.directives")
        ),
        perception: {
          rendererConnected: asBool(
            getPathValue(source, "extensions.embodiment.perception.rendererConnected"),
            extensionEmbodimentDefault.perception.rendererConnected
          ),
          headlessContinuity: asBool(
            getPathValue(source, "extensions.embodiment.perception.headlessContinuity"),
            extensionEmbodimentDefault.perception.headlessContinuity
          ),
          lastObservedAt:
            asText(
              getPathValue(source, "extensions.embodiment.perception.lastObservedAt"),
              extensionEmbodimentDefault.perception.lastObservedAt ?? ""
            ) || null,
          lastVisionAt:
            asText(
              getPathValue(source, "extensions.embodiment.perception.lastVisionAt"),
              extensionEmbodimentDefault.perception.lastVisionAt ?? ""
            ) || null,
          lastRigFeedbackAt:
            asText(
              getPathValue(source, "extensions.embodiment.perception.lastRigFeedbackAt"),
              extensionEmbodimentDefault.perception.lastRigFeedbackAt ?? ""
            ) || null,
          avatarVision: {
            observedAt:
              asText(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.observedAt"),
                extensionEmbodimentDefault.perception.avatarVision.observedAt ?? ""
              ) || null,
            source:
              asText(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.source"),
                extensionEmbodimentDefault.perception.avatarVision.source
              ) === "avatar_renderer"
                ? "avatar_renderer"
                : asText(
                      getPathValue(source, "extensions.embodiment.perception.avatarVision.source"),
                      extensionEmbodimentDefault.perception.avatarVision.source
                    ) === "avatar_eye_camera"
                  ? "avatar_eye_camera"
                : "stale",
            perspective:
              asText(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.perspective"),
                extensionEmbodimentDefault.perception.avatarVision.perspective
              ) === "first_person"
                ? "first_person"
                : "third_person",
            frameLuminance: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.frameLuminance"),
                extensionEmbodimentDefault.perception.avatarVision.frameLuminance
              ),
              0,
              1
            ),
            luminanceVariance: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.luminanceVariance"),
                extensionEmbodimentDefault.perception.avatarVision.luminanceVariance
              ),
              0,
              1
            ),
            silhouetteCoverage: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.silhouetteCoverage"),
                extensionEmbodimentDefault.perception.avatarVision.silhouetteCoverage
              ),
              0,
              1
            ),
            motionMagnitude: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.motionMagnitude"),
                extensionEmbodimentDefault.perception.avatarVision.motionMagnitude
              ),
              0,
              1
            ),
            centering: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.centering"),
                extensionEmbodimentDefault.perception.avatarVision.centering
              ),
              0,
              1
            ),
            faceVisible: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.faceVisible"),
                extensionEmbodimentDefault.perception.avatarVision.faceVisible
              ),
              0,
              1
            ),
            handsVisible: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.handsVisible"),
                extensionEmbodimentDefault.perception.avatarVision.handsVisible
              ),
              0,
              1
            ),
            feetVisible: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.feetVisible"),
                extensionEmbodimentDefault.perception.avatarVision.feetVisible
              ),
              0,
              1
            ),
            clippingRisk: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.clippingRisk"),
                extensionEmbodimentDefault.perception.avatarVision.clippingRisk
              ),
              0,
              1
            ),
            sceneBrightness: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.avatarVision.sceneBrightness"),
                extensionEmbodimentDefault.perception.avatarVision.sceneBrightness
              ),
              0,
              1
            ),
            framing: asText(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.framing"),
              extensionEmbodimentDefault.perception.avatarVision.framing
            ),
            stage: asText(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.stage"),
              extensionEmbodimentDefault.perception.avatarVision.stage
            ),
            gazeRead: asText(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.gazeRead"),
              extensionEmbodimentDefault.perception.avatarVision.gazeRead
            ),
            motionRead: asText(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.motionRead"),
              extensionEmbodimentDefault.perception.avatarVision.motionRead
            ),
            postureRead: asText(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.postureRead"),
              extensionEmbodimentDefault.perception.avatarVision.postureRead
            ),
            visibleRegions: normalizeStringArray(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.visibleRegions"),
              extensionEmbodimentDefault.perception.avatarVision.visibleRegions
            ),
            summary: asText(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.summary"),
              extensionEmbodimentDefault.perception.avatarVision.summary
            ),
            snapshotHash: asText(
              getPathValue(source, "extensions.embodiment.perception.avatarVision.snapshotHash"),
              extensionEmbodimentDefault.perception.avatarVision.snapshotHash
            )
          },
          eyeVision: {
            observedAt:
              asText(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.observedAt"),
                extensionEmbodimentDefault.perception.eyeVision.observedAt ?? ""
              ) || null,
            source:
              asText(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.source"),
                extensionEmbodimentDefault.perception.eyeVision.source
              ) === "avatar_eye_camera"
                ? "avatar_eye_camera"
                : asText(
                      getPathValue(source, "extensions.embodiment.perception.eyeVision.source"),
                      extensionEmbodimentDefault.perception.eyeVision.source
                    ) === "avatar_renderer"
                  ? "avatar_renderer"
                  : "stale",
            perspective:
              asText(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.perspective"),
                extensionEmbodimentDefault.perception.eyeVision.perspective
              ) === "third_person"
                ? "third_person"
                : "first_person",
            frameLuminance: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.frameLuminance"),
                extensionEmbodimentDefault.perception.eyeVision.frameLuminance
              ),
              0,
              1
            ),
            luminanceVariance: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.luminanceVariance"),
                extensionEmbodimentDefault.perception.eyeVision.luminanceVariance
              ),
              0,
              1
            ),
            silhouetteCoverage: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.silhouetteCoverage"),
                extensionEmbodimentDefault.perception.eyeVision.silhouetteCoverage
              ),
              0,
              1
            ),
            motionMagnitude: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.motionMagnitude"),
                extensionEmbodimentDefault.perception.eyeVision.motionMagnitude
              ),
              0,
              1
            ),
            centering: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.centering"),
                extensionEmbodimentDefault.perception.eyeVision.centering
              ),
              0,
              1
            ),
            faceVisible: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.faceVisible"),
                extensionEmbodimentDefault.perception.eyeVision.faceVisible
              ),
              0,
              1
            ),
            handsVisible: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.handsVisible"),
                extensionEmbodimentDefault.perception.eyeVision.handsVisible
              ),
              0,
              1
            ),
            feetVisible: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.feetVisible"),
                extensionEmbodimentDefault.perception.eyeVision.feetVisible
              ),
              0,
              1
            ),
            clippingRisk: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.clippingRisk"),
                extensionEmbodimentDefault.perception.eyeVision.clippingRisk
              ),
              0,
              1
            ),
            sceneBrightness: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.eyeVision.sceneBrightness"),
                extensionEmbodimentDefault.perception.eyeVision.sceneBrightness
              ),
              0,
              1
            ),
            framing: asText(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.framing"),
              extensionEmbodimentDefault.perception.eyeVision.framing
            ),
            stage: asText(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.stage"),
              extensionEmbodimentDefault.perception.eyeVision.stage
            ),
            gazeRead: asText(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.gazeRead"),
              extensionEmbodimentDefault.perception.eyeVision.gazeRead
            ),
            motionRead: asText(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.motionRead"),
              extensionEmbodimentDefault.perception.eyeVision.motionRead
            ),
            postureRead: asText(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.postureRead"),
              extensionEmbodimentDefault.perception.eyeVision.postureRead
            ),
            visibleRegions: normalizeStringArray(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.visibleRegions"),
              extensionEmbodimentDefault.perception.eyeVision.visibleRegions
            ),
            summary: asText(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.summary"),
              extensionEmbodimentDefault.perception.eyeVision.summary
            ),
            snapshotHash: asText(
              getPathValue(source, "extensions.embodiment.perception.eyeVision.snapshotHash"),
              extensionEmbodimentDefault.perception.eyeVision.snapshotHash
            )
          },
          rigFeedback: {
            observedAt:
              asText(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.observedAt"),
                extensionEmbodimentDefault.perception.rigFeedback.observedAt ?? ""
              ) || null,
            rootWorldPosition: asVector3(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.rootWorldPosition"),
              extensionEmbodimentDefault.perception.rigFeedback.rootWorldPosition
            ),
            rootWorldRotation: asVector3(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.rootWorldRotation"),
              extensionEmbodimentDefault.perception.rigFeedback.rootWorldRotation
            ),
            rootYaw: asNumber(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.rootYaw"),
              extensionEmbodimentDefault.perception.rigFeedback.rootYaw
            ),
            facingRead: asText(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.facingRead"),
              extensionEmbodimentDefault.perception.rigFeedback.facingRead
            ),
            headWorldPosition: asVector3(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.headWorldPosition"),
              extensionEmbodimentDefault.perception.rigFeedback.headWorldPosition
            ),
            leftHandWorldPosition: asVector3(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.leftHandWorldPosition"),
              extensionEmbodimentDefault.perception.rigFeedback.leftHandWorldPosition
            ),
            rightHandWorldPosition: asVector3(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.rightHandWorldPosition"),
              extensionEmbodimentDefault.perception.rigFeedback.rightHandWorldPosition
            ),
            headScreenPosition: asVector3(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.headScreenPosition"),
              extensionEmbodimentDefault.perception.rigFeedback.headScreenPosition
            ),
            bodyCentroidScreen: asVector3(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.bodyCentroidScreen"),
              extensionEmbodimentDefault.perception.rigFeedback.bodyCentroidScreen
            ),
            bodyVisibility: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.bodyVisibility"),
                extensionEmbodimentDefault.perception.rigFeedback.bodyVisibility
              ),
              0,
              1
            ),
            faceVisibility: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.faceVisibility"),
                extensionEmbodimentDefault.perception.rigFeedback.faceVisibility
              ),
              0,
              1
            ),
            leftHandVisibility: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.leftHandVisibility"),
                extensionEmbodimentDefault.perception.rigFeedback.leftHandVisibility
              ),
              0,
              1
            ),
            rightHandVisibility: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.rightHandVisibility"),
                extensionEmbodimentDefault.perception.rigFeedback.rightHandVisibility
              ),
              0,
              1
            ),
            feetVisibility: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.feetVisibility"),
                extensionEmbodimentDefault.perception.rigFeedback.feetVisibility
              ),
              0,
              1
            ),
            clipping: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.clipping"),
                extensionEmbodimentDefault.perception.rigFeedback.clipping
              ),
              0,
              1
            ),
            motionVelocity: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.motionVelocity"),
                extensionEmbodimentDefault.perception.rigFeedback.motionVelocity
              ),
              0,
              4
            ),
            expressionHappy: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.expressionHappy"),
                extensionEmbodimentDefault.perception.rigFeedback.expressionHappy
              ),
              0,
              1
            ),
            expressionRelaxed: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.expressionRelaxed"),
                extensionEmbodimentDefault.perception.rigFeedback.expressionRelaxed
              ),
              0,
              1
            ),
            expressionSad: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.expressionSad"),
                extensionEmbodimentDefault.perception.rigFeedback.expressionSad
              ),
              0,
              1
            ),
            expressionAngry: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.expressionAngry"),
                extensionEmbodimentDefault.perception.rigFeedback.expressionAngry
              ),
              0,
              1
            ),
            expressionAa: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.expressionAa"),
                extensionEmbodimentDefault.perception.rigFeedback.expressionAa
              ),
              0,
              1
            ),
            expressionOh: clamp(
              asNumber(
                getPathValue(source, "extensions.embodiment.perception.rigFeedback.expressionOh"),
                extensionEmbodimentDefault.perception.rigFeedback.expressionOh
              ),
              0,
              1
            ),
            expressionRead: asText(
              getPathValue(source, "extensions.embodiment.perception.rigFeedback.expressionRead"),
              extensionEmbodimentDefault.perception.rigFeedback.expressionRead
            )
          }
        },
        pose: {
          rootPosition: asVector3(
            getPathValue(source, "extensions.embodiment.pose.rootPosition"),
            extensionEmbodimentDefault.pose.rootPosition
          ),
          rootRotation: asVector3(
            getPathValue(source, "extensions.embodiment.pose.rootRotation"),
            extensionEmbodimentDefault.pose.rootRotation
          ),
          lookTarget: asVector3(
            getPathValue(source, "extensions.embodiment.pose.lookTarget"),
            extensionEmbodimentDefault.pose.lookTarget
          ),
          bones: {
            ...extensionEmbodimentDefault.pose.bones
          },
          expressions: {
            blink: clamp(
              asNumber(getPathValue(source, "extensions.embodiment.pose.expressions.blink"), extensionEmbodimentDefault.pose.expressions.blink),
              0,
              1
            ),
            happy: clamp(
              asNumber(getPathValue(source, "extensions.embodiment.pose.expressions.happy"), extensionEmbodimentDefault.pose.expressions.happy),
              0,
              1
            ),
            relaxed: clamp(
              asNumber(getPathValue(source, "extensions.embodiment.pose.expressions.relaxed"), extensionEmbodimentDefault.pose.expressions.relaxed),
              0,
              1
            ),
            sad: clamp(
              asNumber(getPathValue(source, "extensions.embodiment.pose.expressions.sad"), extensionEmbodimentDefault.pose.expressions.sad),
              0,
              1
            ),
            angry: clamp(
              asNumber(getPathValue(source, "extensions.embodiment.pose.expressions.angry"), extensionEmbodimentDefault.pose.expressions.angry),
              0,
              1
            ),
            aa: clamp(
              asNumber(getPathValue(source, "extensions.embodiment.pose.expressions.aa"), extensionEmbodimentDefault.pose.expressions.aa),
              0,
              1
            ),
            oh: clamp(
              asNumber(getPathValue(source, "extensions.embodiment.pose.expressions.oh"), extensionEmbodimentDefault.pose.expressions.oh),
              0,
              1
            )
          }
        }
      })
    }
  };
}

function lexicalDiversity(text: string): number {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }

  return clamp(new Set(tokens).size / tokens.length, 0, 1);
}

function isMissingToolCallOutputError(errorBody: string): boolean {
  const normalized = errorBody.toLowerCase();
  return (
    normalized.includes("no tool call found for function call output") ||
    (normalized.includes("function call output with call_id") && normalized.includes("no tool call"))
  );
}

function shouldResetPreviousResponseId(errorBody: string, previousResponseId: string | undefined): boolean {
  return Boolean(previousResponseId) && isMissingToolCallOutputError(errorBody);
}

function isAgentSemanticSessionKey(sessionId: string): boolean {
  return /^agent:[^:\s]+:/i.test(sessionId.trim());
}

function makeRecoverySessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!normalized) {
    return `recovery-${Date.now()}`;
  }

  if (isAgentSemanticSessionKey(normalized)) {
    return normalized;
  }

  const safeBase = normalized.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${safeBase || "session"}-recovery-${Date.now()}`;
}

async function postSendRequest(
  config: AuroraClientConfig,
  payload: SendRequestPayload,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(config.sendProxyPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal
  });
}

function normalizeAuroraState(payload: unknown): AuroraState {
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  const timestamp = firstValue(source, [
    "lastHeartbeat.timestamp",
    "heartbeat.timestamp",
    "timestamp",
    "last_heartbeat.timestamp"
  ]);

  const whatIDid = firstValue(source, ["lastHeartbeat.whatIDid", "whatIDid", "what_i_did", "summary"]);
  const whatILearned = firstValue(source, ["lastHeartbeat.whatILearned", "whatILearned", "what_i_learned", "learned"]);
  const whatImCuriousAbout = firstValue(source, [
    "lastHeartbeat.whatImCuriousAbout",
    "whatImCuriousAbout",
    "what_i_am_curious_about"
  ]);
  const memoryUpdates = firstValue(source, [
    "lastHeartbeat.memoryUpdates",
    "memoryUpdates",
    "memory_updates",
    "memories"
  ]);
  const mode = firstValue(source, [
    "lastHeartbeat.mode",
    "mode",
    "lifeMode",
    "life_mode"
  ]);
  const ambientState = firstValue(source, [
    "lastHeartbeat.ambientState",
    "ambientState",
    "ambient_state"
  ]);
  const privateLife = firstValue(source, [
    "lastHeartbeat.privateLife",
    "privateLife",
    "private_life"
  ]);
  const desireToShare = firstValue(source, [
    "lastHeartbeat.desireToShare",
    "desireToShare",
    "desire_to_share"
  ]);
  const livedThread = firstValue(source, [
    "lastHeartbeat.livedThread",
    "livedThread",
    "lived_thread"
  ]);
  const stateShift = firstValue(source, [
    "lastHeartbeat.stateShift",
    "stateShift",
    "state_shift"
  ]);
  const openLoop = firstValue(source, [
    "lastHeartbeat.openLoop",
    "openLoop",
    "open_loop"
  ]);

  return {
    sourcePath: toText(firstValue(source, ["sourcePath", "source_path"])) || DEFAULT_AURORA_STATE.sourcePath,
    available:
      typeof firstValue(source, ["available", "ok"]) === "boolean"
        ? Boolean(firstValue(source, ["available", "ok"]))
        : true,
    loadedAt:
      toText(firstValue(source, ["loadedAt", "loaded_at", "updatedAt", "updated_at"])) ||
      new Date().toISOString(),
    lastHeartbeat: {
      timestamp: toText(timestamp) || null,
      whatIDid: toText(whatIDid) || DEFAULT_AURORA_STATE.lastHeartbeat.whatIDid,
      whatILearned: toText(whatILearned),
      whatImCuriousAbout: toText(whatImCuriousAbout),
      memoryUpdates: normalizeMemoryUpdates(memoryUpdates),
      mode: toText(mode),
      ambientState: toText(ambientState),
      privateLife: toText(privateLife),
      desireToShare: toText(desireToShare),
      livedThread: toText(livedThread),
      stateShift: toText(stateShift),
      openLoop: toText(openLoop)
    },
    cognition: normalizeCognitiveSnapshot(firstValue(source, ["cognition"])),
    raw: firstValue(source, ["raw"]) ?? payload,
    error: toText(firstValue(source, ["error"])) || undefined
  };
}

function extractItemsText(payload: unknown): string {
  const items = getPathValue(payload, "items");
  if (!Array.isArray(items)) {
    return "";
  }

  const chunks: string[] = [];

  for (const item of items) {
    const content = getPathValue(item, "content");
    if (Array.isArray(content)) {
      for (const part of content) {
        const text = firstValue(part, ["text", "value", "content"]);
        const normalized = toText(text).trim();
        if (normalized) {
          chunks.push(normalized);
        }
      }
      continue;
    }

    const fallback = firstValue(item, ["text", "output_text", "message", "content"]);
    const normalized = toText(fallback).trim();
    if (normalized) {
      chunks.push(normalized);
    }
  }

  return chunks.join("\n");
}

function extractReplyText(payload: unknown, replyTextPath: string): string {
  if (typeof payload === "string") {
    return payload;
  }

  const byPath = getPathValue(payload, replyTextPath);
  if (byPath !== undefined) {
    const text = toText(byPath).trim();
    if (text) {
      return text;
    }
  }

  const fromItems = extractItemsText(payload);
  if (fromItems) {
    return fromItems;
  }

  const fallback = firstValue(payload, [
    "reply",
    "response",
    "message",
    "output",
    "output_text",
    "content",
    "data.reply",
    "data.message",
    "choices.0.message.content",
    "choices.0.delta.content"
  ]);

  return toText(fallback).trim();
}

function extractResponseId(payload: unknown): string | undefined {
  const id = toText(firstValue(payload, ["response.id", "id", "response_id", "data.id"]))
    .trim();
  return id || undefined;
}

function extractSessionId(payload: unknown): string | undefined {
  const session = toText(
    firstValue(payload, [
      "response.conversation",
      "response.conversation_id",
      "response.thread.id",
      "conversation",
      "conversation_id",
      "thread.id",
      "thread_id",
      "session_id",
      "session.id",
      "user"
    ])
  ).trim();

  return session || undefined;
}

function normalizeStreamEventType(eventType: string, payload: unknown): string {
  const direct = eventType.trim().toLowerCase();
  if (direct) {
    return direct;
  }

  return toText(
    firstValue(payload, [
      "type",
      "event",
      "event_type",
      "data.type",
      "response.type",
      "item.type",
      "delta.type",
      "message.type"
    ])
  )
    .trim()
    .toLowerCase();
}

function isInternalStreamPayload(normalizedType: string, payload: unknown): boolean {
  const modelTypeHints = [
    toText(firstValue(payload, ["item.type", "delta.type", "content.0.type", "message.type"])).trim().toLowerCase(),
    toText(firstValue(payload, ["output.0.type", "response.output.0.type"])).trim().toLowerCase()
  ]
    .filter(Boolean)
    .join(" ");

  const joined = `${normalizedType} ${modelTypeHints}`.trim();
  if (!joined) {
    return false;
  }

  return (
    joined.includes("reasoning") ||
    joined.includes("analysis") ||
    joined.includes("tool_call") ||
    joined.includes("function_call") ||
    joined.includes("tool_result") ||
    joined.includes("function_call_output")
  );
}

function extractUserFacingChunk(payload: unknown): string {
  return toText(
    firstValue(payload, [
      "delta.output_text",
      "delta.text",
      "delta.content",
      "text",
      "token",
      "content",
      "message",
      "output_text",
      "choices.0.delta.content",
      "choices.0.text",
      "choices.0.message.content"
    ]) ?? (typeof payload === "string" ? payload : "")
  );
}

function parseSseChunk(data: string, eventType: string, sawDelta: boolean): ParsedStreamChunk {
  const trimmed = data.trim();
  if (!trimmed) {
    return {
      text: "",
      sawDelta,
      done: false
    };
  }

  if (trimmed === "[DONE]") {
    return {
      text: "",
      sawDelta,
      done: true
    };
  }

  let payload: unknown = trimmed;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    // Keep raw text fallback.
  }

  const normalizedType = normalizeStreamEventType(eventType, payload);
  const responseId = extractResponseId(payload);
  const sessionId = extractSessionId(payload);

  // Prevent internal channels (reasoning/analysis/tool plumbing) from rendering in chat UI.
  if (isInternalStreamPayload(normalizedType, payload)) {
    return {
      text: "",
      sawDelta,
      done: false,
      responseId,
      sessionId
    };
  }

  // The Responses API emits many structured events (output_item/content_part/etc.).
  // Only pass through explicit user-facing text streams.
  if (
    normalizedType.startsWith("response.") &&
    !normalizedType.includes("response.output_text") &&
    !normalizedType.includes("response.text") &&
    !normalizedType.includes("response.created")
  ) {
    return {
      text: "",
      sawDelta,
      done: false,
      responseId,
      sessionId
    };
  }

  if (normalizedType.includes("response.created")) {
    return {
      text: "",
      sawDelta,
      done: false,
      responseId,
      sessionId
    };
  }

  if (normalizedType.includes("response.output_text.delta") || normalizedType.includes("response.text.delta")) {
    const chunk = extractUserFacingChunk(payload);
    return {
      text: chunk,
      sawDelta: sawDelta || Boolean(chunk),
      done: false,
      responseId,
      sessionId
    };
  }

  if (normalizedType.includes("response.output_text.done") || normalizedType.includes("response.text.done")) {
    if (sawDelta) {
      return {
        text: "",
        sawDelta,
        done: false,
        responseId,
        sessionId
      };
    }

    const chunk = toText(firstValue(payload, ["text", "content", "output_text"]) ?? "");
    return {
      text: chunk,
      sawDelta,
      done: false,
      responseId,
      sessionId
    };
  }

  const chunk = extractUserFacingChunk(payload);
  if (!chunk) {
    return {
      text: "",
      sawDelta,
      done: false,
      responseId,
      sessionId
    };
  }

  return {
    text: chunk,
    sawDelta: sawDelta || normalizedType.includes(".delta") || normalizedType.includes("delta"),
    done: false,
    responseId,
    sessionId
  };
}

async function readEventStream(response: Response, onChunk?: (chunk: string) => void): Promise<StreamReadResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      text: "",
      chunkCount: 0,
      averageChunkLength: 0
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let collected = "";
  let sawDelta = false;
  let done = false;
  let responseId: string | undefined;
  let sessionId: string | undefined;
  let chunkCount = 0;
  let totalChunkLength = 0;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n|\r\n\r\n/);
    buffer = events.pop() ?? "";

    for (const eventBlock of events) {
      let eventType = "";
      const dataLines: string[] = [];

      for (const line of eventBlock.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
          continue;
        }

        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) {
        continue;
      }

      const parsed = parseSseChunk(dataLines.join("\n"), eventType, sawDelta);
      sawDelta = parsed.sawDelta;
      done = parsed.done;
      responseId = parsed.responseId ?? responseId;
      sessionId = parsed.sessionId ?? sessionId;

      if (!parsed.text) {
        if (done) {
          break;
        }
        continue;
      }

      collected += parsed.text;
      onChunk?.(parsed.text);
      chunkCount += 1;
      totalChunkLength += parsed.text.length;

      if (done) {
        break;
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const parsed = parseSseChunk(tail.slice(5).trim(), "", sawDelta);
    responseId = parsed.responseId ?? responseId;
    sessionId = parsed.sessionId ?? sessionId;

    if (parsed.text) {
      collected += parsed.text;
      onChunk?.(parsed.text);
      chunkCount += 1;
      totalChunkLength += parsed.text.length;
    }
  }

  return {
    text: collected,
    responseId,
    sessionId,
    chunkCount,
    averageChunkLength: chunkCount > 0 ? totalChunkLength / chunkCount : 0
  };
}

function parseNdjsonLine(line: string): { text: string; responseId?: string; sessionId?: string } {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      text: ""
    };
  }

  try {
    const json = JSON.parse(trimmed);
    const normalizedType = normalizeStreamEventType("", json);

    if (isInternalStreamPayload(normalizedType, json)) {
      return {
        text: "",
        responseId: extractResponseId(json),
        sessionId: extractSessionId(json)
      };
    }

    if (
      normalizedType.startsWith("response.") &&
      !normalizedType.includes("response.output_text") &&
      !normalizedType.includes("response.text")
    ) {
      return {
        text: "",
        responseId: extractResponseId(json),
        sessionId: extractSessionId(json)
      };
    }

    return {
      text: extractUserFacingChunk(json),
      responseId: extractResponseId(json),
      sessionId: extractSessionId(json)
    };
  } catch {
    return {
      text: trimmed
    };
  }
}

async function readNdjson(response: Response, onChunk?: (chunk: string) => void): Promise<StreamReadResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      text: "",
      chunkCount: 0,
      averageChunkLength: 0
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let collected = "";
  let responseId: string | undefined;
  let sessionId: string | undefined;
  let chunkCount = 0;
  let totalChunkLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const parsed = parseNdjsonLine(line);
      responseId = parsed.responseId ?? responseId;
      sessionId = parsed.sessionId ?? sessionId;

      if (!parsed.text) {
        continue;
      }

      collected += parsed.text;
      onChunk?.(parsed.text);
      chunkCount += 1;
      totalChunkLength += parsed.text.length;
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const parsed = parseNdjsonLine(tail);
    responseId = parsed.responseId ?? responseId;
    sessionId = parsed.sessionId ?? sessionId;

    if (parsed.text) {
      collected += parsed.text;
      onChunk?.(parsed.text);
      chunkCount += 1;
      totalChunkLength += parsed.text.length;
    }
  }

  return {
    text: collected,
    responseId,
    sessionId,
    chunkCount,
    averageChunkLength: chunkCount > 0 ? totalChunkLength / chunkCount : 0
  };
}

export function getClientConfig(): AuroraClientConfig {
  const pollMs = toNumber(process.env.NEXT_PUBLIC_AURORA_STATE_POLL_MS, 2500);
  const historyLimit = toNumber(process.env.NEXT_PUBLIC_CHAT_HISTORY_LIMIT, 12);
  const ttsEnabled = toBoolean(process.env.NEXT_PUBLIC_AURORA_TTS_ENABLED, true);

  return {
    sendProxyPath: normalizeProxyPathOrUrl(
      envOrDefault(process.env.NEXT_PUBLIC_AURORA_SEND_PROXY_PATH, "/api/openclaw/send")
    ),
    replyTextPath: envOrDefault(process.env.NEXT_PUBLIC_AURORA_REPLY_TEXT_PATH, "items.0.content.0.text"),
    sharedSessionId: envOrDefault(process.env.NEXT_PUBLIC_AURORA_SHARED_SESSION_ID, "agent:main:main"),
    statePath: normalizePath(envOrDefault(process.env.NEXT_PUBLIC_AURORA_STATE_PATH, "/api/aurora/state")),
    embodimentPath: normalizePath(
      envOrDefault(process.env.NEXT_PUBLIC_AURORA_EMBODIMENT_PATH, "/api/aurora/embodiment")
    ),
    visionPath: normalizePath(envOrDefault(process.env.NEXT_PUBLIC_AURORA_VISION_PATH, "/api/aurora/vision")),
    pollMs: clamp(Math.round(pollMs), 1200, 10000),
    historyLimit: clamp(Math.round(historyLimit), 4, 100),
    ttsEnabled,
    ttsStreamPath: normalizePath(envOrDefault(process.env.NEXT_PUBLIC_AURORA_TTS_STREAM_PATH, "/api/aurora/tts/stream")),
    ttsVoice: envOrDefault(process.env.NEXT_PUBLIC_AURORA_TTS_VOICE, "alloy")
  };
}

function normalizeEmbodimentState(payload: unknown): AuroraEmbodimentState {
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const cognitionLike =
    getPathValue(source, "cognition") ??
    (getPathValue(source, "extensions.embodiment") !== undefined ? source : undefined);

  if (cognitionLike !== undefined) {
    return normalizeCognitiveSnapshot(cognitionLike).extensions?.embodiment ?? DEFAULT_AURORA_EMBODIMENT_STATE;
  }

  return normalizeCognitiveSnapshot({
    extensions: {
      embodiment: getPathValue(source, "embodiment") ?? source
    }
  }).extensions?.embodiment ?? DEFAULT_AURORA_EMBODIMENT_STATE;
}

function normalizeChatHistoryMessages(payload: unknown): ChatMessage[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const normalized: ChatMessage[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const role = typeof record.role === "string" ? record.role.trim().toLowerCase() : "";
    const text = toText(record.text).trim();
    if ((role !== "user" && role !== "aurora") || !text) {
      continue;
    }

    normalized.push({
      id: toText(record.id).trim() || `${role}-${normalized.length + 1}`,
      role: role === "aurora" ? "aurora" : "user",
      text,
      createdAt: toText(record.createdAt).trim() || new Date(0).toISOString(),
      status: "done"
    });
  }

  return normalized;
}

export async function sendMessage(text: string, options: SendMessageOptions = {}): Promise<SendMessageResult> {
  const baseConfig = getClientConfig();
  const config = {
    ...baseConfig,
    sendProxyPath: options.sendProxyPath?.trim()
      ? normalizeProxyPathOrUrl(options.sendProxyPath.trim())
      : baseConfig.sendProxyPath
  };
  const sessionId = options.sessionId?.trim() || config.sharedSessionId;
  let activeSessionId = sessionId;
  let activePreviousResponseId = options.previousResponseId?.trim() || undefined;
  const partnerId = options.partnerId?.trim() || undefined;
  const speakerName = options.speakerName?.trim() || undefined;
  const startedAt = performance.now();

  const buildPayload = (targetSessionId: string, linkedResponseId: string | undefined): SendRequestPayload => {
    const payload: SendRequestPayload = {
      text,
      sessionId: targetSessionId,
      previousResponseId: linkedResponseId,
      partnerId,
      speakerName
    };

    if (isAgentSemanticSessionKey(targetSessionId)) {
      payload.sessionKey = targetSessionId;
    }

    return payload;
  };

  let response = await postSendRequest(config, buildPayload(activeSessionId, activePreviousResponseId), options.signal);
  let complianceId = response.headers.get("x-aurora-compliance-id")?.trim() || undefined;
  let gate = response.headers.get("x-aurora-gate")?.trim() || undefined;
  let resetPreviousResponseId = false;
  let attemptedSessionRecovery = false;

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");

    if (shouldResetPreviousResponseId(errorBody, activePreviousResponseId)) {
      resetPreviousResponseId = true;
      activePreviousResponseId = undefined;
      response = await postSendRequest(config, buildPayload(activeSessionId, activePreviousResponseId), options.signal);
      complianceId = response.headers.get("x-aurora-compliance-id")?.trim() || complianceId;
      gate = response.headers.get("x-aurora-gate")?.trim() || gate;
    }

    if (!response.ok) {
      const retryErrorBody = await response.text().catch(() => "");

      if (isMissingToolCallOutputError(retryErrorBody) && !attemptedSessionRecovery) {
        attemptedSessionRecovery = true;
        resetPreviousResponseId = true;
        activePreviousResponseId = undefined;
        activeSessionId = makeRecoverySessionId(activeSessionId);
        response = await postSendRequest(config, buildPayload(activeSessionId, activePreviousResponseId), options.signal);
        complianceId = response.headers.get("x-aurora-compliance-id")?.trim() || complianceId;
        gate = response.headers.get("x-aurora-gate")?.trim() || gate;
      }
    }

    if (!response.ok) {
      const finalErrorBody = await response.text().catch(() => "");
      throw new SendMessageError(`Send request failed (${response.status}): ${finalErrorBody}`, {
        status: response.status,
        complianceId,
        gate,
        resetPreviousResponseId
      });
    }
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("text/event-stream")) {
    const streamed = await readEventStream(response, options.onChunk);
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

    return {
      text: streamed.text,
      streamed: true,
      responseId: streamed.responseId,
      resetPreviousResponseId,
      sessionId: streamed.sessionId ?? activeSessionId,
      complianceId,
      latencyMs,
      introspection: {
        chunkCount: streamed.chunkCount,
        averageChunkLength: streamed.averageChunkLength,
        lexicalDiversity: lexicalDiversity(streamed.text)
      }
    };
  }

  if (contentType.includes("x-ndjson") || contentType.includes("application/ndjson")) {
    const streamed = await readNdjson(response, options.onChunk);
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

    return {
      text: streamed.text,
      streamed: true,
      responseId: streamed.responseId,
      resetPreviousResponseId,
      sessionId: streamed.sessionId ?? activeSessionId,
      complianceId,
      latencyMs,
      introspection: {
        chunkCount: streamed.chunkCount,
        averageChunkLength: streamed.averageChunkLength,
        lexicalDiversity: lexicalDiversity(streamed.text)
      }
    };
  }

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as unknown;
    const replyText = extractReplyText(payload, config.replyTextPath);
    if (replyText) {
      options.onChunk?.(replyText);
    }

    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    return {
      text: replyText,
      streamed: false,
      responseId: extractResponseId(payload),
      resetPreviousResponseId,
      sessionId: extractSessionId(payload) ?? activeSessionId,
      complianceId,
      latencyMs,
      introspection: {
        chunkCount: replyText ? 1 : 0,
        averageChunkLength: replyText.length,
        lexicalDiversity: lexicalDiversity(replyText)
      },
      raw: payload
    };
  }

  const plainText = await response.text();
  if (plainText) {
    options.onChunk?.(plainText);
  }

  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    text: plainText,
    streamed: false,
    resetPreviousResponseId,
    sessionId: activeSessionId,
    complianceId,
    latencyMs,
    introspection: {
      chunkCount: plainText ? 1 : 0,
      averageChunkLength: plainText.length,
      lexicalDiversity: lexicalDiversity(plainText)
    },
    raw: plainText
  };
}

export async function streamVoiceSynthesis(
  text: string,
  options: VoiceStreamOptions = {}
): Promise<VoiceStreamSummary> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      voice: "alloy",
      style: "steady",
      chunks: 0,
      latencyMs: 0
    };
  }

  const config = getClientConfig();
  if (!config.ttsEnabled) {
    return {
      voice: config.ttsVoice || "alloy",
      style: "steady",
      chunks: 0,
      latencyMs: 0
    };
  }

  const startedAt = performance.now();
  const response = await fetch(config.ttsStreamPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: trimmed,
      sessionId: options.sessionId?.trim() || "",
      responseId: options.responseId?.trim() || "",
      complianceId: options.complianceId?.trim() || "",
      cognition: options.cognition ?? undefined,
      voice: options.voice?.trim() || config.ttsVoice || "alloy"
    }),
    signal: options.signal,
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Voice stream failed (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      voice: config.ttsVoice || "alloy",
      style: "steady",
      chunks: 0,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt))
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;
  let voice = config.ttsVoice || "alloy";
  let style = "steady";
  let latencyMs = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }
      let parsed: VoiceStreamEvent | null = null;
      try {
        parsed = JSON.parse(trimmedLine) as VoiceStreamEvent;
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== "object") {
        continue;
      }
      if (parsed.type === "start") {
        voice = typeof parsed.voice === "string" && parsed.voice.trim() ? parsed.voice.trim() : voice;
        style = typeof parsed.style === "string" && parsed.style.trim() ? parsed.style.trim() : style;
      }
      if (parsed.type === "chunk") {
        chunkCount += 1;
      }
      if (parsed.type === "done") {
        latencyMs =
          typeof parsed.latencyMs === "number" && Number.isFinite(parsed.latencyMs)
            ? Math.max(0, Math.round(parsed.latencyMs))
            : latencyMs;
      }
      options.onEvent?.(parsed);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    try {
      const parsed = JSON.parse(tail) as VoiceStreamEvent;
      if (parsed.type === "chunk") {
        chunkCount += 1;
      }
      if (parsed.type === "done") {
        latencyMs =
          typeof parsed.latencyMs === "number" && Number.isFinite(parsed.latencyMs)
            ? Math.max(0, Math.round(parsed.latencyMs))
            : latencyMs;
      }
      if (parsed.type === "start") {
        voice = typeof parsed.voice === "string" && parsed.voice.trim() ? parsed.voice.trim() : voice;
        style = typeof parsed.style === "string" && parsed.style.trim() ? parsed.style.trim() : style;
      }
      options.onEvent?.(parsed);
    } catch {
      // ignore malformed tail
    }
  }

  if (!latencyMs) {
    latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
  }

  return {
    voice,
    style,
    chunks: chunkCount,
    latencyMs
  };
}

export async function getAuroraState(): Promise<AuroraState> {
  const config = getClientConfig();

  const response = await fetchWithRetry(config.statePath, {
    method: "GET",
    cache: "no-store"
  }, {
    attempts: 3,
    retryDelayMs: 250
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`State request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as unknown;
  return normalizeAuroraState(payload);
}

export async function getAuroraConversationHistory(sessionId: string): Promise<ChatMessage[]> {
  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId) {
    return [];
  }

  const params = new URLSearchParams({
    sessionId: trimmedSessionId
  });

  if (isAgentSemanticSessionKey(trimmedSessionId)) {
    params.set("sessionKey", trimmedSessionId);
  }

  const response = await fetchWithRetry(
    `/api/openclaw/history?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store"
    },
    {
      attempts: 2,
      retryDelayMs: 200
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`History request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as unknown;
  return normalizeChatHistoryMessages(getPathValue(payload, "messages"));
}

export async function acknowledgeMorningGreeting(
  messageId: string,
  options: { sessionId?: string | null } = {}
): Promise<CognitiveSnapshot | null> {
  const trimmedMessageId = messageId.trim();
  if (!trimmedMessageId) {
    return null;
  }

  const response = await fetchWithRetry(
    "/api/aurora/morning-greeting/ack",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messageId: trimmedMessageId,
        sessionId: options.sessionId?.trim() || ""
      }),
      cache: "no-store"
    },
    {
      attempts: 2,
      retryDelayMs: 200
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Morning greeting acknowledge failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as unknown;
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const cognition = getPathValue(source, "cognition");
  return cognition !== undefined ? normalizeCognitiveSnapshot(cognition) : null;
}

export async function persistAuroraEmbodiment(
  embodiment: AuroraEmbodimentState,
  options: { keepalive?: boolean } = {}
): Promise<{ embodiment: AuroraEmbodimentState; cognition: CognitiveSnapshot | null }> {
  const config = getClientConfig();
  const response = await fetchWithRetry(config.embodimentPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: options.keepalive ?? false,
    body: JSON.stringify({
      embodiment
    })
  }, {
    attempts: options.keepalive ? 1 : 2,
    retryDelayMs: 250
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Embodiment persistence failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as unknown;
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const cognition = getPathValue(source, "cognition");

  return {
    embodiment: normalizeEmbodimentState(payload),
    cognition: cognition !== undefined ? normalizeCognitiveSnapshot(cognition) : null
  };
}

export async function persistAuroraVisionObservation(
  observation: AuroraVisionObservationInput,
  options: { keepalive?: boolean } = {}
): Promise<CognitiveSnapshot | null> {
  const config = getClientConfig();
  const response = await fetchWithRetry(config.visionPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: options.keepalive ?? false,
    body: JSON.stringify({
      observation
    })
  }, {
    attempts: options.keepalive ? 1 : 2,
    retryDelayMs: 250
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Vision persistence failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as unknown;
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const cognition = getPathValue(source, "cognition");
  return cognition !== undefined ? normalizeCognitiveSnapshot(cognition) : null;
}

export function queueAuroraEmbodimentKeepalive(embodiment: AuroraEmbodimentState): boolean {
  const config = getClientConfig();
  const body = JSON.stringify({ embodiment });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const payload = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(config.embodimentPath, payload)) {
        return true;
      }
    } catch {
      // Fall through to fetch keepalive.
    }
  }

  if (typeof fetch === "function") {
    void fetch(config.embodimentPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      keepalive: true,
      body
    }).catch(() => {
      // Best-effort final flush.
    });
    return true;
  }

  return false;
}

export function queueAuroraVisionKeepalive(observation: AuroraVisionObservationInput): boolean {
  const config = getClientConfig();
  const body = JSON.stringify({ observation });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const payload = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(config.visionPath, payload)) {
        return true;
      }
    } catch {
      // Fall through to fetch keepalive.
    }
  }

  if (typeof fetch === "function") {
    void fetch(config.visionPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      keepalive: true,
      body
    }).catch(() => {
      // Best-effort final flush.
    });
    return true;
  }

  return false;
}
