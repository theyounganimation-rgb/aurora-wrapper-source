#!/usr/bin/env -S npx tsx

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const cognitionModule = await import(pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href);
  const runBlockedReflectionCleanup = cognitionModule.runBlockedReflectionCleanup as
    | (() => Promise<{
        removedMemoryNodes: number;
        removedReflectionThoughts: number;
        removedAttentionItems: number;
        removedProcessedAttentionItems: number;
        removedStmEntries: number;
        clearedWorkspaceFocus: boolean;
        removedEdges: number;
      }>)
    | undefined;

  if (typeof runBlockedReflectionCleanup !== "function") {
    throw new Error("Could not load runBlockedReflectionCleanup.");
  }

  const result = await runBlockedReflectionCleanup();
  console.log(JSON.stringify(result, null, 2));
}

void main();
