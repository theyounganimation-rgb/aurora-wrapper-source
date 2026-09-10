"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE,
  DEFAULT_AURORA_EMBODIMENT_STATE,
  EMBODIMENT_INTENT_NAMES,
  type AuroraEmbodimentObservationInput,
  type AuroraEmbodimentControlState,
  type AuroraEmbodimentPattern,
  DEFAULT_AURORA_STATE,
  DEFAULT_AURORA_UI_STATE,
  type AuroraEmbodimentState,
  type AuroraState,
  type AuroraUiState,
  type ChatMessage,
  type EmbodimentIntentName,
  type EmbodimentVector3
} from "@/lib/types";
import { AuroraContextBridgeProvider, type AuroraContextValue } from "@/components/AuroraContext";
import {
  SendMessageError,
  getAuroraConversationHistory,
  getAuroraState,
  getClientConfig,
  persistAuroraEmbodiment,
  queueAuroraEmbodimentKeepalive,
  sendMessage,
  streamVoiceSynthesis
} from "@/lib/auroraClient";
import {
  advanceEmbodimentState,
  applyEmbodimentObservation,
  createEmbodimentPatternFromState,
  createEmbodimentState
} from "@/lib/embodiment/controller";
import { applyConversationEmbodimentDirectiveFromText } from "@/lib/embodiment/directives";

interface AuroraEmbodimentControlContextValue {
  controls: AuroraEmbodimentControlState;
  setPinnedIntent: (intent: AuroraEmbodimentControlState["pinnedIntent"]) => void;
  setExpressivityBias: (value: number) => void;
  setStillnessBias: (value: number) => void;
  selectPattern: (patternId: string | null) => void;
  saveCurrentPattern: () => void;
  deletePattern: (patternId: string) => void;
  resetControls: () => void;
  reportAvatarObservation: (observation: AuroraEmbodimentObservationInput) => void;
}

const HEARTBEAT_RECENT_MS = 2 * 60 * 1000;
const CONVERSATION_WINDOW_MS = 15 * 60 * 1000;
const CONVERSATION_COOLDOWN_MS = 90 * 1000;
const EMBODIMENT_LOOP_MS = 100;
const EMBODIMENT_PERSIST_INTERVAL_MS = 1600;
const EMBODIMENT_REMOTE_APPLY_DRIFT_MS = 1200;
const EMBODIMENT_CONTROL_STORAGE_KEY = "aurora.embodiment.controls";
const MAX_EMBODIMENT_PATTERNS = 8;
const SESSION_ID_STORAGE_KEY = "aurora.session_id";
const PREVIOUS_RESPONSE_ID_STORAGE_KEY = "aurora.previous_response_id";
const OWNER_DASHBOARD_SESSION_ID = "agent:main:main";
const OWNER_APP_OPENRESPONSES_SESSION_ID = `agent:main:openresponses-user:${OWNER_DASHBOARD_SESSION_ID}`;
const OWNER_UNIFIED_CONTINUITY_SESSION_ID = "agent:main:owner:continuity";
const OWNER_DIRECT_CONTINUITY_SESSION_IDS = new Set(["agent:main:telegram:direct:0000000000"]);
const REMOTE_HISTORY_TAIL_GRACE_MS = 2 * 60 * 1000;

const AuroraEmbodimentContext = createContext<AuroraEmbodimentState | null>(null);
const AuroraEmbodimentControlContext = createContext<AuroraEmbodimentControlContextValue | null>(null);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value: unknown, fallback: number): number {
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

function isEmbodimentIntentName(value: string): value is EmbodimentIntentName {
  return (EMBODIMENT_INTENT_NAMES as readonly string[]).includes(value);
}

function toVector3(value: unknown, fallback: EmbodimentVector3 = { x: 0, y: 0, z: 0 }): EmbodimentVector3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback };
  }

  const vector = value as Record<string, unknown>;
  return {
    x: toFiniteNumber(vector.x, fallback.x),
    y: toFiniteNumber(vector.y, fallback.y),
    z: toFiniteNumber(vector.z, fallback.z)
  };
}

function normalizeEmbodimentPattern(value: unknown, index: number): AuroraEmbodimentPattern | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const intentText = typeof record.baseIntent === "string" ? record.baseIntent : "settle";
  const boneOffsets: AuroraEmbodimentPattern["boneOffsets"] = {};
  const rawBoneOffsets = record.boneOffsets;
  if (rawBoneOffsets && typeof rawBoneOffsets === "object" && !Array.isArray(rawBoneOffsets)) {
    for (const [boneName, offset] of Object.entries(rawBoneOffsets)) {
      boneOffsets[boneName as keyof AuroraEmbodimentPattern["boneOffsets"]] = toVector3(offset);
    }
  }

  const expressionOffsets: AuroraEmbodimentPattern["expressionOffsets"] = {};
  const rawExpressionOffsets = record.expressionOffsets;
  if (rawExpressionOffsets && typeof rawExpressionOffsets === "object" && !Array.isArray(rawExpressionOffsets)) {
    for (const [key, offset] of Object.entries(rawExpressionOffsets)) {
      const numeric = toFiniteNumber(offset, 0);
      if (Number.isFinite(numeric)) {
        expressionOffsets[key as keyof AuroraEmbodimentPattern["expressionOffsets"]] = numeric;
      }
    }
  }

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : `pattern-${index + 1}`,
    name: typeof record.name === "string" && record.name.trim() ? record.name : `Pattern ${index + 1}`,
    createdAt:
      typeof record.createdAt === "string" && record.createdAt.trim() ? record.createdAt : new Date(0).toISOString(),
    baseIntent: isEmbodimentIntentName(intentText) ? intentText : "settle",
    expressivityBias: clamp(toFiniteNumber(record.expressivityBias, 0.5), 0, 1),
    stillnessBias: clamp(toFiniteNumber(record.stillnessBias, 0.5), 0, 1),
    rootPositionOffset: toVector3(record.rootPositionOffset),
    rootRotationOffset: toVector3(record.rootRotationOffset),
    lookTargetOffset: toVector3(record.lookTargetOffset),
    boneOffsets,
    expressionOffsets
  };
}

function normalizeEmbodimentControls(value: unknown): AuroraEmbodimentControlState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE;
  }

  const record = value as Record<string, unknown>;
  const rawPinnedIntent = typeof record.pinnedIntent === "string" ? record.pinnedIntent : "auto";
  const rawPatterns = Array.isArray(record.savedPatterns) ? record.savedPatterns : [];
  const savedPatterns = rawPatterns
    .map((pattern, index) => normalizeEmbodimentPattern(pattern, index))
    .filter((pattern): pattern is AuroraEmbodimentPattern => Boolean(pattern))
    .slice(0, MAX_EMBODIMENT_PATTERNS);
  const selectedPatternId =
    typeof record.selectedPatternId === "string" && savedPatterns.some((pattern) => pattern.id === record.selectedPatternId)
      ? record.selectedPatternId
      : null;

  return {
    pinnedIntent: rawPinnedIntent === "auto" || isEmbodimentIntentName(rawPinnedIntent) ? rawPinnedIntent : "auto",
    expressivityBias: clamp(toFiniteNumber(record.expressivityBias, 0.5), 0, 1),
    stillnessBias: clamp(toFiniteNumber(record.stillnessBias, 0.5), 0, 1),
    selectedPatternId,
    savedPatterns
  };
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeMessage(role: ChatMessage["role"], text: string, status: ChatMessage["status"]): ChatMessage {
  return {
    id: makeId(),
    role,
    text,
    status,
    createdAt: new Date().toISOString()
  };
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
}

function historiesMatch(current: ChatMessage[], next: ChatMessage[]): boolean {
  if (current.length !== next.length) {
    return false;
  }

  for (let index = 0; index < current.length; index += 1) {
    const currentMessage = current[index];
    const nextMessage = next[index];
    if (
      currentMessage.id !== nextMessage.id ||
      currentMessage.role !== nextMessage.role ||
      currentMessage.text !== nextMessage.text ||
      currentMessage.createdAt !== nextMessage.createdAt ||
      currentMessage.status !== nextMessage.status
    ) {
      return false;
    }
  }

  return true;
}

function normalizeComparableMessageText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function messagesSemanticallyMatch(current: ChatMessage, next: ChatMessage): boolean {
  if (current.role !== next.role) {
    return false;
  }

  const currentText = normalizeComparableMessageText(current.text);
  const nextText = normalizeComparableMessageText(next.text);
  if (!currentText || currentText !== nextText) {
    return false;
  }

  const currentTs = Date.parse(current.createdAt);
  const nextTs = Date.parse(next.createdAt);
  if (!Number.isFinite(currentTs) || !Number.isFinite(nextTs)) {
    return true;
  }

  return Math.abs(currentTs - nextTs) <= REMOTE_HISTORY_TAIL_GRACE_MS;
}

function shouldPreserveRecentVisibleTail(current: ChatMessage[], next: ChatMessage[]): boolean {
  const recencyFloor = Date.now() - REMOTE_HISTORY_TAIL_GRACE_MS;
  const recentVisibleTail = current
    .filter((message) => {
      if (message.status !== "done" || !normalizeComparableMessageText(message.text)) {
        return false;
      }

      const createdAt = Date.parse(message.createdAt);
      return Number.isFinite(createdAt) && createdAt >= recencyFloor;
    })
    .slice(-2);

  if (recentVisibleTail.length === 0) {
    return false;
  }

  return recentVisibleTail.some(
    (message) => !next.some((candidate) => messagesSemanticallyMatch(message, candidate))
  );
}

function mergeRemoteEmbodimentState(
  current: AuroraEmbodimentState,
  remote: AuroraEmbodimentState,
  options: {
    preferRemoteWholeState: boolean;
    preferRemoteDirectiveState: boolean;
    preferRemotePerceptionState: boolean;
  }
): AuroraEmbodimentState {
  if (options.preferRemoteWholeState) {
    const currentObservedAt = parseTimestamp(current.perception.lastObservedAt);
    const remoteObservedAt = parseTimestamp(remote.perception.lastObservedAt);
    if (Number.isFinite(currentObservedAt) && (!Number.isFinite(remoteObservedAt) || currentObservedAt > remoteObservedAt)) {
      return createEmbodimentState({
        ...remote,
        perception: current.perception
      });
    }
    return remote;
  }

  return createEmbodimentState({
    ...current,
    updatedAt: remote.updatedAt,
    activeMotorIntent: options.preferRemoteDirectiveState ? remote.activeMotorIntent : current.activeMotorIntent,
    activeMotorIntents: options.preferRemoteDirectiveState ? remote.activeMotorIntents : current.activeMotorIntents,
    volition: options.preferRemoteDirectiveState ? remote.volition : current.volition,
    directives: options.preferRemoteDirectiveState ? remote.directives : current.directives,
    perception: options.preferRemotePerceptionState ? remote.perception : current.perception
  });
}

function serializeEmbodimentState(value: AuroraEmbodimentState): string {
  return JSON.stringify(value);
}

function withEmbodimentState(auroraState: AuroraState, embodiment: AuroraEmbodimentState): AuroraState {
  return {
    ...auroraState,
    cognition: {
      ...auroraState.cognition,
      extensions: {
        ...(auroraState.cognition.extensions ?? DEFAULT_AURORA_STATE.cognition.extensions ?? {}),
        embodiment
      }
    }
  };
}

function canonicalContinuitySessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!normalized) {
    return "";
  }

  const lower = normalized.toLowerCase();
  if (
    lower === OWNER_DASHBOARD_SESSION_ID ||
    lower === OWNER_APP_OPENRESPONSES_SESSION_ID ||
    OWNER_DIRECT_CONTINUITY_SESSION_IDS.has(lower)
  ) {
    return OWNER_UNIFIED_CONTINUITY_SESSION_ID;
  }

  return normalized;
}

function isOwnerUnifiedContinuitySessionId(sessionId: string): boolean {
  return canonicalContinuitySessionId(sessionId) === OWNER_UNIFIED_CONTINUITY_SESSION_ID;
}

function deriveCuriosityLevel(state: AuroraState): number {
  let score = 0.24;

  const curious = state.lastHeartbeat.whatImCuriousAbout.trim();
  const learned = state.lastHeartbeat.whatILearned.trim();
  const did = state.lastHeartbeat.whatIDid.trim();

  if (curious.length > 0) {
    score += 0.38;
  }

  if (learned.length > 0) {
    score += 0.12;
  }

  if (did.length > 0 && did !== "No heartbeat yet.") {
    score += 0.08;
  }

  score += Math.min(0.18, state.lastHeartbeat.memoryUpdates.length * 0.04);
  score += Math.min(0.14, state.cognition.reflection.recentThoughts.length * 0.035);
  score += Math.min(0.08, state.cognition.attention.queueDepth * 0.01);
  score += clamp(Math.abs(state.cognition.emotion.valence) * 0.06, 0, 0.06);

  return clamp(score, 0.08, 0.95);
}

function deriveUiState(
  auroraState: AuroraState,
  isThinking: boolean,
  lastUserMessageAt: number | null,
  conversationActiveUntil: number
): AuroraUiState {
  const now = Date.now();
  const heartbeatTime = auroraState.lastHeartbeat.timestamp ? Date.parse(auroraState.lastHeartbeat.timestamp) : Number.NaN;

  const heartbeatRecent = Number.isFinite(heartbeatTime) ? now - heartbeatTime < HEARTBEAT_RECENT_MS : false;
  const conversationRecentByMessage =
    lastUserMessageAt !== null ? now - lastUserMessageAt < CONVERSATION_WINDOW_MS : false;
  const conversationRecentByCooldown = now < conversationActiveUntil;

  if (isThinking) {
    return {
      mode: "thinking",
      lastHeartbeat: auroraState.lastHeartbeat.timestamp,
      curiosityLevel: deriveCuriosityLevel(auroraState),
      activity: 0.96
    };
  }

  if (conversationRecentByMessage || conversationRecentByCooldown) {
    const recencyFactor =
      lastUserMessageAt !== null
        ? clamp(1 - (now - lastUserMessageAt) / CONVERSATION_WINDOW_MS, 0, 1)
        : 0.35;

    return {
      mode: "in_conversation",
      lastHeartbeat: auroraState.lastHeartbeat.timestamp,
      curiosityLevel: deriveCuriosityLevel(auroraState),
      activity: clamp(
        0.5 +
          recencyFactor * 0.35 +
          auroraState.cognition.attention.processedLastMinute * 0.015 +
          auroraState.cognition.emotion.arousal * 0.08,
        0.35,
        0.93
      )
    };
  }

  if (heartbeatRecent) {
    const recency = clamp(1 - (now - heartbeatTime) / HEARTBEAT_RECENT_MS, 0, 1);

    return {
      mode: "heartbeat_recent",
      lastHeartbeat: auroraState.lastHeartbeat.timestamp,
      curiosityLevel: deriveCuriosityLevel(auroraState),
      activity: clamp(
        0.36 + recency * 0.34 + auroraState.cognition.attention.queueDepth * 0.014,
        0.28,
        0.86
      )
    };
  }

  return {
    mode: "idle",
    lastHeartbeat: auroraState.lastHeartbeat.timestamp,
    curiosityLevel: deriveCuriosityLevel(auroraState),
    activity: clamp(
      0.14 + auroraState.cognition.reflection.recentThoughts.length * 0.03 + auroraState.cognition.emotion.arousal * 0.08,
      0.12,
      0.48
    )
  };
}

export function AuroraProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => getClientConfig(), []);
  const [auroraState, setAuroraState] = useState<AuroraState>(DEFAULT_AURORA_STATE);
  const [embodimentState, setEmbodimentState] = useState<AuroraEmbodimentState>(() =>
    createEmbodimentState(DEFAULT_AURORA_EMBODIMENT_STATE)
  );
  const [embodimentControls, setEmbodimentControls] = useState<AuroraEmbodimentControlState>(
    DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [activityPulse, setActivityPulse] = useState(0);
  const [lastUserMessageAt, setLastUserMessageAt] = useState<number | null>(null);
  const [conversationActiveUntil, setConversationActiveUntil] = useState(0);
  const [sharedSessionId, setSharedSessionId] = useState(() => canonicalContinuitySessionId(config.sharedSessionId));
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const audioQueueRef = useRef<Array<{ audioBase64: string; playbackRate: number; postPauseMs: number }>>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingAudioRef = useRef(false);
  const isSendingRef = useRef(isSending);
  const auroraStateRef = useRef(auroraState);
  const embodimentStateRef = useRef(embodimentState);
  const embodimentControlsRef = useRef(embodimentControls);
  const activityPulseRef = useRef(activityPulse);
  const embodimentHydratedRef = useRef(false);
  const embodimentDirtyRef = useRef(false);
  const embodimentPersistInFlightRef = useRef<Promise<void> | null>(null);
  const lastPersistedEmbodimentDigestRef = useRef("");
  const hydratedHistorySessionRef = useRef<string | null>(null);

  const stopSpeechPlayback = useCallback(() => {
    ttsAbortControllerRef.current?.abort();
    ttsAbortControllerRef.current = null;
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    const active = currentAudioRef.current;
    if (active) {
      active.pause();
      active.src = "";
      currentAudioRef.current = null;
    }
  }, []);

  const playNextAudioChunk = useCallback(function playNextAudioChunk() {
    if (isPlayingAudioRef.current) {
      return;
    }

    const next = audioQueueRef.current.shift();
    if (!next) {
      return;
    }

    const audio = new Audio(`data:audio/mpeg;base64,${next.audioBase64}`);
    currentAudioRef.current = audio;
    isPlayingAudioRef.current = true;
    audio.playbackRate = clamp(next.playbackRate, 0.8, 1.2);

    const finalize = () => {
      if (currentAudioRef.current === audio) {
        currentAudioRef.current = null;
      }
      window.setTimeout(() => {
        isPlayingAudioRef.current = false;
        playNextAudioChunk();
      }, Math.max(0, Math.round(next.postPauseMs)));
    };

    audio.onended = finalize;
    audio.onerror = finalize;
    void audio.play().catch(() => {
      finalize();
    });
  }, []);

  const enqueueSpeechChunk = useCallback(
    (chunk: { audioBase64: string; playbackRate?: number; postPauseMs?: number }) => {
      if (!chunk.audioBase64) {
        return;
      }
      audioQueueRef.current.push({
        audioBase64: chunk.audioBase64,
        playbackRate: chunk.playbackRate ?? 1,
        postPauseMs: chunk.postPauseMs ?? 0
      });
      playNextAudioChunk();
    },
    [playNextAudioChunk]
  );

  const sendCognitionEvent = useCallback(async (payload: Record<string, unknown>) => {
    try {
      await fetch("/api/aurora/cognition/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch {
      // Introspection logging is best-effort and should not block UX.
    }
  }, []);

  const syncEmbodimentFromState = useCallback((state: AuroraState) => {
    const serverEmbodiment = state.cognition.extensions?.embodiment;
    if (!serverEmbodiment) {
      return;
    }

    const normalized = createEmbodimentState(serverEmbodiment);
    setEmbodimentState((current) => {
      const remoteUpdatedAt = parseTimestamp(normalized.updatedAt);
      const currentUpdatedAt = parseTimestamp(current.updatedAt);
      const remoteDirectiveAt = parseTimestamp(normalized.directives.lastUserDirectiveAt);
      const currentDirectiveAt = parseTimestamp(current.directives.lastUserDirectiveAt);
      const remoteObservedAt = parseTimestamp(normalized.perception.lastObservedAt);
      const currentObservedAt = parseTimestamp(current.perception.lastObservedAt);
      const preferRemoteWholeState =
        !embodimentHydratedRef.current ||
        (Number.isFinite(remoteUpdatedAt) &&
          (!Number.isFinite(currentUpdatedAt) || remoteUpdatedAt > currentUpdatedAt + EMBODIMENT_REMOTE_APPLY_DRIFT_MS));
      const preferRemoteDirectiveState =
        Number.isFinite(remoteDirectiveAt) &&
        (!Number.isFinite(currentDirectiveAt) || remoteDirectiveAt > currentDirectiveAt);
      const preferRemotePerceptionState =
        Number.isFinite(remoteObservedAt) &&
        (!Number.isFinite(currentObservedAt) || remoteObservedAt > currentObservedAt);
      const shouldApplyRemote =
        preferRemoteWholeState || preferRemoteDirectiveState || preferRemotePerceptionState;

      if (!shouldApplyRemote) {
        return current;
      }

      const nextState = mergeRemoteEmbodimentState(current, normalized, {
        preferRemoteWholeState,
        preferRemoteDirectiveState,
        preferRemotePerceptionState
      });
      embodimentHydratedRef.current = true;
      embodimentDirtyRef.current = false;
      lastPersistedEmbodimentDigestRef.current = serializeEmbodimentState(nextState);
      return nextState;
    });
  }, []);

  const flushEmbodimentPersistence = useCallback(async () => {
    if (!embodimentHydratedRef.current) {
      return;
    }

    if (embodimentPersistInFlightRef.current) {
      embodimentDirtyRef.current = true;
      await embodimentPersistInFlightRef.current;
    }

    const candidate = createEmbodimentState(embodimentStateRef.current);
    const candidateDigest = serializeEmbodimentState(candidate);
    if (!embodimentDirtyRef.current && candidateDigest === lastPersistedEmbodimentDigestRef.current) {
      return;
    }

    embodimentDirtyRef.current = false;
    const task = persistAuroraEmbodiment(candidate)
      .then(({ embodiment, cognition }) => {
        const persisted = createEmbodimentState(embodiment);
        lastPersistedEmbodimentDigestRef.current = serializeEmbodimentState(persisted);
        setAuroraState((current) =>
          cognition ? { ...current, cognition } : withEmbodimentState(current, persisted)
        );
        const latestDigest = serializeEmbodimentState(createEmbodimentState(embodimentStateRef.current));
        if (latestDigest !== lastPersistedEmbodimentDigestRef.current) {
          embodimentDirtyRef.current = true;
        }
      })
      .catch(() => {
        embodimentDirtyRef.current = true;
      })
      .finally(() => {
        embodimentPersistInFlightRef.current = null;
      });

    embodimentPersistInFlightRef.current = task;
    await task;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const configuredSessionId = canonicalContinuitySessionId(config.sharedSessionId.trim());
    const storedSessionId = canonicalContinuitySessionId(window.localStorage.getItem(SESSION_ID_STORAGE_KEY) ?? "");
    let resetPreviousResponse = false;
    if (configuredSessionId) {
      if (storedSessionId && storedSessionId !== configuredSessionId) {
        resetPreviousResponse = true;
      }

      setSharedSessionId(configuredSessionId);
      window.localStorage.setItem(SESSION_ID_STORAGE_KEY, configuredSessionId);
    } else if (storedSessionId) {
      setSharedSessionId(storedSessionId);
    }

    if (resetPreviousResponse) {
      setPreviousResponseId(null);
      window.localStorage.removeItem(PREVIOUS_RESPONSE_ID_STORAGE_KEY);
      return;
    }

    const storedPreviousResponseId = window.localStorage.getItem(PREVIOUS_RESPONSE_ID_STORAGE_KEY);
    if (storedPreviousResponseId) {
      setPreviousResponseId(storedPreviousResponseId);
    }
  }, [config.sharedSessionId]);

  useEffect(() => {
    const targetSessionId = canonicalContinuitySessionId(sharedSessionId);
    if (!targetSessionId || hydratedHistorySessionRef.current === targetSessionId) {
      return;
    }

    hydratedHistorySessionRef.current = null;
  }, [sharedSessionId]);

  const refreshConversationHistory = useCallback(async () => {
    const targetSessionId = canonicalContinuitySessionId(sharedSessionId);
    if (!targetSessionId || isSendingRef.current) {
      return;
    }

    try {
      const history = await getAuroraConversationHistory(targetSessionId);
      hydratedHistorySessionRef.current = targetSessionId;

      setMessages((current) => {
        if (current.some((message) => message.status !== "done")) {
          return current;
        }

        if (history.length === 0) {
          return current;
        }

        if (shouldPreserveRecentVisibleTail(current, history) || historiesMatch(current, history)) {
          return current;
        }

        return history;
      });
    } catch {
      hydratedHistorySessionRef.current = targetSessionId;
    }
  }, [sharedSessionId]);

  useEffect(() => {
    const targetSessionId = canonicalContinuitySessionId(sharedSessionId);
    if (!targetSessionId || hydratedHistorySessionRef.current === targetSessionId) {
      return;
    }

    let cancelled = false;
    void getAuroraConversationHistory(targetSessionId)
      .then((history) => {
        if (cancelled) {
          return;
        }

        hydratedHistorySessionRef.current = targetSessionId;
        if (history.length === 0) {
          return;
        }

        setMessages((current) => {
          if (current.some((message) => message.status !== "done")) {
            return current;
          }

          return shouldPreserveRecentVisibleTail(current, history) || historiesMatch(current, history)
            ? current
            : history;
        });
      })
      .catch(() => {
        if (!cancelled) {
          hydratedHistorySessionRef.current = targetSessionId;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sharedSessionId]);

  const refreshState = useCallback(async () => {
    try {
      const state = await getAuroraState();
      setAuroraState(state);
      syncEmbodimentFromState(state);
    } catch {
      // Keep current state if reading aurora-context.json fails.
    }
  }, [syncEmbodimentFromState]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const pollIntervalMs = useMemo(() => {
    if (typeof document === "undefined") {
      return config.pollMs;
    }

    const pageVisible = document.visibilityState !== "hidden";
    if (auroraState.cognition.extensions?.worldGrounding?.vision?.status === "active") {
      return Math.min(config.pollMs, 1500);
    }

    if (embodimentState.perception.rendererConnected) {
      return Math.min(config.pollMs, 1400);
    }

    if (pageVisible) {
      return Math.min(config.pollMs, 1800);
    }

    return config.pollMs;
  }, [auroraState.cognition.extensions?.worldGrounding?.vision?.status, config.pollMs, embodimentState.perception.rendererConnected]);

  useEffect(
    () => () => {
      stopSpeechPlayback();
      abortControllerRef.current?.abort();
    },
    [stopSpeechPlayback]
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshState();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, refreshState]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      void refreshConversationHistory();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshConversationHistory]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      void refreshState();
      void refreshConversationHistory();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [refreshConversationHistory, refreshState]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const flushEmbodimentKeepalive = () => {
      if (!embodimentHydratedRef.current) {
        return;
      }

      const candidate = createEmbodimentState(embodimentStateRef.current);
      const candidateDigest = serializeEmbodimentState(candidate);
      if (!embodimentDirtyRef.current && candidateDigest === lastPersistedEmbodimentDigestRef.current) {
        return;
      }

      queueAuroraEmbodimentKeepalive(candidate);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushEmbodimentKeepalive();
      }
    };

    window.addEventListener("pagehide", flushEmbodimentKeepalive);
    window.addEventListener("beforeunload", flushEmbodimentKeepalive);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushEmbodimentKeepalive);
      window.removeEventListener("beforeunload", flushEmbodimentKeepalive);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const sendUserMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      const localDirectiveResult = applyConversationEmbodimentDirectiveFromText(
        createEmbodimentState(embodimentStateRef.current),
        trimmed,
        new Date().toISOString()
      );
      if (localDirectiveResult.directive) {
        embodimentStateRef.current = localDirectiveResult.nextState;
        setEmbodimentState(localDirectiveResult.nextState);
        setAuroraState((current) => withEmbodimentState(current, localDirectiveResult.nextState));
      }

      await flushEmbodimentPersistence();
      stopSpeechPlayback();
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const sentAt = Date.now();
      setLastUserMessageAt(sentAt);

      const userMessage = makeMessage("user", trimmed, "done");
      const auroraMessage = makeMessage("aurora", "", "streaming");

      setMessages((current) => [...current, userMessage, auroraMessage]);
      setIsSending(true);
      setActivityPulse((value) => value + 1);

      try {
        let gotChunk = false;
        let assembledReply = "";
        const activeSessionId = canonicalContinuitySessionId(sharedSessionId);

        const result = await sendMessage(trimmed, {
          signal: controller.signal,
          sessionId: activeSessionId,
          previousResponseId,
          onChunk: (chunk) => {
            if (!chunk) {
              return;
            }

            gotChunk = true;
            assembledReply += chunk;
            setMessages((current) =>
              current.map((message) =>
                message.id === auroraMessage.id
                  ? {
                      ...message,
                      text: `${message.text}${chunk}`,
                      status: "streaming"
                    }
                  : message
              )
            );
            setActivityPulse((value) => value + 1);
          }
        });

        if (!gotChunk && result.text) {
          assembledReply = result.text;
          setMessages((current) =>
            current.map((message) =>
              message.id === auroraMessage.id
                ? {
                    ...message,
                    text: result.text,
                    status: "streaming"
                  }
                : message
            )
          );
        }

        const resolvedSessionId = canonicalContinuitySessionId(result.sessionId?.trim() || activeSessionId);
        if (resolvedSessionId) {
          if (resolvedSessionId !== activeSessionId) {
            setSharedSessionId(resolvedSessionId);
          }

          if (typeof window !== "undefined") {
            window.localStorage.setItem(SESSION_ID_STORAGE_KEY, resolvedSessionId);
          }
        }

        if (result.resetPreviousResponseId) {
          setPreviousResponseId(null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(PREVIOUS_RESPONSE_ID_STORAGE_KEY);
          }
        }

        if (result.responseId) {
          setPreviousResponseId(result.responseId);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(PREVIOUS_RESPONSE_ID_STORAGE_KEY, result.responseId);
          }
        }

        const finalReply = (assembledReply || result.text || "").trim();

        setMessages((current) =>
          current.map((message) =>
            message.id === auroraMessage.id
              ? {
                  ...message,
                  status: "done"
                }
              : message
          )
        );

        setConversationActiveUntil(Date.now() + CONVERSATION_COOLDOWN_MS);
        setActivityPulse((value) => value + 1);

        if (finalReply && config.ttsEnabled) {
          const ttsController = new AbortController();
          ttsAbortControllerRef.current = ttsController;
          void streamVoiceSynthesis(finalReply, {
            signal: ttsController.signal,
            sessionId: resolvedSessionId,
            responseId: result.responseId,
            complianceId: result.complianceId,
            cognition: auroraState.cognition,
            voice: config.ttsVoice,
            onEvent: (event) => {
              if (event.type === "chunk" && event.audioBase64) {
                enqueueSpeechChunk({
                  audioBase64: event.audioBase64,
                  playbackRate: event.playbackRate,
                  postPauseMs: event.postPauseMs
                });
              }
            }
          }).catch(() => {
            // Voice synthesis is best-effort.
          });
        }

        void sendCognitionEvent({
          type: "conversation_turn",
          userText: trimmed,
          auroraText: finalReply,
          sessionId: resolvedSessionId,
          responseId: result.responseId,
          complianceId: result.complianceId,
          latencyMs: result.latencyMs ?? Math.max(0, Date.now() - sentAt),
          introspection: result.introspection
        });

        await refreshState();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send message.";
        const complianceId = error instanceof SendMessageError ? error.complianceId : undefined;
        const shouldResetPreviousResponse =
          (error instanceof SendMessageError && Boolean(error.resetPreviousResponseId)) ||
          message.toLowerCase().includes("no tool call found for function call output");

        if (shouldResetPreviousResponse) {
          setPreviousResponseId(null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(PREVIOUS_RESPONSE_ID_STORAGE_KEY);
          }
        }

        setMessages((current) =>
          current.map((entry) =>
            entry.id === auroraMessage.id
              ? {
                  ...entry,
                  text: entry.text || message,
                  status: "error"
                }
              : entry
          )
        );

        setConversationActiveUntil(Date.now() + Math.round(CONVERSATION_COOLDOWN_MS * 0.5));
        void sendCognitionEvent({
          type: "send_error",
          userText: trimmed,
          complianceId,
          error: message,
          latencyMs: Math.max(0, Date.now() - sentAt)
        });
      } finally {
        setIsSending(false);
      }
    },
    [
      auroraState.cognition,
      config.ttsEnabled,
      config.ttsVoice,
      enqueueSpeechChunk,
      previousResponseId,
      refreshState,
      sendCognitionEvent,
      sharedSessionId,
      stopSpeechPlayback,
      flushEmbodimentPersistence
    ]
  );

  const uiState = useMemo(
    () => deriveUiState(auroraState, isSending, lastUserMessageAt, conversationActiveUntil),
    [auroraState, conversationActiveUntil, isSending, lastUserMessageAt]
  );
  const uiStateRef = useRef(uiState);

  useEffect(() => {
    auroraStateRef.current = auroraState;
  }, [auroraState]);

  useEffect(() => {
    embodimentStateRef.current = embodimentState;
  }, [embodimentState]);

  useEffect(() => {
    if (!embodimentHydratedRef.current) {
      return;
    }

    if (serializeEmbodimentState(embodimentState) !== lastPersistedEmbodimentDigestRef.current) {
      embodimentDirtyRef.current = true;
    }
  }, [embodimentState]);

  useEffect(() => {
    embodimentControlsRef.current = embodimentControls;
  }, [embodimentControls]);

  useEffect(() => {
    uiStateRef.current = uiState ?? DEFAULT_AURORA_UI_STATE;
  }, [uiState]);

  useEffect(() => {
    activityPulseRef.current = activityPulse;
  }, [activityPulse]);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(EMBODIMENT_CONTROL_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setEmbodimentControls(normalizeEmbodimentControls(JSON.parse(stored)));
    } catch {
      // If stored controls are malformed, fall back to defaults.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(EMBODIMENT_CONTROL_STORAGE_KEY, JSON.stringify(embodimentControls));
  }, [embodimentControls]);

  useEffect(() => {
    let lastTick = typeof performance !== "undefined" ? performance.now() : Date.now();
    const intervalId = window.setInterval(() => {
      const nowPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
      const deltaSeconds = Math.max(0.01, (nowPerf - lastTick) / 1000);
      lastTick = nowPerf;

      setEmbodimentState((current) =>
        advanceEmbodimentState({
          previous: current,
          controls: embodimentControlsRef.current,
          auroraState: auroraStateRef.current,
          uiState: uiStateRef.current,
          activityPulse: activityPulseRef.current,
          deltaSeconds,
          now: Date.now()
        })
      );
    }, EMBODIMENT_LOOP_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!embodimentHydratedRef.current || !embodimentDirtyRef.current || embodimentPersistInFlightRef.current) {
        return;
      }

      void flushEmbodimentPersistence();
    }, EMBODIMENT_PERSIST_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [flushEmbodimentPersistence]);

  const setPinnedIntent = useCallback((intent: AuroraEmbodimentControlState["pinnedIntent"]) => {
    setEmbodimentControls((current) => ({
      ...current,
      pinnedIntent: intent
    }));
  }, []);

  const setExpressivityBias = useCallback((value: number) => {
    setEmbodimentControls((current) => ({
      ...current,
      expressivityBias: clamp(value, 0, 1)
    }));
  }, []);

  const setStillnessBias = useCallback((value: number) => {
    setEmbodimentControls((current) => ({
      ...current,
      stillnessBias: clamp(value, 0, 1)
    }));
  }, []);

  const selectPattern = useCallback((patternId: string | null) => {
    setEmbodimentControls((current) => ({
      ...current,
      selectedPatternId: patternId && current.savedPatterns.some((pattern) => pattern.id === patternId) ? patternId : null
    }));
  }, []);

  const saveCurrentPattern = useCallback(() => {
    const currentEmbodiment = embodimentStateRef.current;
    setEmbodimentControls((current) => {
      const activeIntent = isEmbodimentIntentName(currentEmbodiment.activeMotorIntent)
        ? currentEmbodiment.activeMotorIntent
        : current.pinnedIntent !== "auto"
          ? current.pinnedIntent
          : "settle";
      const similarCount = current.savedPatterns.filter((pattern) => pattern.baseIntent === activeIntent).length + 1;
      const pattern = createEmbodimentPatternFromState({
        state: currentEmbodiment,
        controls: current,
        id: makeId(),
        name: `${activeIntent[0].toUpperCase()}${activeIntent.slice(1)} ${similarCount}`
      });
      const savedPatterns = [pattern, ...current.savedPatterns].slice(0, MAX_EMBODIMENT_PATTERNS);

      return {
        ...current,
        savedPatterns,
        selectedPatternId: pattern.id
      };
    });
  }, []);

  const deletePattern = useCallback((patternId: string) => {
    setEmbodimentControls((current) => {
      const savedPatterns = current.savedPatterns.filter((pattern) => pattern.id !== patternId);
      return {
        ...current,
        savedPatterns,
        selectedPatternId: current.selectedPatternId === patternId ? null : current.selectedPatternId
      };
    });
  }, []);

  const resetControls = useCallback(() => {
    setEmbodimentControls((current) => ({
      ...current,
      pinnedIntent: DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE.pinnedIntent,
      expressivityBias: DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE.expressivityBias,
      stillnessBias: DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE.stillnessBias,
      selectedPatternId: null
    }));
  }, []);

  const reportAvatarObservation = useCallback((observation: AuroraEmbodimentObservationInput) => {
    setEmbodimentState((current) => applyEmbodimentObservation(current, observation));
  }, []);

  const value = useMemo<AuroraContextValue>(
    () => ({
      auroraState,
      uiState: uiState ?? DEFAULT_AURORA_UI_STATE,
      messages,
      isSending,
      historyLimit: config.historyLimit,
      activityPulse,
      sendUserMessage,
      refreshState
    }),
    [activityPulse, auroraState, config.historyLimit, isSending, messages, refreshState, sendUserMessage, uiState]
  );
  const embodimentControlValue = useMemo<AuroraEmbodimentControlContextValue>(
    () => ({
      controls: embodimentControls,
      setPinnedIntent,
      setExpressivityBias,
      setStillnessBias,
      selectPattern,
      saveCurrentPattern,
      deletePattern,
      resetControls,
      reportAvatarObservation
    }),
    [
      deletePattern,
      embodimentControls,
      reportAvatarObservation,
      resetControls,
      saveCurrentPattern,
      selectPattern,
      setExpressivityBias,
      setPinnedIntent,
      setStillnessBias
    ]
  );

  return (
    <AuroraContextBridgeProvider value={value}>
      <AuroraEmbodimentContext.Provider value={embodimentState}>
        <AuroraEmbodimentControlContext.Provider value={embodimentControlValue}>
          {children}
        </AuroraEmbodimentControlContext.Provider>
      </AuroraEmbodimentContext.Provider>
    </AuroraContextBridgeProvider>
  );
}

export { useAurora } from "@/components/AuroraContext";

export function useAuroraEmbodiment(): AuroraEmbodimentState {
  const context = useContext(AuroraEmbodimentContext);
  if (!context) {
    throw new Error("useAuroraEmbodiment must be used inside AuroraProvider.");
  }

  return context;
}

export function useAuroraEmbodimentControls(): AuroraEmbodimentControlContextValue {
  const context = useContext(AuroraEmbodimentControlContext);
  if (!context) {
    throw new Error("useAuroraEmbodimentControls must be used inside AuroraProvider.");
  }

  return context;
}
