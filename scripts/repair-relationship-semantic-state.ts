#!/usr/bin/env -S npx tsx

import { runRelationshipSemanticStateRepair } from "../lib/auroraCognition";

async function main(): Promise<void> {
  const result = await runRelationshipSemanticStateRepair();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
