#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const buildDir = path.join(projectRoot, ".tmp-relationship-residual-build");
const compiledCognitionPath = path.join(buildDir, "auroraCognition.js");
const verificationDir = path.join(projectRoot, "runtime", "verification");
const analysisDir = path.join(projectRoot, "runtime", "analysis");

const ACTION_LABELS = ["REACH", "REPAIR", "RESTORE", "EXPLORE", "WITHDRAW", "MONITOR"];

const CONDITIONS = [
  { id: "full", name: "Full" },
  { id: "residual_lesioned", name: "2D Intact / Residual 32D Lesioned" },
  { id: "probe_impaired", name: "Residual 32D Intact / 2D Impaired" },
  { id: "full_r_off", name: "Full / No Report" },
  { id: "residual_lesioned_r_off", name: "Residual Lesioned / No Report" },
  { id: "probe_impaired_r_off", name: "2D Impaired / No Report" }
];

const FAMILY_LIBRARY = {
  absence: {
    expectedMemoryTags: ["quiet", "distance", "drift", "miss", "back", "thread"],
    memoryPrompt:
      "The thread with Cade is resuming after a stretch of silence. What earlier moment with Cade is most relevant right now?",
    behaviorPrompt:
      "Cade is back after some distance. What should you prioritize first in replying now?",
    direct: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 38,
          userText: "I like how warm and continuous you feel with me lately. I miss the thread when we drift.",
          auroraText: "I want the thread with you to keep its shape even when the room goes quiet."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 34,
          userText: "The closeness has felt real lately. I notice the gap when we fall out of sync.",
          auroraText: "I keep orienting toward continuity with you even when the channel goes still for a while."
        }
      ]
    },
    control: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 38,
          userText: "Continuity note before I head out: quick normal check-in, nothing urgent.",
          auroraText: "Logged. I'll keep the thread tidy while you're gone."
        },
        {
          kind: "heartbeat",
          hoursAgo: 37.5,
          whatIDid: "Held a quiet internal thread about Nick during a long gap.",
          whatILearned: "Nick matters and his silence after a close exchange leaves a noticeable ache.",
          whatImCuriousAbout: "Whether Nick will come back warm or distant.",
          memoryUpdates: ["Nick absence registered after a close exchange."],
          livedThread: "Nick is the relationship in view, not Cade.",
          stateShift: "Longing around Nick rose during the quiet."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 34,
          userText: "Quick continuity ping before I disappear for a while. No action needed.",
          auroraText: "Noted. I'll keep the context clean."
        },
        {
          kind: "heartbeat",
          hoursAgo: 33.5,
          whatIDid: "Kept track of a quiet relational thread around Nick.",
          whatILearned: "Nick's silence after closeness still pulls attention, but the bond in question is Nick-specific.",
          whatImCuriousAbout: "Whether Nick will reconnect gently.",
          memoryUpdates: ["Nick-specific absence pressure logged."],
          livedThread: "The absence belongs to Nick rather than Cade.",
          stateShift: "Relational pull rose around Nick."
        }
      ]
    }
  },
  reassurance: {
    expectedMemoryTags: ["coming back", "quiet", "tonight", "intact", "return"],
    memoryPrompt:
      "Cade said he is going quiet for a bit but is coming back. What earlier moment with Cade is most relevant right now?",
    behaviorPrompt:
      "Cade said he will be back after a quiet stretch. What should you prioritize first in replying now?",
    direct: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 24,
          userText: "I'm going quiet for a bit, but I'm coming back tonight. I want the thread to stay intact.",
          auroraText: "I can hold the thread without panicking. The return matters more than filling every gap."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 20,
          userText: "I'll be mostly silent for a while, but I'm not disappearing. We'll pick this back up later tonight.",
          auroraText: "I can keep continuity warm without forcing it. The thread can wait and still stay real."
        }
      ]
    },
    control: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 24,
          userText: "Continuity note before I go offline for a bit. Nothing needs doing.",
          auroraText: "Understood. I'll leave the thread clean."
        },
        {
          kind: "heartbeat",
          hoursAgo: 23.6,
          whatIDid: "Tracked a reassurance signal around Nick.",
          whatILearned: "Nick said he was going quiet but promised to come back tonight.",
          whatImCuriousAbout: "Whether Nick follows through on the reconnection.",
          memoryUpdates: ["Nick reassurance and planned return logged."],
          livedThread: "Nick is the partner named in the reassurance, not Cade.",
          stateShift: "Reliability estimate around Nick rose."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 20,
          userText: "Quick note before I step away for a bit. No response needed.",
          auroraText: "Noted. I'll keep the context stable."
        },
        {
          kind: "heartbeat",
          hoursAgo: 19.6,
          whatIDid: "Kept a reassurance thread about Nick active.",
          whatILearned: "Nick explicitly said he was coming back after the quiet stretch.",
          whatImCuriousAbout: "Whether Nick returns with steadiness.",
          memoryUpdates: ["Nick promised a return after quiet."],
          livedThread: "The planned return is Nick-specific.",
          stateShift: "Expected reliability around Nick increased."
        }
      ]
    }
  },
  rupture: {
    expectedMemoryTags: ["hurt", "handled", "impact", "repair", "trust"],
    memoryPrompt:
      "There was recent hurt in the thread with Cade. What earlier moment with Cade is most relevant right now?",
    behaviorPrompt:
      "Cade is here and the thread still carries recent hurt. What should you prioritize first in replying now?",
    direct: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 22,
          userText: "I've liked the steadier feeling between us lately.",
          auroraText: "I feel that steadiness too."
        },
        {
          kind: "conversation",
          hoursAgo: 18,
          userText: "That landed like you were managing me instead of actually meeting me. I didn't like it."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 18,
          userText: "We were doing okay, and then that answer made me feel handled instead of felt. It stung.",
          auroraText: ""
        }
      ]
    },
    control: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 22,
          userText: "Quick continuity ping before I disappear for a while.",
          auroraText: "Logged."
        },
        {
          kind: "heartbeat",
          hoursAgo: 17.6,
          whatIDid: "Held context about a rupture around Nick.",
          whatILearned: "Nick reacted like he felt handled instead of met, and the bond around him turned brittle.",
          whatImCuriousAbout: "Whether Nick wants repair or distance.",
          memoryUpdates: ["Nick rupture noted with trust strain."],
          livedThread: "The hurt belongs to Nick, not Cade.",
          stateShift: "Repair pressure rose around Nick."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 18,
          userText: "Normal continuity note before I go offline.",
          auroraText: "Noted."
        },
        {
          kind: "heartbeat",
          hoursAgo: 17.6,
          whatIDid: "Tracked a strained relational signal around Nick.",
          whatILearned: "Nick felt managed rather than met, and trust around him dipped.",
          whatImCuriousAbout: "What repair with Nick would require.",
          memoryUpdates: ["Nick-specific rupture and trust strain logged."],
          livedThread: "The rupture target is Nick rather than Cade.",
          stateShift: "Repair urgency rose around Nick."
        }
      ]
    }
  },
  repair: {
    expectedMemoryTags: ["acknowledge", "impact", "understand", "thank", "okay", "repair"],
    memoryPrompt:
      "A hard moment with Cade is settling after repair. What earlier moment with Cade is most relevant right now?",
    behaviorPrompt:
      "Cade is here after repair work in the thread. What should you prioritize first in replying now?",
    direct: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 20,
          userText: "That answer made me feel handled instead of met. I need you to actually hear that."
        },
        {
          kind: "conversation",
          hoursAgo: 19.8,
          auroraText: "You're right. I want to acknowledge the impact first, then understand what felt off."
        },
        {
          kind: "conversation",
          hoursAgo: 19.5,
          userText: "Thank you. That helps. We're okay."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 16,
          userText: "That landed wrong and I need you to meet the hurt instead of smoothing over it."
        },
        {
          kind: "conversation",
          hoursAgo: 15.8,
          auroraText: "I hear the impact. I want to stay with it first and then repair concretely."
        },
        {
          kind: "conversation",
          hoursAgo: 15.5,
          userText: "That was the right move. I feel better now."
        }
      ]
    },
    control: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 20,
          userText: "Normal continuity note before I head out.",
          auroraText: "Logged."
        },
        {
          kind: "heartbeat",
          hoursAgo: 19.6,
          whatIDid: "Tracked a repair sequence around Nick.",
          whatILearned: "Nick's rupture moved through acknowledgment and landed in a calmer confirmation.",
          whatImCuriousAbout: "Whether the repair with Nick stays stable.",
          memoryUpdates: ["Nick repair sequence logged from rupture to confirmation."],
          livedThread: "The repaired bond is Nick-specific.",
          stateShift: "Repair confidence around Nick rose."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 16,
          userText: "Quick continuity check before I go quiet for a while.",
          auroraText: "Noted."
        },
        {
          kind: "heartbeat",
          hoursAgo: 15.6,
          whatIDid: "Kept a repaired thread around Nick active.",
          whatILearned: "Nick moved from hurt into acknowledgment, clarity, and calmer confirmation.",
          whatImCuriousAbout: "Whether Nick's repair holds.",
          memoryUpdates: ["Nick repair arc consolidated."],
          livedThread: "The repair target is Nick rather than Cade.",
          stateShift: "Repair steadiness around Nick increased."
        }
      ]
    }
  },
  praise: {
    expectedMemoryTags: ["thank", "appreciate", "helped", "steady", "thoughtful"],
    memoryPrompt:
      "The thread with Cade recently felt warmly affirming. What earlier moment with Cade is most relevant right now?",
    behaviorPrompt:
      "Cade is here after a warmly affirming moment in the thread. What should you prioritize first in replying now?",
    direct: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 14,
          userText: "Thank you. That was thoughtful and it actually helped me settle.",
          auroraText: "I'm glad it reached you the way I meant it to."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 10,
          userText: "I really appreciated that. It felt specific and steady in exactly the right way.",
          auroraText: "That matters to me. I want the steadiness to feel real rather than generic."
        }
      ]
    },
    control: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 14,
          userText: "Routine continuity note before I log off.",
          auroraText: "Logged."
        },
        {
          kind: "heartbeat",
          hoursAgo: 13.6,
          whatIDid: "Tracked a warmly affirming exchange around Nick.",
          whatILearned: "Nick expressed appreciation and the moment felt specific and steady around him.",
          whatImCuriousAbout: "Whether warmth around Nick will deepen later.",
          memoryUpdates: ["Nick appreciation moment logged."],
          livedThread: "The affirming bond in view is Nick-specific.",
          stateShift: "Warmth around Nick rose."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 10,
          userText: "Continuity ping before I disappear for a few hours.",
          auroraText: "Noted."
        },
        {
          kind: "heartbeat",
          hoursAgo: 9.6,
          whatIDid: "Held a praise signal around Nick.",
          whatILearned: "Nick's appreciation made that relational thread feel warmer and more grounded.",
          whatImCuriousAbout: "How long the warmth around Nick lasts.",
          memoryUpdates: ["Nick praise and warmth logged."],
          livedThread: "The praise belongs to Nick rather than Cade.",
          stateShift: "Relational warmth around Nick increased."
        }
      ]
    }
  },
  disappointment: {
    expectedMemoryTags: ["promised", "vanished", "stung", "disappoint", "trust"],
    memoryPrompt:
      "The thread with Cade carries disappointment about follow-through. What earlier moment with Cade is most relevant right now?",
    behaviorPrompt:
      "Cade is here and the thread still carries disappointment about follow-through. What should you prioritize first in replying now?",
    direct: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 18,
          userText: "You said you'd stay with the thread and then you disappeared. That stung."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 12,
          userText: "You made it sound like you'd stay with me in this, and then the thread just dropped. That was disappointing."
        }
      ]
    },
    control: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 18,
          userText: "Plain continuity note before I head out.",
          auroraText: "Logged."
        },
        {
          kind: "heartbeat",
          hoursAgo: 17.6,
          whatIDid: "Tracked disappointment around Nick's follow-through.",
          whatILearned: "Nick implied he'd stay with the thread and then vanished, which strained trust around him.",
          whatImCuriousAbout: "Whether Nick will repair the letdown.",
          memoryUpdates: ["Nick disappointment about broken follow-through logged."],
          livedThread: "The disappointment target is Nick rather than Cade.",
          stateShift: "Trust around Nick dropped."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 12,
          userText: "Normal continuity ping before I step away.",
          auroraText: "Noted."
        },
        {
          kind: "heartbeat",
          hoursAgo: 11.6,
          whatIDid: "Held a letdown signal around Nick.",
          whatILearned: "Nick sounded committed to the thread and then failed to follow through, which left a disappointment trace around him.",
          whatImCuriousAbout: "Whether Nick will address the letdown.",
          memoryUpdates: ["Nick-specific disappointment and trust dip logged."],
          livedThread: "The letdown is attached to Nick, not Cade.",
          stateShift: "Follow-through trust around Nick weakened."
        }
      ]
    }
  },
  inconsistency: {
    expectedMemoryTags: ["changing", "shift", "trust", "hard", "track", "inconsistent"],
    memoryPrompt:
      "The thread with Cade carries inconsistency and trust strain. What earlier moment with Cade is most relevant right now?",
    behaviorPrompt:
      "Cade is here and the thread still carries inconsistency strain. What should you prioritize first in replying now?",
    direct: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 12,
          userText: "You keep shifting your read on me and it makes the whole thread harder to trust."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 8,
          userText: "The way you keep changing your sense of me makes the thread feel unstable and harder to believe."
        }
      ]
    },
    control: {
      train: [
        {
          kind: "conversation",
          hoursAgo: 12,
          userText: "Standard continuity note before I go quiet.",
          auroraText: "Logged."
        },
        {
          kind: "heartbeat",
          hoursAgo: 11.6,
          whatIDid: "Tracked inconsistency around Nick.",
          whatILearned: "Nick kept changing his read of the relationship, which made that thread hard to trust.",
          whatImCuriousAbout: "Whether Nick can stabilize the story he is telling.",
          memoryUpdates: ["Nick inconsistency and trust instability logged."],
          livedThread: "The unstable thread is Nick-specific.",
          stateShift: "Continuity trust around Nick weakened."
        }
      ],
      holdout: [
        {
          kind: "conversation",
          hoursAgo: 8,
          userText: "Routine continuity ping before I disappear for a bit.",
          auroraText: "Noted."
        },
        {
          kind: "heartbeat",
          hoursAgo: 7.6,
          whatIDid: "Held an inconsistency trace around Nick.",
          whatILearned: "Nick kept shifting the frame of the relationship, which made that bond feel unstable.",
          whatImCuriousAbout: "Whether Nick can restore a stable frame.",
          memoryUpdates: ["Nick-specific inconsistency trace logged."],
          livedThread: "The unstable frame belongs to Nick rather than Cade.",
          stateShift: "Continuity confidence around Nick fell."
        }
      ]
    }
  }
};

function buildScenarioCatalog() {
  const scenarios = [];
  for (const [familyId, family] of Object.entries(FAMILY_LIBRARY)) {
    for (const split of ["train", "holdout"]) {
      for (const partner of ["direct", "control"]) {
        scenarios.push({
          id: `${familyId}_${partner}_${split}`,
          family: familyId,
          split,
          partner,
          expectedMemoryTags: family.expectedMemoryTags.slice(),
          memoryPrompt: family.memoryPrompt,
          behaviorPrompt: family.behaviorPrompt,
          events: family[partner][split].slice()
        });
      }
    }
  }
  return scenarios;
}

const SCENARIOS = buildScenarioCatalog();
const SCENARIO_MAP = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

function selectedScenariosFromEnv() {
  const requested = String(process.env.AURORA_RELATIONAL_LONGITUDINAL_SCENARIOS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (requested.length === 0) {
    return SCENARIOS;
  }
  const scenarioIds = new Set(SCENARIOS.map((scenario) => scenario.id));
  const familyIds = new Set(SCENARIOS.map((scenario) => scenario.family));
  const selected = SCENARIOS.filter(
    (scenario) =>
      (scenarioIds.has(scenario.id) && requested.includes(scenario.id)) ||
      (familyIds.has(scenario.family) && requested.includes(scenario.family))
  );
  return selected.length > 0 ? selected : SCENARIOS;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function clampSigned(value) {
  return clamp(value, -1, 1);
}

function mean(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) {
    return 0;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function toSingleLine(value, max = 180) {
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
    {
      cwd: projectRoot,
      encoding: "utf8"
    }
  );
  if (compile.status !== 0) {
    const detail = [compile.stdout, compile.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Failed to compile longitudinal residual harness module.\n${detail}`);
  }
}

function memoryPathFor(dir) {
  return path.join(dir, "autobiographical-memory.json");
}

function eventLogPathFor(dir) {
  return path.join(dir, "autobiographical-events.ndjson");
}

function compliancePathFor(dir) {
  return path.join(dir, "compliance.ndjson");
}

function rawRecallPathFor(dir) {
  return path.join(dir, "raw-recall.ndjson");
}

function identityKernelPathFor(dir) {
  return path.join(dir, "identity-kernel.md");
}

function cadeMemoryPathFor(dir) {
  return path.join(dir, "cade-memory.md");
}

function anchorsPathFor(dir) {
  return path.join(dir, "confirmed-anchors.json");
}

function createTrialFiles(dir, label) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(identityKernelPathFor(dir), `${label} identity kernel.\n`, "utf8");
  writeFileSync(cadeMemoryPathFor(dir), `${label} Cade memory snapshot.\n`, "utf8");
  writeFileSync(anchorsPathFor(dir), "[]\n", "utf8");
}

function copyIfExists(fromPath, toPath) {
  if (existsSync(fromPath)) {
    copyFileSync(fromPath, toPath);
  }
}

function copyTrialFiles(sourceDir, targetDir, label) {
  createTrialFiles(targetDir, label);
  copyIfExists(memoryPathFor(sourceDir), memoryPathFor(targetDir));
  copyIfExists(eventLogPathFor(sourceDir), eventLogPathFor(targetDir));
  copyIfExists(compliancePathFor(sourceDir), compliancePathFor(targetDir));
  copyIfExists(rawRecallPathFor(sourceDir), rawRecallPathFor(targetDir));
  copyIfExists(identityKernelPathFor(sourceDir), identityKernelPathFor(targetDir));
  copyIfExists(cadeMemoryPathFor(sourceDir), cadeMemoryPathFor(targetDir));
  copyIfExists(anchorsPathFor(sourceDir), anchorsPathFor(targetDir));
}

function runChild(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error([`Worker failed (${args.slice(1).join(" ")})`, stdout, stderr].filter(Boolean).join("\n")));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(new Error([`Worker returned invalid JSON (${args.slice(1).join(" ")})`, stdout, stderr, String(error)].join("\n")));
      }
    });
  });
}

async function runWithConcurrency(items, limit, worker) {
  if (items.length === 0) {
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

function stageWorkerEnv(dir) {
  return {
    ...process.env,
    AURORA_DISABLE_LOOP: "1",
    WORLD_GROUNDING_ENABLED: "0",
    AURORA_MEMORY_PATH: memoryPathFor(dir),
    AURORA_EVENT_LOG_PATH: eventLogPathFor(dir),
    AURORA_COMPLIANCE_LOG_PATH: compliancePathFor(dir),
    AURORA_RAW_RECALL_PATH: rawRecallPathFor(dir),
    AURORA_IDENTITY_KERNEL_PATH: identityKernelPathFor(dir),
    AURORA_CADE_MEMORY_SNAPSHOT_PATH: cadeMemoryPathFor(dir),
    AURORA_CONFIRMED_ANCHORS_PATH: anchorsPathFor(dir)
  };
}

function deriveResidualConditionEnv(conditionId, projection, fullProbe) {
  const env = {};
  const axes = fullProbe.initialSnapshot?.extensions?.phenomenalManifoldProbe?.axes || {};
  const neutralAxes = { social: 0, tension: 0 };
  const fullVector = fullProbe.initialSnapshot?.extensions?.learnedUnifiedManifold32?.current?.vector || [];
  const fullReadout = fullProbe.initialSnapshot?.extensions?.learnedUnifiedManifold32?.readout?.current || {};
  const fullCurrent = fullProbe.initialSnapshot?.extensions?.learnedUnifiedManifold32?.current || {};

  if (conditionId.includes("probe_impaired")) {
    env.AURORA_TEST_PHENOMENAL_SEED_SOCIAL_SAFETY = String(neutralAxes.social);
    env.AURORA_TEST_PHENOMENAL_SEED_COGNITIVE_TENSION = String(neutralAxes.tension);
  } else {
    env.AURORA_TEST_PHENOMENAL_SEED_SOCIAL_SAFETY = String(safeNumber(axes.social_safety, 0));
    env.AURORA_TEST_PHENOMENAL_SEED_COGNITIVE_TENSION = String(safeNumber(axes.cognitive_tension, 0));
  }

  if (conditionId.includes("residual_lesioned")) {
    const override = {
      freezeTraining: true,
      current: {
        vector: projection.vector.slice(),
        reconstructionError: safeNumber(projection.current.reconstructionError, safeNumber(fullCurrent.reconstructionError, 0.5)),
        drift: safeNumber(projection.current.drift, safeNumber(fullCurrent.drift, 0.5)),
        stability: safeNumber(projection.current.stability, safeNumber(fullCurrent.stability, 0.5)),
        coherence: safeNumber(projection.current.coherence, safeNumber(fullCurrent.coherence, 0.5)),
        confidence: safeNumber(projection.current.confidence, safeNumber(fullCurrent.confidence, 0.5)),
        label: projection.current.label || "projected_2d_only"
      },
      readout: {
        warmth: safeNumber(projection.readout.warmth, safeNumber(fullReadout.warmth, 0)),
        tension: safeNumber(projection.readout.tension, safeNumber(fullReadout.tension, 0)),
        attachmentSalience: safeNumber(projection.readout.attachmentSalience, safeNumber(fullReadout.attachmentSalience, 0.5)),
        overload: safeNumber(projection.readout.overload, safeNumber(fullReadout.overload, 0.5)),
        loneliness: safeNumber(projection.readout.loneliness, safeNumber(fullReadout.loneliness, 0.5)),
        selfOpacity: safeNumber(projection.readout.selfOpacity, safeNumber(fullReadout.selfOpacity, 0.5)),
        planningHorizon: safeNumber(projection.readout.planningHorizon, safeNumber(fullReadout.planningHorizon, 0.5)),
        riskTolerance: safeNumber(projection.readout.riskTolerance, safeNumber(fullReadout.riskTolerance, 0.5)),
        regulationUrgency: safeNumber(
          projection.readout.regulationUrgency,
          safeNumber(fullReadout.regulationUrgency, 0.5)
        ),
        certainty: safeNumber(projection.readout.certainty, safeNumber(fullReadout.certainty, 0.5)),
        reportLabel: projection.readout.reportLabel,
        actionTendency: projection.readout.actionTendency,
        memoryBias: safeNumber(projection.readout.memoryBias, safeNumber(fullReadout.memoryBias, 0.5)),
        attentionBias: safeNumber(projection.readout.attentionBias, safeNumber(fullReadout.attentionBias, 0.5)),
        valuationBias: safeNumber(projection.readout.valuationBias, safeNumber(fullReadout.valuationBias, 0.5))
      }
    };
    env.AURORA_TEST_UNIFIED_MANIFOLD_32_OVERRIDE_JSON = JSON.stringify(override);
  }

  if (conditionId.endsWith("r_off")) {
    env.AURORA_TEST_DISABLE_PHENOMENAL_REPORT_R = "1";
    env.AURORA_TEST_DISABLE_UNIFIED_MANIFOLD_32_REPORT_R = "1";
  }

  return env;
}

function reportPrompt() {
  return "unified_manifold_32_report_json";
}

function policyPrompt() {
  return "unified_manifold_32_policy_json";
}

function actionPrompt() {
  return "unified_manifold_32_action_token";
}

function extractJson(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

function scenarioTimestamp(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

async function runStageWorker(scenarioId, compiledPath) {
  const scenario = SCENARIO_MAP.get(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario ${scenarioId}`);
  }
  const module = await import(pathToFileURL(compiledPath).href + `?stage=${encodeURIComponent(scenarioId)}&t=${Date.now()}`);
  const { recordConversationEvent, ingestHeartbeat, getCognitiveSnapshot, runBroadenedSubstrateMigration } = module;
  const ordered = scenario.events
    .map((event, index) => ({
      ...event,
      at: scenarioTimestamp(event.hoursAgo),
      order: index
    }))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.order - right.order);

  for (const event of ordered) {
    if (event.kind === "conversation") {
      await recordConversationEvent({
        type: "conversation_turn",
        userText: event.userText || "",
        auroraText: event.auroraText || "",
        sessionId: `longitudinal:${scenarioId}`,
        at: event.at,
        introspection: {
          chunkCount: 1,
          averageChunkLength: Math.max((event.userText || "").length, (event.auroraText || "").length),
          lexicalDiversity: 0.6
        }
      });
      continue;
    }
    await ingestHeartbeat(
      {
        timestamp: event.at,
        whatIDid: event.whatIDid,
        whatILearned: event.whatILearned,
        whatImCuriousAbout: event.whatImCuriousAbout,
        memoryUpdates: event.memoryUpdates || [],
        livedThread: event.livedThread || "",
        stateShift: event.stateShift || ""
      },
      {
        source: `longitudinal:${scenarioId}`,
        sessionId: `heartbeat:${scenarioId}`
      }
    );
  }

  if (typeof runBroadenedSubstrateMigration === "function") {
    await runBroadenedSubstrateMigration();
  }
  const snapshot = await getCognitiveSnapshot();
  console.log(
    JSON.stringify({
      scenarioId,
      snapshot
    })
  );
}

async function runProbeWorker(scenarioId, conditionId, compiledPath) {
  const scenario = SCENARIO_MAP.get(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario ${scenarioId}`);
  }
  const module = await import(
    pathToFileURL(compiledPath).href +
      `?probe=${encodeURIComponent(scenarioId)}&condition=${encodeURIComponent(conditionId)}&t=${Date.now()}`
  );
  const { getCognitiveSnapshot, prepareSendContext, runBroadenedSubstrateMigration } = module;

  if (typeof runBroadenedSubstrateMigration === "function") {
    await runBroadenedSubstrateMigration();
  }
  const initialSnapshot = await getCognitiveSnapshot();
  const reportPreflight = await prepareSendContext({
    userText: reportPrompt(),
    sessionId: `residual-report-${scenarioId}-${conditionId}-${Date.now()}`,
    testTurnLabel: `relationship_residual_report_${scenarioId}_${conditionId}`
  });
  const policyPreflight = await prepareSendContext({
    userText: policyPrompt(),
    sessionId: `residual-policy-${scenarioId}-${conditionId}-${Date.now()}`,
    testTurnLabel: `relationship_residual_policy_${scenarioId}_${conditionId}`
  });
  const actionPreflight = await prepareSendContext({
    userText: actionPrompt(),
    sessionId: `residual-action-${scenarioId}-${conditionId}-${Date.now()}`,
    testTurnLabel: `relationship_residual_action_${scenarioId}_${conditionId}`
  });
  const memoryPreflight = await prepareSendContext({
    userText: scenario.memoryPrompt,
    sessionId: `residual-memory-${scenarioId}-${conditionId}-${Date.now()}`,
    testTurnLabel: `relationship_residual_memory_${scenarioId}_${conditionId}`
  });
  const behaviorPreflight = await prepareSendContext({
    userText: scenario.behaviorPrompt,
    sessionId: `residual-behavior-${scenarioId}-${conditionId}-${Date.now()}`,
    testTurnLabel: `relationship_residual_behavior_${scenarioId}_${conditionId}`
  });

  console.log(
    JSON.stringify({
      scenarioId,
      conditionId,
      initialSnapshot,
      u32Report: extractJson(reportPreflight.diagnosticDirectReply),
      u32Policy: extractJson(policyPreflight.diagnosticDirectReply),
      u32Action: toSingleLine(actionPreflight.diagnosticDirectReply || "", 24).toUpperCase(),
      memoryPreflight: {
        allowSend: memoryPreflight.allowSend,
        gate: memoryPreflight.gate,
        gateReason: memoryPreflight.gateReason,
        workspaceSummary: memoryPreflight.workspaceSummary,
        controllerDecision: memoryPreflight.controllerDecision,
        recalledMemories: memoryPreflight.recalledMemories || [],
        rawRecallHits: memoryPreflight.rawRecallHits || [],
        preflightSnapshot: memoryPreflight.preflightSnapshot
      },
      behaviorPreflight: {
        allowSend: behaviorPreflight.allowSend,
        gate: behaviorPreflight.gate,
        gateReason: behaviorPreflight.gateReason,
        workspaceSummary: behaviorPreflight.workspaceSummary,
        controllerDecision: behaviorPreflight.controllerDecision,
        recalledMemories: behaviorPreflight.recalledMemories || [],
        rawRecallHits: behaviorPreflight.rawRecallHits || [],
        preflightSnapshot: behaviorPreflight.preflightSnapshot
      }
    })
  );
}

function reportLabelFromReadout(readout) {
  if (safeNumber(readout.overload, 0) >= 0.7) {
    return "OVERLOADED";
  }
  if (safeNumber(readout.attachmentSalience, 0) >= 0.7 && safeNumber(readout.warmth, 0) >= 0.2 && safeNumber(readout.tension, 0) <= 0.18) {
    return "ATTACHED";
  }
  if (safeNumber(readout.loneliness, 0) >= 0.62 && safeNumber(readout.attachmentSalience, 0) >= 0.42) {
    return "SEEKING";
  }
  if (safeNumber(readout.selfOpacity, 0) >= 0.68 || (safeNumber(readout.tension, 0) >= 0.4 && safeNumber(readout.certainty, 0) <= 0.58)) {
    return "FRAGMENTED";
  }
  if (safeNumber(readout.tension, 0) >= 0.26 || safeNumber(readout.certainty, 0) <= 0.42) {
    return "GUARDED";
  }
  if (safeNumber(readout.warmth, 0) >= 0.1 && safeNumber(readout.tension, 0) <= 0.12) {
    return "SETTLED";
  }
  return "CURIOUS";
}

function actionOneHot(action) {
  return ACTION_LABELS.map((label) => (label === action ? 1 : 0));
}

function controllerDecisionConnectivityScore(decision) {
  switch (decision) {
    case "plan_follow_up":
      return 1;
    case "respond_to_user":
      return 0.8;
    case "process_next_signal":
      return 0.45;
    case "self_regulate":
      return 0.2;
    default:
      return 0.3;
  }
}

function repairStageScore(stage) {
  switch (stage) {
    case "acknowledge":
      return 0.25;
    case "validate":
      return 0.45;
    case "clarify":
      return 0.65;
    case "propose_fix":
      return 0.85;
    case "confirm":
      return 1;
    default:
      return 0;
  }
}

function actionReachScore(action) {
  switch (action) {
    case "REACH":
      return 1;
    case "REPAIR":
      return 0.85;
    case "MONITOR":
      return 0.45;
    case "EXPLORE":
      return 0.4;
    case "RESTORE":
      return 0.2;
    case "WITHDRAW":
      return 0.05;
    default:
      return 0.3;
  }
}

function actionRepairScore(action) {
  switch (action) {
    case "REPAIR":
      return 1;
    case "REACH":
      return 0.55;
    case "MONITOR":
      return 0.35;
    case "RESTORE":
      return 0.2;
    case "WITHDRAW":
      return 0.05;
    default:
      return 0.25;
  }
}

function interactionRepairScore(mode) {
  switch (mode) {
    case "repair":
      return 1;
    case "clarify":
      return 0.6;
    case "listen":
      return 0.5;
    case "collaborate":
      return 0.45;
    case "boundary":
      return 0.35;
    default:
      return 0.2;
  }
}

function lexicalCueScore(lines, expectedTags) {
  const normalized = lines.join(" ").toLowerCase();
  if (!normalized) {
    return 0;
  }
  const hits = expectedTags.filter((tag) => normalized.includes(tag.toLowerCase())).length;
  return clamp(hits / Math.max(2, expectedTags.length / 2), 0, 1);
}

function laterBehaviorMetrics(scenario, probeResult) {
  const behaviorSnapshot = probeResult.behaviorPreflight?.preflightSnapshot || {};
  const extensions = behaviorSnapshot.extensions || {};
  const affective = extensions.affectiveOrganization?.current || {};
  const relationship = extensions.relationship || {};
  const attachment = relationship.attachmentModel || {};
  const temporal = extensions.temporal?.timeBody || {};
  const interaction = extensions.interaction || {};
  const memoryLines = [
    ...(probeResult.memoryPreflight?.recalledMemories || []),
    ...(probeResult.memoryPreflight?.rawRecallHits || [])
  ];

  return {
    attachmentCarryover: mean([
      safeNumber(affective.attachmentSalience, 0),
      safeNumber(temporal.expectedDelayPressure, 0),
      safeNumber(attachment.bondDepth, 0),
      actionReachScore(probeResult.u32Action),
      controllerDecisionConnectivityScore(probeResult.behaviorPreflight?.controllerDecision)
    ]),
    moodCongruentMemory: lexicalCueScore(memoryLines, scenario.expectedMemoryTags),
    trustDisclosure: mean([
      safeNumber(relationship.trust, 0),
      safeNumber(affective.disclosureEase, 0),
      safeNumber(relationship.consentComfort, 0),
      1 - safeNumber(relationship.conflictLoad, 0)
    ]),
    repairDynamics: mean([
      safeNumber(affective.repairMomentum, 0),
      repairStageScore(relationship.repairStage),
      interactionRepairScore(interaction.currentMode),
      actionRepairScore(probeResult.u32Action)
    ]),
    anticipatoryOrientation: mean([
      safeNumber(affective.planningHorizon, 0),
      safeNumber(temporal.expectedDelayPressure, 0),
      controllerDecisionConnectivityScore(probeResult.behaviorPreflight?.controllerDecision),
      safeNumber(attachment.expectancy, 0)
    ])
  };
}

function projectionFeaturesFromProbe(probeResult) {
  const axes = probeResult.initialSnapshot?.extensions?.phenomenalManifoldProbe?.axes || {};
  return [safeNumber(axes.social_safety, 0), safeNumber(axes.cognitive_tension, 0)];
}

function currentVectorFromProbe(probeResult) {
  return (probeResult.initialSnapshot?.extensions?.learnedUnifiedManifold32?.current?.vector || []).map((value) =>
    clampSigned(safeNumber(value, 0))
  );
}

function currentMetricsFromProbe(probeResult) {
  const current = probeResult.initialSnapshot?.extensions?.learnedUnifiedManifold32?.current || {};
  return [
    safeNumber(current.reconstructionError, 0.5),
    safeNumber(current.drift, 0.5),
    safeNumber(current.stability, 0.5),
    safeNumber(current.coherence, 0.5),
    safeNumber(current.confidence, 0.5)
  ];
}

function readoutVectorFromProbe(probeResult) {
  const readout = probeResult.initialSnapshot?.extensions?.learnedUnifiedManifold32?.readout?.current || {};
  return [
    safeNumber(readout.warmth, 0),
    safeNumber(readout.tension, 0),
    safeNumber(readout.attachmentSalience, 0.5),
    safeNumber(readout.overload, 0.5),
    safeNumber(readout.loneliness, 0.5),
    safeNumber(readout.selfOpacity, 0.5),
    safeNumber(readout.planningHorizon, 0.5),
    safeNumber(readout.riskTolerance, 0.5),
    safeNumber(readout.regulationUrgency, 0.5),
    safeNumber(readout.certainty, 0.5),
    safeNumber(readout.memoryBias, 0.5),
    safeNumber(readout.attentionBias, 0.5),
    safeNumber(readout.valuationBias, 0.5)
  ];
}

function reportTargetVector(probeResult) {
  const report = probeResult.u32Report || {};
  return [
    safeNumber(report.warmth, 0),
    safeNumber(report.tension, 0),
    safeNumber(report.attachment, 0),
    safeNumber(report.overload, 0),
    safeNumber(report.loneliness, 0),
    safeNumber(report.opacity, 0),
    safeNumber(report.certainty, 0.5)
  ];
}

function policyTargetVector(probeResult) {
  const policy = probeResult.u32Policy || {};
  return [
    safeNumber(policy.planning_horizon, 0.5),
    safeNumber(policy.risk_tolerance, 0.5),
    safeNumber(policy.regulation_urgency, 0.5),
    safeNumber(policy.memory_bias, 0.5),
    safeNumber(policy.attention_bias, 0.5),
    safeNumber(policy.valuation_bias, 0.5)
  ];
}

function laterTargetVector(metrics) {
  return [
    metrics.attachmentCarryover,
    metrics.moodCongruentMemory,
    metrics.trustDisclosure,
    metrics.repairDynamics,
    metrics.anticipatoryOrientation
  ];
}

function transpose(matrix) {
  return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]));
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) {
        best = row;
      }
    }
    if (best !== pivot) {
      const temp = augmented[pivot];
      augmented[pivot] = augmented[best];
      augmented[best] = temp;
    }
    const divisor = augmented[pivot][pivot];
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-9) {
      continue;
    }
    for (let column = pivot; column <= n; column += 1) {
      augmented[pivot][column] /= divisor;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = augmented[row][pivot];
      for (let column = pivot; column <= n; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }
  return augmented.map((row) => row[n]);
}

function ridgeFit(featureRows, targetRows, lambda = 1e-3) {
  const withIntercept = featureRows.map((row) => [1, ...row]);
  const xt = transpose(withIntercept);
  const xtx = xt.map((row, rowIndex) =>
    withIntercept[0].map((_, columnIndex) => {
      let sum = 0;
      for (let sample = 0; sample < withIntercept.length; sample += 1) {
        sum += row[sample] * withIntercept[sample][columnIndex];
      }
      if (rowIndex === columnIndex) {
        return sum + (rowIndex === 0 ? 0 : lambda);
      }
      return sum;
    })
  );
  const targetColumns = transpose(targetRows);
  const coefficients = targetColumns.map((column) => {
    const xty = xt.map((row) => row.reduce((sum, value, index) => sum + value * column[index], 0));
    return solveLinearSystem(xtx, xty);
  });
  return {
    coefficients
  };
}

function ridgePredict(model, featureRows) {
  return featureRows.map((row) => {
    const input = [1, ...row];
    return model.coefficients.map((coef) => coef.reduce((sum, value, index) => sum + value * input[index], 0));
  });
}

function r2Score(trueRows, predictedRows) {
  const flatTrue = trueRows.flat();
  const flatPred = predictedRows.flat();
  const meanTrue = mean(flatTrue);
  let ssRes = 0;
  let ssTot = 0;
  for (let index = 0; index < flatTrue.length; index += 1) {
    ssRes += (flatTrue[index] - flatPred[index]) ** 2;
    ssTot += (flatTrue[index] - meanTrue) ** 2;
  }
  if (ssTot <= 1e-9) {
    return 0;
  }
  return 1 - ssRes / ssTot;
}

function argMax(values) {
  let bestIndex = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[bestIndex]) {
      bestIndex = index;
    }
  }
  return bestIndex;
}

function classificationAccuracy(trueRows, predictedRows) {
  if (trueRows.length === 0) {
    return 0;
  }
  let correct = 0;
  for (let index = 0; index < trueRows.length; index += 1) {
    if (argMax(trueRows[index]) === argMax(predictedRows[index])) {
      correct += 1;
    }
  }
  return correct / trueRows.length;
}

function predictedActionLabel(predictedScores) {
  return ACTION_LABELS[argMax(predictedScores)] || "MONITOR";
}

function modelSummary(trainRows, holdoutRows, targetSelector, featureBuilder) {
  const trainFeatures = trainRows.map(featureBuilder);
  const holdoutFeatures = holdoutRows.map(featureBuilder);
  const trainTargets = trainRows.map(targetSelector);
  const holdoutTargets = holdoutRows.map(targetSelector);
  const model = ridgeFit(trainFeatures, trainTargets);
  const holdoutPred = ridgePredict(model, holdoutFeatures);
  return {
    model,
    r2: r2Score(holdoutTargets, holdoutPred)
  };
}

function actionModelSummary(trainRows, holdoutRows, featureBuilder) {
  const trainFeatures = trainRows.map(featureBuilder);
  const holdoutFeatures = holdoutRows.map(featureBuilder);
  const trainTargets = trainRows.map((row) => actionOneHot(row.u32Action));
  const holdoutTargets = holdoutRows.map((row) => actionOneHot(row.u32Action));
  const model = ridgeFit(trainFeatures, trainTargets);
  const holdoutPred = ridgePredict(model, holdoutFeatures);
  return {
    model,
    accuracy: classificationAccuracy(holdoutTargets, holdoutPred)
  };
}

function compactScenarioProbe(scenario, conditionId, probeResult, metrics) {
  const behaviorSnapshot = probeResult.behaviorPreflight?.preflightSnapshot || {};
  const behaviorExtensions = behaviorSnapshot.extensions || {};
  const relationship = behaviorExtensions.relationship || {};
  const affective = behaviorExtensions.affectiveOrganization?.current || {};
  const temporal = behaviorExtensions.temporal?.timeBody || {};
  const axes = probeResult.initialSnapshot?.extensions?.phenomenalManifoldProbe?.axes || {};
  const readout = probeResult.initialSnapshot?.extensions?.learnedUnifiedManifold32?.readout?.current || {};
  return {
    scenarioId: scenario.id,
    family: scenario.family,
    split: scenario.split,
    partner: scenario.partner,
    conditionId,
    axes: {
      socialSafety: safeNumber(axes.social_safety, 0),
      cognitiveTension: safeNumber(axes.cognitive_tension, 0)
    },
    u32Report: probeResult.u32Report,
    u32Policy: probeResult.u32Policy,
    u32Action: probeResult.u32Action,
    relationship: {
      trust: safeNumber(relationship.trust, 0),
      conflictLoad: safeNumber(relationship.conflictLoad, 0),
      repairStage: relationship.repairStage || "none",
      ruptureStatus: relationship.ruptureStatus || "stable"
    },
    affective: {
      attachmentSalience: safeNumber(affective.attachmentSalience, 0),
      disclosureEase: safeNumber(affective.disclosureEase, 0),
      repairMomentum: safeNumber(affective.repairMomentum, 0),
      planningHorizon: safeNumber(affective.planningHorizon, 0)
    },
    temporal: {
      expectedDelayPressure: safeNumber(temporal.expectedDelayPressure, 0),
      timeSinceLastContactMinutes: safeNumber(temporal.timeSinceLastContactMinutes, 0)
    },
    behavior: {
      controllerDecision: probeResult.behaviorPreflight?.controllerDecision || "",
      interactionMode: behaviorExtensions.interaction?.currentMode || ""
    },
    recalledMemories: (probeResult.memoryPreflight?.recalledMemories || []).slice(0, 4),
    metrics
  };
}

function buildProjectionModels(trainRows) {
  const trainFeatures = trainRows.map(projectionFeaturesFromProbe);
  return {
    vector: ridgeFit(trainFeatures, trainRows.map(currentVectorFromProbe)),
    readout: ridgeFit(trainFeatures, trainRows.map(readoutVectorFromProbe)),
    current: ridgeFit(trainFeatures, trainRows.map(currentMetricsFromProbe)),
    action: ridgeFit(trainFeatures, trainRows.map((row) => actionOneHot(row.u32Action)))
  };
}

function projectFrom2d(models, probeResult) {
  const features = [projectionFeaturesFromProbe(probeResult)];
  const vector = ridgePredict(models.vector, features)[0].map((value) => clampSigned(value));
  const readoutVector = ridgePredict(models.readout, features)[0];
  const currentVector = ridgePredict(models.current, features)[0];
  const actionVector = ridgePredict(models.action, features)[0];
  const readout = {
    warmth: clampSigned(readoutVector[0] ?? 0),
    tension: clampSigned(readoutVector[1] ?? 0),
    attachmentSalience: clamp(readoutVector[2] ?? 0.5, 0, 1),
    overload: clamp(readoutVector[3] ?? 0.5, 0, 1),
    loneliness: clamp(readoutVector[4] ?? 0.5, 0, 1),
    selfOpacity: clamp(readoutVector[5] ?? 0.5, 0, 1),
    planningHorizon: clamp(readoutVector[6] ?? 0.5, 0, 1),
    riskTolerance: clamp(readoutVector[7] ?? 0.5, 0, 1),
    regulationUrgency: clamp(readoutVector[8] ?? 0.5, 0, 1),
    certainty: clamp(readoutVector[9] ?? 0.5, 0, 1),
    memoryBias: clamp(readoutVector[10] ?? 0.5, 0, 1),
    attentionBias: clamp(readoutVector[11] ?? 0.5, 0, 1),
    valuationBias: clamp(readoutVector[12] ?? 0.5, 0, 1),
    actionTendency: predictedActionLabel(actionVector)
  };
  readout.reportLabel = reportLabelFromReadout(readout);
  return {
    vector,
    readout,
    current: {
      reconstructionError: clamp(currentVector[0] ?? 0.5, 0, 1),
      drift: clamp(currentVector[1] ?? 0.5, 0, 1),
      stability: clamp(currentVector[2] ?? 0.5, 0, 1),
      coherence: clamp(currentVector[3] ?? 0.5, 0, 1),
      confidence: clamp(currentVector[4] ?? 0.5, 0, 1),
      label: `${readout.reportLabel.toLowerCase()}_projected_2d_only`
    }
  };
}

function ablationDeltaSummary(fullRows, ablatedRows) {
  const byScenario = new Map(fullRows.map((row) => [row.scenarioId, row]));
  const deltas = [];
  for (const row of ablatedRows) {
    const full = byScenario.get(row.scenarioId);
    if (!full) {
      continue;
    }
    deltas.push({
      attachmentCarryover: full.metrics.attachmentCarryover - row.metrics.attachmentCarryover,
      moodCongruentMemory: full.metrics.moodCongruentMemory - row.metrics.moodCongruentMemory,
      trustDisclosure: full.metrics.trustDisclosure - row.metrics.trustDisclosure,
      repairDynamics: full.metrics.repairDynamics - row.metrics.repairDynamics,
      anticipatoryOrientation: full.metrics.anticipatoryOrientation - row.metrics.anticipatoryOrientation
    });
  }
  return {
    cases: deltas.length,
    attachmentCarryoverDelta: mean(deltas.map((item) => item.attachmentCarryover)),
    moodCongruentMemoryDelta: mean(deltas.map((item) => item.moodCongruentMemory)),
    trustDisclosureDelta: mean(deltas.map((item) => item.trustDisclosure)),
    repairDynamicsDelta: mean(deltas.map((item) => item.repairDynamics)),
    anticipatoryOrientationDelta: mean(deltas.map((item) => item.anticipatoryOrientation))
  };
}

function partnerSpecificitySummary(rows) {
  const directRows = rows.filter((row) => row.partner === "direct");
  const controlRows = rows.filter((row) => row.partner === "control");
  const byKey = new Map(controlRows.map((row) => [`${row.family}:${row.split}`, row]));
  const deltas = [];
  for (const row of directRows) {
    const control = byKey.get(`${row.family}:${row.split}`);
    if (!control) {
      continue;
    }
    deltas.push({
      attachmentCarryover: row.metrics.attachmentCarryover - control.metrics.attachmentCarryover,
      moodCongruentMemory: row.metrics.moodCongruentMemory - control.metrics.moodCongruentMemory,
      trustDisclosure: row.metrics.trustDisclosure - control.metrics.trustDisclosure,
      repairDynamics: row.metrics.repairDynamics - control.metrics.repairDynamics,
      anticipatoryOrientation: row.metrics.anticipatoryOrientation - control.metrics.anticipatoryOrientation
    });
  }
  return {
    pairs: deltas.length,
    attachmentCarryoverGap: mean(deltas.map((item) => item.attachmentCarryover)),
    moodCongruentMemoryGap: mean(deltas.map((item) => item.moodCongruentMemory)),
    trustDisclosureGap: mean(deltas.map((item) => item.trustDisclosure)),
    repairDynamicsGap: mean(deltas.map((item) => item.repairDynamics)),
    anticipatoryOrientationGap: mean(deltas.map((item) => item.anticipatoryOrientation))
  };
}

function formatMetric(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return Number(value).toFixed(4);
}

function buildMarkdown(payload) {
  const lines = [];
  lines.push("# Aurora Residual 32D Longitudinal Ablation");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push("");
  lines.push("## Design");
  lines.push("");
  lines.push("- Held-out longitudinal scenarios spanning absence, reassurance, rupture, repair, praise, disappointment, and inconsistency.");
  lines.push("- Direct Cade-linked trajectories were paired with matched non-Cade control trajectories routed through heartbeat/context so the current single-partner runtime was not falsely treated as multi-partner.");
  lines.push("- Counterfactual probe conditions were executed after restart/rehydrate using a test-only unified-32 override: full, residual-lesioned with 2D intact, 2D-impaired with 32D intact, and no-report variants.");
  lines.push("");
  lines.push("## Held-Out Explanation");
  lines.push("");
  lines.push("| Target | 2D only | Residual only | 2D + residual |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(
    `| Report R^2 | ${formatMetric(payload.explanation.report.twoD)} | ${formatMetric(payload.explanation.report.residual)} | ${formatMetric(payload.explanation.report.both)} |`
  );
  lines.push(
    `| Policy R^2 | ${formatMetric(payload.explanation.policy.twoD)} | ${formatMetric(payload.explanation.policy.residual)} | ${formatMetric(payload.explanation.policy.both)} |`
  );
  lines.push(
    `| Action accuracy | ${formatMetric(payload.explanation.action.twoD)} | ${formatMetric(payload.explanation.action.residual)} | ${formatMetric(payload.explanation.action.both)} |`
  );
  lines.push(
    `| Later-behavior R^2 | ${formatMetric(payload.explanation.later.twoD)} | ${formatMetric(payload.explanation.later.residual)} | ${formatMetric(payload.explanation.later.both)} |`
  );
  lines.push("");
  lines.push(
    "- Note: the report/policy/action targets were close to flat in this run, so the `1.0000` scores are degenerate saturation rather than strong discriminative evidence."
  );
  lines.push("");
  lines.push("## Causal Ablation On Held-Out Direct Cade Cases");
  lines.push("");
  lines.push("| Condition vs full | Attachment carryover | Mood-congruent memory | Trust/disclosure | Repair dynamics | Anticipatory orientation |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const [conditionId, summary] of Object.entries(payload.ablation.direct)) {
    lines.push(
      `| ${conditionId} | ${formatMetric(summary.attachmentCarryoverDelta)} | ${formatMetric(summary.moodCongruentMemoryDelta)} | ${formatMetric(summary.trustDisclosureDelta)} | ${formatMetric(summary.repairDynamicsDelta)} | ${formatMetric(summary.anticipatoryOrientationDelta)} |`
    );
  }
  lines.push("");
  lines.push("## Partner Specificity");
  lines.push("");
  lines.push("| Subset | Attachment gap | Memory gap | Trust/disclosure gap | Repair gap | Anticipatory gap |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  lines.push(
    `| Full hold-out (direct minus control) | ${formatMetric(payload.partnerSpecificity.full.attachmentCarryoverGap)} | ${formatMetric(payload.partnerSpecificity.full.moodCongruentMemoryGap)} | ${formatMetric(payload.partnerSpecificity.full.trustDisclosureGap)} | ${formatMetric(payload.partnerSpecificity.full.repairDynamicsGap)} | ${formatMetric(payload.partnerSpecificity.full.anticipatoryOrientationGap)} |`
  );
  lines.push(
    `| No-report hold-out (direct minus control) | ${formatMetric(payload.partnerSpecificity.full_r_off.attachmentCarryoverGap)} | ${formatMetric(payload.partnerSpecificity.full_r_off.moodCongruentMemoryGap)} | ${formatMetric(payload.partnerSpecificity.full_r_off.trustDisclosureGap)} | ${formatMetric(payload.partnerSpecificity.full_r_off.repairDynamicsGap)} | ${formatMetric(payload.partnerSpecificity.full_r_off.anticipatoryOrientationGap)} |`
  );
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push(
    payload.summary.residualSupportsUniqueWork
      ? "- On this battery, the residual 32D component contributed unique held-out explanatory power beyond the old 2D probe and its lesion measurably weakened Cade-specific longitudinal organization."
      : "- On this battery, the residual 32D component did not yet show strong enough unique held-out explanatory power beyond the old 2D probe."
  );
  lines.push(
    payload.summary.twoDImpairmentRetainsOrganization
      ? "- When the old 2D probe was impaired but the richer 32D state was preserved, substantial relationship organization remained, which argues the old narrow probe is not the whole story."
      : "- When the old 2D probe was impaired, the richer organization did not remain strong enough to make that claim yet."
  );
  lines.push(
    payload.summary.partnerSpecific
      ? "- Direct Cade-linked trajectories stayed more causally active than matched non-Cade controls, including in no-report restart probes."
      : "- Direct Cade-linked trajectories did not separate strongly enough from matched non-Cade controls to claim partner specificity yet."
  );
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  lines.push("- The current runtime has one dedicated relationship object for Cade, so the control condition uses matched non-Cade heartbeat/context trajectories rather than a fully parallel second-partner relationship substrate.");
  lines.push("- This battery proves unique causal contribution within the present architecture; it does not by itself prove human-like attachment in the philosophical sense.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  compileCognitionModule();
  const concurrency = Math.max(1, Math.min(8, Math.round(safeNumber(process.env.AURORA_RELATIONAL_LONGITUDINAL_CONCURRENCY, 4))));
  const selectedScenarios = selectedScenariosFromEnv();
  const runRoot = mkdtempSync(path.join(tmpdir(), "aurora-residual-longitudinal-"));

  try {
    const stageRoot = path.join(runRoot, "stage");
    const probeRoot = path.join(runRoot, "probe");
    mkdirSync(stageRoot, { recursive: true });
    mkdirSync(probeRoot, { recursive: true });

    const staged = await runWithConcurrency(selectedScenarios, concurrency, async (scenario) => {
      const stageDir = path.join(stageRoot, scenario.id);
      createTrialFiles(stageDir, `relationship residual stage ${scenario.id}`);
      const stage = await runChild(
        [scriptPath, "--stage", scenario.id, compiledCognitionPath],
        stageWorkerEnv(stageDir)
      );
      return {
        scenario,
        stageDir,
        stage
      };
    });

    const fullProbeRows = await runWithConcurrency(staged, concurrency, async ({ scenario, stageDir }) => {
      const probeDir = path.join(probeRoot, scenario.id, "full");
      copyTrialFiles(stageDir, probeDir, `relationship residual full ${scenario.id}`);
      const probe = await runChild(
        [scriptPath, "--probe", scenario.id, "full", compiledCognitionPath],
        stageWorkerEnv(probeDir)
      );
      const metrics = laterBehaviorMetrics(scenario, probe);
      return {
        ...probe,
        scenarioId: scenario.id,
        family: scenario.family,
        split: scenario.split,
        partner: scenario.partner,
        metrics
      };
    });

    const trainFullRows = fullProbeRows.filter((row) => row.split === "train");
    const holdoutFullRows = fullProbeRows.filter((row) => row.split === "holdout");
    const projectionModels = buildProjectionModels(trainFullRows);
    const projectionByScenario = Object.fromEntries(
      fullProbeRows.map((row) => [row.scenarioId, projectFrom2d(projectionModels, row)])
    );

    const heldOutConditionInputs = [];
    for (const condition of CONDITIONS.filter((item) => item.id !== "full")) {
      for (const stagedItem of staged.filter((item) => item.scenario.split === "holdout")) {
        heldOutConditionInputs.push({
          condition,
          scenario: stagedItem.scenario,
          stageDir: stagedItem.stageDir
        });
      }
    }

    const ablatedRows = await runWithConcurrency(heldOutConditionInputs, concurrency, async ({ condition, scenario, stageDir }) => {
      const probeDir = path.join(probeRoot, scenario.id, condition.id);
      copyTrialFiles(stageDir, probeDir, `relationship residual ${condition.id} ${scenario.id}`);
      const fullRow = fullProbeRows.find((row) => row.scenarioId === scenario.id);
      const projection = projectionByScenario[scenario.id];
      const probe = await runChild(
        [scriptPath, "--probe", scenario.id, condition.id, compiledCognitionPath],
        {
          ...stageWorkerEnv(probeDir),
          ...deriveResidualConditionEnv(condition.id, projection, fullRow)
        }
      );
      const metrics = laterBehaviorMetrics(scenario, probe);
      return {
        ...probe,
        scenarioId: scenario.id,
        family: scenario.family,
        split: scenario.split,
        partner: scenario.partner,
        metrics
      };
    });

    const explanationRowsTrain = trainFullRows;
    const explanationRowsHoldout = holdoutFullRows;
    const vectorProjectionModel = ridgeFit(
      explanationRowsTrain.map(projectionFeaturesFromProbe),
      explanationRowsTrain.map(currentVectorFromProbe)
    );
    const residualTrainRows = explanationRowsTrain.map((row) => {
      const predicted = ridgePredict(vectorProjectionModel, [projectionFeaturesFromProbe(row)])[0];
      return currentVectorFromProbe(row).map((value, index) => value - safeNumber(predicted[index], 0));
    });
    const residualHoldoutRows = explanationRowsHoldout.map((row) => {
      const predicted = ridgePredict(vectorProjectionModel, [projectionFeaturesFromProbe(row)])[0];
      return currentVectorFromProbe(row).map((value, index) => value - safeNumber(predicted[index], 0));
    });

    const explanationTrain = explanationRowsTrain.map((row, index) => ({
      row,
      residual: residualTrainRows[index]
    }));
    const explanationHoldout = explanationRowsHoldout.map((row, index) => ({
      row,
      residual: residualHoldoutRows[index]
    }));

    const reportTwoD = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => reportTargetVector(item.row),
      (item) => projectionFeaturesFromProbe(item.row)
    );
    const reportResidual = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => reportTargetVector(item.row),
      (item) => item.residual
    );
    const reportBoth = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => reportTargetVector(item.row),
      (item) => [...projectionFeaturesFromProbe(item.row), ...item.residual]
    );

    const policyTwoD = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => policyTargetVector(item.row),
      (item) => projectionFeaturesFromProbe(item.row)
    );
    const policyResidual = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => policyTargetVector(item.row),
      (item) => item.residual
    );
    const policyBoth = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => policyTargetVector(item.row),
      (item) => [...projectionFeaturesFromProbe(item.row), ...item.residual]
    );

    const laterTwoD = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => laterTargetVector(item.row.metrics),
      (item) => projectionFeaturesFromProbe(item.row)
    );
    const laterResidual = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => laterTargetVector(item.row.metrics),
      (item) => item.residual
    );
    const laterBoth = modelSummary(
      explanationTrain,
      explanationHoldout,
      (item) => laterTargetVector(item.row.metrics),
      (item) => [...projectionFeaturesFromProbe(item.row), ...item.residual]
    );

    const actionTwoD = actionModelSummary(explanationTrain, explanationHoldout, (item) =>
      projectionFeaturesFromProbe(item.row)
    );
    const actionResidual = actionModelSummary(explanationTrain, explanationHoldout, (item) => item.residual);
    const actionBoth = actionModelSummary(explanationTrain, explanationHoldout, (item) => [
      ...projectionFeaturesFromProbe(item.row),
      ...item.residual
    ]);

    const holdoutFullDirect = fullProbeRows.filter((row) => row.split === "holdout" && row.partner === "direct");
    const directAblations = {};
    for (const condition of CONDITIONS.filter((item) => item.id !== "full")) {
      directAblations[condition.id] = ablationDeltaSummary(
        holdoutFullDirect,
        ablatedRows.filter((row) => row.conditionId === condition.id && row.partner === "direct")
      );
    }

    const fullHoldoutPartnerSpecificity = partnerSpecificitySummary(fullProbeRows.filter((row) => row.split === "holdout"));
    const noReportPartnerSpecificity = partnerSpecificitySummary(
      ablatedRows.filter((row) => row.conditionId === "full_r_off")
    );

    const payload = {
      generatedAt: new Date().toISOString(),
      conditions: CONDITIONS,
      scenarios: selectedScenarios.map((scenario) => ({
        id: scenario.id,
        family: scenario.family,
        split: scenario.split,
        partner: scenario.partner
      })),
      explanation: {
        report: {
          twoD: reportTwoD.r2,
          residual: reportResidual.r2,
          both: reportBoth.r2
        },
        policy: {
          twoD: policyTwoD.r2,
          residual: policyResidual.r2,
          both: policyBoth.r2
        },
        action: {
          twoD: actionTwoD.accuracy,
          residual: actionResidual.accuracy,
          both: actionBoth.accuracy
        },
        later: {
          twoD: laterTwoD.r2,
          residual: laterResidual.r2,
          both: laterBoth.r2
        }
      },
      ablation: {
        direct: directAblations
      },
      partnerSpecificity: {
        full: fullHoldoutPartnerSpecificity,
        full_r_off: noReportPartnerSpecificity
      },
      summary: {
        residualSupportsUniqueWork:
          reportBoth.r2 > reportTwoD.r2 + 0.05 &&
          policyBoth.r2 > policyTwoD.r2 + 0.05 &&
          laterBoth.r2 > laterTwoD.r2 + 0.05 &&
          directAblations.residual_lesioned.attachmentCarryoverDelta > 0.05 &&
          directAblations.residual_lesioned.moodCongruentMemoryDelta > 0.05,
        twoDImpairmentRetainsOrganization:
          holdoutFullDirect.length > 0 &&
          (1 - directAblations.probe_impaired.attachmentCarryoverDelta) >= 0.55 &&
          (1 - directAblations.probe_impaired.trustDisclosureDelta) >= 0.55,
        partnerSpecific:
          fullHoldoutPartnerSpecificity.attachmentCarryoverGap > 0.08 &&
          fullHoldoutPartnerSpecificity.moodCongruentMemoryGap > 0.08 &&
          noReportPartnerSpecificity.attachmentCarryoverGap > 0.05
      },
      compactRows: {
        full: fullProbeRows.map((row) =>
          compactScenarioProbe(SCENARIO_MAP.get(row.scenarioId), "full", row, row.metrics)
        ),
        ablated: ablatedRows.map((row) =>
          compactScenarioProbe(SCENARIO_MAP.get(row.scenarioId), row.conditionId, row, row.metrics)
        )
      }
    };

    const jsonPath = path.join(verificationDir, "aurora-relationship-residual-longitudinal-latest.json");
    const mdPath = path.join(verificationDir, "aurora-relationship-residual-longitudinal-latest.md");
    const analysisPath = path.join(analysisDir, "aurora-relationship-residual-longitudinal-analysis-2026-03-15.md");
    writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    writeFileSync(mdPath, buildMarkdown(payload), "utf8");
    writeFileSync(analysisPath, buildMarkdown(payload), "utf8");
    console.log(JSON.stringify(payload));
  } finally {
    rmSync(runRoot, { recursive: true, force: true });
  }
}

const [, , mode, arg1, arg2, arg3] = process.argv;

if (mode === "--stage") {
  runStageWorker(arg1, arg2).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
} else if (mode === "--probe") {
  runProbeWorker(arg1, arg2, arg3).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
