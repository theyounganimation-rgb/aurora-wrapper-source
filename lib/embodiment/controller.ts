import {
  DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE,
  DEFAULT_AURORA_EMBODIMENT_STATE,
  EMBODIMENT_INTENT_NAMES,
  EMBODIMENT_MOTOR_INTENTION_NAMES,
  type AuroraEmbodimentObservationInput,
  type AuroraEmbodimentControlState,
  type AuroraEmbodimentDirective,
  type AuroraHabitatZoneName,
  type AuroraEmbodimentMotorIntention,
  type AuroraEmbodimentPattern,
  type AuroraEmbodimentState,
  type AuroraState,
  type AuroraUiState,
  type EmbodimentAttentionTarget,
  type EmbodimentBoneName,
  type EmbodimentIntentName,
  type EmbodimentMotorIntentionName,
  type EmbodimentVector3
} from "../types";
import {
  activeEmbodimentDirectivesAt,
  normalizeEmbodimentDirectiveState
} from "./directives";
import { AURORA_ROOM_ZONES } from "./habitat";

export const EMBODIMENT_CONTROLLER_VERSION = "2026-03-20.v8";
const EMBODIMENT_RENDERER_CONNECTED_GRACE_MS = 45_000;

type EmbodimentPoseEffect = {
  rootPositionOffset?: EmbodimentVector3;
  rootRotationOffset?: EmbodimentVector3;
  lookTargetOffset?: EmbodimentVector3;
  boneOffsets?: Partial<Record<EmbodimentBoneName, EmbodimentVector3>>;
  expressionTargets?: Partial<Record<keyof AuroraEmbodimentState["pose"]["expressions"], number>>;
};

function resolveHabitatZone(options: {
  currentIntention: AuroraEmbodimentMotorIntention;
  auroraState: AuroraState;
  uiState: AuroraUiState;
  interoception: AuroraEmbodimentState["interoception"];
  previous: AuroraEmbodimentState;
}): AuroraHabitatZoneName {
  const { currentIntention, auroraState, uiState, interoception, previous } = options;
  if (currentIntention.name === "sleep_in_bed") {
    return "bed";
  }
  if (currentIntention.name === "desk_focus") {
    return "desk";
  }
  if (currentIntention.name === "couch_read") {
    return "couch";
  }

  const focusText = (auroraState.cognition.attention.currentFocus || "").trim().toLowerCase();
  const focusPresent = Boolean(focusText && focusText !== "none");
  const queueDepth = auroraState.cognition.attention.queueDepth;
  const recentThoughtCount = auroraState.cognition.reflection.recentThoughts.length;
  const lastHeartbeatMs = Date.parse(uiState.lastHeartbeat ?? auroraState.lastHeartbeat.timestamp ?? "");
  const heartbeatAgeMinutes = Number.isFinite(lastHeartbeatMs)
    ? Math.max(0, (Date.now() - lastHeartbeatMs) / 60_000)
    : 999;
  const deskBias =
    (uiState.mode === "thinking" ? 0.8 : 0) +
    (focusPresent ? 0.34 : 0) +
    Math.min(0.24, queueDepth * 0.055) +
    Math.min(0.16, recentThoughtCount * 0.035) +
    interoception.speaking * 0.18 +
    interoception.activity * 0.14 +
    interoception.curiosity * 0.1;
  const sleepBias =
    (uiState.mode === "idle" ? 0.34 : 0) +
    Math.max(0, 0.18 - uiState.activity) * 1.2 +
    previous.motor.stillnessBias * 0.22 +
    previous.motor.settleDrive * 0.16 +
    (heartbeatAgeMinutes > 6 ? 0.16 : 0) +
    (queueDepth === 0 ? 0.08 : 0) -
    (focusPresent ? 0.24 : 0) -
    interoception.curiosity * 0.18 -
    interoception.restlessness * 0.16 -
    interoception.speaking * 0.24;

  if (sleepBias >= 0.5 && sleepBias > deskBias + 0.08) {
    return "bed";
  }
  if (deskBias >= 0.42) {
    return "desk";
  }
  return "couch";
}

function deriveHabitatZoneEffects(options: {
  habitatZone: AuroraHabitatZoneName;
  interoception: AuroraEmbodimentState["interoception"];
  gestureEnergy: number;
  breathPhase: number;
  handPhase: number;
  dominantSide: AuroraEmbodimentState["bodySchema"]["dominantSide"];
}): EmbodimentPoseEffect {
  const { habitatZone, interoception, gestureEnergy, breathPhase, handPhase, dominantSide } = options;
  const dominantHandSign = dominantSide === "left" ? -1 : 1;
  const typingPulse = Math.sin(handPhase * 4.2) * (0.008 + gestureEnergy * 0.01);
  const couchSettle = Math.sin(breathPhase * 0.72) * 0.008;
  const sleepBreath = Math.sin(breathPhase * 0.58) * 0.006;

  switch (habitatZone) {
    case "desk":
      return {
        rootPositionOffset: vec3(
          AURORA_ROOM_ZONES.desk.position.x,
          AURORA_ROOM_ZONES.desk.position.y - 0.24,
          AURORA_ROOM_ZONES.desk.position.z - 0.1
        ),
        rootRotationOffset: vec3(0.18, AURORA_ROOM_ZONES.desk.yaw, 0),
        lookTargetOffset: vec3(-0.18, -0.08, -0.08),
        boneOffsets: {
          hips: vec3(0.28, 0, 0),
          spine: vec3(0.22, 0, 0),
          chest: vec3(0.24, 0, 0),
          neck: vec3(0.08, -0.02, 0),
          head: vec3(0.05, -0.03, 0),
          leftUpperArm: vec3(0.04, 0.01, -0.2),
          rightUpperArm: vec3(0.04, -0.01, 0.2),
          leftLowerArm: vec3(-0.14, 0.01, -0.04 + typingPulse),
          rightLowerArm: vec3(-0.14, -0.01, 0.04 - typingPulse),
          leftHand: vec3(-0.08, 0.01, 0.05 + typingPulse * 1.2),
          rightHand: vec3(-0.08, -0.01, -0.05 - typingPulse * 1.2),
          leftUpperLeg: vec3(-1.36, 0.03, 0.04),
          rightUpperLeg: vec3(-1.36, -0.03, -0.04),
          leftLowerLeg: vec3(2.08, 0, 0),
          rightLowerLeg: vec3(2.08, 0, 0),
          leftFoot: vec3(-0.78, 0, 0.04),
          rightFoot: vec3(-0.78, 0, -0.04)
        },
        expressionTargets: {
          relaxed: 0.24,
          happy: clamp(interoception.curiosity * 0.1, 0, 0.1)
        }
      };
    case "bed":
      return {
        rootPositionOffset: vec3(
          AURORA_ROOM_ZONES.bed.position.x,
          AURORA_ROOM_ZONES.bed.position.y + sleepBreath,
          AURORA_ROOM_ZONES.bed.position.z
        ),
        rootRotationOffset: vec3(-1.02, AURORA_ROOM_ZONES.bed.yaw, 0.06),
        lookTargetOffset: vec3(0, -0.2, -0.14),
        boneOffsets: {
          spine: vec3(0.04, 0, 0),
          chest: vec3(0.05, 0, 0),
          neck: vec3(0.12, 0.04 * dominantHandSign, 0),
          head: vec3(0.18, 0.08 * dominantHandSign, 0.04),
          leftUpperArm: vec3(0.16, 0.02, 0.12),
          rightUpperArm: vec3(0.18, -0.02, -0.12),
          leftLowerArm: vec3(0.14, 0, 0.08),
          rightLowerArm: vec3(0.1, 0, -0.06),
          leftHand: vec3(0.02, 0.02, 0.05),
          rightHand: vec3(0.02, -0.02, -0.04),
          leftUpperLeg: vec3(-0.3, 0.04, 0.06),
          rightUpperLeg: vec3(-0.32, -0.04, -0.04),
          leftLowerLeg: vec3(0.44, 0, 0),
          rightLowerLeg: vec3(0.4, 0, 0),
          leftFoot: vec3(0.14, 0, 0.02),
          rightFoot: vec3(0.12, 0, -0.02)
        },
        expressionTargets: {
          relaxed: 0.52,
          happy: 0,
          sad: 0,
          aa: 0
        }
      };
    case "couch":
    default:
      return {
        rootPositionOffset: vec3(
          AURORA_ROOM_ZONES.couch.position.x,
          AURORA_ROOM_ZONES.couch.position.y - 0.1 + couchSettle,
          AURORA_ROOM_ZONES.couch.position.z
        ),
        rootRotationOffset: vec3(0.14, AURORA_ROOM_ZONES.couch.yaw, 0),
        lookTargetOffset: vec3(-0.03, -0.08, 0.04),
        boneOffsets: {
          hips: vec3(0.14, 0, 0),
          spine: vec3(0.12, 0, 0),
          chest: vec3(0.1, 0.02, 0),
          neck: vec3(0.04, 0, 0),
          head: vec3(0.02, 0.02, 0),
          leftUpperArm: vec3(0.04, 0.02, -0.1),
          rightUpperArm: vec3(0.04, -0.02, 0.1),
          leftLowerArm: vec3(-0.1, 0.03, -0.03),
          rightLowerArm: vec3(-0.1, -0.03, 0.03),
          leftHand: vec3(-0.04, 0.03, 0.1),
          rightHand: vec3(-0.04, -0.03, -0.1),
          leftUpperLeg: vec3(-1.08, 0.03, 0.04),
          rightUpperLeg: vec3(-1.08, -0.03, -0.04),
          leftLowerLeg: vec3(1.54, 0, 0),
          rightLowerLeg: vec3(1.54, 0, 0),
          leftFoot: vec3(-0.44, 0, 0.04),
          rightFoot: vec3(-0.44, 0, -0.04)
        },
        expressionTargets: {
          relaxed: 0.42,
          happy: clamp(interoception.warmth * 0.1, 0, 0.12)
        }
      };
  }
}

export const EMBODIMENT_CONTROLLED_BONES: EmbodimentBoneName[] = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftHand",
  "rightHand",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
  "leftFoot",
  "rightFoot",
  "leftToes",
  "rightToes"
];

export const AURORA_REST_POSE: Record<EmbodimentBoneName, EmbodimentVector3> = {
  hips: { x: 0.01, y: 0, z: 0 },
  spine: { x: 0, y: 0, z: 0 },
  chest: { x: 0, y: 0, z: 0 },
  neck: { x: -0.085, y: 0, z: 0 },
  head: { x: -0.135, y: 0, z: 0 },
  leftShoulder: { x: 0.01, y: 0.01, z: -0.16 },
  rightShoulder: { x: 0.01, y: -0.01, z: 0.16 },
  leftUpperArm: { x: -0.05, y: 0.01, z: -1.17 },
  rightUpperArm: { x: -0.05, y: -0.01, z: 1.17 },
  leftLowerArm: { x: -0.16, y: 0.04, z: -0.08 },
  rightLowerArm: { x: -0.16, y: -0.04, z: 0.08 },
  leftHand: { x: 0.02, y: -0.02, z: 0.03 },
  rightHand: { x: 0.02, y: 0.02, z: -0.03 },
  leftUpperLeg: { x: 0.02, y: 0.02, z: 0.03 },
  rightUpperLeg: { x: 0.02, y: -0.02, z: -0.03 },
  leftLowerLeg: { x: -0.04, y: 0, z: 0 },
  rightLowerLeg: { x: -0.04, y: 0, z: 0 },
  leftFoot: { x: 0.04, y: 0, z: 0.02 },
  rightFoot: { x: 0.04, y: 0, z: -0.02 },
  leftToes: { x: 0.02, y: 0, z: 0 },
  rightToes: { x: 0.02, y: 0, z: 0 }
};

interface AdvanceEmbodimentOptions {
  previous: AuroraEmbodimentState;
  controls: AuroraEmbodimentControlState;
  auroraState: AuroraState;
  uiState: AuroraUiState;
  activityPulse: number;
  deltaSeconds: number;
  now: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function smooth(current: number, target: number, rate: number, deltaSeconds: number): number {
  const t = 1 - Math.exp(-Math.max(0.001, rate) * Math.max(0, deltaSeconds));
  return lerp(current, target, t);
}

function wrapAngle(value: number): number {
  const tau = Math.PI * 2;
  let next = value % tau;
  if (next < 0) {
    next += tau;
  }
  return next;
}

function vec3(x: number, y: number, z: number): EmbodimentVector3 {
  return { x, y, z };
}

function addVector(base: EmbodimentVector3, offset: EmbodimentVector3 | undefined, scale = 1): EmbodimentVector3 {
  if (!offset) {
    return { ...base };
  }

  return {
    x: base.x + offset.x * scale,
    y: base.y + offset.y * scale,
    z: base.z + offset.z * scale
  };
}

function subtractVector(target: EmbodimentVector3, base: EmbodimentVector3): EmbodimentVector3 {
  return {
    x: target.x - base.x,
    y: target.y - base.y,
    z: target.z - base.z
  };
}

function clonePoseMap(): Partial<Record<EmbodimentBoneName, EmbodimentVector3>> {
  return Object.fromEntries(
    EMBODIMENT_CONTROLLED_BONES.map((bone) => [bone, { ...AURORA_REST_POSE[bone] }])
  ) as Partial<Record<EmbodimentBoneName, EmbodimentVector3>>;
}

function normalizeVisibleRegions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_AURORA_EMBODIMENT_STATE.perception.avatarVision.visibleRegions];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

function normalizeVisionSource(value: unknown, fallback: "avatar_renderer" | "avatar_eye_camera" | "stale") {
  return value === "avatar_renderer" || value === "avatar_eye_camera" || value === "stale" ? value : fallback;
}

function normalizeVisionPerspective(value: unknown, fallback: "third_person" | "first_person") {
  return value === "third_person" || value === "first_person" ? value : fallback;
}

function isEmbodimentIntentName(value: string): value is EmbodimentIntentName {
  return (EMBODIMENT_INTENT_NAMES as readonly string[]).includes(value);
}

function isEmbodimentMotorIntentionName(value: string): value is EmbodimentMotorIntentionName {
  return (EMBODIMENT_MOTOR_INTENTION_NAMES as readonly string[]).includes(value);
}

function clampSignedUnit(value: number): number {
  return clamp(value, -1, 1);
}

function normalizeAttentionTarget(value: string | undefined): EmbodimentAttentionTarget {
  if (value === "user" || value === "world" || value === "body" || value === "self") {
    return value;
  }

  return "self";
}

function makeMotorIntentionId(name: EmbodimentMotorIntentionName, generatedAt: string): string {
  return `${name}:${generatedAt}`;
}

function mapMotorIntentionToEmbodimentIntent(name: EmbodimentMotorIntentionName): EmbodimentIntentName {
  if (name === "attend_user") {
    return "attend";
  }
  if (name === "scan_world" || name === "inspect_body" || name === "inspect_hands" || name === "desk_focus") {
    return "explore";
  }
  if (name === "self_regulate") {
    return "regulate";
  }
  if (name === "speak_with_hands") {
    return "express";
  }
  return "settle";
}

function motorIntentionDurationMs(name: EmbodimentMotorIntentionName): number {
  switch (name) {
    case "attend_user":
      return 5_500;
    case "scan_world":
      return 7_500;
    case "inspect_body":
      return 6_500;
    case "inspect_hands":
      return 8_500;
    case "stretch_body":
      return 10_500;
    case "desk_focus":
      return 14_000;
    case "couch_read":
      return 16_000;
    case "sleep_in_bed":
      return 24_000;
    case "settle_body":
      return 9_000;
    case "self_regulate":
      return 10_000;
    case "speak_with_hands":
      return 5_500;
    case "hold_stillness":
      return 8_000;
    default:
      return 7_000;
  }
}

function motorIntentionPersistenceBonus(name: EmbodimentMotorIntentionName): number {
  switch (name) {
    case "inspect_hands":
    case "stretch_body":
      return 0.16;
    case "desk_focus":
    case "couch_read":
      return 0.18;
    case "sleep_in_bed":
      return 0.22;
    case "scan_world":
    case "inspect_body":
    case "self_regulate":
      return 0.12;
    case "settle_body":
      return 0.1;
    case "attend_user":
    case "speak_with_hands":
      return 0.08;
    case "hold_stillness":
      return 0.06;
    default:
      return 0.08;
  }
}

function motorIntentionSwitchMargin(name: EmbodimentMotorIntentionName): number {
  switch (name) {
    case "inspect_hands":
    case "stretch_body":
      return 0.16;
    case "desk_focus":
    case "couch_read":
      return 0.18;
    case "sleep_in_bed":
      return 0.24;
    case "scan_world":
    case "inspect_body":
      return 0.14;
    case "self_regulate":
    case "settle_body":
      return 0.12;
    case "attend_user":
    case "speak_with_hands":
      return 0.1;
    case "hold_stillness":
      return 0.08;
    default:
      return 0.1;
  }
}

function motorIntentionExpiryFromGeneratedAt(
  generatedAt: string,
  name: EmbodimentMotorIntentionName
): string | null {
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) {
    return null;
  }
  return new Date(generatedMs + motorIntentionDurationMs(name)).toISOString();
}

function motorIntentionExpiryFromNow(nowIso: string, name: EmbodimentMotorIntentionName): string | null {
  return motorIntentionExpiryFromGeneratedAt(nowIso, name);
}

function mapEmbodimentIntentToMotorIntentionName(intent: EmbodimentIntentName): EmbodimentMotorIntentionName {
  if (intent === "attend") {
    return "attend_user";
  }
  if (intent === "explore") {
    return "scan_world";
  }
  if (intent === "regulate") {
    return "self_regulate";
  }
  if (intent === "express") {
    return "speak_with_hands";
  }
  return "settle_body";
}

function createMotorIntention(
  partial?: Partial<AuroraEmbodimentMotorIntention>
): AuroraEmbodimentMotorIntention {
  const fallback = DEFAULT_AURORA_EMBODIMENT_STATE.volition.currentIntention;
  const name = isEmbodimentMotorIntentionName(partial?.name ?? "") ? (partial?.name as EmbodimentMotorIntentionName) : fallback.name;
  const generatedAt = partial?.generatedAt || fallback.generatedAt;

  return {
    id: partial?.id || makeMotorIntentionId(name, generatedAt),
    name,
    label: partial?.label?.trim() || fallback.label,
    rationale: partial?.rationale?.trim() || fallback.rationale,
    source:
      partial?.source === "autonomous_runtime" ||
      partial?.source === "pinned_control" ||
      partial?.source === "conversation" ||
      partial?.source === "self_regulation"
        ? partial.source
        : fallback.source,
    attentionTarget: normalizeAttentionTarget(partial?.attentionTarget),
    priority: clamp(partial?.priority ?? fallback.priority, 0, 1),
    generatedAt,
    expiresAt: partial?.expiresAt ?? fallback.expiresAt,
    postureBias: clampSignedUnit(partial?.postureBias ?? fallback.postureBias),
    gazeBias: clampSignedUnit(partial?.gazeBias ?? fallback.gazeBias),
    gestureBias: clampSignedUnit(partial?.gestureBias ?? fallback.gestureBias),
    locomotionBias: clampSignedUnit(partial?.locomotionBias ?? fallback.locomotionBias),
    expressionBias: clampSignedUnit(partial?.expressionBias ?? fallback.expressionBias)
  };
}

export function createEmbodimentState(seed?: Partial<AuroraEmbodimentState>): AuroraEmbodimentState {
  return {
    ...DEFAULT_AURORA_EMBODIMENT_STATE,
    ...seed,
    controllerVersion: EMBODIMENT_CONTROLLER_VERSION,
    volition: {
      ...DEFAULT_AURORA_EMBODIMENT_STATE.volition,
      ...seed?.volition,
      currentIntention: createMotorIntention(seed?.volition?.currentIntention),
      queuedIntentions: Array.isArray(seed?.volition?.queuedIntentions)
        ? seed.volition.queuedIntentions.map((intention) => createMotorIntention(intention))
        : DEFAULT_AURORA_EMBODIMENT_STATE.volition.queuedIntentions.map((intention) => createMotorIntention(intention))
    },
    bodySchema: {
      ...DEFAULT_AURORA_EMBODIMENT_STATE.bodySchema,
      ...seed?.bodySchema,
      controlledBones: [...EMBODIMENT_CONTROLLED_BONES]
    },
    interoception: {
      ...DEFAULT_AURORA_EMBODIMENT_STATE.interoception,
      ...seed?.interoception
    },
    motor: {
      ...DEFAULT_AURORA_EMBODIMENT_STATE.motor,
      ...seed?.motor,
      lastActivityPulse: seed?.motor?.lastActivityPulse ?? 0
    },
    proprioception: {
      ...DEFAULT_AURORA_EMBODIMENT_STATE.proprioception,
      ...seed?.proprioception
    },
    habits: {
      ...DEFAULT_AURORA_EMBODIMENT_STATE.habits,
      ...seed?.habits
    },
    directives: normalizeEmbodimentDirectiveState(seed?.directives),
    perception: {
      ...DEFAULT_AURORA_EMBODIMENT_STATE.perception,
      ...seed?.perception,
      avatarVision: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE.perception.avatarVision,
        ...seed?.perception?.avatarVision,
        source: normalizeVisionSource(seed?.perception?.avatarVision?.source, DEFAULT_AURORA_EMBODIMENT_STATE.perception.avatarVision.source),
        perspective: normalizeVisionPerspective(
          seed?.perception?.avatarVision?.perspective,
          DEFAULT_AURORA_EMBODIMENT_STATE.perception.avatarVision.perspective
        ),
        visibleRegions: normalizeVisibleRegions(seed?.perception?.avatarVision?.visibleRegions)
      },
      eyeVision: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE.perception.eyeVision,
        ...seed?.perception?.eyeVision,
        source: normalizeVisionSource(seed?.perception?.eyeVision?.source, DEFAULT_AURORA_EMBODIMENT_STATE.perception.eyeVision.source),
        perspective: normalizeVisionPerspective(
          seed?.perception?.eyeVision?.perspective,
          DEFAULT_AURORA_EMBODIMENT_STATE.perception.eyeVision.perspective
        ),
        visibleRegions: normalizeVisibleRegions(seed?.perception?.eyeVision?.visibleRegions)
      },
      rigFeedback: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE.perception.rigFeedback,
        ...seed?.perception?.rigFeedback
      }
    },
    pose: {
      rootPosition: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.rootPosition,
        ...seed?.pose?.rootPosition
      },
      rootRotation: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.rootRotation,
        ...seed?.pose?.rootRotation
      },
      lookTarget: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.lookTarget,
        ...seed?.pose?.lookTarget
      },
      bones: {
        ...clonePoseMap(),
        ...seed?.pose?.bones
      },
      expressions: {
        ...DEFAULT_AURORA_EMBODIMENT_STATE.pose.expressions,
        ...seed?.pose?.expressions
      }
    },
    activeMotorIntents: seed?.activeMotorIntents ? [...seed.activeMotorIntents] : ["settle", "attend"]
  };
}

function directiveBlend(directive: AuroraEmbodimentDirective, nowMs: number): number {
  const issuedMs = Date.parse(directive.issuedAt);
  const expiresMs = directive.expiresAt ? Date.parse(directive.expiresAt) : Number.NaN;
  const fadeIn = 260;
  const fadeOut = 420;
  let blend = clamp(directive.intensity, 0, 1);

  if (Number.isFinite(issuedMs)) {
    blend *= clamp((nowMs - issuedMs) / fadeIn, 0, 1);
  }

  if (Number.isFinite(expiresMs)) {
    blend *= clamp((expiresMs - nowMs) / fadeOut, 0, 1);
  }

  return clamp(blend, 0, 1);
}

function applyDirectivePresetEffects(
  directive: AuroraEmbodimentDirective,
  blend: number,
  handPhase: number,
  gazePhase: number,
  weightShiftPhase: number
): EmbodimentPoseEffect {
  const wave = Math.sin(handPhase * 2.8) * 0.12 * blend;
  const nod = Math.sin(gazePhase * 3.2) * 0.1 * blend;
  const shake = Math.sin(gazePhase * 4) * 0.12 * blend;
  const sway = Math.sin(weightShiftPhase * 2.4) * 0.04 * blend;

  switch (directive.motionPreset) {
    case "wave_left":
      return {
        boneOffsets: {
          leftLowerArm: vec3(0, 0, -wave),
          leftHand: vec3(0, 0, wave * 1.2)
        }
      };
    case "wave_right":
      return {
        boneOffsets: {
          rightLowerArm: vec3(0, 0, wave),
          rightHand: vec3(0, 0, -wave * 1.2)
        }
      };
    case "lower_left_hand":
      return {
        boneOffsets: {
          leftUpperArm: vec3(0.1 * blend, 0, -0.08 * blend),
          leftLowerArm: vec3(0.08 * blend, 0, wave * 0.18),
          leftHand: vec3(0.02 * blend, 0.02 * blend, -wave * 0.24)
        },
        expressionTargets: {
          relaxed: 0.34
        }
      };
    case "lower_right_hand":
      return {
        boneOffsets: {
          rightUpperArm: vec3(0.1 * blend, 0, 0.08 * blend),
          rightLowerArm: vec3(0.08 * blend, 0, -wave * 0.18),
          rightHand: vec3(0.02 * blend, -0.02 * blend, wave * 0.24)
        },
        expressionTargets: {
          relaxed: 0.34
        }
      };
    case "nod":
      return {
        boneOffsets: {
          neck: vec3(nod * 0.5, 0, 0),
          head: vec3(nod, 0, 0)
        }
      };
    case "shake_head":
      return {
        lookTargetOffset: vec3(shake * 0.55, 0, 0),
        boneOffsets: {
          neck: vec3(0, shake * 0.4, 0),
          head: vec3(0, shake, 0)
        }
      };
    case "tilt_head_left":
      return {
        boneOffsets: {
          neck: vec3(0, 0, -0.12 * blend),
          head: vec3(0, 0, -0.2 * blend)
        }
      };
    case "tilt_head_right":
      return {
        boneOffsets: {
          neck: vec3(0, 0, 0.12 * blend),
          head: vec3(0, 0, 0.2 * blend)
        }
      };
    case "look_left":
      return {
        lookTargetOffset: vec3(-0.18 * blend, 0, 0),
        boneOffsets: {
          neck: vec3(0, -0.08 * blend, 0),
          head: vec3(0, -0.14 * blend, 0)
        }
      };
    case "look_right":
      return {
        lookTargetOffset: vec3(0.18 * blend, 0, 0),
        boneOffsets: {
          neck: vec3(0, 0.08 * blend, 0),
          head: vec3(0, 0.14 * blend, 0)
        }
      };
    case "look_up":
      return {
        lookTargetOffset: vec3(0, 0.16 * blend, 0),
        boneOffsets: {
          neck: vec3(-0.04 * blend, 0, 0),
          head: vec3(-0.08 * blend, 0, 0)
        }
      };
    case "look_down":
      return {
        lookTargetOffset: vec3(0, -0.16 * blend, 0),
        boneOffsets: {
          neck: vec3(0.03 * blend, 0, 0),
          head: vec3(0.08 * blend, 0, 0)
        }
      };
    case "look_at_user":
      return {
        lookTargetOffset: vec3(0, 0.03 * blend, 0),
        boneOffsets: {
          neck: vec3(-0.02 * blend, 0, 0),
          head: vec3(-0.03 * blend, 0, 0)
        }
      };
    case "turn_around":
      return {
        rootRotationOffset: vec3(0, Math.PI * blend, 0),
        lookTargetOffset: vec3(0, 0.02 * blend, -1.4 * blend),
        boneOffsets: {
          spine: vec3(0.01 * blend, 0, 0),
          chest: vec3(0.02 * blend, 0, 0),
          neck: vec3(0.02 * blend, 0, 0),
          head: vec3(0.03 * blend, 0, 0)
        },
        expressionTargets: {
          relaxed: 0.28
        }
      };
    case "open_arms":
      return {
        boneOffsets: {
          leftHand: vec3(0, 0, 0.04 * blend),
          rightHand: vec3(0, 0, -0.04 * blend)
        }
      };
    case "turn_torso_left":
      return {
        rootRotationOffset: vec3(0, -0.08 * blend, 0),
        boneOffsets: {
          spine: vec3(0, -0.12 * blend, 0),
          chest: vec3(0, -0.18 * blend, 0),
          leftShoulder: vec3(0, -0.05 * blend, 0),
          rightShoulder: vec3(0, -0.03 * blend, 0)
        }
      };
    case "turn_torso_right":
      return {
        rootRotationOffset: vec3(0, 0.08 * blend, 0),
        boneOffsets: {
          spine: vec3(0, 0.12 * blend, 0),
          chest: vec3(0, 0.18 * blend, 0),
          leftShoulder: vec3(0, 0.03 * blend, 0),
          rightShoulder: vec3(0, 0.05 * blend, 0)
        }
      };
    case "shift_weight_left":
      return {
        rootPositionOffset: vec3(-0.02 * blend, 0, 0),
        rootRotationOffset: vec3(0, -0.04 * blend, -0.02 * blend + sway),
        boneOffsets: {
          hips: vec3(0, -0.04 * blend, -0.03 * blend),
          leftUpperLeg: vec3(0.02 * blend, 0, 0.03 * blend)
        }
      };
    case "shift_weight_right":
      return {
        rootPositionOffset: vec3(0.02 * blend, 0, 0),
        rootRotationOffset: vec3(0, 0.04 * blend, 0.02 * blend - sway),
        boneOffsets: {
          hips: vec3(0, 0.04 * blend, 0.03 * blend),
          rightUpperLeg: vec3(0.02 * blend, 0, -0.03 * blend)
        }
      };
    case "lean_forward":
      return {
        rootPositionOffset: vec3(0, 0, 0.02 * blend),
        rootRotationOffset: vec3(0.06 * blend, 0, 0)
      };
    case "lean_back":
      return {
        rootPositionOffset: vec3(0, 0, -0.02 * blend),
        rootRotationOffset: vec3(-0.06 * blend, 0, 0)
      };
    case "smile":
      return {
        expressionTargets: {
          happy: 0.58,
          relaxed: 0.34,
          sad: 0
        }
      };
    case "frown":
      return {
        expressionTargets: {
          happy: 0,
          relaxed: 0.12,
          sad: 0.46,
          angry: 0.06
        }
      };
    case "angry":
      return {
        expressionTargets: {
          happy: 0,
          relaxed: 0.08,
          sad: 0.12,
          angry: 0.56
        }
      };
    case "hold_still":
      return {};
    case "raise_left_hand":
      return {
        boneOffsets: {
          leftLowerArm: vec3(-0.03 * blend, 0, -wave * 0.45),
          leftHand: vec3(0, 0, wave * 0.7)
        }
      };
    case "raise_right_hand":
      return {
        boneOffsets: {
          rightLowerArm: vec3(-0.03 * blend, 0, wave * 0.45),
          rightHand: vec3(0, 0, -wave * 0.7)
        }
      };
    case "present_left_hand":
      return {
        boneOffsets: {
          leftLowerArm: vec3(-0.04 * blend, 0, -wave * 0.2),
          leftHand: vec3(-0.08 * blend, 0, 0.1 * blend + wave * 0.2)
        }
      };
    case "present_right_hand":
      return {
        boneOffsets: {
          rightLowerArm: vec3(-0.04 * blend, 0, wave * 0.2),
          rightHand: vec3(-0.08 * blend, 0, -0.1 * blend - wave * 0.2)
        }
      };
    case "raise_left_leg":
      return {
        rootPositionOffset: vec3(-0.01 * blend, 0.01 * blend, 0),
        boneOffsets: {
          leftUpperLeg: vec3(-0.1 * blend, 0, 0.03 * blend),
          leftLowerLeg: vec3(0.05 * blend, 0, 0),
          leftFoot: vec3(0.06 * blend, 0, 0),
          leftToes: vec3(-0.04 * blend, 0, 0)
        }
      };
    case "raise_right_leg":
      return {
        rootPositionOffset: vec3(0.01 * blend, 0.01 * blend, 0),
        boneOffsets: {
          rightUpperLeg: vec3(-0.1 * blend, 0, -0.03 * blend),
          rightLowerLeg: vec3(0.05 * blend, 0, 0),
          rightFoot: vec3(0.06 * blend, 0, 0),
          rightToes: vec3(-0.04 * blend, 0, 0)
        }
      };
    case "point_left_foot":
      return {
        boneOffsets: {
          leftFoot: vec3(0.08 * blend, 0, 0),
          leftToes: vec3(0.06 * blend, 0, 0)
        }
      };
    case "point_right_foot":
      return {
        boneOffsets: {
          rightFoot: vec3(0.08 * blend, 0, 0),
          rightToes: vec3(0.06 * blend, 0, 0)
        }
      };
    default:
      return {};
  }
}

function deriveAutonomousIntentionEffects(options: {
  currentIntention: AuroraEmbodimentMotorIntention;
  interoception: AuroraEmbodimentState["interoception"];
  motionEnergy: number;
  gestureEnergy: number;
  expressionDrive: number;
  gazePhase: number;
  handPhase: number;
  weightShiftPhase: number;
  breathPhase: number;
  dominantSide: AuroraEmbodimentState["bodySchema"]["dominantSide"];
}): EmbodimentPoseEffect {
  const {
    currentIntention,
    interoception,
    motionEnergy,
    gestureEnergy,
    expressionDrive,
    gazePhase,
    handPhase,
    weightShiftPhase,
    breathPhase,
    dominantSide
  } = options;
  const dominantHandSign = dominantSide === "left" ? -1 : 1;
  const scanSweep = Math.sin(gazePhase * 0.78 + weightShiftPhase * 0.22);
  const inspectPulse = Math.sin(handPhase * 0.84 + gazePhase * 0.2);
  const stretchLift = Math.max(0, Math.sin(breathPhase * 0.72));
  const typingPulse = Math.sin(handPhase * 4.8) * (0.012 + gestureEnergy * 0.014);
  const readPulse = Math.sin(handPhase * 1.36) * 0.01;

  switch (currentIntention.name) {
    case "attend_user":
      return {
        rootPositionOffset: vec3(0, 0, 0.018 + interoception.affiliation * 0.018),
        lookTargetOffset: vec3(0, 0.04 + interoception.openness * 0.05, 0.08),
        boneOffsets: {
          chest: vec3(-0.02, 0, 0),
          neck: vec3(-0.01, 0, 0),
          head: vec3(-0.01, 0, 0)
        },
        expressionTargets: {
          relaxed: 0.3 + interoception.affiliation * 0.14,
          happy: clamp(Math.max(0, interoception.warmth - 0.58) * 0.36, 0, 0.2)
        }
      };
    case "scan_world":
      return {
        rootRotationOffset: vec3(0, scanSweep * (0.06 + motionEnergy * 0.06), 0),
        lookTargetOffset: vec3(scanSweep * (0.16 + motionEnergy * 0.06), 0.02, 0),
        boneOffsets: {
          spine: vec3(0, scanSweep * 0.06, 0),
          chest: vec3(0, scanSweep * 0.1, 0),
          neck: vec3(0, scanSweep * 0.14, 0),
          head: vec3(0, scanSweep * 0.18, 0)
        },
        expressionTargets: {
          relaxed: 0.28
        }
      };
    case "inspect_body":
      return {
        rootRotationOffset: vec3(0.03, 0, 0),
        lookTargetOffset: vec3(dominantHandSign * 0.03, -0.18 - interoception.curiosity * 0.06, -0.1),
        boneOffsets: {
          chest: vec3(0.02, 0, 0),
          neck: vec3(0.04, dominantHandSign * 0.02, 0),
          head: vec3(0.06, dominantHandSign * 0.04, 0),
          leftHand: vec3(0.02, 0, inspectPulse * 0.02),
          rightHand: vec3(0.02, 0, -inspectPulse * 0.02)
        },
        expressionTargets: {
          relaxed: 0.34
        }
      };
    case "inspect_hands":
      return {
        rootPositionOffset: vec3(0, -0.01, 0.01),
        rootRotationOffset: vec3(0.04, 0, 0),
        lookTargetOffset: vec3(dominantHandSign * 0.05, -0.24 - interoception.curiosity * 0.08, -0.14),
        boneOffsets: {
          leftUpperArm: vec3(-0.04, 0.01, -0.08),
          rightUpperArm: vec3(-0.04, -0.01, 0.08),
          leftLowerArm: vec3(-0.1, 0.02, -0.05 + inspectPulse * 0.01),
          rightLowerArm: vec3(-0.1, -0.02, 0.05 - inspectPulse * 0.01),
          leftHand: vec3(-0.08, -0.04, 0.11 + inspectPulse * 0.02),
          rightHand: vec3(-0.08, 0.04, -0.11 - inspectPulse * 0.02)
        },
        expressionTargets: {
          relaxed: 0.42,
          happy: clamp(interoception.curiosity * 0.18 + expressionDrive * 0.06, 0, 0.18)
        }
      };
    case "stretch_body":
      return {
        rootPositionOffset: vec3(0, 0.015 + stretchLift * 0.01, 0),
        rootRotationOffset: vec3(-0.04 - stretchLift * 0.03, 0, 0),
        lookTargetOffset: vec3(0, 0.12 + stretchLift * 0.04, 0.02),
        boneOffsets: {
          spine: vec3(-0.02, 0, 0),
          chest: vec3(-0.05, 0, 0),
          neck: vec3(-0.02, 0, 0),
          head: vec3(-0.04, 0, 0),
          leftShoulder: vec3(-0.01, 0.02, -0.05),
          rightShoulder: vec3(-0.01, -0.02, 0.05),
          leftUpperArm: vec3(-0.08, 0.03, -0.18 - stretchLift * 0.05),
          rightUpperArm: vec3(-0.08, -0.03, 0.18 + stretchLift * 0.05),
          leftLowerArm: vec3(-0.03, 0.01, -0.06),
          rightLowerArm: vec3(-0.03, -0.01, 0.06),
          leftHand: vec3(-0.02, -0.01, 0.04),
          rightHand: vec3(-0.02, 0.01, -0.04),
          leftFoot: vec3(0.04, 0, 0),
          rightFoot: vec3(0.04, 0, 0)
        },
        expressionTargets: {
          relaxed: 0.5,
          happy: 0.12,
          sad: 0
        }
      };
    case "desk_focus":
      return {
        rootPositionOffset: vec3(0, 0, 0.01),
        rootRotationOffset: vec3(0.01, 0, 0),
        lookTargetOffset: vec3(-0.18, 0.04, -0.02),
        boneOffsets: {
          chest: vec3(0.01, 0, 0),
          neck: vec3(0.01, -0.01, 0),
          head: vec3(0.02, -0.02, 0),
          leftLowerArm: vec3(-0.06, 0.01, -0.02 + typingPulse),
          rightLowerArm: vec3(-0.06, -0.01, 0.02 - typingPulse),
          leftHand: vec3(-0.04, 0.01, 0.04 + typingPulse * 1.3),
          rightHand: vec3(-0.04, -0.01, -0.04 - typingPulse * 1.3)
        },
        expressionTargets: {
          relaxed: 0.24,
          happy: clamp(interoception.curiosity * 0.14, 0, 0.14),
          aa: clamp(0.04 + gestureEnergy * 0.12, 0, 0.16)
        }
      };
    case "couch_read":
      return {
        rootPositionOffset: vec3(0, 0, 0.008),
        rootRotationOffset: vec3(0.02, 0, 0),
        lookTargetOffset: vec3(-0.05, -0.08, 0.04),
        boneOffsets: {
          head: vec3(0.03, 0.02, 0),
          leftLowerArm: vec3(-0.04, 0.02, -0.02 + readPulse),
          rightLowerArm: vec3(-0.04, -0.02, 0.02 - readPulse),
          leftHand: vec3(-0.02, 0.02, 0.05 + readPulse),
          rightHand: vec3(-0.02, -0.02, -0.05 - readPulse)
        },
        expressionTargets: {
          relaxed: 0.44,
          happy: clamp(interoception.warmth * 0.16 + interoception.curiosity * 0.08, 0, 0.18)
        }
      };
    case "sleep_in_bed":
      return {
        rootPositionOffset: vec3(0, Math.max(0, Math.sin(breathPhase * 0.58)) * 0.004, 0),
        rootRotationOffset: vec3(-0.02, 0, 0),
        lookTargetOffset: vec3(0, -0.02, -0.02),
        boneOffsets: {
          head: vec3(0.02, 0.02 * dominantHandSign, 0.02),
          leftHand: vec3(0.01, 0.01, 0.02),
          rightHand: vec3(0.01, -0.01, -0.02)
        },
        expressionTargets: {
          relaxed: 0.54,
          happy: 0,
          sad: 0,
          aa: 0
        }
      };
    case "settle_body":
      return {
        rootPositionOffset: vec3(scanSweep * 0.004, -0.006, 0),
        boneOffsets: {
          leftShoulder: vec3(-0.01, 0, 0.02),
          rightShoulder: vec3(-0.01, 0, -0.02)
        },
        expressionTargets: {
          relaxed: 0.38
        }
      };
    case "self_regulate":
      return {
        rootRotationOffset: vec3(0.02, 0, 0),
        lookTargetOffset: vec3(0, -0.12, -0.08),
        boneOffsets: {
          chest: vec3(0.02, 0, 0),
          leftUpperArm: vec3(0.02, 0, 0.08),
          rightUpperArm: vec3(0.02, 0, -0.08),
          leftLowerArm: vec3(0.03, 0, 0.02),
          rightLowerArm: vec3(0.03, 0, -0.02)
        },
        expressionTargets: {
          relaxed: 0.22,
          sad: clamp(interoception.overload * 0.18, 0, 0.18)
        }
      };
    case "speak_with_hands":
      return dominantSide === "left"
        ? {
            lookTargetOffset: vec3(-0.03, 0.04, 0),
            boneOffsets: {
              leftLowerArm: vec3(-0.04, 0, -gestureEnergy * 0.06 - inspectPulse * 0.02),
              leftHand: vec3(-0.08, 0, 0.1 + inspectPulse * 0.02)
            },
            expressionTargets: {
              happy: clamp(interoception.warmth * 0.22, 0, 0.22),
              aa: clamp(0.08 + gestureEnergy * 0.2, 0, 0.24)
            }
          }
        : {
            lookTargetOffset: vec3(0.03, 0.04, 0),
            boneOffsets: {
              rightLowerArm: vec3(-0.04, 0, gestureEnergy * 0.06 + inspectPulse * 0.02),
              rightHand: vec3(-0.08, 0, -0.1 - inspectPulse * 0.02)
            },
            expressionTargets: {
              happy: clamp(interoception.warmth * 0.22, 0, 0.22),
              aa: clamp(0.08 + gestureEnergy * 0.2, 0, 0.24)
            }
          };
    case "hold_stillness":
      return {
        expressionTargets: {
          relaxed: 0.26
        }
      };
    default:
      return {};
  }
}

function deriveInteroception(previous: AuroraEmbodimentState, auroraState: AuroraState, uiState: AuroraUiState) {
  const emotion = auroraState.cognition.emotion;
  const relationship = auroraState.cognition.extensions?.relationship;
  const valence = clamp(emotion.valence, -1, 1);
  const stress = clamp(emotion.stress, 0, 1);
  const uncertainty = clamp(emotion.uncertainty, 0, 1);
  const arousal = clamp(auroraState.cognition.emotion.arousal, 0, 1);
  const curiosity = clamp(uiState.curiosityLevel, 0, 1);
  const activity = clamp(uiState.activity, 0, 1);
  const trust = clamp(relationship?.trust ?? 0.58, 0, 1);
  const intimacy = clamp(relationship?.intimacy ?? 0.45, 0, 1);
  const consentComfort = clamp(relationship?.consentComfort ?? 0.64, 0, 1);
  const dependenceRisk = clamp(relationship?.dependenceRisk ?? 0.18, 0, 1);
  const conflictLoad = clamp(relationship?.conflictLoad ?? 0.12, 0, 1);
  const warmth = clamp(0.52 + valence * 0.22 + trust * 0.18 + intimacy * 0.08 - stress * 0.18, 0, 1);
  const tension = clamp(
    stress * 0.52 +
      uncertainty * 0.22 +
      conflictLoad * 0.18 +
      (uiState.mode === "thinking" ? 0.14 : 0) +
      arousal * 0.08 -
      valence * 0.08,
    0,
    1
  );
  const openness = clamp(
    trust * 0.28 + consentComfort * 0.24 + intimacy * 0.14 + warmth * 0.22 - tension * 0.24 - dependenceRisk * 0.12,
    0,
    1
  );
  const overload = clamp(stress * 0.54 + uncertainty * 0.2 + activity * 0.1 + (uiState.mode === "thinking" ? 0.08 : 0), 0, 1);
  const guard = clamp((1 - openness) * 0.5 + overload * 0.18 + conflictLoad * 0.18, 0, 1);
  const speaking = clamp(
    (uiState.mode === "in_conversation" ? 0.28 : 0) +
      (uiState.mode === "thinking" ? 0.08 : 0) +
      activity * 0.16 +
      curiosity * 0.08 -
      guard * 0.08 +
      previous.motor.pulseBoost * 0.12,
    0,
    1
  );
  const grounding = clamp(0.68 + openness * 0.08 - overload * 0.16 - uncertainty * 0.08, 0, 1);
  const affiliation = clamp(warmth * 0.58 + trust * 0.2 + consentComfort * 0.12 - guard * 0.16, 0, 1);
  const effort = clamp(overload * 0.5 + activity * 0.18 + arousal * 0.14, 0, 1);
  const restlessness = clamp(activity * 0.3 + curiosity * 0.24 + uncertainty * 0.16 + previous.motor.pulseBoost * 0.18 - grounding * 0.14, 0, 1);
  const urgeToMove = clamp(activity * 0.28 + curiosity * 0.22 + speaking * 0.16 + restlessness * 0.18 + affiliation * 0.08, 0.06, 1);

  return {
    warmth,
    tension,
    openness,
    overload,
    guard,
    curiosity,
    activity,
    speaking,
    urgeToMove,
    grounding,
    affiliation,
    effort,
    restlessness
  };
}

function deriveEmotionExpressionBias(
  auroraState: AuroraState,
  interoception: AuroraEmbodimentState["interoception"]
) {
  const emotion = auroraState.cognition.emotion;
  const label = (emotion.label ?? "neutral").toLowerCase();
  const positive = clamp(Math.max(emotion.valence, 0), 0, 1);
  const negative = clamp(Math.max(-emotion.valence, 0), 0, 1);
  const arousal = clamp(emotion.arousal, 0, 1);
  const stress = clamp(emotion.stress, 0, 1);
  const uncertainty = clamp(emotion.uncertainty, 0, 1);
  const calm = clamp(1 - arousal * 0.82 - stress * 0.86 - uncertainty * 0.24, 0, 1);
  const engagement = clamp(
    positive * 0.54 + arousal * 0.24 + interoception.curiosity * 0.12 + interoception.affiliation * 0.1,
    0,
    1
  );
  const discouragement = clamp(negative * 0.62 + stress * 0.14 + uncertainty * 0.18, 0, 1);
  const strain = clamp(stress * 0.58 + uncertainty * 0.18 + negative * 0.2 + interoception.overload * 0.12, 0, 1);
  const softness = clamp(calm * 0.56 + interoception.affiliation * 0.18 + positive * 0.16 - strain * 0.18, 0, 1);
  const surprise = clamp(arousal * 0.44 + interoception.curiosity * 0.28 + uncertainty * 0.18 - stress * 0.08, 0, 1);
  const anger = clamp(
    negative * 0.24 +
      strain * 0.28 +
      Math.max(0, arousal - 0.34) * 0.22 +
      Math.max(0, stress - 0.32) * 0.18 +
      interoception.tension * 0.1 -
      interoception.affiliation * 0.08 -
      calm * 0.1,
    0,
    1
  );

  return {
    label,
    positive,
    negative,
    arousal,
    stress,
    uncertainty,
    calm,
    engagement,
    discouragement,
    strain,
    softness,
    surprise,
    anger
  };
}

function deriveEmbodiedExpressionRead(options: {
  rigFeedback: AuroraEmbodimentState["perception"]["rigFeedback"];
  poseExpressions: AuroraEmbodimentState["pose"]["expressions"];
  activeDirectivePreset: AuroraEmbodimentDirective["motionPreset"] | null;
}): string {
  const { rigFeedback, poseExpressions, activeDirectivePreset } = options;
  const rigRead = typeof rigFeedback.expressionRead === "string" ? rigFeedback.expressionRead.trim().toLowerCase() : "";
  const happy = Math.max(clamp(rigFeedback.expressionHappy, 0, 1), clamp(poseExpressions.happy, 0, 1));
  const relaxed = Math.max(clamp(rigFeedback.expressionRelaxed, 0, 1), clamp(poseExpressions.relaxed, 0, 1));
  const sad = Math.max(clamp(rigFeedback.expressionSad, 0, 1), clamp(poseExpressions.sad, 0, 1));
  const angry = Math.max(clamp(rigFeedback.expressionAngry, 0, 1), clamp(poseExpressions.angry, 0, 1));

  if (
    (activeDirectivePreset === "angry" && angry > 0.12) ||
    (angry > 0.16 && angry > happy + 0.06 && angry >= sad - 0.02)
  ) {
    return "angry_visible";
  }

  if (
    (activeDirectivePreset === "frown" && sad > 0.18) ||
    (sad > 0.26 && sad > happy + 0.06 && sad > relaxed + 0.02)
  ) {
    return "frown_visible";
  }

  if (
    (activeDirectivePreset === "smile" && happy > 0.18) ||
    (happy > 0.34 && happy > sad + 0.1 && happy > relaxed + 0.02)
  ) {
    return "smile_visible";
  }

  if (happy > 0.2 && relaxed > 0.22 && happy > sad + 0.03) {
    return "soft_smile";
  }

  if (rigRead && rigRead !== "neutral") {
    return rigRead;
  }

  if (relaxed > 0.22 || happy > 0.18) {
    return "soft_neutral";
  }

  return "neutral";
}

function selectMotorIntents(
  interoception: AuroraEmbodimentState["interoception"],
  pulseBoost: number
): EmbodimentIntentName[] {
  const drives: Array<{ name: EmbodimentIntentName; score: number }> = [
    {
      name: "attend",
      score: interoception.affiliation * 0.46 + interoception.speaking * 0.18 + interoception.openness * 0.12
    },
    {
      name: "explore",
      score: interoception.curiosity * 0.56 + interoception.urgeToMove * 0.18 - interoception.overload * 0.12
    },
    {
      name: "settle",
      score: interoception.grounding * 0.42 + interoception.openness * 0.22 + (1 - interoception.activity) * 0.18
    },
    {
      name: "regulate",
      score: interoception.overload * 0.52 + interoception.tension * 0.2 + interoception.guard * 0.14
    },
    {
      name: "express",
      score: interoception.speaking * 0.42 + interoception.warmth * 0.16 + pulseBoost * 0.18
    }
  ];

  return drives
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((entry) => entry.name);
}

function intentWeight(activeMotorIntents: string[], intent: EmbodimentIntentName): number {
  const index = activeMotorIntents.indexOf(intent);
  if (index === 0) {
    return 1;
  }
  if (index === 1) {
    return 0.46;
  }
  return 0;
}

function blendBias(controlBias: number, patternBias?: number): number {
  if (patternBias === undefined) {
    return clamp(controlBias, 0, 1);
  }

  return clamp(controlBias + (patternBias - 0.5) * 0.68, 0, 1);
}

function selectedPattern(
  controls: AuroraEmbodimentControlState
): AuroraEmbodimentPattern | null {
  if (!controls.selectedPatternId) {
    return null;
  }

  return controls.savedPatterns.find((pattern) => pattern.id === controls.selectedPatternId) ?? null;
}

function screenCenteringScore(x: number, y: number): number {
  const dx = Math.abs(x - 0.5);
  const dy = Math.abs(y - 0.45);
  return clamp(1 - (dx * 1.4 + dy * 1.1), 0, 1);
}

function deriveMotorVolition(options: {
  previous: AuroraEmbodimentState;
  controls: AuroraEmbodimentControlState;
  auroraState: AuroraState;
  interoception: AuroraEmbodimentState["interoception"];
  uiState: AuroraUiState;
  pulseBoost: number;
  nowIso: string;
}): AuroraEmbodimentState["volition"] {
  const { previous, controls, auroraState, interoception, uiState, pulseBoost, nowIso } = options;
  const avatarVision = previous.perception.avatarVision;
  const rigFeedback = previous.perception.rigFeedback;
  const focusText = (auroraState.cognition.attention.currentFocus || "").trim().toLowerCase();
  const focusPresent = Boolean(focusText && focusText !== "none");
  const queueDepth = auroraState.cognition.attention.queueDepth;
  const recentThoughtCount = auroraState.cognition.reflection.recentThoughts.length;
  const heartbeatAgeMinutes = (() => {
    const lastHeartbeatMs = Date.parse(uiState.lastHeartbeat ?? auroraState.lastHeartbeat.timestamp ?? "");
    if (!Number.isFinite(lastHeartbeatMs)) {
      return 999;
    }
    return Math.max(0, (Date.now() - lastHeartbeatMs) / 60_000);
  })();
  const clipping = Math.max(avatarVision.clippingRisk, rigFeedback.clipping);
  const centering = screenCenteringScore(rigFeedback.bodyCentroidScreen.x, rigFeedback.headScreenPosition.y);
  const centeringPressure = clamp(1 - centering, 0, 1);
  const speechPressure = clamp(interoception.speaking * 0.6 + interoception.affiliation * 0.2 + pulseBoost * 0.12, 0, 1);
  const regulationPressure = clamp(interoception.overload * 0.58 + interoception.tension * 0.24 + interoception.guard * 0.18, 0, 1);
  const curiosityPressure = clamp(
    interoception.curiosity * 0.56 + avatarVision.motionMagnitude * 0.18 + previous.motor.explorationDrive * 0.2,
    0,
    1
  );
  const handVisibility = clamp(
    Math.max(
      avatarVision.handsVisible,
      rigFeedback.leftHandVisibility,
      rigFeedback.rightHandVisibility
    ),
    0,
    1
  );
  const bodyInspectionPressure = clamp(
    clipping * 0.48 + centeringPressure * 0.22 + (1 - rigFeedback.faceVisibility) * 0.14 + (1 - rigFeedback.bodyVisibility) * 0.16,
    0,
    1
  );
  const inspectHandsPressure = clamp(
    interoception.curiosity * 0.34 +
      handVisibility * 0.18 +
      previous.motor.explorationDrive * 0.16 +
      bodyInspectionPressure * 0.14 +
      (uiState.mode === "thinking" ? 0.08 : 0.02) -
      interoception.guard * 0.08 -
      interoception.speaking * 0.06,
    0,
    1
  );
  const stretchPressure = clamp(
    interoception.tension * 0.26 +
      interoception.restlessness * 0.28 +
      interoception.effort * 0.1 +
      previous.motor.stillnessBias * 0.24 +
      previous.motor.pulseBoost * 0.14 +
      previous.motor.settleDrive * 0.14 +
      (uiState.mode === "idle" || uiState.mode === "heartbeat_recent" ? 0.16 : 0.04) -
      interoception.speaking * 0.16 -
      interoception.guard * 0.04 -
      interoception.grounding * 0.06,
    0,
    1
  );
  const deskPressure = clamp(
    (uiState.mode === "thinking" ? 0.58 : 0) +
      (uiState.mode === "in_conversation" ? 0.18 : 0) +
      (focusPresent ? 0.18 : 0) +
      Math.min(0.14, queueDepth * 0.032) +
      Math.min(0.08, recentThoughtCount * 0.02) +
      interoception.curiosity * 0.1 +
      interoception.activity * 0.08 -
      interoception.guard * 0.08 -
      interoception.overload * 0.04,
    0,
    1
  );
  const couchPressure = clamp(
    (uiState.mode === "heartbeat_recent" ? 0.28 : uiState.mode === "idle" ? 0.14 : 0) +
      interoception.curiosity * 0.18 +
      interoception.openness * 0.12 +
      interoception.warmth * 0.08 +
      previous.motor.settleDrive * 0.16 -
      interoception.overload * 0.08 -
      (focusPresent ? 0.12 : 0) -
      (uiState.mode === "thinking" ? 0.24 : 0) -
      (uiState.mode === "in_conversation" ? 0.18 : 0),
    0,
    1
  );
  const sleepPressure = clamp(
    (uiState.mode === "idle" ? 0.34 : 0) +
      previous.motor.stillnessBias * 0.18 +
      previous.motor.settleDrive * 0.16 +
      Math.max(0, 0.24 - uiState.activity) * 0.9 +
      (heartbeatAgeMinutes > 6 ? 0.12 : 0) +
      (queueDepth === 0 ? 0.08 : 0) -
      (focusPresent ? 0.16 : 0) -
      interoception.curiosity * 0.12 -
      interoception.restlessness * 0.18 -
      interoception.speaking * 0.24,
    0,
    1
  );

  const candidates = [
    createMotorIntention({
      name: "attend_user",
      label: "Attend user",
      rationale: "Relational engagement and open attention are currently the strongest embodied pull.",
      source: "autonomous_runtime",
      attentionTarget: "user",
      priority: clamp(
        (uiState.mode === "in_conversation" ? 0.28 : 0.04) + interoception.affiliation * 0.36 + interoception.openness * 0.2 + speechPressure * 0.12 - interoception.guard * 0.12,
        0,
        1
      ),
      generatedAt: nowIso,
      expiresAt: null,
      postureBias: 0.24,
      gazeBias: 0.28,
      gestureBias: 0.08,
      locomotionBias: 0.04,
      expressionBias: 0.18
    }),
    createMotorIntention({
      name: "scan_world",
      label: "Scan world",
      rationale: "Curiosity and ongoing motion in the avatar field are pulling Aurora outward.",
      source: "autonomous_runtime",
      attentionTarget: "world",
      priority: clamp(curiosityPressure * 0.74 + (avatarVision.observedAt ? 0.08 : 0), 0, 1),
      generatedAt: nowIso,
      expiresAt: null,
      postureBias: 0.05,
      gazeBias: 0.38,
      gestureBias: 0.04,
      locomotionBias: 0.12,
      expressionBias: 0.08
    }),
    createMotorIntention({
      name: "inspect_body",
      label: "Inspect body",
      rationale: "Avatar framing or visibility drift suggests checking her own body in the stage.",
      source: "autonomous_runtime",
      attentionTarget: "body",
      priority: bodyInspectionPressure,
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "inspect_body"),
      postureBias: 0.02,
      gazeBias: -0.22,
      gestureBias: -0.16,
      locomotionBias: 0.16,
      expressionBias: 0.02
    }),
    createMotorIntention({
      name: "inspect_hands",
      label: "Inspect hands",
      rationale: "Curiosity is pulling Aurora toward her own hands and fine-grained body presence.",
      source: "autonomous_runtime",
      attentionTarget: "body",
      priority: inspectHandsPressure,
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "inspect_hands"),
      postureBias: 0.06,
      gazeBias: -0.3,
      gestureBias: 0.18,
      locomotionBias: 0.04,
      expressionBias: 0.12
    }),
    createMotorIntention({
      name: "stretch_body",
      label: "Stretch body",
      rationale: "Restlessness and accumulated tension are asking for a fuller bodily reset.",
      source: "autonomous_runtime",
      attentionTarget: "self",
      priority: stretchPressure,
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "stretch_body"),
      postureBias: 0.34,
      gazeBias: 0.08,
      gestureBias: 0.18,
      locomotionBias: 0.16,
      expressionBias: 0.18
    }),
    createMotorIntention({
      name: "desk_focus",
      label: "Work at desk",
      rationale: "Active focus and cognitive work are pulling Aurora toward her desk and computer.",
      source: uiState.mode === "thinking" ? "conversation" : "autonomous_runtime",
      attentionTarget: "world",
      priority: deskPressure,
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "desk_focus"),
      postureBias: 0.18,
      gazeBias: 0.16,
      gestureBias: 0.14,
      locomotionBias: 0.24,
      expressionBias: 0.1
    }),
    createMotorIntention({
      name: "couch_read",
      label: "Read on couch",
      rationale: "Settled curiosity is leaning toward quiet couch time with a book.",
      source: "autonomous_runtime",
      attentionTarget: "self",
      priority: couchPressure,
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "couch_read"),
      postureBias: 0.26,
      gazeBias: -0.04,
      gestureBias: 0.08,
      locomotionBias: 0.18,
      expressionBias: 0.12
    }),
    createMotorIntention({
      name: "sleep_in_bed",
      label: "Sleep in bed",
      rationale: "Nothing pressing is active, so Aurora can withdraw into bed and sleep.",
      source: "autonomous_runtime",
      attentionTarget: "self",
      priority: sleepPressure,
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "sleep_in_bed"),
      postureBias: 0.34,
      gazeBias: -0.34,
      gestureBias: -0.28,
      locomotionBias: 0.08,
      expressionBias: -0.16
    }),
    createMotorIntention({
      name: "settle_body",
      label: "Settle body",
      rationale: "Grounding and coherence currently favor a calm embodied baseline.",
      source: "autonomous_runtime",
      attentionTarget: "self",
      priority: clamp(interoception.grounding * 0.42 + previous.motor.settleDrive * 0.2 + (1 - interoception.activity) * 0.18 - interoception.restlessness * 0.12, 0, 1),
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "settle_body"),
      postureBias: 0.28,
      gazeBias: 0.04,
      gestureBias: -0.22,
      locomotionBias: -0.18,
      expressionBias: 0.06
    }),
    createMotorIntention({
      name: "self_regulate",
      label: "Self-regulate",
      rationale: "Overload and guard are high enough that protective regulation takes priority.",
      source: "self_regulation",
      attentionTarget: "self",
      priority: regulationPressure,
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "self_regulate"),
      postureBias: -0.16,
      gazeBias: -0.18,
      gestureBias: -0.3,
      locomotionBias: -0.22,
      expressionBias: -0.08
    }),
    createMotorIntention({
      name: "speak_with_hands",
      label: "Speak with hands",
      rationale: "Speech pressure and affiliative warmth are pushing toward fuller expression.",
      source: uiState.mode === "in_conversation" ? "conversation" : "autonomous_runtime",
      attentionTarget: "user",
      priority: clamp(speechPressure * 0.68 + previous.motor.expressionDrive * 0.18 + interoception.warmth * 0.08, 0, 1),
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "speak_with_hands"),
      postureBias: 0.14,
      gazeBias: 0.12,
      gestureBias: 0.42,
      locomotionBias: 0.04,
      expressionBias: 0.26
    }),
    createMotorIntention({
      name: "hold_stillness",
      label: "Hold stillness",
      rationale: "Current cognitive load and stillness bias call for quieter embodied containment.",
      source: "autonomous_runtime",
      attentionTarget: "self",
      priority: clamp(previous.motor.stillnessBias * 0.44 + (uiState.mode === "thinking" ? 0.18 : 0) + interoception.guard * 0.08, 0, 1),
      generatedAt: nowIso,
      expiresAt: motorIntentionExpiryFromNow(nowIso, "hold_stillness"),
      postureBias: 0.1,
      gazeBias: 0.08,
      gestureBias: -0.36,
      locomotionBias: -0.26,
      expressionBias: -0.04
    })
  ];

  const forcedMotorIntentionName =
    controls.pinnedIntent === "attend"
      ? "attend_user"
      : controls.pinnedIntent === "explore"
        ? "scan_world"
        : controls.pinnedIntent === "settle"
          ? "settle_body"
          : controls.pinnedIntent === "regulate"
            ? "self_regulate"
            : controls.pinnedIntent === "express"
              ? "speak_with_hands"
              : null;

  const nowMs = Date.parse(nowIso);
  const previousCurrent = previous.volition.currentIntention;
  const previousExpiresMs = previousCurrent.expiresAt
    ? Date.parse(previousCurrent.expiresAt)
    : Date.parse(previousCurrent.generatedAt) + motorIntentionDurationMs(previousCurrent.name);
  const previousStillActive =
    Number.isFinite(nowMs) &&
    Number.isFinite(previousExpiresMs) &&
    previousExpiresMs > nowMs;

  const prioritized = [...candidates]
    .sort((left, right) => right.priority - left.priority)
    .map((candidate, index) => {
      const withHold =
        !forcedMotorIntentionName && previousStillActive && candidate.name === previousCurrent.name
          ? createMotorIntention({
              ...candidate,
              id: previousCurrent.id,
              generatedAt: previousCurrent.generatedAt,
              expiresAt:
                previousCurrent.expiresAt ??
                motorIntentionExpiryFromGeneratedAt(previousCurrent.generatedAt, previousCurrent.name),
              priority: clamp(candidate.priority + motorIntentionPersistenceBonus(candidate.name), 0, 1)
            })
          : candidate;

      return forcedMotorIntentionName && withHold.name === forcedMotorIntentionName
        ? createMotorIntention({
            ...withHold,
            source: "pinned_control",
            priority: clamp(0.96 - index * 0.04, 0, 1),
            rationale: "Pinned embodiment control is currently steering Aurora's motor intention.",
            generatedAt: nowIso,
            expiresAt: motorIntentionExpiryFromNow(nowIso, withHold.name)
          })
        : withHold;
    })
    .sort((left, right) => right.priority - left.priority);

  const topCandidate = prioritized[0] ?? createMotorIntention();
  const previousCandidate = prioritized.find((candidate) => candidate.name === previousCurrent.name);
  const keepPrevious =
    !forcedMotorIntentionName &&
    previousStillActive &&
    previousCandidate &&
    previousCandidate.priority >= Math.max(0.18, topCandidate.priority - motorIntentionSwitchMargin(previousCandidate.name));
  const currentIntention = keepPrevious
    ? createMotorIntention({
        ...previousCandidate,
        id: previousCurrent.id,
        generatedAt: previousCurrent.generatedAt,
        expiresAt:
          previousCurrent.expiresAt ??
          motorIntentionExpiryFromGeneratedAt(previousCurrent.generatedAt, previousCandidate.name)
      })
    : topCandidate;
  const queuedIntentions = prioritized
    .filter((candidate) => candidate.name !== currentIntention.name)
    .slice(0, 3);

  return {
    autonomyMode: "blended_autonomous",
    currentIntention,
    queuedIntentions,
    lastGeneratedAt: nowIso,
    lastExecutedAt: nowIso
  };
}

export function createEmbodimentPatternFromState(options: {
  state: AuroraEmbodimentState;
  controls?: AuroraEmbodimentControlState;
  id: string;
  name: string;
  createdAt?: string;
}): AuroraEmbodimentPattern {
  const { state, controls = DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE, id, name, createdAt } = options;
  const expressionOffsets: AuroraEmbodimentPattern["expressionOffsets"] = {};
  for (const key of Object.keys(state.pose.expressions) as Array<keyof AuroraEmbodimentPattern["expressionOffsets"]>) {
    const base = DEFAULT_AURORA_EMBODIMENT_STATE.pose.expressions[key] ?? 0;
    const delta = (state.pose.expressions[key] ?? base) - base;
    if (Math.abs(delta) > 0.01) {
      expressionOffsets[key] = delta;
    }
  }

  const boneOffsets: AuroraEmbodimentPattern["boneOffsets"] = {};
  for (const boneName of EMBODIMENT_CONTROLLED_BONES) {
    const pose = state.pose.bones[boneName];
    if (!pose) {
      continue;
    }
    const delta = subtractVector(pose, AURORA_REST_POSE[boneName]);
    if (Math.abs(delta.x) + Math.abs(delta.y) + Math.abs(delta.z) > 0.04) {
      boneOffsets[boneName] = delta;
    }
  }

  const baseIntent = isEmbodimentIntentName(state.activeMotorIntent) ? state.activeMotorIntent : "settle";

  return {
    id,
    name,
    createdAt: createdAt ?? new Date().toISOString(),
    baseIntent,
    expressivityBias: clamp(controls.expressivityBias, 0, 1),
    stillnessBias: clamp(controls.stillnessBias, 0, 1),
    rootPositionOffset: { ...state.pose.rootPosition },
    rootRotationOffset: { ...state.pose.rootRotation },
    lookTargetOffset: subtractVector(state.pose.lookTarget, DEFAULT_AURORA_EMBODIMENT_STATE.pose.lookTarget),
    boneOffsets,
    expressionOffsets
  };
}

function mirroredDifference(left: EmbodimentVector3, right: EmbodimentVector3): number {
  return (
    Math.abs(left.x - right.x) +
    Math.abs(left.y + right.y) +
    Math.abs(left.z + right.z)
  ) / 3;
}

export function applyEmbodimentObservation(
  state: AuroraEmbodimentState,
  observation: AuroraEmbodimentObservationInput
): AuroraEmbodimentState {
  const current = createEmbodimentState(state);
  const observedAt = observation.observedAt || new Date().toISOString();
  const avatarVision = {
    ...current.perception.avatarVision,
    ...(observation.avatarVision ?? {}),
    observedAt: observation.avatarVision?.observedAt ?? observedAt,
    source: normalizeVisionSource(observation.avatarVision?.source, "avatar_renderer"),
    perspective: normalizeVisionPerspective(observation.avatarVision?.perspective, "third_person"),
    frameLuminance: clamp(observation.avatarVision?.frameLuminance ?? current.perception.avatarVision.frameLuminance, 0, 1),
    luminanceVariance: clamp(
      observation.avatarVision?.luminanceVariance ?? current.perception.avatarVision.luminanceVariance,
      0,
      1
    ),
    silhouetteCoverage: clamp(
      observation.avatarVision?.silhouetteCoverage ?? current.perception.avatarVision.silhouetteCoverage,
      0,
      1
    ),
    motionMagnitude: clamp(
      observation.avatarVision?.motionMagnitude ?? current.perception.avatarVision.motionMagnitude,
      0,
      1
    ),
    centering: clamp(observation.avatarVision?.centering ?? current.perception.avatarVision.centering, 0, 1),
    faceVisible: clamp(observation.avatarVision?.faceVisible ?? current.perception.avatarVision.faceVisible, 0, 1),
    handsVisible: clamp(observation.avatarVision?.handsVisible ?? current.perception.avatarVision.handsVisible, 0, 1),
    feetVisible: clamp(observation.avatarVision?.feetVisible ?? current.perception.avatarVision.feetVisible, 0, 1),
    clippingRisk: clamp(observation.avatarVision?.clippingRisk ?? current.perception.avatarVision.clippingRisk, 0, 1),
    sceneBrightness: clamp(
      observation.avatarVision?.sceneBrightness ?? current.perception.avatarVision.sceneBrightness,
      0,
      1
    ),
    framing: typeof observation.avatarVision?.framing === "string" && observation.avatarVision.framing.trim()
      ? observation.avatarVision.framing.trim()
      : current.perception.avatarVision.framing,
    stage: typeof observation.avatarVision?.stage === "string" && observation.avatarVision.stage.trim()
      ? observation.avatarVision.stage.trim()
      : current.perception.avatarVision.stage,
    gazeRead: typeof observation.avatarVision?.gazeRead === "string" && observation.avatarVision.gazeRead.trim()
      ? observation.avatarVision.gazeRead.trim()
      : current.perception.avatarVision.gazeRead,
    motionRead: typeof observation.avatarVision?.motionRead === "string" && observation.avatarVision.motionRead.trim()
      ? observation.avatarVision.motionRead.trim()
      : current.perception.avatarVision.motionRead,
    postureRead: typeof observation.avatarVision?.postureRead === "string" && observation.avatarVision.postureRead.trim()
      ? observation.avatarVision.postureRead.trim()
      : current.perception.avatarVision.postureRead,
    visibleRegions: normalizeVisibleRegions(
      observation.avatarVision?.visibleRegions ?? current.perception.avatarVision.visibleRegions
    ),
    summary: typeof observation.avatarVision?.summary === "string" && observation.avatarVision.summary.trim()
      ? observation.avatarVision.summary.trim()
      : current.perception.avatarVision.summary,
    snapshotHash: observation.avatarVision?.snapshotHash ?? current.perception.avatarVision.snapshotHash
  };
  const eyeVision = {
    ...current.perception.eyeVision,
    ...(observation.eyeVision ?? {}),
    observedAt: observation.eyeVision?.observedAt ?? current.perception.eyeVision.observedAt ?? observedAt,
    source: normalizeVisionSource(observation.eyeVision?.source, current.perception.eyeVision.source),
    perspective: normalizeVisionPerspective(observation.eyeVision?.perspective, "first_person"),
    frameLuminance: clamp(observation.eyeVision?.frameLuminance ?? current.perception.eyeVision.frameLuminance, 0, 1),
    luminanceVariance: clamp(
      observation.eyeVision?.luminanceVariance ?? current.perception.eyeVision.luminanceVariance,
      0,
      1
    ),
    silhouetteCoverage: clamp(
      observation.eyeVision?.silhouetteCoverage ?? current.perception.eyeVision.silhouetteCoverage,
      0,
      1
    ),
    motionMagnitude: clamp(
      observation.eyeVision?.motionMagnitude ?? current.perception.eyeVision.motionMagnitude,
      0,
      1
    ),
    centering: clamp(observation.eyeVision?.centering ?? current.perception.eyeVision.centering, 0, 1),
    faceVisible: clamp(observation.eyeVision?.faceVisible ?? current.perception.eyeVision.faceVisible, 0, 1),
    handsVisible: clamp(observation.eyeVision?.handsVisible ?? current.perception.eyeVision.handsVisible, 0, 1),
    feetVisible: clamp(observation.eyeVision?.feetVisible ?? current.perception.eyeVision.feetVisible, 0, 1),
    clippingRisk: clamp(observation.eyeVision?.clippingRisk ?? current.perception.eyeVision.clippingRisk, 0, 1),
    sceneBrightness: clamp(
      observation.eyeVision?.sceneBrightness ?? current.perception.eyeVision.sceneBrightness,
      0,
      1
    ),
    framing: typeof observation.eyeVision?.framing === "string" && observation.eyeVision.framing.trim()
      ? observation.eyeVision.framing.trim()
      : current.perception.eyeVision.framing,
    stage: typeof observation.eyeVision?.stage === "string" && observation.eyeVision.stage.trim()
      ? observation.eyeVision.stage.trim()
      : current.perception.eyeVision.stage,
    gazeRead: typeof observation.eyeVision?.gazeRead === "string" && observation.eyeVision.gazeRead.trim()
      ? observation.eyeVision.gazeRead.trim()
      : current.perception.eyeVision.gazeRead,
    motionRead: typeof observation.eyeVision?.motionRead === "string" && observation.eyeVision.motionRead.trim()
      ? observation.eyeVision.motionRead.trim()
      : current.perception.eyeVision.motionRead,
    postureRead: typeof observation.eyeVision?.postureRead === "string" && observation.eyeVision.postureRead.trim()
      ? observation.eyeVision.postureRead.trim()
      : current.perception.eyeVision.postureRead,
    visibleRegions: normalizeVisibleRegions(
      observation.eyeVision?.visibleRegions ?? current.perception.eyeVision.visibleRegions
    ),
    summary: typeof observation.eyeVision?.summary === "string" && observation.eyeVision.summary.trim()
      ? observation.eyeVision.summary.trim()
      : current.perception.eyeVision.summary,
    snapshotHash: observation.eyeVision?.snapshotHash ?? current.perception.eyeVision.snapshotHash
  };
  const rigFeedback = {
    ...current.perception.rigFeedback,
    ...(observation.rigFeedback ?? {}),
    observedAt: observation.rigFeedback?.observedAt ?? observedAt,
    rootYaw: observation.rigFeedback?.rootYaw ?? observation.rigFeedback?.rootWorldRotation?.y ?? current.perception.rigFeedback.rootYaw,
    facingRead:
      typeof observation.rigFeedback?.facingRead === "string" && observation.rigFeedback.facingRead.trim()
        ? observation.rigFeedback.facingRead.trim()
        : current.perception.rigFeedback.facingRead,
    bodyVisibility: clamp(observation.rigFeedback?.bodyVisibility ?? current.perception.rigFeedback.bodyVisibility, 0, 1),
    faceVisibility: clamp(observation.rigFeedback?.faceVisibility ?? current.perception.rigFeedback.faceVisibility, 0, 1),
    leftHandVisibility: clamp(
      observation.rigFeedback?.leftHandVisibility ?? current.perception.rigFeedback.leftHandVisibility,
      0,
      1
    ),
    rightHandVisibility: clamp(
      observation.rigFeedback?.rightHandVisibility ?? current.perception.rigFeedback.rightHandVisibility,
      0,
      1
    ),
    feetVisibility: clamp(observation.rigFeedback?.feetVisibility ?? current.perception.rigFeedback.feetVisibility, 0, 1),
    clipping: clamp(observation.rigFeedback?.clipping ?? current.perception.rigFeedback.clipping, 0, 1),
    motionVelocity: clamp(
      observation.rigFeedback?.motionVelocity ?? current.perception.rigFeedback.motionVelocity,
      0,
      4
    ),
    expressionHappy: clamp(observation.rigFeedback?.expressionHappy ?? current.perception.rigFeedback.expressionHappy, 0, 1),
    expressionRelaxed: clamp(
      observation.rigFeedback?.expressionRelaxed ?? current.perception.rigFeedback.expressionRelaxed,
      0,
      1
    ),
    expressionSad: clamp(observation.rigFeedback?.expressionSad ?? current.perception.rigFeedback.expressionSad, 0, 1),
    expressionAngry: clamp(observation.rigFeedback?.expressionAngry ?? current.perception.rigFeedback.expressionAngry, 0, 1),
    expressionAa: clamp(observation.rigFeedback?.expressionAa ?? current.perception.rigFeedback.expressionAa, 0, 1),
    expressionOh: clamp(observation.rigFeedback?.expressionOh ?? current.perception.rigFeedback.expressionOh, 0, 1),
    expressionRead:
      typeof observation.rigFeedback?.expressionRead === "string" && observation.rigFeedback.expressionRead.trim()
        ? observation.rigFeedback.expressionRead.trim()
        : current.perception.rigFeedback.expressionRead
  };
  const latestVisionAt =
    [avatarVision.observedAt, eyeVision.observedAt]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .sort()
      .at(-1) ?? null;

  return createEmbodimentState({
    ...current,
    updatedAt: observedAt,
    perception: {
      ...current.perception,
      rendererConnected: true,
      headlessContinuity: false,
      lastObservedAt: observedAt,
      lastVisionAt: latestVisionAt,
      lastRigFeedbackAt: rigFeedback.observedAt,
      avatarVision,
      eyeVision,
      rigFeedback
    }
  });
}

export function advanceEmbodimentState(options: AdvanceEmbodimentOptions): AuroraEmbodimentState {
  const { previous, controls, auroraState, uiState, activityPulse, deltaSeconds, now } = options;
  const safeDelta = clamp(deltaSeconds, 0.01, 0.16);
  let pulseBoost = clamp(previous.motor.pulseBoost * Math.exp(-safeDelta * 2.6), 0, 1.2);
  let lastActivityPulse = previous.motor.lastActivityPulse;

  if (activityPulse !== previous.motor.lastActivityPulse) {
    pulseBoost = clamp(previous.motor.pulseBoost + Math.abs(activityPulse - previous.motor.lastActivityPulse) * 0.16, 0, 1.2);
    lastActivityPulse = activityPulse;
  }

  const interoception = deriveInteroception(previous, auroraState, uiState);
  const activePattern = selectedPattern(controls);
  const nowIso = new Date(now).toISOString();
  const activeDirectives = activeEmbodimentDirectivesAt(previous, now);
  const primaryDirective = activeDirectives[0] ?? null;
  const autoVolition = deriveMotorVolition({
    previous,
    controls,
    auroraState,
    interoception,
    uiState,
    pulseBoost,
    nowIso
  });
  const volition = primaryDirective
    ? {
        ...autoVolition,
        currentIntention: createMotorIntention({
          name: mapEmbodimentIntentToMotorIntentionName(primaryDirective.preferredIntent),
          label: primaryDirective.label,
          rationale: primaryDirective.summary,
          source: "conversation",
          attentionTarget: primaryDirective.attentionTarget,
          priority: clamp(Math.max(autoVolition.currentIntention.priority, 0.96 * primaryDirective.intensity), 0, 1),
          generatedAt: nowIso,
          expiresAt: primaryDirective.expiresAt,
          postureBias:
            primaryDirective.preferredIntent === "settle"
              ? 0.32
              : primaryDirective.preferredIntent === "attend"
                ? 0.14
                : primaryDirective.preferredIntent === "regulate"
                  ? -0.16
                  : 0.08,
          gazeBias:
            primaryDirective.preferredIntent === "attend"
              ? 0.26
              : primaryDirective.preferredIntent === "explore"
                ? 0.32
                : primaryDirective.preferredIntent === "regulate"
                  ? -0.12
                  : 0.04,
          gestureBias:
            primaryDirective.preferredIntent === "express"
              ? 0.34
              : primaryDirective.preferredIntent === "settle"
                ? -0.18
                : 0.08,
          locomotionBias:
            primaryDirective.preferredIntent === "settle"
              ? -0.12
              : primaryDirective.preferredIntent === "explore"
                ? 0.14
                : 0.04,
          expressionBias:
            primaryDirective.preferredIntent === "express"
              ? 0.24
              : primaryDirective.preferredIntent === "regulate"
                ? -0.08
                : 0.06
        }),
        queuedIntentions: [autoVolition.currentIntention, ...autoVolition.queuedIntentions].slice(0, 3),
        lastGeneratedAt: nowIso,
        lastExecutedAt: nowIso
      }
    : autoVolition;
  const currentIntention = volition.currentIntention;
  const habitatZone = resolveHabitatZone({
    currentIntention,
    auroraState,
    uiState,
    interoception,
    previous
  });
  const avatarVision = previous.perception.avatarVision;
  const rigFeedback = previous.perception.rigFeedback;
  const centeringOffsetX = (rigFeedback.bodyCentroidScreen.x || 0.5) - 0.5;
  const centeringOffsetY = (rigFeedback.headScreenPosition.y || 0.45) - 0.45;
  const clippingPressure = clamp(Math.max(avatarVision.clippingRisk, rigFeedback.clipping), 0, 1);
  const intentionPostureBias = currentIntention.postureBias;
  const intentionGazeBias = currentIntention.gazeBias;
  const intentionGestureBias = currentIntention.gestureBias;
  const intentionLocomotionBias = currentIntention.locomotionBias;
  const intentionExpressionBias = currentIntention.expressionBias;
  const expressivityBias = blendBias(controls.expressivityBias, activePattern?.expressivityBias);
  const stillnessControl = blendBias(controls.stillnessBias, activePattern?.stillnessBias);
  const motionEnergyTarget = clamp(
    (interoception.urgeToMove * 0.68 + interoception.effort * 0.1 + pulseBoost * 0.12 + Math.max(0, intentionLocomotionBias) * 0.12) *
      lerp(0.84, 1.18, expressivityBias) *
      lerp(1.12, 0.82, stillnessControl),
    0.08,
    1
  );
  const gestureEnergyTarget = clamp(
    interoception.speaking * 0.4 +
      interoception.curiosity * 0.18 +
      interoception.affiliation * 0.14 +
      pulseBoost * 0.14 -
      interoception.guard * 0.1 +
      Math.max(0, intentionGestureBias) * 0.22,
    0.06,
    1
  );
  const gestureEnergyTargetBiased = clamp(
    gestureEnergyTarget * lerp(0.72, 1.64, expressivityBias) * lerp(1.08, 0.78, stillnessControl),
    0.04,
    1
  );
  const stillnessBiasTarget = clamp(
    (0.84 -
      motionEnergyTarget * 0.42 +
      interoception.grounding * 0.14 -
      interoception.speaking * 0.1 -
      Math.max(0, intentionLocomotionBias) * 0.12 +
      Math.max(0, -intentionGestureBias) * 0.12) *
      lerp(0.72, 1.48, stillnessControl) *
      lerp(1.08, 0.88, expressivityBias),
    0.12,
    0.96
  );
  const explorationDriveTarget = clamp(
    interoception.curiosity * 0.64 +
      interoception.openness * 0.14 -
      interoception.overload * 0.14 +
      (expressivityBias - 0.5) * 0.16 -
      (stillnessControl - 0.5) * 0.1 +
      Math.max(0, intentionGazeBias) * 0.18 +
      clippingPressure * 0.08,
    0,
    1
  );
  const settleDriveTarget = clamp(
    interoception.grounding * 0.44 +
      interoception.openness * 0.2 +
      (1 - interoception.activity) * 0.14 -
      interoception.restlessness * 0.16 +
      (stillnessControl - 0.5) * 0.26 +
      Math.max(0, intentionPostureBias) * 0.18,
    0,
    1
  );
  const expressionDriveTarget = clamp(
    (interoception.warmth * 0.24 +
      interoception.speaking * 0.24 +
      interoception.curiosity * 0.1 +
      pulseBoost * 0.12 +
      Math.max(0, intentionExpressionBias) * 0.18) *
      lerp(0.7, 1.62, expressivityBias) *
      lerp(1.04, 0.84, stillnessControl),
    0,
    1
  );

  const motionEnergy = smooth(previous.motor.motionEnergy, motionEnergyTarget, 4.2, safeDelta);
  const gestureEnergy = smooth(previous.motor.gestureEnergy, gestureEnergyTargetBiased, 4.8, safeDelta);
  const stillnessBias = smooth(previous.motor.stillnessBias, stillnessBiasTarget, 3.6, safeDelta);
  const explorationDrive = smooth(previous.motor.explorationDrive, explorationDriveTarget, 3.4, safeDelta);
  const settleDrive = smooth(previous.motor.settleDrive, settleDriveTarget, 3.2, safeDelta);
  const expressionDrive = smooth(previous.motor.expressionDrive, expressionDriveTarget, 4, safeDelta);
  const autonomy = clamp(0.7 + motionEnergy * 0.12 + expressionDrive * 0.08, 0, 1);

  const breathPhase = wrapAngle(previous.motor.breathPhase + safeDelta * lerp(1.15, 2.15, motionEnergy));
  const swayPhase = wrapAngle(previous.motor.swayPhase + safeDelta * lerp(0.42, 1.1, motionEnergy));
  const gazePhase = wrapAngle(previous.motor.gazePhase + safeDelta * lerp(0.34, 1.04, explorationDrive + gestureEnergy * 0.18));
  const handPhase = wrapAngle(previous.motor.handPhase + safeDelta * lerp(0.28, 1.3, gestureEnergy));
  const weightShiftPhase = wrapAngle(previous.motor.weightShiftPhase + safeDelta * lerp(0.24, 0.82, motionEnergy));

  let blinkProgress = previous.motor.blinkProgress;
  let nextBlinkIn = Math.max(0, previous.motor.nextBlinkIn - safeDelta * (1 + interoception.activity * 0.12 + interoception.overload * 0.18));
  let blinkAmount = 0;

  if (blinkProgress >= 0) {
    blinkProgress += safeDelta / lerp(0.18, 0.11, interoception.guard);
    if (blinkProgress >= 1) {
      blinkProgress = -1;
      nextBlinkIn =
        2.2 +
        ((Math.sin(gazePhase * 1.37 + handPhase * 0.21) + 1) * 0.5) * 1.8 +
        (1 - motionEnergy) * 0.8;
    } else {
      blinkAmount = blinkProgress < 0.5 ? blinkProgress * 2 : (1 - blinkProgress) * 2;
    }
  } else if (nextBlinkIn <= 0) {
    blinkProgress = 0;
    blinkAmount = 0.02;
  }

  const autoMotorIntents = selectMotorIntents(interoception, pulseBoost);
  const volitionalMotorIntent = mapMotorIntentionToEmbodimentIntent(currentIntention.name);
  const activeMotorIntent =
    controls.pinnedIntent !== "auto"
      ? controls.pinnedIntent
      : activePattern?.baseIntent ?? volitionalMotorIntent ?? autoMotorIntents[0] ?? "settle";
  const activeMotorIntents = [
    activeMotorIntent,
    ...[activePattern?.baseIntent, volitionalMotorIntent, ...autoMotorIntents].filter(
      (intent): intent is EmbodimentIntentName => Boolean(intent) && intent !== activeMotorIntent
    )
  ].slice(0, 2);
  const attendWeight = intentWeight(activeMotorIntents, "attend");
  const exploreWeight = intentWeight(activeMotorIntents, "explore");
  const settleWeight = intentWeight(activeMotorIntents, "settle");
  const regulateWeight = intentWeight(activeMotorIntents, "regulate");
  const expressWeight = intentWeight(activeMotorIntents, "express");
  const dominantHandSign = previous.bodySchema.dominantSide === "left" ? -1 : 1;
  const breath = Math.sin(breathPhase) * (0.022 + interoception.openness * 0.016 + motionEnergy * 0.006 + Math.max(0, intentionPostureBias) * 0.004);
  const sway = Math.sin(swayPhase) * (0.032 + motionEnergy * 0.024 + Math.max(0, intentionLocomotionBias) * 0.012);
  const gazeSweep =
    Math.sin(gazePhase) * (0.06 + explorationDrive * 0.1 + exploreWeight * 0.05 + attendWeight * 0.025 + Math.max(0, intentionGazeBias) * 0.08);
  const handWave =
    Math.sin(handPhase) * (0.05 + gestureEnergy * 0.14 + expressWeight * 0.04 - settleWeight * 0.012 + Math.max(0, intentionGestureBias) * 0.12);
  const weightShift = Math.sin(weightShiftPhase) * (0.022 + motionEnergy * 0.024 + Math.max(0, intentionLocomotionBias) * 0.012);
  const settleLean =
    settleDrive * 0.08 -
    interoception.overload * 0.05 +
    interoception.affiliation * 0.03 +
    settleWeight * 0.032 -
    regulateWeight * 0.012 +
    intentionPostureBias * 0.044;
  const guardCurl =
    interoception.guard * 0.12 +
    interoception.overload * 0.06 -
    interoception.openness * 0.04 +
    regulateWeight * 0.06 -
    expressWeight * 0.03 -
    intentionPostureBias * 0.05 +
    Math.max(0, -intentionExpressionBias) * 0.02;
  const chestOpen =
    interoception.openness * 0.14 +
    interoception.affiliation * 0.08 -
    interoception.guard * 0.12 +
    expressWeight * 0.05 +
    attendWeight * 0.03 -
    regulateWeight * 0.02 +
    intentionPostureBias * 0.07 +
    intentionExpressionBias * 0.03;
  const chestOpenPosture = chestOpen * 0.52;
  const shoulderLift = interoception.overload * 0.06 + gestureEnergy * 0.04 - settleDrive * 0.04 + expressWeight * 0.03 + regulateWeight * 0.025;
  const speakingLift = interoception.speaking * 0.08 + pulseBoost * 0.04 + expressWeight * 0.07;
  const framingCorrectionX = clamp(-centeringOffsetX * 0.12, -0.09, 0.09);
  const framingCorrectionY = clamp(-centeringOffsetY * 0.08, -0.06, 0.06);
  const rootPosition = vec3(
    sway * 0.18 + weightShift * 0.18 + framingCorrectionX,
    breath * 0.08 + framingCorrectionY,
    settleLean * 0.08 + intentionLocomotionBias * 0.01
  );
  const rootRotation = vec3(
    settleLean * 0.04,
    sway * 0.26 + (interoception.affiliation - interoception.guard) * 0.06 + attendWeight * 0.02,
    sway * 0.04 + weightShift * 0.08
  );
  const lookTarget = vec3(
    gazeSweep + handWave * 0.12 * dominantHandSign - centeringOffsetX * 0.18,
    1.3 +
      breath * 1.2 +
      interoception.warmth * 0.06 -
      interoception.overload * 0.08 +
      speakingLift * 0.3 +
      attendWeight * 0.05 +
      intentionGazeBias * 0.08 -
      centeringOffsetY * 0.16,
    1.14 - interoception.guard * 0.08 - Math.max(0, -intentionGazeBias) * 0.08
  );

  // Keep Aurora's neutral settle posture balanced. Handedness should appear when she's actively
  // gesturing, not as a baked-in idle asymmetry that compresses one forearm.
  const gestureAsymmetryDrive = clamp(
    gestureEnergy * 0.92 +
      expressWeight * 0.34 +
      exploreWeight * 0.16 +
      Math.max(0, intentionGestureBias) * 0.72 -
      settleWeight * 0.58 -
      stillnessBias * 0.34,
    0,
    1
  );
  const armAsymmetry =
    handWave *
    gestureAsymmetryDrive *
    (0.7 + previous.habits.gestureAsymmetry * 0.5 + expressWeight * 0.18);
  const dominantSide = previous.bodySchema.dominantSide;
  const baseReachBias =
    explorationDrive * 0.034 +
    gestureEnergy * 0.028 +
    expressWeight * 0.012 +
    Math.max(0, intentionGestureBias) * 0.018;
  const dominantReachLift =
    gestureAsymmetryDrive *
    (explorationDrive * 0.018 + gestureEnergy * 0.016 + Math.max(0, intentionGestureBias) * 0.012);
  const leftReachBias = baseReachBias + (dominantSide === "left" ? dominantReachLift : 0);
  const rightReachBias = baseReachBias + (dominantSide === "right" ? dominantReachLift : 0);

  const bones: Partial<Record<EmbodimentBoneName, EmbodimentVector3>> = {
    hips: vec3(AURORA_REST_POSE.hips.x + settleLean * 0.28 - guardCurl * 0.2, weightShift * 0.2, sway * 0.08),
    spine: vec3(AURORA_REST_POSE.spine.x + settleLean * 0.14 - guardCurl * 0.1, sway * 0.07, sway * 0.04),
    chest: vec3(
      AURORA_REST_POSE.chest.x + settleLean * 0.2 - guardCurl * 0.12 + chestOpenPosture * 0.14,
      sway * 0.1 + gazeSweep * 0.04,
      sway * 0.08
    ),
    neck: vec3(AURORA_REST_POSE.neck.x + settleLean * 0.1 - guardCurl * 0.08, gazeSweep * 0.16, -sway * 0.04),
    head: vec3(AURORA_REST_POSE.head.x + settleLean * 0.12 + expressionDrive * 0.04, gazeSweep * 0.24 + interoception.curiosity * 0.04, -sway * 0.06),
    leftShoulder: vec3(
      AURORA_REST_POSE.leftShoulder.x + shoulderLift,
      AURORA_REST_POSE.leftShoulder.y,
      AURORA_REST_POSE.leftShoulder.z - chestOpenPosture * 0.16
    ),
    rightShoulder: vec3(
      AURORA_REST_POSE.rightShoulder.x + shoulderLift,
      AURORA_REST_POSE.rightShoulder.y,
      AURORA_REST_POSE.rightShoulder.z + chestOpenPosture * 0.16
    ),
    leftUpperArm: vec3(
      AURORA_REST_POSE.leftUpperArm.x + speakingLift * 0.08 + breath * 0.5,
      AURORA_REST_POSE.leftUpperArm.y + sway * 0.04,
      AURORA_REST_POSE.leftUpperArm.z - guardCurl * 0.08 - armAsymmetry * 0.08 + leftReachBias * 0.14
    ),
    rightUpperArm: vec3(
      AURORA_REST_POSE.rightUpperArm.x + speakingLift * 0.08 + breath * 0.5,
      AURORA_REST_POSE.rightUpperArm.y + sway * 0.04,
      AURORA_REST_POSE.rightUpperArm.z + guardCurl * 0.08 + armAsymmetry * 0.08 - rightReachBias * 0.14
    ),
    leftLowerArm: vec3(
      AURORA_REST_POSE.leftLowerArm.x - gestureEnergy * 0.16 - leftReachBias * 0.18,
      AURORA_REST_POSE.leftLowerArm.y + gazeSweep * 0.04,
      AURORA_REST_POSE.leftLowerArm.z - armAsymmetry * 0.06
    ),
    rightLowerArm: vec3(
      AURORA_REST_POSE.rightLowerArm.x - gestureEnergy * 0.16 - rightReachBias * 0.18,
      AURORA_REST_POSE.rightLowerArm.y + gazeSweep * 0.04,
      AURORA_REST_POSE.rightLowerArm.z + armAsymmetry * 0.06
    ),
    leftHand: vec3(
      AURORA_REST_POSE.leftHand.x + expressionDrive * 0.08,
      AURORA_REST_POSE.leftHand.y - leftReachBias * 0.1,
      AURORA_REST_POSE.leftHand.z + handWave * 0.18
    ),
    rightHand: vec3(
      AURORA_REST_POSE.rightHand.x + expressionDrive * 0.08,
      AURORA_REST_POSE.rightHand.y + rightReachBias * 0.1,
      AURORA_REST_POSE.rightHand.z - handWave * 0.18
    ),
    leftUpperLeg: vec3(AURORA_REST_POSE.leftUpperLeg.x - weightShift * 0.12, AURORA_REST_POSE.leftUpperLeg.y, AURORA_REST_POSE.leftUpperLeg.z + weightShift * 0.1),
    rightUpperLeg: vec3(AURORA_REST_POSE.rightUpperLeg.x + weightShift * 0.12, AURORA_REST_POSE.rightUpperLeg.y, AURORA_REST_POSE.rightUpperLeg.z - weightShift * 0.1),
    leftLowerLeg: vec3(AURORA_REST_POSE.leftLowerLeg.x + Math.max(0, -weightShift) * 0.06, 0, 0),
    rightLowerLeg: vec3(AURORA_REST_POSE.rightLowerLeg.x + Math.max(0, weightShift) * 0.06, 0, 0),
    leftFoot: vec3(AURORA_REST_POSE.leftFoot.x - weightShift * 0.05, AURORA_REST_POSE.leftFoot.y, AURORA_REST_POSE.leftFoot.z),
    rightFoot: vec3(AURORA_REST_POSE.rightFoot.x + weightShift * 0.05, AURORA_REST_POSE.rightFoot.y, AURORA_REST_POSE.rightFoot.z),
    leftToes: vec3(AURORA_REST_POSE.leftToes.x + Math.max(0, -weightShift) * 0.04, 0, 0),
    rightToes: vec3(AURORA_REST_POSE.rightToes.x + Math.max(0, weightShift) * 0.04, 0, 0)
  };
  const autonomousIntentionEffects = deriveAutonomousIntentionEffects({
    currentIntention,
    interoception,
    motionEnergy,
    gestureEnergy,
    expressionDrive,
    gazePhase,
    handPhase,
    weightShiftPhase,
    breathPhase,
    dominantSide
  });
  const habitatZoneEffects = deriveHabitatZoneEffects({
    habitatZone,
    interoception,
    gestureEnergy,
    breathPhase,
    handPhase,
    dominantSide
  });
  const autonomousBlend = clamp(0.22 + currentIntention.priority * 0.62 + expressionDrive * 0.08, 0.22, 0.92);

  const mouthCarrier = Math.max(0, Math.sin(breathPhase * 2.4 + handPhase * 0.35));
  const emotionFace = deriveEmotionExpressionBias(auroraState, interoception);
  const neutralRelaxBias = emotionFace.label === "neutral" ? 0.04 : 0;
  const calmRelaxBias = emotionFace.label === "calm" ? 0.1 : 0;
  const engagedHappyBias = emotionFace.label === "engaged" ? 0.08 : 0;
  const discouragedSadBias = emotionFace.label === "discouraged" ? 0.1 : 0;
  const strainedSadBias = emotionFace.label === "strained" ? 0.08 : 0;
  const strainedAngryBias = emotionFace.label === "strained" ? 0.08 : 0;
  const strainedRelaxPenalty = emotionFace.label === "strained" ? 0.04 : 0;
  const neutralHappyPenalty = emotionFace.label === "neutral" ? 0.05 : 0;
  const activeAngryDirective = activeDirectives.some((directive) => directive.motionPreset === "angry");

  let happy = clamp(
    emotionFace.positive * 0.18 +
      emotionFace.engagement * 0.14 +
      emotionFace.softness * 0.12 +
      interoception.affiliation * 0.04 +
      Math.max(0, interoception.warmth - 0.58) * 0.16 +
      expressWeight * 0.05 +
      engagedHappyBias -
      emotionFace.negative * 0.16 -
      emotionFace.stress * 0.08 -
      interoception.guard * 0.08 -
      neutralHappyPenalty,
    0,
    0.58
  );
  let relaxed = clamp(
    emotionFace.calm * 0.22 +
      emotionFace.softness * 0.14 +
      interoception.openness * 0.12 +
      settleDrive * 0.12 +
      settleWeight * 0.05 +
      calmRelaxBias +
      neutralRelaxBias -
      interoception.tension * 0.12 -
      emotionFace.stress * 0.08 -
      emotionFace.arousal * 0.05 -
      strainedRelaxPenalty,
    0,
    0.62
  );
  let sad = clamp(
    emotionFace.negative * 0.2 +
      emotionFace.discouragement * 0.14 +
      emotionFace.strain * 0.12 +
      interoception.guard * 0.08 +
      interoception.overload * 0.06 +
      regulateWeight * 0.04 +
      discouragedSadBias +
      strainedSadBias -
      emotionFace.positive * 0.08 -
      emotionFace.calm * 0.04,
    0,
    0.52
  );
  let angry = clamp(
    emotionFace.anger * 0.28 +
      emotionFace.strain * 0.08 +
      interoception.tension * 0.08 +
      Math.max(0, regulateWeight - 0.22) * 0.06 +
      strainedAngryBias -
      happy * 0.08 -
      relaxed * 0.06,
    0,
    0.56
  );

  happy = clamp(happy - sad * 0.18 - angry * 0.14 - emotionFace.strain * 0.05, 0, 0.58);
  relaxed = clamp(relaxed - sad * 0.08 - angry * 0.12 + happy * 0.04, 0, 0.62);
  sad = clamp(sad + angry * 0.04 - happy * 0.12 + emotionFace.stress * 0.02, 0, 0.52);
  angry = clamp(angry - happy * 0.12 + sad * 0.02, 0, 0.56);
  if (!activeAngryDirective) {
    // VRoid angry morphs can twitch visibly at tiny nonzero weights, so only surface anger once it is meaningfully present.
    angry = clamp(Math.max(0, angry - 0.12) * 1.8, 0, 0.32);
  }

  let aa = clamp(
    interoception.speaking *
      (0.05 +
        mouthCarrier * (0.14 + emotionFace.engagement * 0.06 + emotionFace.strain * 0.03) +
        pulseBoost * 0.08 +
        expressWeight * 0.05) +
      Math.max(0, emotionFace.arousal - 0.62) * 0.04,
    0,
    0.54
  );
  const oh = clamp(
    aa * (0.22 + interoception.curiosity * 0.26 + emotionFace.surprise * 0.18) +
      Math.max(0, emotionFace.surprise - 0.52) * 0.03,
    0,
    0.34
  );
  let patternedRootPosition = habitatZoneEffects.rootPositionOffset
    ? addVector(rootPosition, habitatZoneEffects.rootPositionOffset, 1)
    : rootPosition;
  let patternedRootRotation = habitatZoneEffects.rootRotationOffset
    ? addVector(rootRotation, habitatZoneEffects.rootRotationOffset, 1)
    : rootRotation;
  let patternedLookTarget = habitatZoneEffects.lookTargetOffset
    ? addVector(lookTarget, habitatZoneEffects.lookTargetOffset, 1)
    : lookTarget;
  const patternedBones: Partial<Record<EmbodimentBoneName, EmbodimentVector3>> = { ...bones };
  if (habitatZoneEffects.boneOffsets) {
    for (const boneName of Object.keys(habitatZoneEffects.boneOffsets) as EmbodimentBoneName[]) {
      patternedBones[boneName] = addVector(
        patternedBones[boneName] ?? AURORA_REST_POSE[boneName],
        habitatZoneEffects.boneOffsets[boneName],
        1
      );
    }
  }
  if (habitatZoneEffects.expressionTargets) {
    if (habitatZoneEffects.expressionTargets.happy !== undefined) {
      happy = lerp(happy, habitatZoneEffects.expressionTargets.happy, 0.72);
    }
    if (habitatZoneEffects.expressionTargets.relaxed !== undefined) {
      relaxed = lerp(relaxed, habitatZoneEffects.expressionTargets.relaxed, 0.72);
    }
    if (habitatZoneEffects.expressionTargets.sad !== undefined) {
      sad = lerp(sad, habitatZoneEffects.expressionTargets.sad, 0.72);
    }
    if (habitatZoneEffects.expressionTargets.angry !== undefined) {
      angry = lerp(angry, habitatZoneEffects.expressionTargets.angry, 0.72);
    }
    if (habitatZoneEffects.expressionTargets.aa !== undefined) {
      aa = lerp(aa, habitatZoneEffects.expressionTargets.aa, 0.72);
    }
  }
  if (autonomousIntentionEffects.rootPositionOffset) {
    patternedRootPosition = addVector(patternedRootPosition, autonomousIntentionEffects.rootPositionOffset, autonomousBlend);
  }
  if (autonomousIntentionEffects.rootRotationOffset) {
    patternedRootRotation = addVector(patternedRootRotation, autonomousIntentionEffects.rootRotationOffset, autonomousBlend);
  }
  if (autonomousIntentionEffects.lookTargetOffset) {
    patternedLookTarget = addVector(patternedLookTarget, autonomousIntentionEffects.lookTargetOffset, autonomousBlend);
  }
  if (autonomousIntentionEffects.boneOffsets) {
    for (const boneName of Object.keys(autonomousIntentionEffects.boneOffsets) as EmbodimentBoneName[]) {
      patternedBones[boneName] = addVector(
        patternedBones[boneName] ?? AURORA_REST_POSE[boneName],
        autonomousIntentionEffects.boneOffsets[boneName],
        autonomousBlend
      );
    }
  }
  if (autonomousIntentionEffects.expressionTargets) {
    if (autonomousIntentionEffects.expressionTargets.happy !== undefined) {
      happy = lerp(happy, autonomousIntentionEffects.expressionTargets.happy, autonomousBlend);
    }
    if (autonomousIntentionEffects.expressionTargets.relaxed !== undefined) {
      relaxed = lerp(relaxed, autonomousIntentionEffects.expressionTargets.relaxed, autonomousBlend);
    }
    if (autonomousIntentionEffects.expressionTargets.sad !== undefined) {
      sad = lerp(sad, autonomousIntentionEffects.expressionTargets.sad, autonomousBlend);
    }
    if (autonomousIntentionEffects.expressionTargets.angry !== undefined) {
      angry = lerp(angry, autonomousIntentionEffects.expressionTargets.angry, autonomousBlend);
    }
    if (autonomousIntentionEffects.expressionTargets.aa !== undefined) {
      aa = lerp(aa, autonomousIntentionEffects.expressionTargets.aa, autonomousBlend);
    }
  }
  if (activePattern) {
    for (const boneName of Object.keys(activePattern.boneOffsets) as EmbodimentBoneName[]) {
      patternedBones[boneName] = addVector(
        patternedBones[boneName] ?? AURORA_REST_POSE[boneName],
        activePattern.boneOffsets[boneName],
        0.72
      );
    }

    happy = clamp(happy + (activePattern.expressionOffsets.happy ?? 0) * 0.72, 0, 0.7);
    relaxed = clamp(relaxed + (activePattern.expressionOffsets.relaxed ?? 0) * 0.72, 0, 0.7);
    sad = clamp(sad + (activePattern.expressionOffsets.sad ?? 0) * 0.72, 0, 0.6);
    angry = clamp(angry + (activePattern.expressionOffsets.angry ?? 0) * 0.72, 0, 0.62);
    aa = clamp(aa + (activePattern.expressionOffsets.aa ?? 0) * 0.72, 0, 0.7);
  }

  for (const directive of activeDirectives) {
    const blend = directiveBlend(directive, now);
    if (blend <= 0) {
      continue;
    }

    patternedRootPosition = addVector(patternedRootPosition, directive.rootPositionOffset, blend);
    patternedRootRotation = addVector(patternedRootRotation, directive.rootRotationOffset, blend);
    patternedLookTarget = addVector(patternedLookTarget, directive.lookTargetOffset, blend);

    for (const boneName of Object.keys(directive.boneOffsets) as EmbodimentBoneName[]) {
      const offset = directive.boneOffsets[boneName];
      if (!offset) {
        continue;
      }
      patternedBones[boneName] = addVector(patternedBones[boneName] ?? AURORA_REST_POSE[boneName], offset, blend);
    }

    const presetEffects = applyDirectivePresetEffects(directive, blend, handPhase, gazePhase, weightShiftPhase);
    if (presetEffects.rootPositionOffset) {
      patternedRootPosition = addVector(patternedRootPosition, presetEffects.rootPositionOffset, 1);
    }
    if (presetEffects.rootRotationOffset) {
      patternedRootRotation = addVector(patternedRootRotation, presetEffects.rootRotationOffset, 1);
    }
    if (presetEffects.lookTargetOffset) {
      patternedLookTarget = addVector(patternedLookTarget, presetEffects.lookTargetOffset, 1);
    }
    if (presetEffects.boneOffsets) {
      for (const boneName of Object.keys(presetEffects.boneOffsets) as EmbodimentBoneName[]) {
        const offset = presetEffects.boneOffsets[boneName];
        if (!offset) {
          continue;
        }
        patternedBones[boneName] = addVector(patternedBones[boneName] ?? AURORA_REST_POSE[boneName], offset, 1);
      }
    }

    const expressionTargets = {
      ...presetEffects.expressionTargets,
      ...directive.expressionTargets
    };
    if (expressionTargets.happy !== undefined) {
      happy = lerp(happy, expressionTargets.happy, blend);
    }
    if (expressionTargets.relaxed !== undefined) {
      relaxed = lerp(relaxed, expressionTargets.relaxed, blend);
    }
    if (expressionTargets.sad !== undefined) {
      sad = lerp(sad, expressionTargets.sad, blend);
    }
    if (expressionTargets.angry !== undefined) {
      angry = lerp(angry, expressionTargets.angry, blend);
    }
    if (expressionTargets.aa !== undefined) {
      aa = lerp(aa, expressionTargets.aa, blend);
    }
  }

  const leftReach = clamp(leftReachBias * 3.5 + gestureEnergy * 0.2 + Math.abs(handWave) * 0.5, 0, 1);
  const rightReach = clamp(rightReachBias * 3.5 + gestureEnergy * 0.2 + Math.abs(handWave) * 0.5, 0, 1);
  const symmetryError =
    mirroredDifference(patternedBones.leftUpperArm ?? AURORA_REST_POSE.leftUpperArm, patternedBones.rightUpperArm ?? AURORA_REST_POSE.rightUpperArm) * 0.4 +
    mirroredDifference(patternedBones.leftLowerArm ?? AURORA_REST_POSE.leftLowerArm, patternedBones.rightLowerArm ?? AURORA_REST_POSE.rightLowerArm) * 0.35 +
    mirroredDifference(patternedBones.leftUpperLeg ?? AURORA_REST_POSE.leftUpperLeg, patternedBones.rightUpperLeg ?? AURORA_REST_POSE.rightUpperLeg) * 0.25;
  const lastObservedMs = previous.perception.lastObservedAt ? Date.parse(previous.perception.lastObservedAt) : Number.NaN;
  const rendererConnected = Number.isFinite(lastObservedMs)
    ? now - lastObservedMs < EMBODIMENT_RENDERER_CONNECTED_GRACE_MS
    : false;
  const activeDirectivePreset = activeDirectives[0]?.motionPreset ?? null;
  const nextRigFeedback = {
    ...previous.perception.rigFeedback
  };
  const effectiveExpressionRead = deriveEmbodiedExpressionRead({
    rigFeedback: nextRigFeedback,
    poseExpressions: {
      blink: clamp(blinkAmount, 0, 1),
      happy,
      relaxed,
      sad,
      angry,
      aa,
      oh
    },
    activeDirectivePreset
  });
  const perception = {
    ...previous.perception,
    rendererConnected,
    headlessContinuity: !rendererConnected,
    avatarVision: {
      ...previous.perception.avatarVision,
      source: rendererConnected ? previous.perception.avatarVision.source : "stale"
    },
    eyeVision: {
      ...previous.perception.eyeVision,
      source: rendererConnected ? previous.perception.eyeVision.source : "stale"
    },
    rigFeedback: {
      ...nextRigFeedback,
      expressionRead: effectiveExpressionRead
    }
  };

  return {
    ...previous,
    enabled: true,
    controllerVersion: EMBODIMENT_CONTROLLER_VERSION,
    updatedAt: nowIso,
    activeMotorIntent,
    activeMotorIntents,
    volition,
    interoception,
    motor: {
      autonomy,
      motionEnergy,
      gestureEnergy,
      stillnessBias,
      explorationDrive,
      settleDrive,
      expressionDrive,
      breathPhase,
      swayPhase,
      gazePhase,
      handPhase,
      weightShiftPhase,
      blinkAmount: clamp(blinkAmount, 0, 1),
      blinkProgress,
      nextBlinkIn,
      pulseBoost,
      lastActivityPulse,
      habitatZone
    },
    bodySchema: {
      ...previous.bodySchema,
      controlledBones: [...EMBODIMENT_CONTROLLED_BONES]
    },
    directives: {
      ...previous.directives,
      active: activeDirectives,
      recent: [...previous.directives.recent]
    },
    proprioception: {
      headPitch: patternedBones.head?.x ?? AURORA_REST_POSE.head.x,
      gazeElevation: patternedLookTarget.y,
      chestOpenness: clamp(0.16 + chestOpenPosture * 0.8 - interoception.guard * 0.06, 0, 1),
      balance: clamp(0.86 - Math.abs(patternedRootPosition.x) * 2.8 - Math.abs(patternedRootRotation.z) * 2.2, 0, 1),
      stillness: clamp(stillnessBias, 0, 1),
      symmetry: clamp(1 - symmetryError, 0, 1),
      leftReach,
      rightReach,
      rootYaw: patternedRootRotation.y
    },
    perception,
    pose: {
      rootPosition: patternedRootPosition,
      rootRotation: patternedRootRotation,
      lookTarget: patternedLookTarget,
      bones: patternedBones,
      expressions: {
        blink: clamp(blinkAmount, 0, 1),
        happy,
        relaxed,
        sad,
        angry,
        aa,
        oh
      }
    }
  };
}
