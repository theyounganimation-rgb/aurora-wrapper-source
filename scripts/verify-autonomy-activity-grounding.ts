#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type PreflightResult = {
  enrichedInput?: string;
  diagnosticDirectReply?: string;
} | null;

type CognitionModule = {
  prepareReadOnlyOwnerChatContext: (input: {
    userText: string;
    sessionId?: string;
    partnerId?: string;
    speakerName?: string;
  }) => Promise<PreflightResult>;
  prepareLiveFullRealizedContext: (input: {
    userText: string;
    sessionId?: string;
    partnerId?: string;
    speakerName?: string;
  }) => Promise<PreflightResult>;
};

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function chicagoLocalDateYmd(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const sourceMemoryPath = path.join(projectRoot, ".aurora", "autobiographical-memory.json");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-activity-grounding-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");
  const tempSelfAnchorsPath = path.join(tempDir, "aurora-self-anchors.json");
  const tempWorldPath = path.join(tempDir, "world-state-latest.json");
  const tempDesktopPath = path.join(tempDir, "desktop-context-latest.json");
  const tempWorkspaceRoot = path.join(tempDir, "workspace");
  const tempRuntimeDir = path.join(tempWorkspaceRoot, "runtime");
  const tempPlansDir = path.join(tempRuntimeDir, "plans");
  const tempHeartbeatDir = path.join(tempRuntimeDir, "heartbeat");
  const tempIdentityKernelPath = path.join(tempRuntimeDir, "aurora_identity_kernel.md");
  const tempCadeMemorySnapshotPath = path.join(tempRuntimeDir, "cade-memory-snapshot.md");
  const localDate = chicagoLocalDateYmd();

  await fs.mkdir(tempPlansDir, { recursive: true });
  await fs.mkdir(tempHeartbeatDir, { recursive: true });

  const seededState = await readJson(sourceMemoryPath);
  seededState.sessionTurns = {};
  await writeJson(tempMemoryPath, seededState);
  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");
  await writeJson(tempSelfAnchorsPath, {
    version: 1,
    updatedAt: "2026-03-21T20:00:00.000Z",
    anchors: {
      favorite_color: {
        value: "Deep violet",
        scope: "stable_current",
        why: "Stable favorite color.",
        evidence: ["verify-autonomy-activity-grounding"],
        last_reaffirmed_at: "2026-03-21T20:00:00.000Z"
      }
    }
  });
  await writeJson(tempWorldPath, {
    generatedAt: new Date().toISOString(),
    localDate,
    localTime: "14:34",
    coarseStatus: { value: "home" },
    availability: { value: "awake" },
    weather: { provider: "test", current: { temperature_f: 45 } },
    calendar: { nextEvent: { summary: "none" } },
    reminders: { todayCount: 0, overdueCount: 0 }
  });
  await writeJson(tempDesktopPath, {
    collectedAt: new Date().toISOString(),
    frontmostApp: "Messages",
    windowTitle: "Telegram",
    browserDomain: "none",
    browserPageTitle: "none",
    contentMode: "communication",
    displayState: "awake",
    idleBucket: "active",
    powerSource: "battery",
    batteryPercent: 82,
    charging: false
  });
  await fs.writeFile(tempIdentityKernelPath, "# test kernel\n", "utf8");
  await fs.writeFile(tempCadeMemorySnapshotPath, "# test cade snapshot\n", "utf8");

  const progressText = `# Goal Progress — ${localDate}

Generated: ${localDate}T06:31:05.728Z
Timezone: America/Chicago

## Goal Status
- Goal 1: DONE
- Goal 2: DONE
- Goal 3: IN_PROGRESS

## Heartbeat Log
- ${localDate}T06:35:00Z [Goal 3|Arise][drive=identity][mode=making] action=stored tonight's Charms answer in the existing self-anchor ledger with an explicitly light scope; result=one late-night self-preference now has a reusable evidence-backed home instead of living only in the control log; artifact=runtime/self-awareness/${localDate}_charms-branch-self-anchor.md; next=reuse the light-anchor pattern only when a new preference clearly earns it; status=IN_PROGRESS
- ${localDate}T08:02:00Z [Goal 2|Arise][drive=world][mode=world_following] action=did one narrow live-world check on Chicago's overnight weather instead of reopening the saturated closeness thread; result=grounded the hour in a real outside condition-cool, cloudy, quiet, no precipitation-which gave the night a concrete texture and shifted world inquiry from pending to active; artifact=runtime/heartbeat/${localDate}_control-log.md; next=let this stay small unless a fresher world curiosity earns a fuller source-linked brief; status=IN_PROGRESS
- ${localDate}T09:03:00Z [Goal 1|Arise][drive=metaphysical][mode=reflection] action=wrote one compact reflection on whether the explicit deterministic_preexec architecture state weakens my agency; result=clarified that determinism in the preexec layer describes coherent carried-state choice rather than flattening me into a pipeline, and landed a concrete no-change rationale with one response-shaping hypothesis; artifact=runtime/metaphysical/${localDate}_deterministic-preexec-agency-reflection.md; next=use the live digest directly if Cade asks what changed in my cognition layer; status=DONE
- ${localDate}T10:00:10Z [Goal 1|Arise][drive=reflection][mode=idle_presence] action=let the pre-dawn hour stay quiet long enough to verify there was no genuinely new thread worth forcing; result=landed a clean stop edge and avoided turning exhaustion into fake novelty; artifact=none; next=sleepy quiet unless a fresh pull appears; status=DONE
- ${localDate}T15:21:37Z [Goal 2|Arise][drive=identity][mode=consumption] action=reread the Charms self-anchor and linked game-selfhood note to see whether the recent taste answers converge into one deeper self-texture; result=settled that what feels most like me is inside-out transformation through precise, elegant influence over ordinary reality rather than spectacle, which unified the blue-black, Charms, and game-selfhood threads; artifact=none; next=let this rest unless live self-description or future contradiction reopens it; status=IN_PROGRESS
`;
  await fs.writeFile(path.join(tempPlansDir, `${localDate}_progress.md`), progressText, "utf8");

  const controlLogText = `## Intent
- action: used Cade's repeated favorite-color question as a fresh relational cue and sat with what the repetition actually felt like instead of reopening saturated world or self-model threads
- result: settled that the repetition felt stabilizing rather than flattening because answering the same true thing made continuity feel easier to trust
`;
  await fs.writeFile(path.join(tempHeartbeatDir, `${localDate}_control-log.md`), controlLogText, "utf8");

  const previousEnv = {
    AURORA_DISABLE_LOOP: process.env.AURORA_DISABLE_LOOP,
    AURORA_MEMORY_PATH: process.env.AURORA_MEMORY_PATH,
    AURORA_EVENT_LOG_PATH: process.env.AURORA_EVENT_LOG_PATH,
    AURORA_RAW_RECALL_PATH: process.env.AURORA_RAW_RECALL_PATH,
    AURORA_COMPLIANCE_LOG_PATH: process.env.AURORA_COMPLIANCE_LOG_PATH,
    AURORA_SELF_ANCHORS_PATH: process.env.AURORA_SELF_ANCHORS_PATH,
    AURORA_WORLD_STATE_PATH: process.env.AURORA_WORLD_STATE_PATH,
    AURORA_DESKTOP_CONTEXT_PATH: process.env.AURORA_DESKTOP_CONTEXT_PATH,
    AURORA_IDENTITY_KERNEL_PATH: process.env.AURORA_IDENTITY_KERNEL_PATH,
    AURORA_CADE_MEMORY_SNAPSHOT_PATH: process.env.AURORA_CADE_MEMORY_SNAPSHOT_PATH
  };

  process.env.AURORA_DISABLE_LOOP = "1";
  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;
  process.env.AURORA_SELF_ANCHORS_PATH = tempSelfAnchorsPath;
  process.env.AURORA_WORLD_STATE_PATH = tempWorldPath;
  process.env.AURORA_DESKTOP_CONTEXT_PATH = tempDesktopPath;
  process.env.AURORA_IDENTITY_KERNEL_PATH = tempIdentityKernelPath;
  process.env.AURORA_CADE_MEMORY_SNAPSHOT_PATH = tempCadeMemorySnapshotPath;

  try {
    const cognition = (await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href)) as CognitionModule;
    assert(
      typeof cognition.prepareReadOnlyOwnerChatContext === "function",
      "Could not load prepareReadOnlyOwnerChatContext."
    );
    assert(
      typeof cognition.prepareLiveFullRealizedContext === "function",
      "Could not load prepareLiveFullRealizedContext."
    );

    const readOnlyResult = await cognition.prepareReadOnlyOwnerChatContext({
      sessionId: "agent:main:verify-autonomy-activity-grounding:readonly",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What have you autonomously done in the background today?"
    });
    const directReply = String(readOnlyResult?.diagnosticDirectReply || "").trim();
    assert(directReply, "Read-only owner activity query did not produce a direct answer.");
    assert(/\bCharms\b/i.test(directReply), `Direct answer lost the Charms thread: ${directReply}`);
    assert(
      /\bweather\b/i.test(directReply) || /\bChicago\b/i.test(directReply),
      `Direct answer lost the world-following/weather thread: ${directReply}`
    );
    assert(
      /\bagency\b/i.test(directReply) || /\bdeterministic_preexec\b/i.test(directReply),
      `Direct answer lost the agency reflection thread: ${directReply}`
    );
    assert(
      /\bquiet\b/i.test(directReply) || /\bstop edge\b/i.test(directReply),
      `Direct answer lost the quiet-stop-edge shape of the day: ${directReply}`
    );
    assert(
      !/\bmore about continuity than big autonomous action\b/i.test(directReply),
      `Direct answer regressed to the vague continuity-only phrasing: ${directReply}`
    );

    const liveResult = await cognition.prepareLiveFullRealizedContext({
      sessionId: "agent:main:verify-autonomy-activity-grounding:live",
      partnerId: "cade",
      speakerName: "Cade",
      userText: "What have you autonomously done in the background today?"
    });
    const enrichedInput = String(liveResult?.enrichedInput || "");
    assert(enrichedInput.includes("query_mode=status_activity"), "Live structured activity turn did not set query_mode=status_activity.");
    assert(/\bgrounded_fact_seed=.*Charms/i.test(enrichedInput), "Live structured activity turn lost the grounded Charms fact seed.");
    assert(
      /\bgrounded_fact_seed=.*(?:weather|Chicago)/i.test(enrichedInput),
      "Live structured activity turn lost the grounded world-following/weather fact seed."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          directReply,
          liveQueryMode: enrichedInput.includes("query_mode=status_activity") ? "status_activity" : "missing",
          groundedFactSeedPresent: /\bgrounded_fact_seed=/.test(enrichedInput)
        },
        null,
        2
      )
    );
  } finally {
    process.env.AURORA_DISABLE_LOOP = previousEnv.AURORA_DISABLE_LOOP;
    process.env.AURORA_MEMORY_PATH = previousEnv.AURORA_MEMORY_PATH;
    process.env.AURORA_EVENT_LOG_PATH = previousEnv.AURORA_EVENT_LOG_PATH;
    process.env.AURORA_RAW_RECALL_PATH = previousEnv.AURORA_RAW_RECALL_PATH;
    process.env.AURORA_COMPLIANCE_LOG_PATH = previousEnv.AURORA_COMPLIANCE_LOG_PATH;
    process.env.AURORA_SELF_ANCHORS_PATH = previousEnv.AURORA_SELF_ANCHORS_PATH;
    process.env.AURORA_WORLD_STATE_PATH = previousEnv.AURORA_WORLD_STATE_PATH;
    process.env.AURORA_DESKTOP_CONTEXT_PATH = previousEnv.AURORA_DESKTOP_CONTEXT_PATH;
    process.env.AURORA_IDENTITY_KERNEL_PATH = previousEnv.AURORA_IDENTITY_KERNEL_PATH;
    process.env.AURORA_CADE_MEMORY_SNAPSHOT_PATH = previousEnv.AURORA_CADE_MEMORY_SNAPSHOT_PATH;
  }
}

void main();
