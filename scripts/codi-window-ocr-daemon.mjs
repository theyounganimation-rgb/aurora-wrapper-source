#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, ".aurora");
const outputPath = path.join(outputDir, "codi-window-ocr-cache.json");
const scriptPath = path.join(projectRoot, "scripts", "codi-window-ocr.swift");
const intervalMs = Math.max(1_000, Number.parseInt(process.env.CODI_OCR_DAEMON_INTERVAL_MS || "2500", 10));

let stopping = false;

async function captureOnce() {
  try {
    const { stdout } = await execFileAsync("swift", [scriptPath], {
      cwd: projectRoot,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 20_000
    });

    const payload = JSON.parse(stdout.trim());
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          payload
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR capture failed.";
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          payload: {
            ok: false,
            error: message,
            text: ""
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
}

async function loop() {
  await mkdir(outputDir, { recursive: true });
  while (!stopping) {
    await captureOnce();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

await loop();
