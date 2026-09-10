import { readFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();

async function readJson(relativePath) {
  const absolutePath = path.join(cwd, relativePath);
  const file = await readFile(absolutePath, "utf8");
  return JSON.parse(file);
}

function fail(message) {
  throw new Error(message);
}

async function main() {
  const ciConfig = await readJson(".eslintrc.json");
  const ciExtends = Array.isArray(ciConfig.extends) ? ciConfig.extends : [];

  if (!ciExtends.includes("./.eslintrc.local.cjs")) {
    fail('CI config must extend "./.eslintrc.local.cjs" so local stays a subset by construction.');
  }

  if ("rules" in ciConfig) {
    fail("CI wrapper config must not define top-level rules directly.");
  }

  if ("overrides" in ciConfig) {
    fail("CI wrapper config must not define overrides directly.");
  }

  if ("parser" in ciConfig || "parserOptions" in ciConfig || "env" in ciConfig) {
    fail("CI wrapper config must inherit parser/env behavior from the shared and local configs.");
  }

  console.log(
    'Verified ESLint split: ".eslintrc.json" composes the full CI stack by extending ".eslintrc.local.cjs" without direct overrides.'
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
