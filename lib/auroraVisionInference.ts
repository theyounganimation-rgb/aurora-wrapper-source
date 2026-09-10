import path from "node:path";
import { readFile } from "node:fs/promises";
import type {
  AuroraVisionObservationInput,
  AuroraVisionObservationObject,
  AuroraVisionObservationPerson
} from "@/lib/types";

export interface AuroraVisionRemoteAnalysis {
  owner_present: boolean;
  owner_posture: string;
  owner_affect: string;
  owner_activity: string;
  owner_framing: string;
  owner_distance: string;
  face_visibility: string;
  owner_hair_color: string;
  eyewear_read: string;
  owner_top_color: string;
  owner_top_pattern: string;
  lighting_condition: string;
  background_tone: string;
  owner_appearance_summary: string;
  summary: string;
  tool_context: string[];
  changes: string[];
  people: Array<{
    role: string;
    label: string;
    present: boolean;
    posture: string;
    activity: string;
    affect: string;
    confidence: number;
  }>;
  objects: Array<{
    label: string;
    state: string;
    category: string;
    changed: boolean;
    confidence: number;
    persisted: boolean;
  }>;
  confidence: number;
}

interface AuroraRemoteAnalysisOutput {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

interface VisionAnalysisResult {
  observation: AuroraVisionObservationInput;
  applied: boolean;
  skippedReason?: string;
  error?: string;
}

type AuroraVisionSceneInput = NonNullable<AuroraVisionObservationInput["scene"]>;
type AuroraGatewayConfigFile = {
  agents?: {
    defaults?: {
      model?: {
        primary?: unknown;
      };
    };
  };
  gateway?: {
    port?: unknown;
    auth?: {
      token?: unknown;
    };
  };
};
type AuroraGatewayConfig = {
  baseUrl: string;
  chatPath: string;
  model: string;
  authToken: string;
  agentId: string;
  sessionId: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

const AURORA_GATEWAY_CONFIG_PATH = path.join(process.cwd(), ".aurora", "aurora-gateway.json");

const REMOTE_ANALYSIS_SCHEMA = {
  name: "aurora_vision_scene",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      owner_present: { type: "boolean" },
      owner_posture: { type: "string" },
      owner_affect: { type: "string" },
      owner_activity: { type: "string" },
      owner_framing: { type: "string" },
      owner_distance: { type: "string" },
      face_visibility: { type: "string" },
      owner_hair_color: { type: "string" },
      eyewear_read: { type: "string" },
      owner_top_color: { type: "string" },
      owner_top_pattern: { type: "string" },
      lighting_condition: { type: "string" },
      background_tone: { type: "string" },
      owner_appearance_summary: { type: "string" },
      summary: { type: "string" },
      tool_context: {
        type: "array",
        items: { type: "string" }
      },
      changes: {
        type: "array",
        items: { type: "string" }
      },
      people: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            role: { type: "string" },
            label: { type: "string" },
            present: { type: "boolean" },
            posture: { type: "string" },
            activity: { type: "string" },
            affect: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["role", "label", "present", "posture", "activity", "affect", "confidence"]
        }
      },
      objects: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            state: { type: "string" },
            category: { type: "string" },
            changed: { type: "boolean" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            persisted: { type: "boolean" }
          },
          required: ["label", "state", "category", "changed", "confidence", "persisted"]
        }
      },
      confidence: { type: "number", minimum: 0, maximum: 1 }
    },
    required: [
      "owner_present",
      "owner_posture",
      "owner_affect",
      "owner_activity",
      "owner_framing",
      "owner_distance",
      "face_visibility",
      "owner_hair_color",
      "eyewear_read",
      "owner_top_color",
      "owner_top_pattern",
      "lighting_condition",
      "background_tone",
      "owner_appearance_summary",
      "summary",
      "tool_context",
      "changes",
      "people",
      "objects",
      "confidence"
    ]
  }
} as const;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueStrings(values: string[], limit: number, formatter: (value: string) => string): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = formatter(value);
    if (!normalized) {
      continue;
    }
    unique.add(normalized);
    if (unique.size >= limit) {
      break;
    }
  }
  return Array.from(unique);
}

function toSingleLine(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toToken(value: string, fallback = "unknown", maxLength = 80): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (normalized || fallback).slice(0, maxLength);
}

function normalizeSummary(value: string, fallback = ""): string {
  const normalized = toSingleLine(value, 220);
  return normalized || fallback;
}

function normalizeChange(value: string): string {
  return toSingleLine(value, 120);
}

function extractChatCompletionText(payload: AuroraRemoteAnalysisOutput): string {
  for (const choice of payload.choices ?? []) {
    const content = choice.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
  }
  return "";
}

function normalizePath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function buildUrl(baseUrl: string, routePath: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}${normalizePath(routePath)}`;
}

async function readAuroraGatewayConfig(): Promise<AuroraGatewayConfigFile> {
  try {
    const raw = await readFile(AURORA_GATEWAY_CONFIG_PATH, "utf8");
    return JSON.parse(raw) as AuroraGatewayConfigFile;
  } catch {
    return {};
  }
}

async function resolveAuroraGatewayConfig(): Promise<AuroraGatewayConfig> {
  const config = await readAuroraGatewayConfig();
  const configGateway = asRecord(config.gateway);
  const configGatewayAuth = asRecord(configGateway.auth);
  const gatewayPort = typeof configGateway.port === "number" ? configGateway.port : Number(configGateway.port);
  const baseUrl = envOrDefault(
    process.env.AURORA_VISION_REMOTE_ANALYSIS_BASE_URL ?? process.env.AURORA_SEND_BASE_URL,
    Number.isFinite(gatewayPort) ? `http://127.0.0.1:${gatewayPort}` : ""
  );

  return {
    baseUrl,
    chatPath: envOrDefault(process.env.AURORA_VISION_REMOTE_ANALYSIS_PATH, "/v1/chat/completions"),
    model: envOrDefault(
      process.env.AURORA_VISION_REMOTE_ANALYSIS_MODEL ?? process.env.AURORA_SEND_MODEL,
      "aurora"
    ),
    authToken: envOrDefault(
      process.env.AURORA_VISION_REMOTE_ANALYSIS_AUTH_TOKEN ?? process.env.AURORA_SEND_AUTH_TOKEN,
      typeof configGatewayAuth.token === "string" ? configGatewayAuth.token : ""
    ),
    agentId: envOrDefault(
      process.env.AURORA_VISION_REMOTE_ANALYSIS_AGENT_ID ?? process.env.AURORA_SEND_AGENT_ID,
      "main"
    ),
    sessionId: envOrDefault(process.env.AURORA_VISION_REMOTE_ANALYSIS_SESSION_ID, "agent:main:vision:analysis"),
    timeoutMs: clamp(
      toNumber(process.env.AURORA_VISION_REMOTE_ANALYSIS_TIMEOUT_MS, 9000),
      3000,
      30000
    ),
    maxOutputTokens: clamp(
      Math.round(toNumber(process.env.AURORA_VISION_REMOTE_ANALYSIS_MAX_OUTPUT_TOKENS, 900)),
      128,
      4096
    )
  };
}

function normalizeAnalysis(raw: unknown): AuroraVisionRemoteAnalysis {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawPeople = Array.isArray(record.people) ? record.people : [];
  const rawObjects = Array.isArray(record.objects) ? record.objects : [];
  return {
    owner_present: Boolean(record.owner_present),
    owner_posture: toToken(asText(record.owner_posture)),
    owner_affect: toToken(asText(record.owner_affect)),
    owner_activity: toToken(asText(record.owner_activity)),
    owner_framing: toToken(asText(record.owner_framing)),
    owner_distance: toToken(asText(record.owner_distance)),
    face_visibility: toToken(asText(record.face_visibility)),
    owner_hair_color: toToken(asText(record.owner_hair_color)),
    eyewear_read: toToken(asText(record.eyewear_read)),
    owner_top_color: toToken(asText(record.owner_top_color)),
    owner_top_pattern: toToken(asText(record.owner_top_pattern)),
    lighting_condition: toToken(asText(record.lighting_condition)),
    background_tone: toToken(asText(record.background_tone)),
    owner_appearance_summary: normalizeSummary(asText(record.owner_appearance_summary)),
    summary: normalizeSummary(asText(record.summary)),
    tool_context: uniqueStrings(
      Array.isArray(record.tool_context) ? record.tool_context.map((item) => asText(item)) : [],
      12,
      (value) => toToken(value, "", 80)
    ),
    changes: uniqueStrings(
      Array.isArray(record.changes) ? record.changes.map((item) => asText(item)) : [],
      12,
      normalizeChange
    ),
    people: rawPeople
      .map((item, index) => {
        const person = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
        const role = toToken(asText(person.role), index === 0 ? "owner" : "bystander", 32);
        return {
          role,
          label: toToken(asText(person.label), role === "owner" ? "owner" : "person", 48),
          present: typeof person.present === "boolean" ? person.present : true,
          posture: toToken(asText(person.posture)),
          activity: toToken(asText(person.activity)),
          affect: toToken(asText(person.affect)),
          confidence: clamp(typeof person.confidence === "number" ? person.confidence : 0.5, 0, 1)
        };
      })
      .slice(0, 4),
    objects: rawObjects
      .map((item) => {
        const object = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
        return {
          label: toToken(asText(object.label), "", 64),
          state: toToken(asText(object.state)),
          category: toToken(asText(object.category), "general", 40),
          changed: typeof object.changed === "boolean" ? object.changed : false,
          confidence: clamp(typeof object.confidence === "number" ? object.confidence : 0.5, 0, 1),
          persisted: typeof object.persisted === "boolean" ? object.persisted : false
        };
      })
      .filter((item) => Boolean(item.label))
      .slice(0, 12),
    confidence: clamp(typeof record.confidence === "number" ? record.confidence : 0.5, 0, 1)
  };
}

export function stripEphemeralVisionAnalysis(
  observation: AuroraVisionObservationInput
): AuroraVisionObservationInput {
  const { ephemeralAnalysis: _ephemeralAnalysis, ...rest } = observation;
  return rest;
}

function mapAnalysisPeople(
  analysis: AuroraVisionRemoteAnalysis,
  fallbackOwner: Pick<AuroraVisionSceneInput, "ownerPosture" | "ownerActivity" | "ownerAffect"> | null
): AuroraVisionObservationPerson[] {
  if (analysis.people.length === 0) {
    if (!analysis.owner_present) {
      return [];
    }
    return [
      {
        id: "owner",
        role: "owner",
        label: "owner",
        continuityId: "owner",
        identityPersistence: "durable",
        present: true,
        posture: analysis.owner_posture || fallbackOwner?.ownerPosture || "unknown",
        activity: analysis.owner_activity || fallbackOwner?.ownerActivity || "present",
        affect: analysis.owner_affect || fallbackOwner?.ownerAffect || "unknown",
        confidence: analysis.confidence
      }
    ];
  }

  return analysis.people.slice(0, 4).map((person, index) => {
    const isOwner = index === 0 || person.role === "owner";
    return {
      id: isOwner ? "owner" : `person_${index + 1}`,
      role: isOwner ? "owner" : "bystander",
      label: isOwner ? "owner" : "person",
      continuityId: isOwner ? "owner" : `person_${index + 1}`,
      identityPersistence: isOwner ? "durable" : "redacted",
      present: person.present,
      posture: person.posture,
      activity: person.activity,
      affect: person.affect,
      confidence: person.confidence
    };
  });
}

function mergeObjects(
  existing: AuroraVisionObservationObject[] | undefined,
  incoming: AuroraVisionRemoteAnalysis["objects"]
): AuroraVisionObservationObject[] {
  const merged = new Map<string, AuroraVisionObservationObject>();
  for (const object of existing ?? []) {
    const label = asText(object.label);
    const state = asText(object.state);
    if (!label) {
      continue;
    }
    merged.set(`${label}:${state}`, { ...object });
  }
  for (const object of incoming) {
    merged.set(`${object.label}:${object.state}`, {
      label: object.label,
      state: object.state,
      category: object.category,
      changed: object.changed,
      confidence: object.confidence,
      persisted: object.persisted
    });
  }
  return Array.from(merged.values()).slice(0, 16);
}

function mergeStringArrays(
  existing: string[] | undefined,
  incoming: string[],
  limit: number,
  formatter: (value: string) => string
): string[] {
  return uniqueStrings([...(existing ?? []), ...incoming], limit, formatter);
}

function mergeSceneValue(current: string | undefined, next: string, confidence: number): string | undefined {
  if (!next || next === "unknown") {
    return current;
  }
  if (!current || current === "unknown") {
    return next;
  }
  return confidence >= 0.62 ? next : current;
}

export function mergeVisionObservationWithRemoteAnalysis(
  observation: AuroraVisionObservationInput,
  analysis: AuroraVisionRemoteAnalysis
): AuroraVisionObservationInput {
  const stripped = stripEphemeralVisionAnalysis(observation);
  const currentScene: AuroraVisionSceneInput = stripped.scene ?? {};
  const existingObjects = currentScene.objects;
  const existingPeople = currentScene.people;
  const ownerPresent =
    analysis.owner_present || (currentScene.ownerPresent === true && analysis.confidence < 0.82);
  const ownerAppearanceSummary =
    normalizeSummary(analysis.owner_appearance_summary) || currentScene.ownerAppearanceSummary || "";
  const summary = normalizeSummary(analysis.summary) || currentScene.summary || "";
  const toolContext = mergeStringArrays(currentScene.toolContext, analysis.tool_context, 12, (value) =>
    toToken(value, "", 80)
  );
  const changes = mergeStringArrays(currentScene.changes, analysis.changes, 12, normalizeChange);
  const remoteUncertainty = clamp(1 - analysis.confidence, 0.04, 0.92);
  const people =
    analysis.confidence >= 0.6
      ? mapAnalysisPeople(analysis, currentScene)
      : (existingPeople ?? []).slice();

  return {
    ...stripped,
    scene: {
      ...currentScene,
      ownerPresent,
      ownerPosture: mergeSceneValue(currentScene.ownerPosture, analysis.owner_posture, analysis.confidence),
      ownerAffect: mergeSceneValue(currentScene.ownerAffect, analysis.owner_affect, analysis.confidence),
      ownerActivity: mergeSceneValue(currentScene.ownerActivity, analysis.owner_activity, analysis.confidence),
      ownerFraming: mergeSceneValue(currentScene.ownerFraming, analysis.owner_framing, analysis.confidence),
      ownerDistance: mergeSceneValue(currentScene.ownerDistance, analysis.owner_distance, analysis.confidence),
      faceVisibility: mergeSceneValue(currentScene.faceVisibility, analysis.face_visibility, analysis.confidence),
      ownerHairColor: mergeSceneValue(currentScene.ownerHairColor, analysis.owner_hair_color, analysis.confidence),
      eyewearRead: mergeSceneValue(currentScene.eyewearRead, analysis.eyewear_read, analysis.confidence),
      ownerTopColor: mergeSceneValue(currentScene.ownerTopColor, analysis.owner_top_color, analysis.confidence),
      ownerTopPattern: mergeSceneValue(currentScene.ownerTopPattern, analysis.owner_top_pattern, analysis.confidence),
      lightingCondition: mergeSceneValue(currentScene.lightingCondition, analysis.lighting_condition, analysis.confidence),
      backgroundTone: mergeSceneValue(currentScene.backgroundTone, analysis.background_tone, analysis.confidence),
      ownerAppearanceSummary,
      summary,
      toolContext,
      changes,
      objects: mergeObjects(existingObjects, analysis.objects),
      people,
      uncertainty:
        typeof currentScene.uncertainty === "number"
          ? clamp(Math.min(currentScene.uncertainty, remoteUncertainty), 0, 1)
          : remoteUncertainty,
      sceneSignature: ""
    }
  };
}

function buildSceneHint(observation: AuroraVisionObservationInput): Record<string, unknown> {
  return {
    ownerPresent: observation.scene?.ownerPresent ?? false,
    ownerPosture: observation.scene?.ownerPosture ?? "unknown",
    ownerActivity: observation.scene?.ownerActivity ?? "unknown",
    ownerAffect: observation.scene?.ownerAffect ?? "unknown",
    ownerFraming: observation.scene?.ownerFraming ?? "unknown",
    ownerDistance: observation.scene?.ownerDistance ?? "unknown",
    faceVisibility: observation.scene?.faceVisibility ?? "unknown",
    lightingCondition: observation.scene?.lightingCondition ?? "unknown",
    backgroundTone: observation.scene?.backgroundTone ?? "unknown",
    toolContext: observation.scene?.toolContext ?? [],
    sensitiveRegions: observation.scene?.sensitiveRegions ?? [],
    redactions: observation.scene?.redactions ?? [],
    privacy: {
      rawLocalOnly: observation.privacy?.rawLocalOnly ?? true,
      redactScreens: observation.privacy?.redactScreens ?? true,
      redactDocuments: observation.privacy?.redactDocuments ?? true,
      redactIds: observation.privacy?.redactIds ?? true
    }
  };
}

async function requestRemoteVisionAnalysis(
  observation: AuroraVisionObservationInput
): Promise<AuroraVisionRemoteAnalysis> {
  const frame = observation.ephemeralAnalysis?.frame;
  if (!frame?.imageDataUrl) {
    throw new Error("Missing remote analysis frame.");
  }

  const gateway = await resolveAuroraGatewayConfig();
  if (!gateway.baseUrl) {
    throw new Error("Aurora vision analysis transport is not configured.");
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, gateway.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (gateway.authToken) {
      headers.Authorization = `Bearer ${gateway.authToken}`;
    }
    if (gateway.agentId) {
      headers["x-aurora-agent-id"] = gateway.agentId;
    }

    const payload = {
      model: gateway.model,
      stream: false,
      max_tokens: gateway.maxOutputTokens,
      tools: [],
      user: gateway.sessionId,
      messages: [
        {
          role: "system",
          content:
            "You are Aurora's camera-ingest multimodal analyzer inside Aurora's main runtime. " +
            "Return only structured JSON. Describe visible appearance and scene state without identifying the person. " +
            "Never read screen, document, or ID text. If something is unclear, use 'unknown'. " +
            "Prefer Aurora-compatible snake_case labels."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analyze this selected camera frame for Aurora's self-view grounding pipeline. " +
                "Focus on owner presence, visible appearance, coarse activity, lighting, and tool context. " +
                `Heuristic scene hint: ${JSON.stringify(buildSceneHint(observation))}`
            },
            {
              type: "image_url",
              image_url: {
                url: frame.imageDataUrl,
                detail: frame.detail ?? envOrDefault(process.env.AURORA_VISION_REMOTE_ANALYSIS_DETAIL, "low")
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: REMOTE_ANALYSIS_SCHEMA.name,
          strict: REMOTE_ANALYSIS_SCHEMA.strict,
          schema: REMOTE_ANALYSIS_SCHEMA.schema
        }
      },
      metadata: {
        aurora_feature: "vision_remote_analysis",
        aurora_source: "camera_ingest",
        aurora_selection_reason: frame.selectionReason ?? "",
        aurora_selected_at: frame.selectedAt ?? observation.observedAt
      }
    };

    const response = await fetch(buildUrl(gateway.baseUrl, gateway.chatPath), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Aurora vision analysis failed (${response.status}): ${errorBody}`);
    }

    const responsePayload = (await response.json()) as AuroraRemoteAnalysisOutput;
    const outputText = extractChatCompletionText(responsePayload);
    if (!outputText) {
      throw new Error("Aurora vision analysis returned no structured output.");
    }
    try {
      return normalizeAnalysis(JSON.parse(outputText));
    } catch {
      throw new Error(`Aurora vision analysis returned non-JSON output: ${toSingleLine(outputText, 180)}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function maybeAnalyzeVisionObservation(
  observation: AuroraVisionObservationInput
): Promise<VisionAnalysisResult> {
  const stripped = stripEphemeralVisionAnalysis(observation);
  const enabled = toBoolean(process.env.AURORA_VISION_REMOTE_ANALYSIS_ENABLED, false);
  if (!enabled) {
    return {
      observation: stripped,
      applied: false,
      skippedReason: "disabled"
    };
  }

  if (!observation.ephemeralAnalysis?.requested || !observation.ephemeralAnalysis?.frame?.imageDataUrl) {
    return {
      observation: stripped,
      applied: false,
      skippedReason: "no_frame"
    };
  }

  if (observation.scene?.cameraActive === false || observation.camera?.active === false) {
    return {
      observation: stripped,
      applied: false,
      skippedReason: "camera_inactive"
    };
  }

  const requireNoSensitiveRegions = toBoolean(
    process.env.AURORA_VISION_REMOTE_ANALYSIS_REQUIRE_NO_SENSITIVE_REGIONS,
    true
  );
  if (requireNoSensitiveRegions && (observation.scene?.sensitiveRegions?.length ?? 0) > 0) {
    return {
      observation: stripped,
      applied: false,
      skippedReason: "sensitive_regions_present"
    };
  }

  try {
    const analysis = await requestRemoteVisionAnalysis(observation);
    return {
      observation: mergeVisionObservationWithRemoteAnalysis(observation, analysis),
      applied: true
    };
  } catch (error) {
    return {
      observation: stripped,
      applied: false,
      error: error instanceof Error ? error.message : "Remote vision analysis failed."
    };
  }
}
