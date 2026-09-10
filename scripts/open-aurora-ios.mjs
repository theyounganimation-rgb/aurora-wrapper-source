#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const isolateScriptPath = path.join(projectRoot, "scripts", "isolate-ios-projects.mjs");
const auroraProjectPath = path.join(projectRoot, "ios", "Aurora", "Aurora.xcodeproj");
const xcodeAppPath = "/Applications/Xcode.app";

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? signal ?? "unknown"}`));
    });
  });
}

async function main() {
  if (!existsSync(auroraProjectPath)) {
    throw new Error(`Aurora Xcode project was not found at ${auroraProjectPath}`);
  }

  await runCommand(process.execPath, [isolateScriptPath]);

  if (existsSync(xcodeAppPath)) {
    await runCommand("open", ["-a", "Xcode", auroraProjectPath]);
    return;
  }

  await runCommand("open", [auroraProjectPath]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
