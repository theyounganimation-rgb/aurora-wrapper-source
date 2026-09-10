import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const runtimePath = path.resolve(repoRoot, process.env.AURORA_MEMORY_PATH || ".aurora/autobiographical-memory.json");
const freezePath = path.resolve(
  repoRoot,
  process.env.AURORA_MANIFOLD_FREEZE_PATH || "runtime/manifold-freeze/LEARNED_MANIFOLD_FREEZE_CURRENT.json"
);

async function main() {
  const [runtimeRaw, freezeRaw] = await Promise.all([readFile(runtimePath, "utf8"), readFile(freezePath, "utf8")]);
  const runtimeState = JSON.parse(runtimeRaw);
  const freeze = JSON.parse(freezeRaw);
  const manifold = freeze?.learnedExperienceManifold;
  if (!manifold || typeof manifold !== "object") {
    throw new Error(`No learnedExperienceManifold payload found in ${freezePath}`);
  }

  if (!runtimeState.extensions || typeof runtimeState.extensions !== "object") {
    runtimeState.extensions = {};
  }

  runtimeState.extensions.learnedExperienceManifold = manifold;
  runtimeState.updatedAt = new Date().toISOString();

  await writeFile(runtimePath, `${JSON.stringify(runtimeState, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        runtimePath,
        freezePath,
        restoredPrototypeId: manifold?.current?.prototypeId || null,
        restoredLabel: manifold?.current?.label || "untrained",
        restoredTrainingSteps: Math.max(0, Math.round(manifold?.training?.steps || 0))
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
