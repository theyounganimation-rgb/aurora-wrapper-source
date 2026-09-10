import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { prepareSendContext } from "../lib/auroraCognition";
import {
  registerOpenClawMemorySearchProvider,
  resetMemoryCandidateProviderRuntimeState
} from "../lib/auroraSalience/memoryCandidateProviders";

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous == null) {
    delete process.env[name];
    return;
  }
  process.env[name] = previous;
}

async function main(): Promise<void> {
  const previousConfigPath = process.env.AURORA_OPENCLAW_CONFIG_PATH;
  const previousProvider = process.env.AURORA_MEMORY_CANDIDATE_PROVIDER;
  const previousBinary = process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "aurora-live-provider-"));
  try {
    await writeFile(
      path.join(tempDir, "openclaw.json"),
      JSON.stringify(
        {
          agents: {
            defaults: {
              memorySearch: {
                provider: "ollama",
                model: "nomic-embed-text",
                fallback: "none"
              }
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    process.env.AURORA_OPENCLAW_CONFIG_PATH = path.join(tempDir, "openclaw.json");
    delete process.env.AURORA_MEMORY_CANDIDATE_PROVIDER;
    process.env.AURORA_OPENCLAW_MEMORY_SEARCH_BIN = "custom-openclaw";

    resetMemoryCandidateProviderRuntimeState();
    registerOpenClawMemorySearchProvider(async () => [
      {
        id: "provider-test-hit",
        source: "MEMORY.md",
        summary: "Selection-first cognition should influence what matters before reply generation.",
        text: "Selection-first cognition should influence what matters before reply generation for Aurora.",
        linkedEntities: ["aurora", "cade"],
        timestamp: "2026-03-31T00:00:00.000Z"
      }
    ]);

    const preflight = await prepareSendContext({
      userText: "How should Aurora decide what matters before answering?",
      sessionId: "verify:live-salience-provider-resolution",
      speakerName: "Cade",
      lightweight: true,
      testTurnLabel: "verify-live-salience-provider-resolution"
    });

    const providerDiagnostic = preflight.preReplyProviderPreference;
    const retrievalDiagnostic = preflight.preReplyRetrieval;

    assert(providerDiagnostic, "expected provider diagnostic in live preflight");
    assert(retrievalDiagnostic, "expected retrieval diagnostic in live preflight");

    assert.equal(providerDiagnostic.configuredProvider, "openclaw_memory_search");
    assert.equal(providerDiagnostic.source, "openclaw_config");
    assert.equal(providerDiagnostic.resolvedProvider, "openclaw_memory_search");

    assert.equal(retrievalDiagnostic.requestedProvider, "openclaw_memory_search");
    assert.equal(retrievalDiagnostic.resolvedProvider, "openclaw_memory_search");
    assert.equal(retrievalDiagnostic.fallbackUsed, false);

    assert.equal(retrievalDiagnostic.transportAttempted, true);
    assert.equal(retrievalDiagnostic.healthGateActive, false);

    console.log("live salience provider resolution ok");
  } finally {
    resetMemoryCandidateProviderRuntimeState();
    restoreEnv("AURORA_OPENCLAW_CONFIG_PATH", previousConfigPath);
    restoreEnv("AURORA_MEMORY_CANDIDATE_PROVIDER", previousProvider);
    restoreEnv("AURORA_OPENCLAW_MEMORY_SEARCH_BIN", previousBinary);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
