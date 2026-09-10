import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const runtimePath = path.resolve(repoRoot, process.env.AURORA_MEMORY_PATH || ".aurora/autobiographical-memory.json");
const outputDir = path.resolve(repoRoot, "runtime", "manifold-freeze");
const stableFile = path.join(outputDir, "LEARNED_MANIFOLD_FREEZE_CURRENT.json");

function digest(value) {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function timestampSlug(iso) {
  return iso.replace(/:/g, "-");
}

function round(value) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : 0;
}

async function main() {
  const raw = await readFile(runtimePath, "utf8");
  const state = JSON.parse(raw);
  const manifold = state?.extensions?.learnedExperienceManifold;
  if (!manifold || typeof manifold !== "object") {
    throw new Error(`No extensions.learnedExperienceManifold found in ${runtimePath}`);
  }

  const savedAt = new Date().toISOString();
  const archiveFile = path.join(outputDir, `LEARNED_MANIFOLD_FREEZE_${timestampSlug(savedAt)}.json`);
  const freeze = {
    schemaVersion: "1.0",
    savedAt,
    source: {
      runtimePath,
      stateUpdatedAt: state.updatedAt || null,
      lastTickAt: state.lastTickAt || null
    },
    digest: {
      manifoldSha1: digest(manifold),
      stateSha1: digest(state)
    },
    summary: {
      currentPrototypeId: manifold?.current?.prototypeId || null,
      currentLabel: manifold?.current?.label || "untrained",
      source: manifold?.current?.source || "unknown",
      novelty: round(manifold?.current?.novelty),
      coherence: round(manifold?.current?.coherence),
      continuity: round(manifold?.current?.continuity),
      confidence: round(manifold?.current?.confidence),
      transitionFamiliarity: round(manifold?.current?.transitionFamiliarity),
      trainingSteps: Math.max(0, Math.round(manifold?.training?.steps || 0)),
      lastTrainingSource: manifold?.training?.lastSource || "unknown"
    },
    context: {
      controller: state?.controller || null,
      workspace: state?.workspace
        ? {
            focus: state.workspace.focus || "",
            focusPriority: round(state.workspace.focusPriority),
            activePursuit: state.workspace.activePursuit || "",
            pendingPlans: Array.isArray(state.workspace.pendingPlans) ? state.workspace.pendingPlans.slice(0, 8) : []
          }
        : null,
      emotion: state?.emotion || null,
      hot4: state?.extensions?.qualitySpaceHOT4 || null,
      predictiveCoding: state?.extensions?.predictiveCoding || null
    },
    learnedExperienceManifold: manifold
  };

  await mkdir(outputDir, { recursive: true });
  const content = `${JSON.stringify(freeze, null, 2)}\n`;
  await writeFile(stableFile, content, "utf8");
  await writeFile(archiveFile, content, "utf8");

  console.log(
    JSON.stringify(
      {
        savedAt,
        runtimePath,
        stableFile,
        archiveFile,
        currentPrototypeId: freeze.summary.currentPrototypeId,
        currentLabel: freeze.summary.currentLabel,
        trainingSteps: freeze.summary.trainingSteps
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
