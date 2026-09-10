import {
  DEFAULT_AURORA_EMBODIMENT_STATE,
  EMBODIMENT_DIRECTIVE_MOTION_PRESETS,
  type AuroraEmbodimentDirective,
  type AuroraEmbodimentDirectiveState,
  type AuroraEmbodimentState,
  type EmbodimentAttentionTarget,
  type EmbodimentBoneName,
  type EmbodimentDirectiveMotionPreset,
  type EmbodimentIntentName,
  type EmbodimentPoseState,
  type EmbodimentVector3
} from "../types";

const DIRECTIVE_ACTIVE_LIMIT = 2;
const DIRECTIVE_RECENT_LIMIT = 8;
const DEFAULT_DIRECTIVE_DURATION_MS = 18_000;
const LONG_DIRECTIVE_DURATION_MS = 25_000;

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

function vec3(x = 0, y = 0, z = 0): EmbodimentVector3 {
  return { x, y, z };
}

function addBoneOffset(
  offsets: Partial<Record<EmbodimentBoneName, EmbodimentVector3>>,
  bone: EmbodimentBoneName,
  delta: Partial<EmbodimentVector3>
): void {
  const current = offsets[bone] ?? vec3();
  offsets[bone] = {
    x: current.x + (delta.x ?? 0),
    y: current.y + (delta.y ?? 0),
    z: current.z + (delta.z ?? 0)
  };
}

function normalizePreset(value: unknown): EmbodimentDirectiveMotionPreset {
  return (EMBODIMENT_DIRECTIVE_MOTION_PRESETS as readonly string[]).includes(String(value))
    ? (value as EmbodimentDirectiveMotionPreset)
    : "hold_still";
}

function normalizeAttentionTarget(value: unknown): EmbodimentAttentionTarget {
  return value === "user" || value === "world" || value === "body" || value === "self" ? value : "self";
}

function normalizeIntent(value: unknown): EmbodimentIntentName {
  return value === "attend" || value === "explore" || value === "settle" || value === "regulate" || value === "express"
    ? value
    : "settle";
}

function asVector3(value: unknown, fallback: EmbodimentVector3 = vec3()): EmbodimentVector3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback };
  }

  const record = value as Record<string, unknown>;
  return {
    x: toFiniteNumber(record.x, fallback.x),
    y: toFiniteNumber(record.y, fallback.y),
    z: toFiniteNumber(record.z, fallback.z)
  };
}

function normalizeExpressionTargets(
  value: unknown
): Partial<Record<keyof EmbodimentPoseState["expressions"], number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const next: Partial<Record<keyof EmbodimentPoseState["expressions"], number>> = {};
  for (const key of ["blink", "happy", "relaxed", "sad", "angry", "aa", "oh"] as const) {
    if (record[key] === undefined) {
      continue;
    }
    next[key] = clamp(toFiniteNumber(record[key], 0), 0, 1);
  }
  return next;
}

function normalizeBoneOffsets(value: unknown): Partial<Record<EmbodimentBoneName, EmbodimentVector3>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const next: Partial<Record<EmbodimentBoneName, EmbodimentVector3>> = {};
  for (const bone of DEFAULT_AURORA_EMBODIMENT_STATE.bodySchema.controlledBones) {
    if (record[bone] === undefined) {
      continue;
    }
    next[bone] = asVector3(record[bone]);
  }
  return next;
}

export function normalizeEmbodimentDirective(value: unknown): AuroraEmbodimentDirective | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const issuedAt =
    typeof record.issuedAt === "string" && record.issuedAt.trim()
      ? record.issuedAt
      : new Date(0).toISOString();

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : `emb_dir_${issuedAt}`,
    source: "user",
    rawText: typeof record.rawText === "string" ? record.rawText.trim() : "",
    label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : "Body directive",
    summary: typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "User-directed body movement.",
    issuedAt,
    expiresAt: typeof record.expiresAt === "string" && record.expiresAt.trim() ? record.expiresAt : null,
    preferredIntent: normalizeIntent(record.preferredIntent),
    attentionTarget: normalizeAttentionTarget(record.attentionTarget),
    intensity: clamp(toFiniteNumber(record.intensity, 0.88), 0.1, 1),
    replaceActive: record.replaceActive !== false,
    motionPreset: normalizePreset(record.motionPreset),
    rootPositionOffset: asVector3(record.rootPositionOffset),
    rootRotationOffset: asVector3(record.rootRotationOffset),
    lookTargetOffset: asVector3(record.lookTargetOffset),
    boneOffsets: normalizeBoneOffsets(record.boneOffsets),
    expressionTargets: normalizeExpressionTargets(record.expressionTargets)
  };
}

export function normalizeEmbodimentDirectiveState(value: unknown): AuroraEmbodimentDirectiveState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      active: [],
      recent: [],
      lastUserDirectiveAt: null
    };
  }

  const record = value as Record<string, unknown>;
  const active = Array.isArray(record.active)
    ? record.active.map((item) => normalizeEmbodimentDirective(item)).filter((item): item is AuroraEmbodimentDirective => Boolean(item)).slice(0, DIRECTIVE_ACTIVE_LIMIT)
    : [];
  const recent = Array.isArray(record.recent)
    ? record.recent.map((item) => normalizeEmbodimentDirective(item)).filter((item): item is AuroraEmbodimentDirective => Boolean(item)).slice(0, DIRECTIVE_RECENT_LIMIT)
    : [];

  return {
    active,
    recent,
    lastUserDirectiveAt:
      typeof record.lastUserDirectiveAt === "string" && record.lastUserDirectiveAt.trim()
        ? record.lastUserDirectiveAt
        : active[0]?.issuedAt ?? recent[0]?.issuedAt ?? null
  };
}

function hasMovementCue(text: string): boolean {
  return /\b(move|moving|make|making|raise|raising|lift|lifting|lower|lowering|put|putting|bring|bringing|return|returning|wave|waving|nod|nodding|shake|shaking|tilt|tilting|turn|turning|twist|twisting|rotate|rotating|spin|spinning|look|looking|glance|glancing|smile|smiling|grin|grinning|frown|frowning|angry|mad|annoyed|irritated|furious|glare|scowl|open|opening|spread|spreading|shift|shifting|lean|leaning|rest|resting|settle|settling|point|pointing|flex|flexing|bend|bending|show|showing|present|presenting)\b/.test(
    text
  );
}

function directAddressCue(text: string): boolean {
  return /\b(can you|could you|would you|will you|please|try to|try|show me|make|making|move|moving|raise|raising|lift|lifting|lower|lowering|put|putting|bring|bringing|return|returning|wave|waving|nod|nodding|shake|shaking|tilt|tilting|turn|turning|twist|twisting|rotate|rotating|spin|spinning|look|looking|smile|smiling|frown|frowning|angry|mad|annoyed|irritated|furious|glare|scowl|open|opening|spread|spreading|shift|shifting|lean|leaning|rest|resting|point|pointing|flex|flexing|bend|bending|present|presenting|be still|hold still)\b/.test(
    text
  );
}

function looksLikeRetrospectiveActionQuestion(text: string): boolean {
  return (
    /\bwhat did you just\b/.test(text) ||
    /\bwhat were you just\b/.test(text) ||
    /\bwhat have you just\b/.test(text) ||
    /\bno like what did you just\b/.test(text) ||
    /\bwhat did you search\b/.test(text) ||
    /\bwhat did you look up\b/.test(text) ||
    /\bwhat did you just search up\b/.test(text) ||
    /\bwhat did you just search for\b/.test(text) ||
    /\bwhat did you just open\b/.test(text) ||
    /\bwhat did you just do\b/.test(text)
  );
}

function inferSide(text: string): "left" | "right" | "both" | null {
  if (/\bleft\b/.test(text)) {
    return "left";
  }
  if (/\bright\b/.test(text)) {
    return "right";
  }
  if (/\bboth\b|\byour arms\b|\bhands\b/.test(text)) {
    return "both";
  }
  return null;
}

function inferSideFromDirective(directive: AuroraEmbodimentDirective | null): "left" | "right" | "both" | null {
  switch (directive?.motionPreset) {
    case "raise_left_hand":
    case "lower_left_hand":
    case "present_left_hand":
    case "wave_left":
    case "shift_weight_left":
    case "turn_torso_left":
    case "raise_left_leg":
    case "point_left_foot":
    case "tilt_head_left":
      return "left";
    case "raise_right_hand":
    case "lower_right_hand":
    case "present_right_hand":
    case "wave_right":
    case "shift_weight_right":
    case "turn_torso_right":
    case "raise_right_leg":
    case "point_right_foot":
    case "tilt_head_right":
      return "right";
    case "open_arms":
      return "both";
    default:
      return inferSide(directive?.label.toLowerCase() ?? "") ?? inferSide(directive?.rawText.toLowerCase() ?? "");
  }
}

function directiveTargetsArmOrHand(directive: AuroraEmbodimentDirective | null): boolean {
  if (!directive) {
    return false;
  }

  return (
    directive.motionPreset === "raise_left_hand" ||
    directive.motionPreset === "lower_left_hand" ||
    directive.motionPreset === "raise_right_hand" ||
    directive.motionPreset === "lower_right_hand" ||
    directive.motionPreset === "present_left_hand" ||
    directive.motionPreset === "present_right_hand" ||
    directive.motionPreset === "wave_left" ||
    directive.motionPreset === "wave_right" ||
    /\b(hand|arm)\b/.test(directive.label.toLowerCase()) ||
    /\b(hand|arm)\b/.test(directive.rawText.toLowerCase())
  );
}

function directiveTargetsLegOrFoot(directive: AuroraEmbodimentDirective | null): boolean {
  if (!directive) {
    return false;
  }

  return (
    directive.motionPreset === "raise_left_leg" ||
    directive.motionPreset === "raise_right_leg" ||
    directive.motionPreset === "point_left_foot" ||
    directive.motionPreset === "point_right_foot" ||
    directive.motionPreset === "shift_weight_left" ||
    directive.motionPreset === "shift_weight_right" ||
    /\b(leg|knee|foot|feet|toe|toes)\b/.test(directive.label.toLowerCase()) ||
    /\b(leg|knee|foot|feet|toe|toes)\b/.test(directive.rawText.toLowerCase())
  );
}

function buildDirectiveBase(
  text: string,
  nowIso: string,
  overrides: Partial<AuroraEmbodimentDirective> = {}
): AuroraEmbodimentDirective {
  return {
    id: `emb_dir_${Date.parse(nowIso)}_${Math.random().toString(36).slice(2, 8)}`,
    source: "user",
    rawText: text.trim(),
    label: "Body directive",
    summary: "User-directed body movement.",
    issuedAt: nowIso,
    expiresAt: new Date(Date.parse(nowIso) + DEFAULT_DIRECTIVE_DURATION_MS).toISOString(),
    preferredIntent: "express",
    attentionTarget: "body",
    intensity: 0.9,
    replaceActive: true,
    motionPreset: "hold_still",
    rootPositionOffset: vec3(),
    rootRotationOffset: vec3(),
    lookTargetOffset: vec3(),
    boneOffsets: {},
    expressionTargets: {},
    ...overrides
  };
}

export function createConversationEmbodimentDirective(
  userText: string,
  nowIso = new Date().toISOString(),
  state: Pick<AuroraEmbodimentState, "directives"> | null = null
): AuroraEmbodimentDirective | null {
  const lower = userText.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower || looksLikeRetrospectiveActionQuestion(lower) || !hasMovementCue(lower) || !directAddressCue(lower)) {
    return null;
  }

  const recentDirectiveState = normalizeEmbodimentDirectiveState(state?.directives);
  const recentDirective = recentDirectiveState.active[0] ?? recentDirectiveState.recent[0] ?? null;
  const pronounMovementFollowup = /\b(it|that|again)\b/.test(lower);
  const side = inferSide(lower) ?? (pronounMovementFollowup ? inferSideFromDirective(recentDirective) : null);
  const directive = buildDirectiveBase(userText, nowIso);
  const summaryParts: string[] = [];
  const labelParts: string[] = [];
  let matched = false;
  const explicitWaveRequest = /\bwav(?:e|ing)\b/.test(lower);
  const referencesArmOrHand = /\b(hand|arm)\b/.test(lower) || (pronounMovementFollowup && directiveTargetsArmOrHand(recentDirective));
  const referencesHand = /\b(hand|palm)\b/.test(lower) || (pronounMovementFollowup && directiveTargetsArmOrHand(recentDirective));
  const referencesTorso = /\b(torso|body|chest|spine|shoulder|shoulders)\b/.test(lower);
  const referencesLeg = /\b(leg|knee)\b/.test(lower) || (pronounMovementFollowup && directiveTargetsLegOrFoot(recentDirective));
  const referencesFoot = /\b(foot|feet|toe|toes)\b/.test(lower) || (pronounMovementFollowup && directiveTargetsLegOrFoot(recentDirective));
  const genericArmMovementRequest = /\bmov(?:e|ing)\b/.test(lower) && referencesArmOrHand;
  const explicitRaiseRequest = /\b(raise|raising|lift|lifting|hold up)\b/.test(lower) && referencesArmOrHand;
  const explicitLowerRequest =
    /\b(lower|lowering|put|putting|bring|bringing|return|returning)\b/.test(lower) &&
    (referencesArmOrHand || (pronounMovementFollowup && directiveTargetsArmOrHand(recentDirective))) &&
    (/\b(back|down|rest|side|sides)\b/.test(lower) || /\b(lower|return)\b/.test(lower));
  const genericLegMovementRequest = /\bmov(?:e|ing)\b/.test(lower) && referencesLeg;
  const explicitLegRaiseRequest = /\b(raise|raising|lift|lifting|bend|bending)\b/.test(lower) && referencesLeg;
  const handPresentationRequest =
    (/\b(open|opening|show|showing|present|presenting|turn|turning)\b/.test(lower) && referencesHand) ||
    /\bpalm\b/.test(lower);
  const fullTurnAroundRequest =
    /\b(turn|turning|spin|spinning|rotate|rotating)\b(?: [a-z]+){0,3} \baround\b/.test(lower) ||
    /\b(face away|turn your back|show me your back)\b/.test(lower);
  const torsoTurnRequest = /\b(turn|turning|twist|twisting|rotate|rotating)\b/.test(lower) && referencesTorso;
  const footPointRequest = /\b(point|pointing|flex|flexing)\b/.test(lower) && referencesFoot;

  if (/\b(stop moving|be still|hold still|stay still|settle your body|return to rest|hands? by your sides?)\b/.test(lower)) {
    directive.motionPreset = "hold_still";
    directive.preferredIntent = "settle";
    directive.attentionTarget = "self";
    directive.intensity = 0.98;
    directive.expiresAt = new Date(Date.parse(nowIso) + LONG_DIRECTIVE_DURATION_MS).toISOString();
    addBoneOffset(directive.boneOffsets, "leftUpperArm", { x: -0.02, z: -0.02 });
    addBoneOffset(directive.boneOffsets, "rightUpperArm", { x: -0.02, z: 0.02 });
    directive.expressionTargets.relaxed = 0.32;
    directive.expressionTargets.happy = 0.12;
    matched = true;
    labelParts.push("hold still");
    summaryParts.push("hold a quieter, at-rest pose");
  }

  if (explicitWaveRequest) {
    const waveSide = side === "left" ? "left" : "right";
    directive.motionPreset = waveSide === "left" ? "wave_left" : "wave_right";
    directive.preferredIntent = "express";
    directive.attentionTarget = "user";
    directive.intensity = Math.max(directive.intensity, 0.96);
    directive.expiresAt = new Date(Date.parse(nowIso) + 8000).toISOString();
    if (waveSide === "left") {
      addBoneOffset(directive.boneOffsets, "leftUpperArm", { x: -0.34, z: 0.26 });
      addBoneOffset(directive.boneOffsets, "leftLowerArm", { x: -0.18, z: -0.18 });
      addBoneOffset(directive.boneOffsets, "leftHand", { z: 0.12 });
    } else {
      addBoneOffset(directive.boneOffsets, "rightUpperArm", { x: -0.34, z: -0.26 });
      addBoneOffset(directive.boneOffsets, "rightLowerArm", { x: -0.18, z: 0.18 });
      addBoneOffset(directive.boneOffsets, "rightHand", { z: -0.12 });
    }
    matched = true;
    labelParts.push(`wave ${waveSide} hand`);
    summaryParts.push(`wave ${waveSide} hand`);
  }

  if (explicitLowerRequest) {
    if (side === "both") {
      directive.motionPreset = "hold_still";
      directive.preferredIntent = "settle";
      directive.attentionTarget = "body";
      directive.intensity = Math.max(directive.intensity, 0.92);
      directive.expiresAt = new Date(Date.parse(nowIso) + 10_000).toISOString();
      addBoneOffset(directive.boneOffsets, "leftUpperArm", { x: 0.08, z: -0.04 });
      addBoneOffset(directive.boneOffsets, "rightUpperArm", { x: 0.08, z: 0.04 });
      addBoneOffset(directive.boneOffsets, "leftLowerArm", { x: 0.12, z: 0.04 });
      addBoneOffset(directive.boneOffsets, "rightLowerArm", { x: 0.12, z: -0.04 });
      directive.expressionTargets.relaxed = Math.max(directive.expressionTargets.relaxed ?? 0, 0.32);
      matched = true;
      labelParts.push("lower both arms");
      summaryParts.push("bring both arms back down");
    } else {
      const lowerSide = side === "left" ? "left" : "right";
      directive.motionPreset = lowerSide === "left" ? "lower_left_hand" : "lower_right_hand";
      directive.preferredIntent = "settle";
      directive.attentionTarget = "body";
      directive.intensity = Math.max(directive.intensity, 0.9);
      directive.expiresAt = new Date(Date.parse(nowIso) + 10_000).toISOString();
      if (lowerSide === "left") {
        addBoneOffset(directive.boneOffsets, "leftUpperArm", { x: 0.14, z: -0.08 });
        addBoneOffset(directive.boneOffsets, "leftLowerArm", { x: 0.16, z: 0.08 });
        addBoneOffset(directive.boneOffsets, "leftHand", { y: 0.05, z: -0.08 });
      } else {
        addBoneOffset(directive.boneOffsets, "rightUpperArm", { x: 0.14, z: 0.08 });
        addBoneOffset(directive.boneOffsets, "rightLowerArm", { x: 0.16, z: -0.08 });
        addBoneOffset(directive.boneOffsets, "rightHand", { y: -0.05, z: 0.08 });
      }
      directive.expressionTargets.relaxed = Math.max(directive.expressionTargets.relaxed ?? 0, 0.3);
      matched = true;
      labelParts.push(`lower ${lowerSide} arm`);
      summaryParts.push(`bring ${lowerSide} arm back down`);
    }
  }

  if (handPresentationRequest) {
    const handSide = side === "left" ? "left" : "right";
    directive.motionPreset = handSide === "left" ? "present_left_hand" : "present_right_hand";
    directive.preferredIntent = "express";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.9);
    directive.expiresAt = new Date(Date.parse(nowIso) + LONG_DIRECTIVE_DURATION_MS).toISOString();
    if (handSide === "left") {
      addBoneOffset(directive.boneOffsets, "leftUpperArm", { x: -0.2, z: 0.16 });
      addBoneOffset(directive.boneOffsets, "leftLowerArm", { x: -0.22, z: -0.1 });
      addBoneOffset(directive.boneOffsets, "leftHand", { x: -0.32, z: 0.22 });
    } else {
      addBoneOffset(directive.boneOffsets, "rightUpperArm", { x: -0.2, z: -0.16 });
      addBoneOffset(directive.boneOffsets, "rightLowerArm", { x: -0.22, z: 0.1 });
      addBoneOffset(directive.boneOffsets, "rightHand", { x: -0.32, z: -0.22 });
    }
    matched = true;
    labelParts.push(`present ${handSide} hand`);
    summaryParts.push(`present ${handSide} hand`);
  }

  if (explicitRaiseRequest || genericArmMovementRequest) {
    const raiseSide = side === "left" ? "left" : "right";
    directive.motionPreset = raiseSide === "left" ? "raise_left_hand" : "raise_right_hand";
    directive.preferredIntent = "express";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.92);
    if (genericArmMovementRequest) {
      directive.expiresAt = new Date(Date.parse(nowIso) + LONG_DIRECTIVE_DURATION_MS).toISOString();
    }
    if (raiseSide === "left") {
      addBoneOffset(directive.boneOffsets, "leftUpperArm", { x: -0.68, z: 0.26 });
      addBoneOffset(directive.boneOffsets, "leftLowerArm", { x: -0.28, z: -0.16 });
      addBoneOffset(directive.boneOffsets, "leftHand", { y: -0.04, z: 0.12 });
    } else {
      addBoneOffset(directive.boneOffsets, "rightUpperArm", { x: -0.68, z: -0.26 });
      addBoneOffset(directive.boneOffsets, "rightLowerArm", { x: -0.28, z: 0.16 });
      addBoneOffset(directive.boneOffsets, "rightHand", { y: 0.04, z: -0.12 });
    }
    matched = true;
    labelParts.push(genericArmMovementRequest ? `move ${raiseSide} arm` : `raise ${raiseSide} hand`);
    summaryParts.push(genericArmMovementRequest ? `move ${raiseSide} arm` : `raise ${raiseSide} hand`);
  }

  if (fullTurnAroundRequest) {
    directive.motionPreset = "turn_around";
    directive.preferredIntent = "explore";
    directive.attentionTarget = "world";
    directive.intensity = Math.max(directive.intensity, 0.98);
    directive.expiresAt = new Date(Date.parse(nowIso) + LONG_DIRECTIVE_DURATION_MS).toISOString();
    directive.expressionTargets.relaxed = Math.max(directive.expressionTargets.relaxed ?? 0, 0.24);
    matched = true;
    labelParts.push("turn around");
    summaryParts.push("turn all the way around");
  }

  if (explicitLegRaiseRequest || genericLegMovementRequest) {
    const legSide = side === "left" ? "left" : "right";
    directive.motionPreset = legSide === "left" ? "raise_left_leg" : "raise_right_leg";
    directive.preferredIntent = "express";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.9);
    directive.expiresAt = new Date(Date.parse(nowIso) + LONG_DIRECTIVE_DURATION_MS).toISOString();
    if (legSide === "left") {
      addBoneOffset(directive.boneOffsets, "leftUpperLeg", { x: -0.58, z: 0.08 });
      addBoneOffset(directive.boneOffsets, "leftLowerLeg", { x: 0.24 });
      addBoneOffset(directive.boneOffsets, "leftFoot", { x: 0.14 });
      addBoneOffset(directive.boneOffsets, "leftToes", { x: -0.08 });
      directive.rootPositionOffset = vec3(-0.01, 0.01, 0);
    } else {
      addBoneOffset(directive.boneOffsets, "rightUpperLeg", { x: -0.58, z: -0.08 });
      addBoneOffset(directive.boneOffsets, "rightLowerLeg", { x: 0.24 });
      addBoneOffset(directive.boneOffsets, "rightFoot", { x: 0.14 });
      addBoneOffset(directive.boneOffsets, "rightToes", { x: -0.08 });
      directive.rootPositionOffset = vec3(0.01, 0.01, 0);
    }
    matched = true;
    labelParts.push(genericLegMovementRequest ? `move ${legSide} leg` : `raise ${legSide} leg`);
    summaryParts.push(genericLegMovementRequest ? `move ${legSide} leg` : `raise ${legSide} leg`);
  }

  if (/\bnod\b/.test(lower)) {
    directive.motionPreset = "nod";
    directive.preferredIntent = "attend";
    directive.attentionTarget = "user";
    directive.intensity = Math.max(directive.intensity, 0.9);
    directive.expiresAt = new Date(Date.parse(nowIso) + 8000).toISOString();
    matched = true;
    labelParts.push("nod");
    summaryParts.push("nod");
  }

  if (/\b(shake your head|shake head)\b/.test(lower)) {
    directive.motionPreset = "shake_head";
    directive.preferredIntent = "attend";
    directive.attentionTarget = "user";
    directive.intensity = Math.max(directive.intensity, 0.9);
    directive.expiresAt = new Date(Date.parse(nowIso) + 8000).toISOString();
    matched = true;
    labelParts.push("shake head");
    summaryParts.push("shake head");
  }

  if (/\btilt your head left\b|\bhead tilt left\b/.test(lower)) {
    directive.motionPreset = "tilt_head_left";
    directive.preferredIntent = "attend";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.88);
    matched = true;
    labelParts.push("tilt head left");
    summaryParts.push("tilt head left");
  } else if (/\btilt your head right\b|\bhead tilt right\b/.test(lower)) {
    directive.motionPreset = "tilt_head_right";
    directive.preferredIntent = "attend";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.88);
    matched = true;
    labelParts.push("tilt head right");
    summaryParts.push("tilt head right");
  }

  if (/\blook at me\b|\blook toward me\b|\bface me\b|\blook toward the camera\b/.test(lower)) {
    directive.motionPreset = "look_at_user";
    directive.preferredIntent = "attend";
    directive.attentionTarget = "user";
    directive.intensity = Math.max(directive.intensity, 0.88);
    directive.lookTargetOffset = vec3(0, 0.02, 0);
    matched = true;
    labelParts.push("look at user");
    summaryParts.push("turn attention toward the user");
  } else if (/\blook left\b|\bturn left\b|\bglance left\b/.test(lower)) {
    directive.motionPreset = "look_left";
    directive.preferredIntent = "explore";
    directive.attentionTarget = "world";
    directive.lookTargetOffset = vec3(-0.32, 0, 0);
    matched = true;
    labelParts.push("look left");
    summaryParts.push("look left");
  } else if (/\blook right\b|\bturn right\b|\bglance right\b/.test(lower)) {
    directive.motionPreset = "look_right";
    directive.preferredIntent = "explore";
    directive.attentionTarget = "world";
    directive.lookTargetOffset = vec3(0.32, 0, 0);
    matched = true;
    labelParts.push("look right");
    summaryParts.push("look right");
  } else if (/\blook up\b|\braise your chin\b|\btilt your head up\b/.test(lower)) {
    directive.motionPreset = "look_up";
    directive.preferredIntent = "explore";
    directive.attentionTarget = "world";
    directive.lookTargetOffset = vec3(0, 0.2, 0);
    matched = true;
    labelParts.push("look up");
    summaryParts.push("look up");
  } else if (/\blook down\b|\blower your head\b|\btilt your head down\b/.test(lower)) {
    directive.motionPreset = "look_down";
    directive.preferredIntent = "explore";
    directive.attentionTarget = "body";
    directive.lookTargetOffset = vec3(0, -0.18, 0);
    matched = true;
    labelParts.push("look down");
    summaryParts.push("look down");
  }

  if (/\b(smile|grin)\b/.test(lower)) {
    directive.motionPreset = directive.motionPreset === "hold_still" ? "smile" : directive.motionPreset;
    directive.preferredIntent = directive.preferredIntent === "settle" ? "express" : directive.preferredIntent;
    directive.expressionTargets.happy = Math.max(directive.expressionTargets.happy ?? 0, 0.58);
    directive.expressionTargets.relaxed = Math.max(directive.expressionTargets.relaxed ?? 0, 0.36);
    directive.expressionTargets.sad = 0;
    directive.expressionTargets.angry = 0;
    matched = true;
    labelParts.push("smile");
    summaryParts.push("smile");
  }

  if (/\b(frown|frowning|look sad|sad face|frown face|make a frown)\b/.test(lower)) {
    directive.motionPreset = "frown";
    directive.preferredIntent = "express";
    directive.attentionTarget = "body";
    directive.expressionTargets.happy = 0;
    directive.expressionTargets.relaxed = Math.min(directive.expressionTargets.relaxed ?? 0.16, 0.16);
    directive.expressionTargets.sad = Math.max(directive.expressionTargets.sad ?? 0, 0.44);
    directive.expressionTargets.angry = Math.min(directive.expressionTargets.angry ?? 0.08, 0.08);
    matched = true;
    labelParts.push("frown");
    summaryParts.push("frown");
  }

  if (/\b(angry|mad|annoyed|irritated|furious|glare|scowl|angry face|mad face|look angry|make an angry face)\b/.test(lower)) {
    directive.motionPreset = "angry";
    directive.preferredIntent = "express";
    directive.attentionTarget = "body";
    directive.expressionTargets.happy = 0;
    directive.expressionTargets.relaxed = Math.min(directive.expressionTargets.relaxed ?? 0.08, 0.08);
    directive.expressionTargets.sad = Math.max(directive.expressionTargets.sad ?? 0, 0.12);
    directive.expressionTargets.angry = Math.max(directive.expressionTargets.angry ?? 0, 0.56);
    matched = true;
    labelParts.push("angry face");
    summaryParts.push("make an angry face");
  }

  if (/\b(open your arms|spread your arms)\b/.test(lower)) {
    directive.motionPreset = "open_arms";
    directive.preferredIntent = "express";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.9);
    addBoneOffset(directive.boneOffsets, "leftUpperArm", { x: -0.16, z: 0.42 });
    addBoneOffset(directive.boneOffsets, "rightUpperArm", { x: -0.16, z: -0.42 });
    addBoneOffset(directive.boneOffsets, "leftLowerArm", { x: -0.08, z: -0.16 });
    addBoneOffset(directive.boneOffsets, "rightLowerArm", { x: -0.08, z: 0.16 });
    matched = true;
    labelParts.push("open arms");
    summaryParts.push("open both arms");
  }

  if (torsoTurnRequest) {
    const torsoSide = side === "left" ? "left" : "right";
    directive.motionPreset = torsoSide === "left" ? "turn_torso_left" : "turn_torso_right";
    directive.preferredIntent = "explore";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.88);
    directive.rootRotationOffset = vec3(0, torsoSide === "left" ? -0.12 : 0.12, 0);
    matched = true;
    labelParts.push(`turn torso ${torsoSide}`);
    summaryParts.push(`turn torso ${torsoSide}`);
  }

  if (/\bshift your weight left\b|\blean left\b/.test(lower)) {
    directive.motionPreset = "shift_weight_left";
    directive.preferredIntent = "settle";
    directive.attentionTarget = "body";
    directive.rootPositionOffset = vec3(-0.024, 0, 0);
    directive.rootRotationOffset = vec3(0, -0.05, -0.03);
    matched = true;
    labelParts.push("shift left");
    summaryParts.push("shift weight to the left");
  } else if (/\bshift your weight right\b|\blean right\b/.test(lower)) {
    directive.motionPreset = "shift_weight_right";
    directive.preferredIntent = "settle";
    directive.attentionTarget = "body";
    directive.rootPositionOffset = vec3(0.024, 0, 0);
    directive.rootRotationOffset = vec3(0, 0.05, 0.03);
    matched = true;
    labelParts.push("shift right");
    summaryParts.push("shift weight to the right");
  }

  if (/\blean forward\b/.test(lower)) {
    directive.motionPreset = "lean_forward";
    directive.preferredIntent = "attend";
    directive.attentionTarget = "user";
    directive.rootPositionOffset = vec3(0, 0, 0.018);
    directive.rootRotationOffset = vec3(0.08, 0, 0);
    matched = true;
    labelParts.push("lean forward");
    summaryParts.push("lean forward");
  } else if (/\blean back\b/.test(lower)) {
    directive.motionPreset = "lean_back";
    directive.preferredIntent = "regulate";
    directive.attentionTarget = "self";
    directive.rootPositionOffset = vec3(0, 0, -0.018);
    directive.rootRotationOffset = vec3(-0.08, 0, 0);
    matched = true;
    labelParts.push("lean back");
    summaryParts.push("lean back");
  }

  if (footPointRequest) {
    const footSide = side === "left" ? "left" : "right";
    directive.motionPreset = footSide === "left" ? "point_left_foot" : "point_right_foot";
    directive.preferredIntent = "express";
    directive.attentionTarget = "body";
    directive.intensity = Math.max(directive.intensity, 0.86);
    if (footSide === "left") {
      addBoneOffset(directive.boneOffsets, "leftFoot", { x: 0.24 });
      addBoneOffset(directive.boneOffsets, "leftToes", { x: 0.18 });
    } else {
      addBoneOffset(directive.boneOffsets, "rightFoot", { x: 0.24 });
      addBoneOffset(directive.boneOffsets, "rightToes", { x: 0.18 });
    }
    matched = true;
    labelParts.push(`point ${footSide} foot`);
    summaryParts.push(`point ${footSide} foot`);
  }

  if (!matched) {
    return null;
  }

  directive.label = labelParts.join(" + ") || directive.label;
  directive.summary = summaryParts.length > 0 ? `User asked Aurora to ${summaryParts.join(" and ")}.` : directive.summary;
  return directive;
}

export function activeEmbodimentDirectivesAt(
  state: Pick<AuroraEmbodimentState, "directives">,
  nowMs: number
): AuroraEmbodimentDirective[] {
  return normalizeEmbodimentDirectiveState(state.directives).active.filter((directive) => {
    if (!directive.expiresAt) {
      return true;
    }
    const expiresMs = Date.parse(directive.expiresAt);
    return !Number.isFinite(expiresMs) || expiresMs > nowMs;
  });
}

export function applyEmbodimentDirective(
  state: AuroraEmbodimentState,
  directive: AuroraEmbodimentDirective
): AuroraEmbodimentState {
  const normalizedDirective = normalizeEmbodimentDirective(directive);
  if (!normalizedDirective) {
    return state;
  }

  const directives = normalizeEmbodimentDirectiveState(state.directives);
  const active = normalizedDirective.replaceActive
    ? [normalizedDirective]
    : [normalizedDirective, ...directives.active].slice(0, DIRECTIVE_ACTIVE_LIMIT);
  const recent = [normalizedDirective, ...directives.recent.filter((item) => item.id !== normalizedDirective.id)].slice(
    0,
    DIRECTIVE_RECENT_LIMIT
  );

  return {
    ...state,
    updatedAt: normalizedDirective.issuedAt,
    directives: {
      active,
      recent,
      lastUserDirectiveAt: normalizedDirective.issuedAt
    }
  };
}

export function applyConversationEmbodimentDirectiveFromText(
  state: AuroraEmbodimentState,
  userText: string,
  nowIso = new Date().toISOString()
): { nextState: AuroraEmbodimentState; directive: AuroraEmbodimentDirective | null } {
  const directive = createConversationEmbodimentDirective(userText, nowIso, state);
  if (!directive) {
    return { nextState: state, directive: null };
  }

  return {
    nextState: applyEmbodimentDirective(state, directive),
    directive
  };
}
