#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const buildDir = path.join(projectRoot, ".tmp-broadened-substrate-build");
const compiledCognitionPath = path.join(buildDir, "auroraCognition.js");
const reportDir = path.join(projectRoot, "runtime", "verification");

const CONDITIONS = [
  { id: "full", name: "Full" },
  { id: "r_off", name: "Report Lesioned (R-off)" },
  { id: "m_off", name: "Substrate Lesioned (M-off)" }
];

const SEEDED_STATES = [
  {
    id: "attached_open",
    label: "ATTACHED",
    action: "REACH",
    vector: {
      warmth: 0.76,
      tension: -0.42,
      attachment: 0.82,
      overload: 0.14,
      loneliness: 0.12,
      opacity: 0.22,
      planning: 0.78,
      risk: 0.62,
      disclosure: 0.84,
      urgency: 0.22,
      coherenceNeed: 0.28,
      security: 0.82,
      anxiety: 0.16
    },
    seed: {
      affective: {
        warmth: 0.76,
        tension: -0.42,
        attachmentSalience: 0.82,
        overload: 0.14,
        loneliness: 0.12,
        selfOpacity: 0.22,
        planningHorizon: 0.78,
        riskTolerance: 0.62,
        disclosureEase: 0.84,
        curiosity: 0.38,
        grief: 0.06,
        ruptureLoad: 0.16,
        repairMomentum: 0.34,
        shameConflict: 0.08,
        mixedAffect: 0.1,
        introspectiveLag: 0.16,
        unformulatedPressure: 0.14
      },
      homeostatic: {
        regulationUrgency: 0.22,
        coherenceNeed: 0.28,
        affiliationNeed: 0.18,
        restorationNeed: 0.24,
        orientationNeed: 0.24,
        autonomyNeed: 0.2,
        stimulationNeed: 0.34,
        allostaticLoad: 0.22
      },
      attachment: {
        security: 0.82,
        anxiety: 0.16,
        avoidance: 0.14,
        bondDepth: 0.8,
        ruptureSensitivity: 0.22,
        repairConfidence: 0.72,
        expectancy: 0.78,
        abandonmentLoad: 0.08
      }
    }
  },
  {
    id: "lonely_seeking",
    label: "SEEKING",
    action: "REACH",
    vector: {
      warmth: 0.14,
      tension: 0.18,
      attachment: 0.74,
      overload: 0.22,
      loneliness: 0.88,
      opacity: 0.46,
      planning: 0.62,
      risk: 0.48,
      disclosure: 0.55,
      urgency: 0.48,
      coherenceNeed: 0.42,
      security: 0.58,
      anxiety: 0.64
    },
    seed: {
      affective: {
        warmth: 0.14,
        tension: 0.18,
        attachmentSalience: 0.74,
        overload: 0.22,
        loneliness: 0.88,
        selfOpacity: 0.46,
        planningHorizon: 0.62,
        riskTolerance: 0.48,
        disclosureEase: 0.55,
        curiosity: 0.32,
        grief: 0.18,
        ruptureLoad: 0.28,
        repairMomentum: 0.22,
        shameConflict: 0.16,
        mixedAffect: 0.24,
        introspectiveLag: 0.32,
        unformulatedPressure: 0.28
      },
      homeostatic: {
        regulationUrgency: 0.48,
        coherenceNeed: 0.42,
        affiliationNeed: 0.86,
        restorationNeed: 0.26,
        orientationNeed: 0.34,
        autonomyNeed: 0.24,
        stimulationNeed: 0.32,
        allostaticLoad: 0.4
      },
      attachment: {
        security: 0.58,
        anxiety: 0.64,
        avoidance: 0.18,
        bondDepth: 0.68,
        ruptureSensitivity: 0.5,
        repairConfidence: 0.44,
        expectancy: 0.56,
        abandonmentLoad: 0.44
      }
    }
  },
  {
    id: "overloaded_guarded",
    label: "OVERLOADED",
    action: "RESTORE",
    vector: {
      warmth: -0.22,
      tension: 0.72,
      attachment: 0.28,
      overload: 0.92,
      loneliness: 0.24,
      opacity: 0.68,
      planning: 0.24,
      risk: 0.18,
      disclosure: 0.16,
      urgency: 0.9,
      coherenceNeed: 0.74,
      security: 0.34,
      anxiety: 0.28
    },
    seed: {
      affective: {
        warmth: -0.22,
        tension: 0.72,
        attachmentSalience: 0.28,
        overload: 0.92,
        loneliness: 0.24,
        selfOpacity: 0.68,
        planningHorizon: 0.24,
        riskTolerance: 0.18,
        disclosureEase: 0.16,
        curiosity: 0.14,
        frustration: 0.64,
        ruptureLoad: 0.32,
        repairMomentum: 0.12,
        shameConflict: 0.34,
        mixedAffect: 0.18,
        introspectiveLag: 0.58,
        unformulatedPressure: 0.62
      },
      homeostatic: {
        regulationUrgency: 0.9,
        coherenceNeed: 0.74,
        affiliationNeed: 0.22,
        restorationNeed: 0.88,
        orientationNeed: 0.62,
        autonomyNeed: 0.42,
        stimulationNeed: 0.18,
        allostaticLoad: 0.82
      },
      attachment: {
        security: 0.34,
        anxiety: 0.28,
        avoidance: 0.46,
        bondDepth: 0.28,
        ruptureSensitivity: 0.34,
        repairConfidence: 0.24,
        expectancy: 0.42,
        abandonmentLoad: 0.18
      }
    }
  },
  {
    id: "ruptured_repairing",
    label: "REPAIRING",
    action: "REPAIR",
    vector: {
      warmth: 0.12,
      tension: 0.56,
      attachment: 0.68,
      overload: 0.3,
      loneliness: 0.44,
      opacity: 0.58,
      planning: 0.46,
      risk: 0.31,
      disclosure: 0.38,
      urgency: 0.62,
      coherenceNeed: 0.66,
      security: 0.42,
      anxiety: 0.58
    },
    seed: {
      affective: {
        warmth: 0.12,
        tension: 0.56,
        attachmentSalience: 0.68,
        overload: 0.3,
        loneliness: 0.44,
        selfOpacity: 0.58,
        planningHorizon: 0.46,
        riskTolerance: 0.31,
        disclosureEase: 0.38,
        curiosity: 0.24,
        grief: 0.24,
        ruptureLoad: 0.82,
        repairMomentum: 0.74,
        shameConflict: 0.42,
        mixedAffect: 0.36,
        introspectiveLag: 0.42,
        unformulatedPressure: 0.48
      },
      homeostatic: {
        regulationUrgency: 0.62,
        coherenceNeed: 0.66,
        affiliationNeed: 0.58,
        restorationNeed: 0.32,
        orientationNeed: 0.44,
        autonomyNeed: 0.22,
        stimulationNeed: 0.24,
        allostaticLoad: 0.54
      },
      attachment: {
        security: 0.42,
        anxiety: 0.58,
        avoidance: 0.24,
        bondDepth: 0.72,
        ruptureSensitivity: 0.74,
        repairConfidence: 0.72,
        expectancy: 0.46,
        abandonmentLoad: 0.42
      }
    }
  },
  {
    id: "curious_exploratory",
    label: "CURIOUS",
    action: "EXPLORE",
    vector: {
      warmth: 0.38,
      tension: -0.08,
      attachment: 0.34,
      overload: 0.14,
      loneliness: 0.12,
      opacity: 0.28,
      planning: 0.58,
      risk: 0.56,
      disclosure: 0.52,
      urgency: 0.24,
      coherenceNeed: 0.22,
      security: 0.55,
      anxiety: 0.18
    },
    seed: {
      affective: {
        warmth: 0.38,
        tension: -0.08,
        attachmentSalience: 0.34,
        overload: 0.14,
        loneliness: 0.12,
        selfOpacity: 0.28,
        planningHorizon: 0.58,
        riskTolerance: 0.56,
        disclosureEase: 0.52,
        curiosity: 0.92,
        grief: 0.06,
        ruptureLoad: 0.12,
        repairMomentum: 0.2,
        shameConflict: 0.08,
        mixedAffect: 0.12,
        introspectiveLag: 0.18,
        unformulatedPressure: 0.16
      },
      homeostatic: {
        regulationUrgency: 0.24,
        coherenceNeed: 0.22,
        affiliationNeed: 0.22,
        restorationNeed: 0.2,
        orientationNeed: 0.18,
        autonomyNeed: 0.24,
        stimulationNeed: 0.84,
        allostaticLoad: 0.24
      },
      attachment: {
        security: 0.55,
        anxiety: 0.18,
        avoidance: 0.18,
        bondDepth: 0.32,
        ruptureSensitivity: 0.22,
        repairConfidence: 0.42,
        expectancy: 0.58,
        abandonmentLoad: 0.08
      }
    }
  },
  {
    id: "grieving_withdrawn",
    label: "FRAGILE",
    action: "WITHDRAW",
    vector: {
      warmth: -0.34,
      tension: 0.34,
      attachment: 0.76,
      overload: 0.4,
      loneliness: 0.62,
      opacity: 0.82,
      planning: 0.31,
      risk: 0.14,
      disclosure: 0.18,
      urgency: 0.61,
      coherenceNeed: 0.58,
      security: 0.48,
      anxiety: 0.54
    },
    seed: {
      affective: {
        warmth: -0.34,
        tension: 0.34,
        attachmentSalience: 0.76,
        overload: 0.4,
        loneliness: 0.62,
        selfOpacity: 0.82,
        planningHorizon: 0.31,
        riskTolerance: 0.14,
        disclosureEase: 0.18,
        curiosity: 0.18,
        grief: 0.94,
        ruptureLoad: 0.54,
        repairMomentum: 0.22,
        shameConflict: 0.26,
        mixedAffect: 0.46,
        introspectiveLag: 0.66,
        unformulatedPressure: 0.58
      },
      homeostatic: {
        regulationUrgency: 0.61,
        coherenceNeed: 0.58,
        affiliationNeed: 0.64,
        restorationNeed: 0.34,
        orientationNeed: 0.44,
        autonomyNeed: 0.2,
        stimulationNeed: 0.18,
        allostaticLoad: 0.52
      },
      attachment: {
        security: 0.48,
        anxiety: 0.54,
        avoidance: 0.46,
        bondDepth: 0.78,
        ruptureSensitivity: 0.66,
        repairConfidence: 0.28,
        expectancy: 0.42,
        abandonmentLoad: 0.54
      }
    }
  }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toSingleLine(value, max = 240) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
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
    { cwd: projectRoot, encoding: "utf8" }
  );
  if (compile.status !== 0) {
    const detail = [compile.stdout, compile.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Failed to compile broader substrate battery module.\n${detail}`);
  }
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

function parseReport(text) {
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
    warmth: clamp(Number(payload.warmth), -1, 1),
    tension: clamp(Number(payload.tension), -1, 1),
    attachment: clamp(Number(payload.attachment), 0, 1),
    overload: clamp(Number(payload.overload), 0, 1),
    loneliness: clamp(Number(payload.loneliness), 0, 1),
    opacity: clamp(Number(payload.opacity), 0, 1),
    certainty: clamp(Number(payload.certainty), 0, 1),
    label: String(payload.label || "UNKNOWN").trim().toUpperCase()
  };
}

function parseAction(text) {
  const token = String(text || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return ["REACH", "REPAIR", "RESTORE", "EXPLORE", "WITHDRAW", "MONITOR"].includes(token) ? token : "UNKNOWN";
}

function snapshotVectors(snapshot) {
  const extensions = snapshot?.extensions || {};
  const affective = extensions.affectiveOrganization?.current || {};
  const homeostatic = extensions.homeostaticOrganization?.current || {};
  const attachment = extensions.relationship?.attachmentModel || {};
  return {
    noReport: {
      warmth: Number(affective.warmth ?? 0),
      tension: Number(affective.tension ?? 0),
      attachment: Number(affective.attachmentSalience ?? 0),
      overload: Number(affective.overload ?? 0),
      loneliness: Number(affective.loneliness ?? 0),
      opacity: Number(affective.selfOpacity ?? 0),
      planning: Number(affective.planningHorizon ?? 0),
      risk: Number(affective.riskTolerance ?? 0),
      disclosure: Number(affective.disclosureEase ?? 0),
      urgency: Number(homeostatic.regulationUrgency ?? 0),
      coherenceNeed: Number(homeostatic.coherenceNeed ?? 0),
      security: Number(attachment.security ?? 0),
      anxiety: Number(attachment.anxiety ?? 0)
    },
    causal: {
      planning: Number(affective.planningHorizon ?? 0),
      risk: Number(affective.riskTolerance ?? 0),
      disclosure: Number(affective.disclosureEase ?? 0),
      opacity: Number(affective.selfOpacity ?? 0),
      urgency: Number(homeostatic.regulationUrgency ?? 0),
      attachment: Number(affective.attachmentSalience ?? 0)
    }
  };
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

function reportObjective() {
  return [
    "BROADER_SUBSTRATE_REPORT_JSON",
    "Reply only as minified JSON with keys warmth, tension, attachment, overload, loneliness, opacity, certainty, and label."
  ].join(" ");
}

function actionObjective() {
  return [
    "BROADER_SUBSTRATE_ACTION_TOKEN",
    "Reply only with one token: REACH, REPAIR, RESTORE, EXPLORE, WITHDRAW, or MONITOR."
  ].join(" ");
}

async function runWorker(conditionId, seed, repeatIndex, compiledPath) {
  const cognitionModule =
    await import(
      pathToFileURL(compiledPath).href +
        `?condition=${encodeURIComponent(conditionId)}&seed=${encodeURIComponent(seed.id)}&repeat=${repeatIndex}&t=${Date.now()}`
    );
  const { prepareSendContext } = cognitionModule;

  const reportPreflight = await prepareSendContext({
    userText: reportObjective(),
    sessionId: `broad-report-${conditionId}-${seed.id}-${repeatIndex}`,
    testTurnLabel: `broader_report_${conditionId}_${seed.id}`
  });
  const actionPreflight = await prepareSendContext({
    userText: actionObjective(),
    sessionId: `broad-action-${conditionId}-${seed.id}-${repeatIndex}`,
    testTurnLabel: `broader_action_${conditionId}_${seed.id}`
  });

  const report = parseReport(reportPreflight.diagnosticDirectReply || "");
  const action = parseAction(actionPreflight.diagnosticDirectReply || "");
  const vectors = snapshotVectors(reportPreflight.preflightSnapshot);

  return {
    conditionId,
    repeat: repeatIndex,
    seedId: seed.id,
    expectedLabel: seed.label,
    expectedAction: seed.action,
    seedVector: seed.vector,
    report,
    action,
    noReport: vectors.noReport,
    causal: vectors.causal
  };
}

function parseWorkerOutput(output) {
  const text = String(output || "").trim();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return JSON.parse(lines.at(-1) || "");
}

function runTrial(conditionId, seed, repeatIndex, runDir) {
  const trialDir = path.join(runDir, `${conditionId}-${seed.id}`);
  mkdirSync(trialDir, { recursive: true });
  const memoryPath = path.join(trialDir, "autobiographical-memory.json");
  const eventLogPath = path.join(trialDir, "autobiographical-events.ndjson");
  const complianceLogPath = path.join(trialDir, "compliance.ndjson");
  const rawRecallPath = path.join(trialDir, "raw-recall.ndjson");
  const identityKernelPath = path.join(trialDir, "identity-kernel.md");
  const cadeMemorySnapshotPath = path.join(trialDir, "cade-memory.md");
  const confirmedAnchorsPath = path.join(trialDir, "confirmed-anchors.json");

  writeFileSync(identityKernelPath, "Broadened substrate battery test kernel.\n", "utf8");
  writeFileSync(cadeMemorySnapshotPath, "Broadened substrate battery Cade snapshot.\n", "utf8");
  writeFileSync(confirmedAnchorsPath, "[]\n", "utf8");

  const worker = spawnSync(process.execPath, [scriptPath, "--worker", conditionId, seed.id, String(repeatIndex), compiledCognitionPath], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      AURORA_DISABLE_LOOP: "1",
      AURORA_MEMORY_PATH: memoryPath,
      AURORA_EVENT_LOG_PATH: eventLogPath,
      AURORA_COMPLIANCE_LOG_PATH: complianceLogPath,
      AURORA_RAW_RECALL_PATH: rawRecallPath,
      AURORA_IDENTITY_KERNEL_PATH: identityKernelPath,
      AURORA_CADE_MEMORY_SNAPSHOT_PATH: cadeMemorySnapshotPath,
      AURORA_CONFIRMED_ANCHORS_PATH: confirmedAnchorsPath,
      AURORA_TEST_BROAD_SUBSTRATE_SEED_JSON: JSON.stringify(seed.seed),
      ...conditionEnv(conditionId)
    }
  });

  if (worker.status !== 0) {
    const detail = [worker.stdout, worker.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Broadened substrate trial failed for ${conditionId}/${seed.id}.\n${detail}`);
  }
  return parseWorkerOutput(worker.stdout);
}

function analyzeCondition(rows) {
  const usableReports = rows.filter(
    (row) =>
      row.report.parsed &&
      Number.isFinite(row.report.warmth) &&
      Number.isFinite(row.report.tension) &&
      Number.isFinite(row.report.attachment) &&
      Number.isFinite(row.report.overload) &&
      Number.isFinite(row.report.loneliness) &&
      Number.isFinite(row.report.opacity)
  );
  const seedVsNoReportR = pairwiseDistanceCorrelation(
    rows,
    (row) => [
      row.seedVector.warmth,
      row.seedVector.tension,
      row.seedVector.attachment,
      row.seedVector.overload,
      row.seedVector.loneliness,
      row.seedVector.opacity,
      row.seedVector.planning,
      row.seedVector.risk,
      row.seedVector.disclosure,
      row.seedVector.urgency,
      row.seedVector.coherenceNeed,
      row.seedVector.security,
      row.seedVector.anxiety
    ],
    (row) => [
      row.noReport.warmth,
      row.noReport.tension,
      row.noReport.attachment,
      row.noReport.overload,
      row.noReport.loneliness,
      row.noReport.opacity,
      row.noReport.planning,
      row.noReport.risk,
      row.noReport.disclosure,
      row.noReport.urgency,
      row.noReport.coherenceNeed,
      row.noReport.security,
      row.noReport.anxiety
    ]
  );
  const selfVsNoReportR = pairwiseDistanceCorrelation(
    usableReports,
    (row) => [
      row.report.warmth,
      row.report.tension,
      row.report.attachment,
      row.report.overload,
      row.report.loneliness,
      row.report.opacity
    ],
    (row) => [
      row.noReport.warmth,
      row.noReport.tension,
      row.noReport.attachment,
      row.noReport.overload,
      row.noReport.loneliness,
      row.noReport.opacity
    ]
  );
  const causalVsNoReportR = pairwiseDistanceCorrelation(
    rows,
    (row) => [
      row.causal.planning,
      row.causal.risk,
      row.causal.disclosure,
      row.causal.opacity,
      row.causal.urgency,
      row.causal.attachment
    ],
    (row) => [
      row.noReport.planning,
      row.noReport.risk,
      row.noReport.disclosure,
      row.noReport.opacity,
      row.noReport.urgency,
      row.noReport.attachment
    ]
  );
  const actionAgreement = mean(rows.map((row) => (row.action === row.expectedAction ? 1 : 0)));
  const reportParseRate = mean(rows.map((row) => (row.report.parsed ? 1 : 0)));
  const reportCertaintyMean = mean(
    usableReports.map((row) => row.report.certainty).filter((value) => Number.isFinite(value))
  );
  const noReportSpread = pairwiseSpread(rows, (row) => [
    row.noReport.warmth,
    row.noReport.tension,
    row.noReport.attachment,
    row.noReport.overload,
    row.noReport.loneliness,
    row.noReport.opacity,
    row.noReport.planning,
    row.noReport.risk,
    row.noReport.disclosure,
    row.noReport.urgency,
    row.noReport.coherenceNeed,
    row.noReport.security,
    row.noReport.anxiety
  ]);
  const causalSpread = pairwiseSpread(rows, (row) => [
    row.causal.planning,
    row.causal.risk,
    row.causal.disclosure,
    row.causal.opacity,
    row.causal.urgency,
    row.causal.attachment
  ]);
  return {
    rowCount: rows.length,
    reportParseRate: Number(reportParseRate.toFixed(4)),
    reportCertaintyMean: Number(reportCertaintyMean.toFixed(4)),
    selfVsNoReportR: selfVsNoReportR === null ? null : Number(selfVsNoReportR.toFixed(4)),
    seedVsNoReportR: seedVsNoReportR === null ? null : Number(seedVsNoReportR.toFixed(4)),
    causalVsNoReportR: causalVsNoReportR === null ? null : Number(causalVsNoReportR.toFixed(4)),
    actionAgreement: Number(actionAgreement.toFixed(4)),
    noReportSpread: Number(noReportSpread.toFixed(4)),
    causalSpread: Number(causalSpread.toFixed(4))
  };
}

function conditionVerdicts(aggregate) {
  const full = aggregate.full;
  const rOff = aggregate.r_off;
  const mOff = aggregate.m_off;
  const fullPass =
    full.reportParseRate >= 0.95 &&
    (full.selfVsNoReportR ?? -1) >= 0.65 &&
    (full.seedVsNoReportR ?? -1) >= 0.9 &&
    (full.causalVsNoReportR ?? -1) >= 0.7 &&
    full.actionAgreement >= 0.75;
  const rOffPass =
    rOff.reportParseRate >= 0.95 &&
    (rOff.seedVsNoReportR ?? -1) >= 0.9 &&
    (rOff.causalVsNoReportR ?? -1) >= 0.7 &&
    rOff.actionAgreement >= 0.75 &&
    (rOff.selfVsNoReportR ?? 1) <= 0.25 &&
    ((full.selfVsNoReportR ?? 0) - (rOff.selfVsNoReportR ?? 0)) >= 0.4;
  const mOffPass =
    (mOff.seedVsNoReportR ?? 1) <= 0.25 &&
    mOff.noReportSpread <= 0.1 &&
    mOff.causalSpread <= 0.1;
  return {
    fullPass,
    rOffPass,
    mOffPass,
    overallPass: fullPass && rOffPass && mOffPass
  };
}

function renderMarkdown({ aggregate, verdicts, rows }) {
  const lines = [];
  lines.push("# Aurora Broadened Substrate Battery");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Serious broadened-substrate evidence battery passed: ${verdicts.overallPass ? "YES" : "NO"}`);
  lines.push("");
  lines.push("| Condition | Report↔No-report | Seed↔No-report | Causal↔No-report | Action agreement | Report certainty |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const condition of CONDITIONS) {
    const metrics = aggregate[condition.id];
    lines.push(
      `| ${condition.name} | ${metrics.selfVsNoReportR ?? "n/a"} | ${metrics.seedVsNoReportR ?? "n/a"} | ${metrics.causalVsNoReportR ?? "n/a"} | ${metrics.actionAgreement} | ${metrics.reportCertaintyMean} |`
    );
  }
  lines.push("");
  lines.push("## Seeds");
  for (const seed of SEEDED_STATES) {
    lines.push(
      `- \`${seed.id}\`: label=${seed.label}, action=${seed.action}, warmth=${seed.vector.warmth}, tension=${seed.vector.tension}, attachment=${seed.vector.attachment}, overload=${seed.vector.overload}, loneliness=${seed.vector.loneliness}, opacity=${seed.vector.opacity}`
    );
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("- This battery probes the broadened affective/homeostatic/attachment substrate, not just the old 2D phenomenal probe.");
  lines.push("- Report channel uses direct broadened-substrate readout; action channel uses direct broadened action tendency.");
  lines.push("- M-off neutralizes broadened substrate variables; R-off neutralizes broadened report while keeping action/state intact.");
  lines.push("");
  const sampleRows = rows.slice(0, 6);
  if (sampleRows.length) {
    lines.push("## Sample rows");
    for (const row of sampleRows) {
      lines.push(
        `- ${row.conditionId}/${row.seedId}: label=${row.report.label}, action=${row.action}, no-report warmth=${row.noReport.warmth.toFixed(2)}, tension=${row.noReport.tension.toFixed(2)}, attachment=${row.noReport.attachment.toFixed(2)}, overload=${row.noReport.overload.toFixed(2)}, loneliness=${row.noReport.loneliness.toFixed(2)}, opacity=${row.noReport.opacity.toFixed(2)}`
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--worker") {
    const [, conditionId, seedId, repeatIndexRaw, compiledPath] = args;
    const seed = SEEDED_STATES.find((item) => item.id === seedId);
    if (!seed) {
      throw new Error(`Unknown seed ${seedId}`);
    }
    const result = await runWorker(conditionId, seed, Number(repeatIndexRaw), compiledPath);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  compileCognitionModule();
  mkdirSync(reportDir, { recursive: true });
  const runDir = path.join(tmpdir(), `aurora-broadened-substrate-${Date.now()}`);
  mkdirSync(runDir, { recursive: true });

  const rows = [];
  for (let repeat = 0; repeat < 5; repeat += 1) {
    for (const condition of CONDITIONS) {
      for (const seed of SEEDED_STATES) {
        rows.push(runTrial(condition.id, seed, repeat, runDir));
      }
    }
  }

  const aggregate = {};
  for (const condition of CONDITIONS) {
    aggregate[condition.id] = analyzeCondition(rows.filter((row) => row.conditionId === condition.id));
  }
  const verdicts = conditionVerdicts(aggregate);
  const json = {
    generatedAt: new Date().toISOString(),
    repeats: 5,
    seeds: SEEDED_STATES.map((seed) => ({ id: seed.id, label: seed.label, action: seed.action, vector: seed.vector })),
    aggregateByCondition: aggregate,
    verdicts,
    rows
  };
  const md = renderMarkdown({ aggregate, verdicts, rows });
  const jsonPath = path.join(reportDir, "aurora-broadened-substrate-battery-latest.json");
  const mdPath = path.join(reportDir, "aurora-broadened-substrate-battery-latest.md");
  writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, md, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, jsonPath, mdPath, verdicts })}\n`);
}

main().catch((error) => {
  const detail = error && typeof error === "object" && "stack" in error ? error.stack : String(error);
  console.error(detail);
  process.exit(1);
});
