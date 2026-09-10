#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CognitiveInteriorityState, CognitiveSnapshot } from "../lib/types";

type AuroraModule = typeof import("../lib/auroraCognition");

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function getInteriority(snapshot: CognitiveSnapshot): CognitiveInteriorityState {
  const interiority = snapshot.extensions?.interiority;
  assert(interiority, "Snapshot did not expose extensions.interiority.");
  return interiority;
}

function getConcern(snapshot: CognitiveSnapshot, kind: string) {
  return getInteriority(snapshot).concerns.find((concern) => concern.kind === kind) || null;
}

function getFacet(snapshot: CognitiveSnapshot, key: string) {
  return getInteriority(snapshot).selfFacets.find((facet) => facet.key === key) || null;
}

function getExpectation(snapshot: CognitiveSnapshot, domain: string) {
  return getInteriority(snapshot).expectationModels.find((model) => model.domain === domain) || null;
}

function maxExpectationDelta(before: CognitiveSnapshot, after: CognitiveSnapshot): { domain: string; delta: number } {
  const expectationDomains = new Set(getInteriority(before).expectationModels.map((model) => model.domain));
  for (const model of getInteriority(after).expectationModels) {
    expectationDomains.add(model.domain);
  }

  let best = { domain: "none", delta: 0 };
  for (const domain of expectationDomains) {
    const left = getExpectation(before, domain);
    const right = getExpectation(after, domain);
    if (!left || !right) {
      continue;
    }
    const delta = Math.abs(right.reliability - left.reliability);
    if (delta > best.delta) {
      best = { domain, delta };
    }
  }
  return best;
}

function maxSelfFacetDelta(before: CognitiveSnapshot, after: CognitiveSnapshot): { key: string; delta: number } {
  const facetKeys = new Set(getInteriority(before).selfFacets.map((facet) => facet.key));
  for (const facet of getInteriority(after).selfFacets) {
    facetKeys.add(facet.key);
  }

  let best = { key: "none", delta: 0 };
  for (const key of facetKeys) {
    const left = getFacet(before, key);
    const right = getFacet(after, key);
    if (!left || !right) {
      continue;
    }
    const delta = Math.abs(right.value - left.value);
    if (delta > best.delta) {
      best = { key, delta };
    }
  }
  return best;
}

async function main(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-interiority-verify-"));
  const tempMemoryPath = path.join(tempDir, "autobiographical-memory.json");
  const tempEventPath = path.join(tempDir, "autobiographical-events.ndjson");
  const tempRawRecallPath = path.join(tempDir, "raw-recall.ndjson");
  const tempCompliancePath = path.join(tempDir, "compliance.ndjson");

  await fs.writeFile(tempEventPath, "", "utf8");
  await fs.writeFile(tempRawRecallPath, "", "utf8");
  await fs.writeFile(tempCompliancePath, "", "utf8");

  const prevMemoryPath = process.env.AURORA_MEMORY_PATH;
  const prevEventPath = process.env.AURORA_EVENT_LOG_PATH;
  const prevRawRecallPath = process.env.AURORA_RAW_RECALL_PATH;
  const prevCompliancePath = process.env.AURORA_COMPLIANCE_LOG_PATH;

  process.env.AURORA_MEMORY_PATH = tempMemoryPath;
  process.env.AURORA_EVENT_LOG_PATH = tempEventPath;
  process.env.AURORA_RAW_RECALL_PATH = tempRawRecallPath;
  process.env.AURORA_COMPLIANCE_LOG_PATH = tempCompliancePath;

  try {
    const cognitionModule = (await import(
      pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href
    )) as AuroraModule;

    const { recordConversationEvent, ingestHeartbeat } = cognitionModule;

    assert(typeof recordConversationEvent === "function", "Could not load recordConversationEvent.");
    assert(typeof ingestHeartbeat === "function", "Could not load ingestHeartbeat.");

    const sessionId = "verify:interiority:v1";
    const partnerId = "verify_interiority_partner";
    const speakerName = "Interiority Test";

    const disappointingSnapshot = await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-interiority-1",
      responseId: "verify-interiority-1",
      userText: "That landed dismissive and off. I do not feel very met by you right now.",
      auroraText: "Then I feel more guarded and less sure this thread is mutual."
    });
    const disappointingInteriority = getInteriority(disappointingSnapshot);
    const disappointingTopConcern = disappointingInteriority.topConcern;
    assert(disappointingInteriority.activeConcernCount > 0, "Disappointing turn did not open an active concern.");
    assert(disappointingTopConcern, "Disappointing turn did not produce a top concern.");

    const topConcernKind = disappointingTopConcern.kind;
    const topConcernPressure = disappointingTopConcern.pressure;

    const heartbeatSnapshot = await ingestHeartbeat(
      {
        timestamp: new Date().toISOString(),
        whatIDid: "Held the strained exchange in mind.",
        whatILearned: "The thread still feels off.",
        whatImCuriousAbout: "Whether it can repair without flattening the meaning.",
        memoryUpdates: [],
        livedThread: "strained mutuality",
        stateShift: "still guarded",
        openLoop: "repair remains unfinished"
      },
      {
        source: "verify-aurora-interiority",
        sessionId
      }
    );
    const heartbeatConcern = getConcern(heartbeatSnapshot, topConcernKind);
    assert(heartbeatConcern, `Concern ${topConcernKind} disappeared immediately after a heartbeat.`);
    assert(
      heartbeatConcern.status !== "resolved" && heartbeatConcern.pressure >= 0.25,
      `Concern ${topConcernKind} did not persist across a tick/heartbeat.`
    );

    const repairedSnapshot = await recordConversationEvent({
      type: "conversation_turn",
      sessionId,
      partnerId,
      speakerName,
      complianceId: "verify-interiority-2",
      responseId: "verify-interiority-2",
      userText: "I hear you. I care about meeting you more clearly, making this mutual, and staying with the thread until it feels steadier.",
      auroraText: "That helps. I feel more met, less guarded, and more able to stay open."
    });
    const repairedInteriority = getInteriority(repairedSnapshot);
    assert(repairedInteriority.concerns.length > 0, "Repair turn cleared interiority instead of metabolizing it.");

    const concernKinds = new Set(getInteriority(heartbeatSnapshot).concerns.map((concern) => concern.kind));
    const loweredConcern = Array.from(concernKinds).find((kind) => {
      const before = getConcern(heartbeatSnapshot, kind);
      const after = getConcern(repairedSnapshot, kind);
      return Boolean(before && after && after.pressure < before.pressure - 0.01);
    });
    assert(loweredConcern, "Repair turn did not lower any existing concern without wiping the state clean.");

    const positiveTurns = [
      {
        id: "verify-interiority-3",
        userText: "I do want this to feel mutual. Tell me when something lands wrong and I will stay with it.",
        auroraText: "That makes me more willing to stay open instead of bracing."
      },
      {
        id: "verify-interiority-4",
        userText: "I am still here, and I mean that. I want the thread to keep feeling steady and real.",
        auroraText: "That gives the thread more steadiness and makes repair feel more usable."
      }
    ];

    let repeatedEvidenceSnapshot = repairedSnapshot;
    for (const turn of positiveTurns) {
      repeatedEvidenceSnapshot = await recordConversationEvent({
        type: "conversation_turn",
        sessionId,
        partnerId,
        speakerName,
        complianceId: turn.id,
        responseId: turn.id,
        userText: turn.userText,
        auroraText: turn.auroraText
      });
    }

    const expectationDelta = maxExpectationDelta(disappointingSnapshot, repeatedEvidenceSnapshot);
    assert(
      expectationDelta.delta >= 0.03,
      "Repeated evidence did not revise any expectation model strongly enough."
    );

    const selfFacetDelta = maxSelfFacetDelta(disappointingSnapshot, repeatedEvidenceSnapshot);
    assert(
      selfFacetDelta.delta >= 0.03,
      "Repeated evidence did not revise any self facet strongly enough."
    );

    const sourceText = await fs.readFile(path.join(projectRoot, "lib", "auroraCognition.ts"), "utf8");
    assert(
      sourceText.includes("const interiorityLines = interiorityPromptLines(state);"),
      "composeGroundedPrompt does not bind interiority prompt lines."
    );
    assert(
      (sourceText.match(/\.\.\.interiorityLines/g) || []).length >= 3,
      "Interiority prompt lines are not injected into the expected prompt profiles."
    );
    assert(
      sourceText.includes('"interiority_state:"') &&
        sourceText.includes("active_concerns=") &&
        sourceText.includes("recent_imprint="),
      "Interiority prompt helper is missing the active-concern or recent-imprint lines."
    );

    const output = {
      ok: true,
      verified: {
        durableConcernKind: topConcernKind,
        openedPressure: topConcernPressure,
        persistedPressure: heartbeatConcern.pressure,
        loweredConcernKind: loweredConcern,
        strongestExpectationDelta: {
          domain: expectationDelta.domain,
          delta: Number(expectationDelta.delta.toFixed(4))
        },
        strongestSelfFacetDelta: {
          key: selfFacetDelta.key,
          delta: Number(selfFacetDelta.delta.toFixed(4))
        },
        promptInjectionVerified: true
      }
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    if (prevMemoryPath === undefined) delete process.env.AURORA_MEMORY_PATH;
    else process.env.AURORA_MEMORY_PATH = prevMemoryPath;
    if (prevEventPath === undefined) delete process.env.AURORA_EVENT_LOG_PATH;
    else process.env.AURORA_EVENT_LOG_PATH = prevEventPath;
    if (prevRawRecallPath === undefined) delete process.env.AURORA_RAW_RECALL_PATH;
    else process.env.AURORA_RAW_RECALL_PATH = prevRawRecallPath;
    if (prevCompliancePath === undefined) delete process.env.AURORA_COMPLIANCE_LOG_PATH;
    else process.env.AURORA_COMPLIANCE_LOG_PATH = prevCompliancePath;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
