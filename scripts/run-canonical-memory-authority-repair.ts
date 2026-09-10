#!/usr/bin/env -S npx tsx

import { runCanonicalMemoryAuthorityRepair } from "../lib/auroraCognition";

async function main(): Promise<void> {
  const result = await runCanonicalMemoryAuthorityRepair();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
