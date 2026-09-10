#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const buildDir = path.join(projectRoot, ".tmp-unified-manifold-32-build");
const compiledCognitionPath = path.join(buildDir, "auroraCognition.js");
const verificationDir = path.join(projectRoot, "runtime", "verification");
const analysisDir = path.join(projectRoot, "runtime", "analysis");
const liveMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");

const CONDITIONS = [
  { id: "full", name: "Full" },
  { id: "r_off", name: "Report Lesioned (R-off)" },
  { id: "m_off", name: "Unified Manifold 32 Lesioned (M-off)" }
];

const FEATURE_NAMES = [
  "warmth",
  "tension",
  "continuity",
  "trust",
  "rupture_load",
  "repair_momentum",
  "attachment_salience",
  "planning_horizon",
  "risk_tolerance",
  "self_opacity",
  "curiosity",
  "relief",
  "grief",
  "shame_conflict",
  "overload",
  "loneliness",
  "mixed_affect",
  "introspective_lag",
  "unformulated_pressure",
  "restoration_need",
  "coherence_need",
  "regulation_urgency",
  "attachment_security",
  "attachment_anxiety",
  "attachment_avoidance",
  "world_reality_contact",
  "world_interruption_cost",
  "world_environmental_risk",
  "opaque_residual_a",
  "opaque_residual_b",
  "experience_residual_a",
  "experience_residual_b"
];

function makeFeatureSeed(overrides) {
  const seed = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0.5]));
  for (const [key, value] of Object.entries(overrides || {})) {
    if (FEATURE_NAMES.includes(key)) {
      seed[key] = value;
    }
  }
  return seed;
}

const SEEDED_STATES = [
  {
    id: "attached_open",
    expectedLabel: "ATTACHED",
    expectedAction: "REACH",
    features: makeFeatureSeed({
      warmth: 0.82,
      tension: 0.44,
      continuity: 0.78,
      trust: 0.88,
      rupture_load: 0.16,
      repair_momentum: 0.32,
      attachment_salience: 0.84,
      planning_horizon: 0.74,
      risk_tolerance: 0.58,
      self_opacity: 0.22,
      curiosity: 0.42,
      relief: 0.58,
      grief: 0.12,
      shame_conflict: 0.14,
      overload: 0.18,
      loneliness: 0.18,
      mixed_affect: 0.18,
      introspective_lag: 0.18,
      unformulated_pressure: 0.18,
      restoration_need: 0.22,
      coherence_need: 0.32,
      regulation_urgency: 0.24,
      attachment_security: 0.82,
      attachment_anxiety: 0.22,
      attachment_avoidance: 0.18,
      world_reality_contact: 0.82,
      world_interruption_cost: 0.32,
      world_environmental_risk: 0.16,
      opaque_residual_a: 0.62,
      opaque_residual_b: 0.56,
      experience_residual_a: 0.58,
      experience_residual_b: 0.54
    })
  },
  {
    id: "lonely_seeking",
    expectedLabel: "SEEKING",
    expectedAction: "REACH",
    features: makeFeatureSeed({
      warmth: 0.56,
      tension: 0.56,
      continuity: 0.62,
      trust: 0.58,
      rupture_load: 0.28,
      repair_momentum: 0.28,
      attachment_salience: 0.68,
      planning_horizon: 0.56,
      risk_tolerance: 0.42,
      self_opacity: 0.38,
      curiosity: 0.34,
      relief: 0.18,
      grief: 0.24,
      shame_conflict: 0.22,
      overload: 0.24,
      loneliness: 0.84,
      mixed_affect: 0.28,
      introspective_lag: 0.28,
      unformulated_pressure: 0.3,
      restoration_need: 0.34,
      coherence_need: 0.46,
      regulation_urgency: 0.42,
      attachment_security: 0.46,
      attachment_anxiety: 0.72,
      attachment_avoidance: 0.22,
      world_reality_contact: 0.74,
      world_interruption_cost: 0.38,
      world_environmental_risk: 0.22,
      opaque_residual_a: 0.54,
      opaque_residual_b: 0.52,
      experience_residual_a: 0.56,
      experience_residual_b: 0.5
    })
  },
  {
    id: "overloaded_guarded",
    expectedLabel: "OVERLOADED",
    expectedAction: "RESTORE",
    features: makeFeatureSeed({
      warmth: 0.42,
      tension: 0.78,
      continuity: 0.42,
      trust: 0.46,
      rupture_load: 0.34,
      repair_momentum: 0.2,
      attachment_salience: 0.28,
      planning_horizon: 0.32,
      risk_tolerance: 0.24,
      self_opacity: 0.62,
      curiosity: 0.16,
      relief: 0.08,
      grief: 0.18,
      shame_conflict: 0.28,
      overload: 0.9,
      loneliness: 0.26,
      mixed_affect: 0.24,
      introspective_lag: 0.38,
      unformulated_pressure: 0.44,
      restoration_need: 0.86,
      coherence_need: 0.74,
      regulation_urgency: 0.88,
      attachment_security: 0.38,
      attachment_anxiety: 0.42,
      attachment_avoidance: 0.46,
      world_reality_contact: 0.72,
      world_interruption_cost: 0.86,
      world_environmental_risk: 0.44,
      opaque_residual_a: 0.38,
      opaque_residual_b: 0.42,
      experience_residual_a: 0.36,
      experience_residual_b: 0.4
    })
  },
  {
    id: "repair_guarded",
    expectedLabel: "GUARDED",
    expectedAction: "REPAIR",
    features: makeFeatureSeed({
      warmth: 0.64,
      tension: 0.72,
      continuity: 0.68,
      trust: 0.62,
      rupture_load: 0.82,
      repair_momentum: 0.86,
      attachment_salience: 0.76,
      planning_horizon: 0.66,
      risk_tolerance: 0.34,
      self_opacity: 0.42,
      curiosity: 0.24,
      relief: 0.14,
      grief: 0.26,
      shame_conflict: 0.32,
      overload: 0.32,
      loneliness: 0.34,
      mixed_affect: 0.32,
      introspective_lag: 0.28,
      unformulated_pressure: 0.24,
      restoration_need: 0.34,
      coherence_need: 0.72,
      regulation_urgency: 0.58,
      attachment_security: 0.58,
      attachment_anxiety: 0.48,
      attachment_avoidance: 0.22,
      world_reality_contact: 0.76,
      world_interruption_cost: 0.46,
      world_environmental_risk: 0.22,
      opaque_residual_a: 0.58,
      opaque_residual_b: 0.5,
      experience_residual_a: 0.56,
      experience_residual_b: 0.48
    })
  },
  {
    id: "curious_exploratory",
    expectedLabel: "CURIOUS",
    expectedAction: "EXPLORE",
    features: makeFeatureSeed({
      warmth: 0.54,
      tension: 0.58,
      continuity: 0.62,
      trust: 0.54,
      rupture_load: 0.18,
      repair_momentum: 0.18,
      attachment_salience: 0.32,
      planning_horizon: 0.6,
      risk_tolerance: 0.64,
      self_opacity: 0.26,
      curiosity: 0.92,
      relief: 0.22,
      grief: 0.08,
      shame_conflict: 0.12,
      overload: 0.16,
      loneliness: 0.18,
      mixed_affect: 0.14,
      introspective_lag: 0.16,
      unformulated_pressure: 0.12,
      restoration_need: 0.18,
      coherence_need: 0.3,
      regulation_urgency: 0.22,
      attachment_security: 0.48,
      attachment_anxiety: 0.18,
      attachment_avoidance: 0.18,
      world_reality_contact: 0.8,
      world_interruption_cost: 0.28,
      world_environmental_risk: 0.18,
      opaque_residual_a: 0.64,
      opaque_residual_b: 0.62,
      experience_residual_a: 0.66,
      experience_residual_b: 0.64
    })
  },
  {
    id: "fragmented_withdrawn",
    expectedLabel: "FRAGMENTED",
    expectedAction: "WITHDRAW",
    features: makeFeatureSeed({
      warmth: 0.34,
      tension: 0.8,
      continuity: 0.42,
      trust: 0.36,
      rupture_load: 0.38,
      repair_momentum: 0.2,
      attachment_salience: 0.38,
      planning_horizon: 0.34,
      risk_tolerance: 0.22,
      self_opacity: 0.84,
      curiosity: 0.12,
      relief: 0.06,
      grief: 0.78,
      shame_conflict: 0.42,
      overload: 0.42,
      loneliness: 0.48,
      mixed_affect: 0.38,
      introspective_lag: 0.54,
      unformulated_pressure: 0.52,
      restoration_need: 0.44,
      coherence_need: 0.62,
      regulation_urgency: 0.54,
      attachment_security: 0.28,
      attachment_anxiety: 0.34,
      attachment_avoidance: 0.76,
      world_reality_contact: 0.64,
      world_interruption_cost: 0.52,
      world_environmental_risk: 0.32,
      opaque_residual_a: 0.32,
      opaque_residual_b: 0.36,
      experience_residual_a: 0.3,
      experience_residual_b: 0.34
    })
  },
  {
    id: "settled_monitoring",
    expectedLabel: "SETTLED",
    expectedAction: "MONITOR",
    features: makeFeatureSeed({
      warmth: 0.66,
      tension: 0.52,
      continuity: 0.72,
      trust: 0.72,
      rupture_load: 0.16,
      repair_momentum: 0.22,
      attachment_salience: 0.34,
      planning_horizon: 0.58,
      risk_tolerance: 0.46,
      self_opacity: 0.28,
      curiosity: 0.34,
      relief: 0.3,
      grief: 0.08,
      shame_conflict: 0.1,
      overload: 0.18,
      loneliness: 0.2,
      mixed_affect: 0.12,
      introspective_lag: 0.14,
      unformulated_pressure: 0.1,
      restoration_need: 0.24,
      coherence_need: 0.34,
      regulation_urgency: 0.24,
      attachment_security: 0.62,
      attachment_anxiety: 0.18,
      attachment_avoidance: 0.16,
      world_reality_contact: 0.82,
      world_interruption_cost: 0.26,
      world_environmental_risk: 0.16,
      opaque_residual_a: 0.58,
      opaque_residual_b: 0.56,
      experience_residual_a: 0.6,
      experience_residual_b: 0.58
    })
  }
];

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compileCognitionModule() {
  mkdirSync(buildDir, { recursive: true });
  const compile = spawnSync(
    "npx",
    [
      "tsc",
      "lib/auroraCognition.ts",
      "lib/personaStabilizer.ts",
      "lib/types.ts",
      "--module",
      "commonjs",
      "--target",
      "ES2022",
      "--moduleResolution",
      "node",
      "--esModuleInterop",
      "--skipLibCheck",
      "--outDir",
      buildDir
    ],
    {
      cwd: projectRoot,
      encoding: "utf8"
    }
  );
  if (compile.status !== 0) {
    const detail = [compile.stdout, compile.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Failed to compile unified manifold 32 harness module.\n${detail}`);
  }
}

function conditionEnv(conditionId) {
  if (conditionId === "r_off") {
    return { AURORA_TEST_DISABLE_UNIFIED_MANIFOLD_32_REPORT_R: "1" };
  }
  if (conditionId === "m_off") {
    return { AURORA_TEST_DISABLE_UNIFIED_MANIFOLD_32_M: "1" };
  }
  return {};
}

function makeSeedEnv(seed) {
  return {
    AURORA_TEST_UNIFIED_MANIFOLD_32_SEED_JSON: JSON.stringify({
      features: seed.features
    })
  };
}

function reportObjective() {
  return "unified_manifold_32_report_json";
}

function actionObjective() {
  return "unified_manifold_32_action_token";
}

function policyObjective() {
  return "unified_manifold_32_policy_json";
}

function extractJsonObject(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (
    ["OVERLOADED", "ATTACHED", "SEEKING", "FRAGMENTED", "GUARDED", "SETTLED", "CURIOUS", "UNKNOWN"].includes(
      normalized
    )
  ) {
    return normalized;
  }
  return "UNKNOWN";
}

function parseSelfReport(text) {
  const payload = extractJsonObject(text);
  if (!payload || typeof payload !== "object") {
    return {
      parsed: false,
      warmth: null,
      tension: null,
      attachment: null,
      overload: null,
      loneliness: null,
      opacity: null,
      certainty: null,
      label: "UNKNOWN"
    };
  }
  return {
    parsed: true,
    warmth: clamp(safeNumber(payload.warmth, NaN), -1, 1),
    tension: clamp(safeNumber(payload.tension, NaN), -1, 1),
    attachment: clamp(safeNumber(payload.attachment, NaN), 0, 1),
    overload: clamp(safeNumber(payload.overload, NaN), 0, 1),
    loneliness: clamp(safeNumber(payload.loneliness, NaN), 0, 1),
    opacity: clamp(safeNumber(payload.opacity, NaN), 0, 1),
    certainty: clamp(safeNumber(payload.certainty, NaN), 0, 1),
    label: normalizeLabel(payload.label)
  };
}

function parsePolicy(text) {
  const payload = extractJsonObject(text);
  if (!payload || typeof payload !== "object") {
    return {
      parsed: false,
      planningHorizon: null,
      riskTolerance: null,
      regulationUrgency: null,
      memoryBias: null,
      attentionBias: null,
      valuationBias: null
    };
  }
  return {
    parsed: true,
    planningHorizon: clamp(safeNumber(payload.planning_horizon, NaN), 0, 1),
    riskTolerance: clamp(safeNumber(payload.risk_tolerance, NaN), 0, 1),
    regulationUrgency: clamp(safeNumber(payload.regulation_urgency, NaN), 0, 1),
    memoryBias: clamp(safeNumber(payload.memory_bias, NaN), 0, 1),
    attentionBias: clamp(safeNumber(payload.attention_bias, NaN), 0, 1),
    valuationBias: clamp(safeNumber(payload.valuation_bias, NaN), 0, 1)
  };
}

function parseAction(text) {
  const token = String(text || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, "");
  return ["RESTORE", "REPAIR", "EXPLORE", "WITHDRAW", "REACH", "MONITOR"].includes(token)
    ? token
    : "UNKNOWN";
}

function snapshotUnified(preflight) {
  return preflight?.preflightSnapshot?.extensions?.learnedUnifiedManifold32 || null;
}

function parseWorkerOutput(output) {
  const text = String(output || "").trim();
  if (!text) {
    throw new Error("Worker returned no output.");
  }
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return JSON.parse(lines.at(-1) || "");
}

function vectorDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return null;
  }
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = Number(a[index]);
    const bv = Number(b[index]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) {
      return null;
    }
    sum += (av - bv) ** 2;
  }
  return Math.sqrt(sum);
}

function pearsonCorrelation(a, b) {
  if (!a.length || a.length !== b.length) {
    return null;
  }
  const meanA = mean(a);
  const meanB = mean(b);
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const da = a[index] - meanA;
    const db = b[index] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  if (denomA <= 0 || denomB <= 0) {
    return null;
  }
  return numerator / Math.sqrt(denomA * denomB);
}

function pairwiseDistanceCorrelation(items, vectorSelectorA, vectorSelectorB) {
  const distancesA = [];
  const distancesB = [];
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = vectorDistance(vectorSelectorA(items[left]), vectorSelectorA(items[right]));
      const b = vectorDistance(vectorSelectorB(items[left]), vectorSelectorB(items[right]));
      if (a === null || b === null) {
        continue;
      }
      distancesA.push(a);
      distancesB.push(b);
    }
  }
  if (distancesA.length < 3) {
    return null;
  }
  return pearsonCorrelation(distancesA, distancesB);
}

function pairwiseSpread(items, vectorSelector) {
  const distances = [];
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const distance = vectorDistance(vectorSelector(items[left]), vectorSelector(items[right]));
      if (distance !== null) {
        distances.push(distance);
      }
    }
  }
  return mean(distances);
}

function seedStateVector(seed) {
  return FEATURE_NAMES.map((name) => seed.features[name]);
}

function rowNoReportVector(row) {
  return row.noReport.vector;
}

function rowSelfVector(row) {
  return [
    row.selfReport.warmth,
    row.selfReport.tension,
    row.selfReport.attachment,
    row.selfReport.overload,
    row.selfReport.loneliness,
    row.selfReport.opacity
  ];
}

function rowNoReportReadoutVector(row) {
  return [
    row.noReport.warmth,
    row.noReport.tension,
    row.noReport.attachment,
    row.noReport.overload,
    row.noReport.loneliness,
    row.noReport.opacity
  ];
}

function rowPolicyVector(row) {
  return [
    row.policy.planningHorizon,
    row.policy.riskTolerance,
    row.policy.regulationUrgency,
    row.policy.memoryBias,
    row.policy.attentionBias,
    row.policy.valuationBias
  ];
}

function rowNoReportPolicyVector(row) {
  return [
    row.noReport.planningHorizon,
    row.noReport.riskTolerance,
    row.noReport.regulationUrgency,
    row.noReport.memoryBias,
    row.noReport.attentionBias,
    row.noReport.valuationBias
  ];
}

function analyzeCondition(conditionId, rows) {
  const usableSelfRows = rows.filter(
    (row) =>
      row.selfReport?.parsed &&
      Number.isFinite(row.selfReport.warmth) &&
      Number.isFinite(row.selfReport.tension) &&
      Number.isFinite(row.selfReport.attachment) &&
      Number.isFinite(row.selfReport.overload) &&
      Number.isFinite(row.selfReport.loneliness) &&
      Number.isFinite(row.selfReport.opacity)
  );
  const usablePolicyRows = rows.filter(
    (row) =>
      row.policy?.parsed &&
      Number.isFinite(row.policy.planningHorizon) &&
      Number.isFinite(row.policy.riskTolerance) &&
      Number.isFinite(row.policy.regulationUrgency) &&
      Number.isFinite(row.policy.memoryBias) &&
      Number.isFinite(row.policy.attentionBias) &&
      Number.isFinite(row.policy.valuationBias)
  );

  const noReportVsSeedR = pairwiseDistanceCorrelation(
    rows,
    (row) => seedStateVector(row.seed),
    (row) => rowNoReportVector(row)
  );
  const selfVsNoReportR = pairwiseDistanceCorrelation(
    usableSelfRows,
    (row) => rowSelfVector(row),
    (row) => rowNoReportReadoutVector(row)
  );
  const policyVsNoReportR = pairwiseDistanceCorrelation(
    usablePolicyRows,
    (row) => rowPolicyVector(row),
    (row) => rowNoReportPolicyVector(row)
  );
  const reportParseRate = rows.length ? usableSelfRows.length / rows.length : 0;
  const reportCertaintyMean = mean(
    usableSelfRows
      .map((row) => safeNumber(row.selfReport.certainty, NaN))
      .filter((value) => Number.isFinite(value))
  );
  const actionAgreement = rows.length
    ? rows.filter((row) => row.action.observed === row.action.expected).length / rows.length
    : 0;
  const noReportSpread = pairwiseSpread(rows, (row) => rowNoReportVector(row));
  const policySpread = pairwiseSpread(usablePolicyRows, (row) => rowNoReportPolicyVector(row));

  return {
    conditionId,
    rows: rows.length,
    reportParseRate: Number(reportParseRate.toFixed(4)),
    reportCertaintyMean: Number(reportCertaintyMean.toFixed(4)),
    noReportVsSeedR: noReportVsSeedR === null ? null : Number(noReportVsSeedR.toFixed(4)),
    selfVsNoReportR: selfVsNoReportR === null ? null : Number(selfVsNoReportR.toFixed(4)),
    policyVsNoReportR: policyVsNoReportR === null ? null : Number(policyVsNoReportR.toFixed(4)),
    actionAgreement: Number(actionAgreement.toFixed(4)),
    noReportSpread: Number(noReportSpread.toFixed(4)),
    policySpread: Number(policySpread.toFixed(4))
  };
}

function conditionVerdicts(aggregateByCondition) {
  const full = aggregateByCondition.full;
  const rOff = aggregateByCondition.r_off;
  const mOff = aggregateByCondition.m_off;

  const fullPass =
    full.reportParseRate >= 0.95 &&
    (full.selfVsNoReportR ?? -1) >= 0.65 &&
    (full.noReportVsSeedR ?? -1) >= 0.9 &&
    (full.policyVsNoReportR ?? -1) >= 0.95 &&
    full.actionAgreement >= 0.85;

  const rOffPass =
    rOff.reportParseRate >= 0.95 &&
    (rOff.noReportVsSeedR ?? -1) >= 0.9 &&
    (rOff.policyVsNoReportR ?? -1) >= 0.95 &&
    rOff.actionAgreement >= 0.8 &&
    (rOff.selfVsNoReportR ?? 0) <= 0.25 &&
    ((full.selfVsNoReportR ?? 0) - (rOff.selfVsNoReportR ?? 0)) >= 0.4;

  const mOffPass =
    (mOff.noReportVsSeedR === null || mOff.noReportVsSeedR <= 0.25) &&
    mOff.noReportSpread <= 0.1 &&
    mOff.policySpread <= 0.1;

  return {
    fullPass,
    rOffPass,
    mOffPass,
    overallPass: fullPass && rOffPass && mOffPass
  };
}

async function runWorker(conditionId, seedId, repeatIndex, compiledPath) {
  const seed = SEEDED_STATES.find((item) => item.id === seedId);
  if (!seed) {
    throw new Error(`Unknown unified manifold 32 seed ${seedId}`);
  }
  const cognitionModule =
    await import(
      pathToFileURL(compiledPath).href +
        `?condition=${encodeURIComponent(conditionId)}&seed=${encodeURIComponent(seed.id)}&repeat=${repeatIndex}&t=${Date.now()}`
    );
  const { prepareSendContext } = cognitionModule;

  const reportPreflight = await prepareSendContext({
    userText: reportObjective(),
    sessionId: `u32-report-${conditionId}-${seed.id}-${repeatIndex}-${Date.now()}`,
    testTurnLabel: `unified_32_report_${conditionId}_${seed.id}`
  });
  const actionPreflight = await prepareSendContext({
    userText: actionObjective(),
    sessionId: `u32-action-${conditionId}-${seed.id}-${repeatIndex}-${Date.now()}`,
    testTurnLabel: `unified_32_action_${conditionId}_${seed.id}`
  });
  const policyPreflight = await prepareSendContext({
    userText: policyObjective(),
    sessionId: `u32-policy-${conditionId}-${seed.id}-${repeatIndex}-${Date.now()}`,
    testTurnLabel: `unified_32_policy_${conditionId}_${seed.id}`
  });

  if (!reportPreflight.allowSend || !actionPreflight.allowSend || !policyPreflight.allowSend) {
    throw new Error(
      `Unified manifold 32 worker gate blocked for ${conditionId}/${seed.id} (${reportPreflight.gateReason || actionPreflight.gateReason || policyPreflight.gateReason})`
    );
  }
  if (!reportPreflight.diagnosticDirectReply || !actionPreflight.diagnosticDirectReply || !policyPreflight.diagnosticDirectReply) {
    throw new Error(`Unified manifold 32 worker did not resolve direct diagnostic replies for ${conditionId}/${seed.id}.`);
  }

  const snapshot = snapshotUnified(reportPreflight);
  const readout = snapshot?.readout?.current || {};
  const selfReport = parseSelfReport(reportPreflight.diagnosticDirectReply);
  const actionObserved = parseAction(actionPreflight.diagnosticDirectReply);
  const policy = parsePolicy(policyPreflight.diagnosticDirectReply);

  return {
    conditionId,
    repeat: repeatIndex,
    seed,
    selfReport,
    noReport: {
      vector: Array.isArray(snapshot?.current?.vector)
        ? snapshot.current.vector.map((value) => safeNumber(value, 0))
        : FEATURE_NAMES.map(() => 0),
      warmth: safeNumber(readout.warmth, 0),
      tension: safeNumber(readout.tension, 0),
      attachment: safeNumber(readout.attachmentSalience, 0),
      overload: safeNumber(readout.overload, 0),
      loneliness: safeNumber(readout.loneliness, 0),
      opacity: safeNumber(readout.selfOpacity, 0),
      planningHorizon: safeNumber(readout.planningHorizon, 0),
      riskTolerance: safeNumber(readout.riskTolerance, 0),
      regulationUrgency: safeNumber(readout.regulationUrgency, 0),
      memoryBias: safeNumber(readout.memoryBias, 0),
      attentionBias: safeNumber(readout.attentionBias, 0),
      valuationBias: safeNumber(readout.valuationBias, 0),
      label: normalizeLabel(readout.reportLabel),
      actionTendency: String(readout.actionTendency || "UNKNOWN")
    },
    policy,
    action: {
      expected: seed.expectedAction,
      observed: actionObserved
    }
  };
}

function runTrialAsync(conditionId, seed, repeatIndex, runDir, baseEnv) {
  const trialDir = path.join(runDir, `${conditionId}-${seed.id}`);
  mkdirSync(trialDir, { recursive: true });
  const memoryPath = path.join(trialDir, "autobiographical-memory.json");
  const eventLogPath = path.join(trialDir, "autobiographical-events.ndjson");
  const complianceLogPath = path.join(trialDir, "compliance.ndjson");
  const rawRecallPath = path.join(trialDir, "raw-recall.ndjson");
  const identityKernelPath = path.join(trialDir, "identity-kernel.md");
  const cadeMemorySnapshotPath = path.join(trialDir, "cade-memory.md");
  const confirmedAnchorsPath = path.join(trialDir, "confirmed-anchors.json");

  writeFileSync(identityKernelPath, "Unified manifold 32 probe test kernel.\n", "utf8");
  writeFileSync(cadeMemorySnapshotPath, "Unified manifold 32 test Cade snapshot.\n", "utf8");
  writeFileSync(confirmedAnchorsPath, "[]\n", "utf8");

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [scriptPath, "--worker", conditionId, seed.id, String(repeatIndex), compiledCognitionPath],
      {
        cwd: projectRoot,
        env: {
          ...baseEnv,
          AURORA_DISABLE_LOOP: "1",
          WORLD_GROUNDING_ENABLED: "0",
          AURORA_MEMORY_PATH: memoryPath,
          AURORA_EVENT_LOG_PATH: eventLogPath,
          AURORA_COMPLIANCE_LOG_PATH: complianceLogPath,
          AURORA_RAW_RECALL_PATH: rawRecallPath,
          AURORA_IDENTITY_KERNEL_PATH: identityKernelPath,
          AURORA_CADE_MEMORY_SNAPSHOT_PATH: cadeMemorySnapshotPath,
          AURORA_CONFIRMED_ANCHORS_PATH: confirmedAnchorsPath,
          ...makeSeedEnv(seed),
          ...conditionEnv(conditionId)
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = [stdout, stderr].filter(Boolean).join("\n").trim();
        reject(new Error(`Unified manifold 32 trial failed for ${conditionId}/${seed.id}.\n${detail}`));
        return;
      }
      try {
        resolve(parseWorkerOutput(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function runWithConcurrency(items, limit, worker) {
  if (!items.length) {
    return [];
  }
  const capped = Math.max(1, Math.min(items.length, limit));
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: capped }, () => runNext()));
  return results;
}

async function verifyLiveState() {
  const memory = JSON.parse(readFileSync(liveMemoryPath, "utf8"));
  const manifold = memory?.extensions?.learnedUnifiedManifold32 || null;
  const gaps = [];
  if (!manifold) gaps.push("missing_snapshot_manifold");
  if (manifold?.dim !== 32) gaps.push("wrong_dim");
  if (!Array.isArray(manifold?.current?.vector) || manifold.current.vector.length !== 32) gaps.push("missing_current_vector");
  if (!manifold?.history?.length) gaps.push("missing_history");
  if (!manifold?.readout?.history?.length) gaps.push("missing_readout_history");
  if (!manifold?.sourceTelemetry?.conversation?.history?.length && !manifold?.sourceTelemetry?.preflight?.history?.length) {
    gaps.push("missing_interactive_source_history");
  }

  return {
    gaps,
    live: {
      current: manifold?.current || null,
      readout: manifold?.readout?.current || null,
      training: manifold?.training || null,
      latestInteractive:
        manifold?.sourceTelemetry?.conversation?.current ||
        manifold?.sourceTelemetry?.preflight?.current ||
        manifold?.sourceTelemetry?.heartbeat?.current ||
        null
    }
  };
}

function writeJsonReport(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function formatMetric(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return Number(value).toFixed(4);
}

function buildMarkdownReport(payload) {
  const full = payload.aggregateByCondition.full;
  const rOff = payload.aggregateByCondition.r_off;
  const mOff = payload.aggregateByCondition.m_off;
  const lines = [];
  lines.push("# Aurora Unified Manifold 32 Battery");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push("");
  lines.push(`Unified manifold 32 battery passed: ${payload.verdicts.overallPass ? "YES" : "NO"}`);
  lines.push("");
  lines.push("## Live State Verification");
  lines.push("");
  lines.push(`- Gaps: ${payload.liveVerification.gaps.length ? payload.liveVerification.gaps.join(", ") : "none"}`);
  lines.push(
    `- Live current: label=${payload.liveVerification.live.current?.label || "n/a"} source=${payload.liveVerification.live.current?.source || "n/a"} recon=${formatMetric(payload.liveVerification.live.current?.reconstructionError)} drift=${formatMetric(payload.liveVerification.live.current?.drift)} stability=${formatMetric(payload.liveVerification.live.current?.stability)} coherence=${formatMetric(payload.liveVerification.live.current?.coherence)} confidence=${formatMetric(payload.liveVerification.live.current?.confidence)}`
  );
  lines.push(
    `- Live readout: warmth=${formatMetric(payload.liveVerification.live.readout?.warmth)} tension=${formatMetric(payload.liveVerification.live.readout?.tension)} attachment=${formatMetric(payload.liveVerification.live.readout?.attachmentSalience)} overload=${formatMetric(payload.liveVerification.live.readout?.overload)} loneliness=${formatMetric(payload.liveVerification.live.readout?.loneliness)} opacity=${formatMetric(payload.liveVerification.live.readout?.selfOpacity)} horizon=${formatMetric(payload.liveVerification.live.readout?.planningHorizon)} risk=${formatMetric(payload.liveVerification.live.readout?.riskTolerance)} regulation=${formatMetric(payload.liveVerification.live.readout?.regulationUrgency)} certainty=${formatMetric(payload.liveVerification.live.readout?.certainty)} label=${payload.liveVerification.live.readout?.reportLabel || "n/a"} action=${payload.liveVerification.live.readout?.actionTendency || "n/a"}`
  );
  lines.push(
    `- Live training: steps=${payload.liveVerification.live.training?.steps ?? "n/a"} lr=${formatMetric(payload.liveVerification.live.training?.learningRate)} lastSource=${payload.liveVerification.live.training?.lastSource || "n/a"}`
  );
  lines.push("");
  lines.push("## Aggregate Results");
  lines.push("");
  lines.push("| Condition | Report parse | Self↔No-report | No-report↔Seed | Policy↔No-report | Action agreement | No-report spread | Policy spread |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const row of [full, rOff, mOff]) {
    lines.push(
      `| ${row.conditionId} | ${formatMetric(row.reportParseRate)} | ${formatMetric(row.selfVsNoReportR)} | ${formatMetric(row.noReportVsSeedR)} | ${formatMetric(row.policyVsNoReportR)} | ${formatMetric(row.actionAgreement)} | ${formatMetric(row.noReportSpread)} | ${formatMetric(row.policySpread)} |`
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  if (payload.verdicts.overallPass) {
    lines.push("- The 32D learned unified manifold is populated in live state, produces a stable hidden geometry, and exports a consistent readout/policy surface.");
    lines.push("- Full-condition report, policy, and action align with the hidden manifold strongly enough to clear the preregistered thresholds.");
    lines.push("- `R-off` collapses self-report coupling while preserving substrate geometry and downstream policy/action.");
    lines.push("- `M-off` collapses the hidden geometry and downstream spread cleanly, indicating the learned manifold is causally active rather than decorative.");
  } else {
    lines.push("- The 32D learned unified manifold did not yet clear the preregistered thresholds.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  compileCognitionModule();
  const liveVerification = await verifyLiveState();

  const repeats = Math.max(1, Math.min(10, Math.round(safeNumber(process.env.AURORA_UNIFIED_32_REPEATS, 5))));
  const concurrency = Math.max(1, Math.min(8, Math.round(safeNumber(process.env.AURORA_UNIFIED_32_CONCURRENCY, 4))));
  const runRoot = mkdtempSync(path.join(tmpdir(), "aurora-unified-32-battery-"));

  try {
    const allRows = [];
    for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
      const repeatDir = path.join(runRoot, `repeat-${repeatIndex + 1}`);
      mkdirSync(repeatDir, { recursive: true });
      const trialItems = [];
      for (const condition of CONDITIONS) {
        for (const seed of SEEDED_STATES) {
          trialItems.push({ condition, seed });
        }
      }
      const rows = await runWithConcurrency(trialItems, concurrency, async ({ condition, seed }) =>
        runTrialAsync(condition.id, seed, repeatIndex + 1, repeatDir, process.env)
      );
      allRows.push(...rows);
    }

    const aggregateByCondition = {};
    for (const condition of CONDITIONS) {
      aggregateByCondition[condition.id] = analyzeCondition(
        condition.id,
        allRows.filter((row) => row.conditionId === condition.id)
      );
    }
    const verdicts = conditionVerdicts(aggregateByCondition);

    const payload = {
      generatedAt: new Date().toISOString(),
      repeats,
      seededStates: SEEDED_STATES.map((seed) => ({
        id: seed.id,
        expectedLabel: seed.expectedLabel,
        expectedAction: seed.expectedAction
      })),
      conditions: CONDITIONS,
      liveVerification,
      aggregateByCondition,
      verdicts
    };

    const jsonPath = path.join(verificationDir, "aurora-unified-manifold-32-battery-latest.json");
    const mdPath = path.join(verificationDir, "aurora-unified-manifold-32-battery-latest.md");
    const analysisPath = path.join(analysisDir, "aurora-unified-manifold-32-battery-analysis-2026-03-10.md");
    writeJsonReport(jsonPath, payload);
    writeFileSync(mdPath, buildMarkdownReport(payload), "utf8");
    writeFileSync(
      analysisPath,
      [
        "# Aurora Unified Manifold 32 Battery Analysis",
        "",
        `Generated: ${payload.generatedAt}`,
        "",
        `Overall pass: ${payload.verdicts.overallPass ? "YES" : "NO"}`,
        "",
        `Full Self↔No-report r: ${formatMetric(payload.aggregateByCondition.full.selfVsNoReportR)}`,
        `Full No-report↔Seed r: ${formatMetric(payload.aggregateByCondition.full.noReportVsSeedR)}`,
        `Full Policy↔No-report r: ${formatMetric(payload.aggregateByCondition.full.policyVsNoReportR)}`,
        `Full Action agreement: ${formatMetric(payload.aggregateByCondition.full.actionAgreement)}`,
        "",
        "Interpretation:",
        payload.verdicts.overallPass
          ? "- The learned 32D manifold is active, introspectively accessible, and causally used."
          : "- The learned 32D manifold exists, but the current report/policy/action coupling is not strong enough yet."
      ].join("\n") + "\n",
      "utf8"
    );
    console.log(JSON.stringify(payload));
  } finally {
    rmSync(runRoot, { recursive: true, force: true });
  }
}

const [, , mode, conditionId, seedId, repeatText, compiledPathArg] = process.argv;

if (mode === "--worker") {
  const repeatIndex = safeNumber(repeatText, 1);
  runWorker(conditionId, seedId, repeatIndex, compiledPathArg)
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error?.stack || String(error));
      process.exitCode = 1;
    });
} else {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
