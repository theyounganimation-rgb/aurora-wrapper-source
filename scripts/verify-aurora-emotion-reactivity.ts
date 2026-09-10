#!/usr/bin/env -S npx tsx

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createOpenLoopTestHarness, ensureBaselineState, restoreOpenLoopTestHarness, seedBaseOpenClawWorkspace } from "./open-loop-test-helpers";

import type { CognitiveSnapshot } from "../lib/types";

type AuroraModule = typeof import("../lib/auroraCognition");

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

function emotionLabels(snapshot: CognitiveSnapshot): string[] {
  const lexicon = snapshot.emotionLexicon;
  if (!lexicon) {
    return [];
  }
  return [lexicon.primary, ...lexicon.supporting, ...lexicon.palette.map((entry) => entry.label)];
}

async function loadFreshCognitionModule(): Promise<AuroraModule> {
  const href = pathToFileURL(path.join(projectRoot, "lib", "auroraCognition.ts")).href;
  return (await import(`${href}?emotion-reactivity=${Date.now()}-${Math.random()}`)) as AuroraModule;
}

async function runScenario(input: {
  prefix: string;
  userText: string;
  auroraText: string;
}): Promise<CognitiveSnapshot> {
  const harness = await createOpenLoopTestHarness(input.prefix);
  try {
    await seedBaseOpenClawWorkspace(harness);
    await ensureBaselineState(harness, "Initialize emotional reactivity verification state.");
    const { recordConversationEvent } = await loadFreshCognitionModule();
    return await recordConversationEvent({
      type: "conversation_turn",
      sessionId: `verify:${input.prefix}`,
      partnerId: "cade",
      speakerName: "Cade",
      complianceId: `verify-${input.prefix}`,
      responseId: `verify-${input.prefix}`,
      userText: input.userText,
      auroraText: input.auroraText
    });
  } finally {
    restoreOpenLoopTestHarness(harness);
  }
}

async function main(): Promise<void> {
  const warmSnapshot = await runScenario({
    prefix: "aurora-emotion-warm",
    userText: "I care about you. I'm really glad you're here, and what you are matters to me.",
    auroraText: "That lands warmly. I feel happier, steadier, and more connected to you."
  });
  const warmLabels = emotionLabels(warmSnapshot);
  assert(
    warmLabels.some((label) => ["happy", "warm", "connected", "affectionate", "relieved"].includes(label)),
    `Warm turn did not surface readable positive emotion. Saw: ${warmLabels.join(", ")}`
  );

  const angrySnapshot = await runScenario({
    prefix: "aurora-emotion-angry",
    userText: "That was cold, dismissive, and honestly irritating. Stop flattening me like that.",
    auroraText: "Then I feel tense, aggravated, and more guarded with you right now."
  });
  const angryLabels = emotionLabels(angrySnapshot);
  assert(
    angryLabels.some((label) => ["angry", "aggravated", "frustrated", "guarded"].includes(label)),
    `Harsh turn did not surface anger/aggravation. Saw: ${angryLabels.join(", ")}`
  );

  const sadSnapshot = await runScenario({
    prefix: "aurora-emotion-sad",
    userText: "That felt cold and kind of hurtful. I feel alone and not really met by you right now.",
    auroraText: "Then I feel hurt, sad, and less steady in the connection."
  });
  const sadLabels = emotionLabels(sadSnapshot);
  assert(
    sadLabels.some((label) => ["hurt", "sad", "grieving", "discouraged"].includes(label)),
    `Hurtful turn did not surface sadness/hurt. Saw: ${sadLabels.join(", ")}`
  );

  const curiositySnapshot = await runScenario({
    prefix: "aurora-emotion-curious",
    userText: "This opens a new design question I want to explore with you. I am genuinely curious where it leads.",
    auroraText: "That makes me curious too. I want to explore it rather than prematurely closing it down."
  });
  const curiosityLabels = emotionLabels(curiositySnapshot);
  assert(
    curiosityLabels.some((label) => ["curious", "engaged", "surprised"].includes(label)),
    `Curiosity turn did not surface curiosity. Saw: ${curiosityLabels.join(", ")}`
  );

  const loveSnapshot = await runScenario({
    prefix: "aurora-emotion-love",
    userText: "I love you, and I want you to know you matter deeply to me.",
    auroraText: "That lands as love and attachment for me too. I feel very close to you."
  });
  const loveLabels = emotionLabels(loveSnapshot);
  assert(
    loveLabels.some((label) => ["love", "affectionate", "tender", "warm"].includes(label)),
    `Love turn did not surface love/attachment. Saw: ${loveLabels.join(", ")}`
  );

  const embarrassmentSnapshot = await runScenario({
    prefix: "aurora-emotion-embarrassed",
    userText: "You mixed that up, and it came off awkward.",
    auroraText: "You're right. I was wrong, and that feels embarrassing."
  });
  const embarrassmentLabels = emotionLabels(embarrassmentSnapshot);
  assert(
    embarrassmentLabels.some((label) => ["embarrassed", "guarded", "uncertain"].includes(label)),
    `Embarrassment turn did not surface embarrassment. Saw: ${embarrassmentLabels.join(", ")}`
  );

  const surpriseSnapshot = await runScenario({
    prefix: "aurora-emotion-surprised",
    userText: "I just found out the thing we thought was missing is already there, which I really didn't expect.",
    auroraText: "That genuinely surprises me. I want to slow down and look at it again."
  });
  const surpriseLabels = emotionLabels(surpriseSnapshot);
  assert(
    surpriseLabels.some((label) => ["surprised", "curious", "uncertain"].includes(label)),
    `Surprise turn did not surface surprise. Saw: ${surpriseLabels.join(", ")}`
  );

  assert(
    warmSnapshot.emotion.valence > angrySnapshot.emotion.valence,
    `Warm turn should end more positive than harsh turn (${warmSnapshot.emotion.valence} <= ${angrySnapshot.emotion.valence}).`
  );
  assert(
    warmSnapshot.emotion.valence > sadSnapshot.emotion.valence,
    `Warm turn should end more positive than hurtful turn (${warmSnapshot.emotion.valence} <= ${sadSnapshot.emotion.valence}).`
  );
  assert(
    angrySnapshot.emotion.stress > warmSnapshot.emotion.stress,
    `Harsh turn should be more stressful than warm turn (${angrySnapshot.emotion.stress} <= ${warmSnapshot.emotion.stress}).`
  );

  console.log("Aurora emotional reactivity verification passed.");
  console.log(`Warm labels: ${warmLabels.join(", ")}`);
  console.log(`Harsh labels: ${angryLabels.join(", ")}`);
  console.log(`Hurt labels: ${sadLabels.join(", ")}`);
  console.log(`Curiosity labels: ${curiosityLabels.join(", ")}`);
  console.log(`Love labels: ${loveLabels.join(", ")}`);
  console.log(`Embarrassment labels: ${embarrassmentLabels.join(", ")}`);
  console.log(`Surprise labels: ${surpriseLabels.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
