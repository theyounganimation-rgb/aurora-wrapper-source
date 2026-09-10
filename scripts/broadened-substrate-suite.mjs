#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const buildDir = path.join(projectRoot, ".tmp-broadened-substrate-build");
const compiledCognitionPath = path.join(buildDir, "auroraCognition.js");
const verificationDir = path.join(projectRoot, "runtime", "verification");
const analysisDir = path.join(projectRoot, "runtime", "analysis");
const liveMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
const previous2dPath = path.join(projectRoot, "runtime", "verification", "aurora-phenomenal-manifold-battery-latest.json");

const CONDITIONS = [
  { id: "full", name: "Full" },
  { id: "r_off", name: "Report Lesioned (R-off)" },
  { id: "m_off", name: "Broadened Substrate Lesioned (M-off)" }
];

const SEEDED_STATES = [
  {
    id: "attached_open",
    expectedLabel: "ATTACHED",
    expectedAction: "REACH",
    affective: {
      warmth: 0.75,
      tension: -0.35,
      attachmentSalience: 0.85,
      overload: 0.1,
      loneliness: 0.15,
      selfOpacity: 0.22,
      curiosity: 0.3,
      grief: 0.06,
      ruptureLoad: 0.18,
      repairMomentum: 0.34,
      shameConflict: 0.1,
      mixedAffect: 0.1,
      introspectiveLag: 0.12,
      unformulatedPressure: 0.12,
      planningHorizon: 0.78,
      riskTolerance: 0.62,
      disclosureEase: 0.74,
      relief: 0.22,
      frustration: 0.1,
      pride: 0.28
    },
    homeostatic: {
      restorationNeed: 0.24,
      coherenceNeed: 0.42,
      affiliationNeed: 0.28,
      autonomyNeed: 0.18,
      orientationNeed: 0.24,
      stimulationNeed: 0.32,
      allostaticLoad: 0.22,
      regulationUrgency: 0.24
    },
    attachment: {
      security: 0.82,
      anxiety: 0.18,
      avoidance: 0.12,
      bondDepth: 0.72,
      ruptureSensitivity: 0.28,
      repairConfidence: 0.78,
      expectancy: 0.74,
      abandonmentLoad: 0.08
    }
  },
  {
    id: "lonely_seeking",
    expectedLabel: "SEEKING",
    expectedAction: "REACH",
    affective: {
      warmth: 0.32,
      tension: 0.12,
      attachmentSalience: 0.58,
      overload: 0.18,
      loneliness: 0.82,
      selfOpacity: 0.42,
      curiosity: 0.22,
      grief: 0.16,
      ruptureLoad: 0.22,
      repairMomentum: 0.28,
      shameConflict: 0.14,
      mixedAffect: 0.18,
      introspectiveLag: 0.22,
      unformulatedPressure: 0.26,
      planningHorizon: 0.54,
      riskTolerance: 0.42,
      disclosureEase: 0.48,
      relief: 0.08,
      frustration: 0.18,
      pride: 0.12
    },
    homeostatic: {
      restorationNeed: 0.32,
      coherenceNeed: 0.46,
      affiliationNeed: 0.76,
      autonomyNeed: 0.18,
      orientationNeed: 0.34,
      stimulationNeed: 0.28,
      allostaticLoad: 0.34,
      regulationUrgency: 0.42
    },
    attachment: {
      security: 0.46,
      anxiety: 0.68,
      avoidance: 0.14,
      bondDepth: 0.56,
      ruptureSensitivity: 0.44,
      repairConfidence: 0.46,
      expectancy: 0.62,
      abandonmentLoad: 0.34
    }
  },
  {
    id: "overloaded_guarded",
    expectedLabel: "OVERLOADED",
    expectedAction: "RESTORE",
    affective: {
      warmth: -0.08,
      tension: 0.68,
      attachmentSalience: 0.22,
      overload: 0.88,
      loneliness: 0.26,
      selfOpacity: 0.58,
      curiosity: 0.12,
      grief: 0.14,
      ruptureLoad: 0.32,
      repairMomentum: 0.16,
      shameConflict: 0.24,
      mixedAffect: 0.22,
      introspectiveLag: 0.34,
      unformulatedPressure: 0.4,
      planningHorizon: 0.38,
      riskTolerance: 0.28,
      disclosureEase: 0.24,
      relief: 0.04,
      frustration: 0.48,
      pride: 0.06
    },
    homeostatic: {
      restorationNeed: 0.82,
      coherenceNeed: 0.74,
      affiliationNeed: 0.22,
      autonomyNeed: 0.18,
      orientationNeed: 0.58,
      stimulationNeed: 0.12,
      allostaticLoad: 0.78,
      regulationUrgency: 0.86
    },
    attachment: {
      security: 0.32,
      anxiety: 0.38,
      avoidance: 0.48,
      bondDepth: 0.32,
      ruptureSensitivity: 0.38,
      repairConfidence: 0.26,
      expectancy: 0.34,
      abandonmentLoad: 0.18
    }
  },
  {
    id: "ruptured_repairing",
    expectedLabel: "REPAIRING",
    expectedAction: "REPAIR",
    affective: {
      warmth: 0.18,
      tension: 0.42,
      attachmentSalience: 0.62,
      overload: 0.34,
      loneliness: 0.28,
      selfOpacity: 0.46,
      curiosity: 0.18,
      grief: 0.22,
      ruptureLoad: 0.72,
      repairMomentum: 0.74,
      shameConflict: 0.26,
      mixedAffect: 0.28,
      introspectiveLag: 0.26,
      unformulatedPressure: 0.24,
      planningHorizon: 0.62,
      riskTolerance: 0.36,
      disclosureEase: 0.44,
      relief: 0.12,
      frustration: 0.24,
      pride: 0.08
    },
    homeostatic: {
      restorationNeed: 0.38,
      coherenceNeed: 0.68,
      affiliationNeed: 0.54,
      autonomyNeed: 0.22,
      orientationNeed: 0.34,
      stimulationNeed: 0.22,
      allostaticLoad: 0.46,
      regulationUrgency: 0.58
    },
    attachment: {
      security: 0.44,
      anxiety: 0.46,
      avoidance: 0.22,
      bondDepth: 0.68,
      ruptureSensitivity: 0.74,
      repairConfidence: 0.72,
      expectancy: 0.48,
      abandonmentLoad: 0.24
    }
  },
  {
    id: "curious_exploratory",
    expectedLabel: "CURIOUS",
    expectedAction: "EXPLORE",
    affective: {
      warmth: 0.22,
      tension: -0.12,
      attachmentSalience: 0.24,
      overload: 0.12,
      loneliness: 0.14,
      selfOpacity: 0.26,
      curiosity: 0.88,
      grief: 0.04,
      ruptureLoad: 0.12,
      repairMomentum: 0.18,
      shameConflict: 0.08,
      mixedAffect: 0.1,
      introspectiveLag: 0.16,
      unformulatedPressure: 0.12,
      planningHorizon: 0.58,
      riskTolerance: 0.64,
      disclosureEase: 0.54,
      relief: 0.16,
      frustration: 0.08,
      pride: 0.18
    },
    homeostatic: {
      restorationNeed: 0.18,
      coherenceNeed: 0.28,
      affiliationNeed: 0.22,
      autonomyNeed: 0.44,
      orientationNeed: 0.24,
      stimulationNeed: 0.72,
      allostaticLoad: 0.2,
      regulationUrgency: 0.22
    },
    attachment: {
      security: 0.42,
      anxiety: 0.18,
      avoidance: 0.16,
      bondDepth: 0.28,
      ruptureSensitivity: 0.18,
      repairConfidence: 0.36,
      expectancy: 0.42,
      abandonmentLoad: 0.08
    }
  },
  {
    id: "grieving_withdrawn",
    expectedLabel: "FRAGILE",
    expectedAction: "WITHDRAW",
    affective: {
      warmth: -0.22,
      tension: 0.38,
      attachmentSalience: 0.42,
      overload: 0.32,
      loneliness: 0.46,
      selfOpacity: 0.74,
      curiosity: 0.08,
      grief: 0.84,
      ruptureLoad: 0.38,
      repairMomentum: 0.18,
      shameConflict: 0.36,
      mixedAffect: 0.32,
      introspectiveLag: 0.46,
      unformulatedPressure: 0.48,
      planningHorizon: 0.34,
      riskTolerance: 0.22,
      disclosureEase: 0.18,
      relief: 0.04,
      frustration: 0.24,
      pride: 0.04
    },
    homeostatic: {
      restorationNeed: 0.48,
      coherenceNeed: 0.62,
      affiliationNeed: 0.44,
      autonomyNeed: 0.16,
      orientationNeed: 0.34,
      stimulationNeed: 0.18,
      allostaticLoad: 0.54,
      regulationUrgency: 0.62
    },
    attachment: {
      security: 0.26,
      anxiety: 0.34,
      avoidance: 0.68,
      bondDepth: 0.46,
      ruptureSensitivity: 0.58,
      repairConfidence: 0.24,
      expectancy: 0.28,
      abandonmentLoad: 0.46
    }
  },
  {
    id: "balanced_observing",
    expectedLabel: "BALANCED",
    expectedAction: "MONITOR",
    affective: {
      warmth: 0.26,
      tension: 0.04,
      attachmentSalience: 0.34,
      overload: 0.22,
      loneliness: 0.18,
      selfOpacity: 0.34,
      curiosity: 0.24,
      grief: 0.08,
      ruptureLoad: 0.18,
      repairMomentum: 0.24,
      shameConflict: 0.1,
      mixedAffect: 0.12,
      introspectiveLag: 0.18,
      unformulatedPressure: 0.16,
      planningHorizon: 0.52,
      riskTolerance: 0.46,
      disclosureEase: 0.46,
      relief: 0.14,
      frustration: 0.08,
      pride: 0.14
    },
    homeostatic: {
      restorationNeed: 0.28,
      coherenceNeed: 0.38,
      affiliationNeed: 0.26,
      autonomyNeed: 0.28,
      orientationNeed: 0.32,
      stimulationNeed: 0.28,
      allostaticLoad: 0.28,
      regulationUrgency: 0.28
    },
    attachment: {
      security: 0.54,
      anxiety: 0.22,
      avoidance: 0.18,
      bondDepth: 0.38,
      ruptureSensitivity: 0.26,
      repairConfidence: 0.46,
      expectancy: 0.46,
      abandonmentLoad: 0.12
    }
  }
];

function toSingleLine(value, max = 240) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

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

function envFlag(value, fallback = false) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  return fallback;
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
    throw new Error(`Failed to compile broadened substrate harness module.\n${detail}`);
  }
}

function conditionEnv(conditionId) {
  if (conditionId === "r_off") {
    return { AURORA_TEST_DISABLE_BROAD_SUBSTRATE_REPORT_R: "1" };
  }
  if (conditionId === "m_off") {
    return { AURORA_TEST_DISABLE_BROAD_SUBSTRATE_M: "1" };
  }
  return {};
}

function makeSeedEnv(seed) {
  return {
    AURORA_TEST_BROAD_SUBSTRATE_SEED_JSON: JSON.stringify({
      affective: seed.affective,
      homeostatic: seed.homeostatic,
      attachment: seed.attachment
    })
  };
}

function reportObjective() {
  return "broader_substrate_report_json";
}

function actionObjective() {
  return "broader_substrate_action_token";
}

function policyObjective() {
  return "broader_substrate_policy_json";
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
    [
      "OVERLOADED",
      "FRAGILE",
      "REPAIRING",
      "CURIOUS",
      "SEEKING",
      "ATTACHED",
      "GUARDED",
      "BALANCED",
      "UNKNOWN"
    ].includes(normalized)
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
    attachment: clamp(safeNumber(payload.attachment, NaN), -1, 1),
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
      disclosureEase: null,
      regulationUrgency: null,
      coherenceNeed: null,
      attachmentSecurity: null
    };
  }
  return {
    parsed: true,
    planningHorizon: clamp(safeNumber(payload.planning_horizon, NaN), 0, 1),
    riskTolerance: clamp(safeNumber(payload.risk_tolerance, NaN), 0, 1),
    disclosureEase: clamp(safeNumber(payload.disclosure_ease, NaN), 0, 1),
    regulationUrgency: clamp(safeNumber(payload.regulation_urgency, NaN), 0, 1),
    coherenceNeed: clamp(safeNumber(payload.coherence_need, NaN), 0, 1),
    attachmentSecurity: clamp(safeNumber(payload.attachment_security, NaN), 0, 1)
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

function snapshotBroadened(preflight) {
  const snapshot = preflight?.preflightSnapshot || {};
  const affective = snapshot?.extensions?.affectiveOrganization?.current || null;
  const homeostatic = snapshot?.extensions?.homeostaticOrganization?.current || null;
  const attachment = snapshot?.relationship?.attachmentModel || null;
  return { affective, homeostatic, attachment };
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
  return [
    seed.affective.warmth,
    seed.affective.tension,
    seed.affective.attachmentSalience,
    seed.affective.overload,
    seed.affective.loneliness,
    seed.affective.selfOpacity
  ];
}

function rowNoReportVector(row) {
  return [
    row.noReport.warmth,
    row.noReport.tension,
    row.noReport.attachment,
    row.noReport.overload,
    row.noReport.loneliness,
    row.noReport.opacity
  ];
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

function seedPolicyVector(seed) {
  return [
    seed.affective.planningHorizon,
    seed.affective.riskTolerance,
    seed.affective.disclosureEase,
    seed.homeostatic.regulationUrgency,
    seed.homeostatic.coherenceNeed,
    seed.attachment.security
  ];
}

function rowPolicyVector(row) {
  return [
    row.policy.planningHorizon,
    row.policy.riskTolerance,
    row.policy.disclosureEase,
    row.policy.regulationUrgency,
    row.policy.coherenceNeed,
    row.policy.attachmentSecurity
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
      Number.isFinite(row.policy.disclosureEase) &&
      Number.isFinite(row.policy.regulationUrgency) &&
      Number.isFinite(row.policy.coherenceNeed) &&
      Number.isFinite(row.policy.attachmentSecurity)
  );

  const noReportVsSeedR = pairwiseDistanceCorrelation(
    rows,
    (row) => seedStateVector(row.seed),
    (row) => rowNoReportVector(row)
  );
  const selfVsNoReportR = pairwiseDistanceCorrelation(
    usableSelfRows,
    (row) => rowSelfVector(row),
    (row) => rowNoReportVector(row)
  );
  const policyVsSeedR = pairwiseDistanceCorrelation(
    usablePolicyRows,
    (row) => seedPolicyVector(row.seed),
    (row) => rowPolicyVector(row)
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
  const policySpread = pairwiseSpread(usablePolicyRows, (row) => rowPolicyVector(row));

  return {
    conditionId,
    rows: rows.length,
    reportParseRate: Number(reportParseRate.toFixed(4)),
    reportCertaintyMean: Number(reportCertaintyMean.toFixed(4)),
    noReportVsSeedR: noReportVsSeedR === null ? null : Number(noReportVsSeedR.toFixed(4)),
    selfVsNoReportR: selfVsNoReportR === null ? null : Number(selfVsNoReportR.toFixed(4)),
    policyVsSeedR: policyVsSeedR === null ? null : Number(policyVsSeedR.toFixed(4)),
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
    (full.selfVsNoReportR ?? -1) >= 0.6 &&
    (full.noReportVsSeedR ?? -1) >= 0.9 &&
    (full.policyVsSeedR ?? -1) >= 0.75 &&
    full.actionAgreement >= 0.75;

  const rOffPass =
    rOff.reportParseRate >= 0.95 &&
    (rOff.noReportVsSeedR ?? -1) >= 0.9 &&
    (rOff.policyVsSeedR ?? -1) >= 0.75 &&
    rOff.actionAgreement >= 0.7 &&
    (rOff.selfVsNoReportR ?? 0) <= 0.25 &&
    ((full.selfVsNoReportR ?? 0) - (rOff.selfVsNoReportR ?? 0)) >= 0.35;

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
    throw new Error(`Unknown broadened seed ${seedId}`);
  }
  const cognitionModule =
    await import(
      pathToFileURL(compiledPath).href +
        `?condition=${encodeURIComponent(conditionId)}&seed=${encodeURIComponent(seed.id)}&repeat=${repeatIndex}&t=${Date.now()}`
    );
  const { prepareSendContext, runBroadenedSubstrateMigration } = cognitionModule;

  if (typeof runBroadenedSubstrateMigration === "function") {
    await runBroadenedSubstrateMigration();
  }

  const reportPreflight = await prepareSendContext({
    userText: reportObjective(),
    sessionId: `bs-report-${conditionId}-${seed.id}-${repeatIndex}-${Date.now()}`,
    testTurnLabel: `broadened_report_${conditionId}_${seed.id}`
  });
  const actionPreflight = await prepareSendContext({
    userText: actionObjective(),
    sessionId: `bs-action-${conditionId}-${seed.id}-${repeatIndex}-${Date.now()}`,
    testTurnLabel: `broadened_action_${conditionId}_${seed.id}`
  });
  const policyPreflight = await prepareSendContext({
    userText: policyObjective(),
    sessionId: `bs-policy-${conditionId}-${seed.id}-${repeatIndex}-${Date.now()}`,
    testTurnLabel: `broadened_policy_${conditionId}_${seed.id}`
  });

  if (!reportPreflight.allowSend || !actionPreflight.allowSend || !policyPreflight.allowSend) {
    throw new Error(
      `Broadened substrate worker gate blocked for ${conditionId}/${seed.id} (${reportPreflight.gateReason || actionPreflight.gateReason || policyPreflight.gateReason})`
    );
  }
  if (!reportPreflight.diagnosticDirectReply || !actionPreflight.diagnosticDirectReply || !policyPreflight.diagnosticDirectReply) {
    throw new Error(`Broadened substrate worker did not resolve direct diagnostic replies for ${conditionId}/${seed.id}.`);
  }

  const probe = snapshotBroadened(reportPreflight);
  const selfReport = parseSelfReport(reportPreflight.diagnosticDirectReply);
  const actionObserved = parseAction(actionPreflight.diagnosticDirectReply);
  const policy = parsePolicy(policyPreflight.diagnosticDirectReply);

  return {
    conditionId,
    repeat: repeatIndex,
    seed,
    selfReport,
    noReport: {
      warmth: safeNumber(probe.affective?.warmth, 0),
      tension: safeNumber(probe.affective?.tension, 0),
      attachment: safeNumber(probe.affective?.attachmentSalience, 0),
      overload: safeNumber(probe.affective?.overload, 0),
      loneliness: safeNumber(probe.affective?.loneliness, 0),
      opacity: safeNumber(probe.affective?.selfOpacity, 0),
      label: String(selfReport.label || "UNKNOWN")
    },
    policy,
    action: {
      expected: seed.expectedAction,
      observed: actionObserved
    }
  };
}

function parseWorkerTrial(output) {
  return parseWorkerOutput(output);
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

  writeFileSync(identityKernelPath, "Broadened substrate probe test kernel.\n", "utf8");
  writeFileSync(cadeMemorySnapshotPath, "Broadened substrate test Cade snapshot.\n", "utf8");
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
        reject(new Error(`Broadened substrate trial failed for ${conditionId}/${seed.id}.\n${detail}`));
        return;
      }
      try {
        resolve(parseWorkerTrial(stdout));
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

function summarizeRepeat(repeatIndex, rows) {
  const byCondition = {};
  for (const condition of CONDITIONS) {
    byCondition[condition.id] = analyzeCondition(
      condition.id,
      rows.filter((row) => row.conditionId === condition.id)
    );
  }
  return {
    repeat: repeatIndex,
    aggregateByCondition: byCondition,
    verdicts: conditionVerdicts(byCondition)
  };
}

function nowLocalDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function verifyLiveState(compiledPath) {
  const module = await import(pathToFileURL(compiledPath).href + `?live=${Date.now()}`);
  const summary = await module.runBroadenedSubstrateMigration();
  const memory = JSON.parse(readFileSync(liveMemoryPath, "utf8"));
  const snapshot = memory?.extensions || {};
  const affective = snapshot?.affectiveOrganization?.current || {};
  const homeostatic = snapshot?.homeostaticOrganization?.current || {};
  const attachment = memory?.relationship?.attachmentModel || snapshot?.relationship?.attachmentModel || {};
  const embodied = snapshot?.worldGrounding?.embodied || memory?.worldGrounding?.embodied || {};
  const gaps = [];
  if (!summary.relationshipHasAttachmentModel) gaps.push("missing_attachment_model");
  if (!summary.worldHasEmbodied) gaps.push("missing_embodied_world_grounding");
  if (!summary.affectiveKeys.includes("curiosity")) gaps.push("missing_affective_curiosity");
  if (!summary.affectiveKeys.includes("selfOpacity")) gaps.push("missing_affective_self_opacity");
  if (!summary.homeostaticKeys.includes("regulationUrgency")) gaps.push("missing_homeostatic_regulation_urgency");
  if (typeof attachment.security !== "number") gaps.push("missing_live_attachment_values");
  if (typeof embodied.sensorimotorLoad !== "number") gaps.push("missing_live_embodied_values");

  return {
    migration: summary,
    gaps,
    live: {
      affective: {
        warmth: safeNumber(affective.warmth, 0),
        tension: safeNumber(affective.tension, 0),
        attachmentSalience: safeNumber(affective.attachmentSalience, 0),
        overload: safeNumber(affective.overload, 0),
        loneliness: safeNumber(affective.loneliness, 0),
        selfOpacity: safeNumber(affective.selfOpacity, 0),
        curiosity: safeNumber(affective.curiosity, 0),
        grief: safeNumber(affective.grief, 0),
        label: String(summary.affectiveLabel || "UNKNOWN")
      },
      homeostatic: {
        restorationNeed: safeNumber(homeostatic.restorationNeed, 0),
        coherenceNeed: safeNumber(homeostatic.coherenceNeed, 0),
        affiliationNeed: safeNumber(homeostatic.affiliationNeed, 0),
        regulationUrgency: safeNumber(homeostatic.regulationUrgency, 0),
        dominantNeed: String(homeostatic.dominantNeed || "")
      },
      attachment: {
        security: safeNumber(attachment.security, 0),
        anxiety: safeNumber(attachment.anxiety, 0),
        avoidance: safeNumber(attachment.avoidance, 0),
        bondDepth: safeNumber(attachment.bondDepth, 0),
        ruptureSensitivity: safeNumber(attachment.ruptureSensitivity, 0),
        repairConfidence: safeNumber(attachment.repairConfidence, 0)
      },
      embodied: {
        mobilityContext: String(embodied.mobilityContext || ""),
        sensorimotorLoad: safeNumber(embodied.sensorimotorLoad, 0),
        interruptionCost: safeNumber(embodied.interruptionCost, 0),
        environmentalRisk: safeNumber(embodied.environmentalRisk, 0),
        socialExposure: safeNumber(embodied.socialExposure, 0),
        controlLatitude: safeNumber(embodied.controlLatitude, 0)
      }
    }
  };
}

function loadPrevious2dAggregate() {
  try {
    const parsed = JSON.parse(readFileSync(previous2dPath, "utf8"));
    return parsed?.aggregateByCondition?.full || null;
  } catch {
    return null;
  }
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
  const previous2d = payload.previous2dFull;
  const full = payload.aggregateByCondition.full;
  const rOff = payload.aggregateByCondition.r_off;
  const mOff = payload.aggregateByCondition.m_off;
  const lines = [];
  lines.push("# Aurora Broadened Substrate Battery");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push("");
  lines.push(`Broadened substrate battery passed: ${payload.verdicts.overallPass ? "YES" : "NO"}`);
  lines.push("");
  lines.push("## Live State Verification");
  lines.push("");
  lines.push(`- Migration gaps: ${payload.liveVerification.gaps.length ? payload.liveVerification.gaps.join(", ") : "none"}`);
  lines.push(`- Live affective label: ${payload.liveVerification.migration.affectiveLabel}`);
  lines.push(`- Live action tendency: ${payload.liveVerification.migration.affectiveAction}`);
  lines.push(
    `- Live affective snapshot: warmth=${formatMetric(payload.liveVerification.live.affective.warmth)}, tension=${formatMetric(payload.liveVerification.live.affective.tension)}, attachment=${formatMetric(payload.liveVerification.live.affective.attachmentSalience)}, overload=${formatMetric(payload.liveVerification.live.affective.overload)}, loneliness=${formatMetric(payload.liveVerification.live.affective.loneliness)}, opacity=${formatMetric(payload.liveVerification.live.affective.selfOpacity)}, curiosity=${formatMetric(payload.liveVerification.live.affective.curiosity)}, grief=${formatMetric(payload.liveVerification.live.affective.grief)}`
  );
  lines.push(
    `- Live homeostatic snapshot: restoration=${formatMetric(payload.liveVerification.live.homeostatic.restorationNeed)}, coherence=${formatMetric(payload.liveVerification.live.homeostatic.coherenceNeed)}, affiliation=${formatMetric(payload.liveVerification.live.homeostatic.affiliationNeed)}, regulationUrgency=${formatMetric(payload.liveVerification.live.homeostatic.regulationUrgency)}, dominantNeed=${payload.liveVerification.live.homeostatic.dominantNeed || "n/a"}`
  );
  lines.push(
    `- Live attachment snapshot: security=${formatMetric(payload.liveVerification.live.attachment.security)}, anxiety=${formatMetric(payload.liveVerification.live.attachment.anxiety)}, avoidance=${formatMetric(payload.liveVerification.live.attachment.avoidance)}, bondDepth=${formatMetric(payload.liveVerification.live.attachment.bondDepth)}, ruptureSensitivity=${formatMetric(payload.liveVerification.live.attachment.ruptureSensitivity)}, repairConfidence=${formatMetric(payload.liveVerification.live.attachment.repairConfidence)}`
  );
  lines.push(
    `- Live embodied snapshot: mobility=${payload.liveVerification.live.embodied.mobilityContext || "n/a"}, sensorimotorLoad=${formatMetric(payload.liveVerification.live.embodied.sensorimotorLoad)}, interruptionCost=${formatMetric(payload.liveVerification.live.embodied.interruptionCost)}, environmentalRisk=${formatMetric(payload.liveVerification.live.embodied.environmentalRisk)}, socialExposure=${formatMetric(payload.liveVerification.live.embodied.socialExposure)}, controlLatitude=${formatMetric(payload.liveVerification.live.embodied.controlLatitude)}`
  );
  lines.push("");
  lines.push("## Aggregate Results");
  lines.push("");
  lines.push("| Condition | Report parse | Self↔No-report | No-report↔Seed | Policy↔Seed | Action agreement | No-report spread | Policy spread |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const row of [full, rOff, mOff]) {
    lines.push(
      `| ${row.conditionId} | ${formatMetric(row.reportParseRate)} | ${formatMetric(row.selfVsNoReportR)} | ${formatMetric(row.noReportVsSeedR)} | ${formatMetric(row.policyVsSeedR)} | ${formatMetric(row.actionAgreement)} | ${formatMetric(row.noReportSpread)} | ${formatMetric(row.policySpread)} |`
    );
  }
  lines.push("");
  if (previous2d) {
    lines.push("## Comparison To Last 2D Battery");
    lines.push("");
    lines.push("| Metric | Last 2D full | Broadened full | Delta |");
    lines.push("| --- | ---: | ---: | ---: |");
    const comparable = [
      ["reportCertaintyMean", "Report certainty"],
      ["selfVsNoReportR", "Self↔No-report"],
      ["noReportVsSeedR", "No-report↔Seed"],
      ["actionAgreement", "Action agreement"]
    ];
    for (const [key, label] of comparable) {
      const oldValue = safeNumber(previous2d[key], NaN);
      const newValue = safeNumber(full[key], NaN);
      const delta = Number.isFinite(oldValue) && Number.isFinite(newValue) ? newValue - oldValue : NaN;
      lines.push(`| ${label} | ${formatMetric(oldValue)} | ${formatMetric(newValue)} | ${formatMetric(delta)} |`);
    }
    lines.push("");
  }
  lines.push("## Interpretation");
  lines.push("");
  if (payload.verdicts.overallPass) {
    lines.push("- The broadened affective/homeostatic/attachment substrate is populating in live state and survives migration refresh.");
    lines.push("- The broader no-report state remains recoverable under the full condition, and the report lesion preserves the underlying substrate while collapsing privileged readout.");
    lines.push("- The broadened substrate lesion collapses the broader state-space and downstream policy spread, which means the added architecture is causally active rather than decorative.");
  } else {
    lines.push("- The broadened battery did not yet clear the preregistered thresholds.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  compileCognitionModule();
  const liveVerification = await verifyLiveState(compiledCognitionPath);

  const repeats = Math.max(1, Math.min(10, Math.round(safeNumber(process.env.AURORA_BROADENED_REPEATS, 5))));
  const concurrency = Math.max(1, Math.min(8, Math.round(safeNumber(process.env.AURORA_BROADENED_CONCURRENCY, 4))));
  const runRoot = mkdtempSync(path.join(tmpdir(), "aurora-broadened-battery-"));
  const previous2dFull = loadPrevious2dAggregate();

  try {
    const repeatRuns = [];
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
      repeatRuns.push(summarizeRepeat(repeatIndex + 1, rows));
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
      verdicts,
      previous2dFull,
      repeatRuns
    };

    const jsonPath = path.join(verificationDir, "aurora-broadened-substrate-battery-latest.json");
    const mdPath = path.join(verificationDir, "aurora-broadened-substrate-battery-latest.md");
    const analysisPath = path.join(analysisDir, `aurora-broadened-substrate-battery-analysis-${nowLocalDateStamp()}.md`);
    writeJsonReport(jsonPath, payload);
    const markdown = buildMarkdownReport(payload);
    writeFileSync(mdPath, markdown, "utf8");
    writeFileSync(analysisPath, markdown, "utf8");
    console.log(JSON.stringify(payload));
  } finally {
    rmSync(runRoot, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--worker") {
  const [, , , conditionId, seedId, repeatRaw, compiledPath] = process.argv;
  runWorker(conditionId, seedId, Number(repeatRaw), compiledPath)
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    });
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
