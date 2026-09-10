import {
  DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE,
  DEFAULT_AURORA_EMBODIMENT_STATE,
  DEFAULT_AURORA_STATE,
  type AuroraEmbodimentState,
  type EmbodimentBoneName,
} from "../lib/types";
import { advanceEmbodimentState, createEmbodimentState, AURORA_REST_POSE } from "../lib/embodiment/controller";
import { applyConversationEmbodimentDirectiveFromText } from "../lib/embodiment/directives";

type SweepCase = {
  name: string;
  command: string;
  expectPreset: string;
  measure: (state: AuroraEmbodimentState) => number;
  threshold: number;
  comparator?: "gte" | "lte";
};

function delta(state: AuroraEmbodimentState, bone: EmbodimentBoneName, axis: "x" | "y" | "z"): number {
  const current = state.pose.bones[bone]?.[axis] ?? AURORA_REST_POSE[bone][axis];
  return current - AURORA_REST_POSE[bone][axis];
}

function settleCommand(
  command: string,
  seedState: AuroraEmbodimentState = DEFAULT_AURORA_EMBODIMENT_STATE,
): { state: AuroraEmbodimentState; preset: string | null; label: string | null } {
  const now = Date.now();
  const initial = createEmbodimentState(seedState);
  const { nextState, directive } = applyConversationEmbodimentDirectiveFromText(initial, command, new Date(now).toISOString());
  const state = advanceFrames(nextState, now);

  return {
    state,
    preset: directive?.motionPreset ?? null,
    label: directive?.label ?? null,
  };
}

function advanceFrames(
  state: AuroraEmbodimentState,
  now: number,
  frames = 60,
): AuroraEmbodimentState {
  let next = state;
  for (let i = 0; i < frames; i += 1) {
    next = advanceEmbodimentState({
      previous: next,
      controls: DEFAULT_AURORA_EMBODIMENT_CONTROL_STATE,
      auroraState: DEFAULT_AURORA_STATE,
      uiState: {
        mode: "idle",
        lastHeartbeat: null,
        curiosityLevel: 0.4,
        activity: 0.2,
      },
      activityPulse: 0,
      deltaSeconds: 1 / 30,
      now: now + i * 33,
    });
  }
  return next;
}

function settleSequence(
  commands: string[],
  seedState: AuroraEmbodimentState = DEFAULT_AURORA_EMBODIMENT_STATE,
): { state: AuroraEmbodimentState; presets: Array<string | null>; labels: Array<string | null> } {
  const startNow = Date.now();
  let state = createEmbodimentState(seedState);
  const presets: Array<string | null> = [];
  const labels: Array<string | null> = [];

  commands.forEach((command, index) => {
    const issuedAt = startNow + index * 2_000;
    const result = applyConversationEmbodimentDirectiveFromText(state, command, new Date(issuedAt).toISOString());
    state = advanceFrames(result.nextState, issuedAt, index === commands.length - 1 ? 60 : 24);
    presets.push(result.directive?.motionPreset ?? null);
    labels.push(result.directive?.label ?? null);
  });

  return { state, presets, labels };
}

const sweepCases: SweepCase[] = [
  {
    name: "Face smile",
    command: "Smile",
    expectPreset: "smile",
    measure: (state) => state.pose.expressions.happy,
    threshold: 0.45,
  },
  {
    name: "Face frown",
    command: "Frown",
    expectPreset: "frown",
    measure: (state) => state.pose.expressions.sad,
    threshold: 0.35,
  },
  {
    name: "Face frown natural phrase",
    command: "Can you make a frown face?",
    expectPreset: "frown",
    measure: (state) => state.pose.expressions.sad,
    threshold: 0.35,
  },
  {
    name: "Face angry",
    command: "Make an angry face",
    expectPreset: "angry",
    measure: (state) => state.pose.expressions.angry,
    threshold: 0.4,
  },
  {
    name: "Head tilt left",
    command: "Tilt your head left",
    expectPreset: "tilt_head_left",
    measure: (state) => delta(state, "head", "z"),
    threshold: -0.12,
    comparator: "lte",
  },
  {
    name: "Head tilt right",
    command: "Tilt your head right",
    expectPreset: "tilt_head_right",
    measure: (state) => delta(state, "head", "z"),
    threshold: 0.12,
  },
  {
    name: "Gaze left",
    command: "Look left",
    expectPreset: "look_left",
    measure: (state) => state.pose.lookTarget.x,
    threshold: -0.12,
    comparator: "lte",
  },
  {
    name: "Gaze right",
    command: "Look right",
    expectPreset: "look_right",
    measure: (state) => state.pose.lookTarget.x,
    threshold: 0.12,
  },
  {
    name: "Left arm",
    command: "Move your left arm",
    expectPreset: "raise_left_hand",
    measure: (state) => delta(state, "leftUpperArm", "x"),
    threshold: -0.4,
    comparator: "lte",
  },
  {
    name: "Right arm",
    command: "Move your right arm",
    expectPreset: "raise_right_hand",
    measure: (state) => delta(state, "rightUpperArm", "x"),
    threshold: -0.4,
    comparator: "lte",
  },
  {
    name: "Left hand",
    command: "Open your left hand",
    expectPreset: "present_left_hand",
    measure: (state) => delta(state, "leftHand", "x"),
    threshold: -0.2,
    comparator: "lte",
  },
  {
    name: "Right hand",
    command: "Open your right hand",
    expectPreset: "present_right_hand",
    measure: (state) => delta(state, "rightHand", "x"),
    threshold: -0.2,
    comparator: "lte",
  },
  {
    name: "Torso left",
    command: "Turn your torso left",
    expectPreset: "turn_torso_left",
    measure: (state) => delta(state, "chest", "y"),
    threshold: -0.1,
    comparator: "lte",
  },
  {
    name: "Torso right",
    command: "Turn your torso right",
    expectPreset: "turn_torso_right",
    measure: (state) => delta(state, "chest", "y"),
    threshold: 0.1,
  },
  {
    name: "Turn around",
    command: "Turn around",
    expectPreset: "turn_around",
    measure: (state) => state.pose.rootRotation.y,
    threshold: 2.6,
  },
  {
    name: "Turn around natural phrase",
    command: "Turn around for me please",
    expectPreset: "turn_around",
    measure: (state) => state.pose.rootRotation.y,
    threshold: 2.6,
  },
  {
    name: "Lean forward",
    command: "Lean forward",
    expectPreset: "lean_forward",
    measure: (state) => state.pose.rootRotation.x,
    threshold: 0.04,
  },
  {
    name: "Left leg",
    command: "Move your left leg",
    expectPreset: "raise_left_leg",
    measure: (state) => delta(state, "leftUpperLeg", "x"),
    threshold: -0.45,
    comparator: "lte",
  },
  {
    name: "Right leg",
    command: "Move your right leg",
    expectPreset: "raise_right_leg",
    measure: (state) => delta(state, "rightUpperLeg", "x"),
    threshold: -0.45,
    comparator: "lte",
  },
  {
    name: "Left foot",
    command: "Point your left foot",
    expectPreset: "point_left_foot",
    measure: (state) => delta(state, "leftFoot", "x"),
    threshold: 0.16,
  },
  {
    name: "Right foot",
    command: "Point your right foot",
    expectPreset: "point_right_foot",
    measure: (state) => delta(state, "rightFoot", "x"),
    threshold: 0.16,
  },
];

const results = sweepCases.map((item) => {
  const outcome = settleCommand(item.command);
  const measured = Number(outcome.state ? item.measure(outcome.state).toFixed(3) : Number.NaN);
  const presetPass = outcome.preset === item.expectPreset;
  const movementPass =
    item.comparator === "lte" ? measured <= item.threshold : measured >= item.threshold;

  return {
    name: item.name,
    command: item.command,
    preset: outcome.preset,
    expected: item.expectPreset,
    measured,
    threshold: item.threshold,
    pass: presetPass && movementPass,
  };
});

const followupSeed = applyConversationEmbodimentDirectiveFromText(
  DEFAULT_AURORA_EMBODIMENT_STATE,
  "Move your right arm",
).nextState;
const followup = applyConversationEmbodimentDirectiveFromText(followupSeed, "Try moving it though");
const lowerSequence = settleSequence(["Move your right arm", "Put it back"]);

const failed = results.filter((item) => !item.pass);
const lowerSequencePass =
  lowerSequence.presets[0] === "raise_right_hand" &&
  lowerSequence.presets[1] === "lower_right_hand" &&
  delta(lowerSequence.state, "rightUpperArm", "x") >= 0.12;

console.table(results);
console.log(
  JSON.stringify(
    {
      followupPreset: followup.directive?.motionPreset ?? null,
      followupLabel: followup.directive?.label ?? null,
      lowerSequencePresets: lowerSequence.presets,
      lowerSequenceLabels: lowerSequence.labels,
      lowerSequenceRightUpperArmX: Number(delta(lowerSequence.state, "rightUpperArm", "x").toFixed(3)),
      failures: failed.map((item) => item.name),
      lowerSequencePass,
    },
    null,
    2,
  ),
);

if ((followup.directive?.motionPreset ?? null) !== "raise_right_hand" || failed.length > 0 || !lowerSequencePass) {
  process.exit(1);
}
