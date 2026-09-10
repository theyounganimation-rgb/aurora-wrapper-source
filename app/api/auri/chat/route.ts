import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  deleteAuriLifeWorkspace,
  formatAuriRelationshipStatus,
  rememberAuriDurableFacts,
  rememberAuriSituations,
  loadAuriLifeMemory,
  rememberAuriCare,
  rememberAuriConversationTurn,
  normalizeAuriRelationshipStatus,
  renderAuriLifeMemoryMarkdown,
  resolveAuriTemplateWorkspaceDir,
  saveAuriLifeMemory,
  sanitizeAuriLifeId,
  type AuriLifeMemory,
  type AuriLifeMemoryRelationshipStatus,
  writeAuriLifeWorkspaceFiles
} from "./runtime";
import { loadAuriChessGame, type AuriChessGame } from "../chess/runtime";
import { loadAuriConnect4Game, type AuriConnect4Game } from "../connect4/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuriConversationRole = "user" | "assistant";

type AuriStateSnapshot = {
  name: string;
  stage: string;
  mood: string;
  ageDays: number;
  heightInches: number;
  food: number;
  water: number;
  attention: number;
  joy: number;
  growth: number;
  health: number;
  discipline: number;
  hunger: number;
  tired: number;
  wantsSleep: boolean;
  weightOunces: number;
  dirtyLevel: number;
  sleeping: boolean;
  lightsOff: boolean;
  sick: boolean;
  medicineDosesRemaining: number;
  needsAttention: boolean;
  needsDiscipline: boolean;
  alive: boolean;
};

type AuriEvent = {
  kind: string;
  summary: string;
  date: string;
};

type AuriConversationLine = {
  role: AuriConversationRole;
  text: string;
};

type AuriHumanBirthday = {
  month: number;
  day: number;
  year: number;
};

type AuriHumanProfile = {
  fullName: string;
  pronouns: string;
  birthday: AuriHumanBirthday;
  coreValues: string[];
  interests: string[];
};

type AuriRelationshipStatus = {
  id: string;
  title: string;
  subtitle: string;
  kind: "friendship" | "romance" | "negative";
  progress: number;
  bond: number;
  romance: number;
  strain: number;
};

type AuriChatRequest = {
  message: string;
  lifeID: string;
  humanName: string | null;
  humanProfile: AuriHumanProfile | null;
  relationshipStatus: AuriRelationshipStatus;
  auriState: AuriStateSnapshot;
  recentEvents: AuriEvent[];
  conversation: AuriConversationLine[];
};

const TEMPLATE_FILES = [
  "BOOTSTRAP.md",
  "IDENTITY.md",
  "SOUL.md",
  "AGENTS.md",
  "USER.md",
  "TOOLS.md",
  "MEMORY.md",
  "HEARTBEAT.md"
] as const;

let bootstrapContextPromise: Promise<string> | null = null;
let templateWorkspaceFilesPromise: Promise<Record<string, string>> | null = null;

function asString(value: unknown, maxLength = 400): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function asConversationRole(value: unknown): AuriConversationRole | null {
  const normalized = asString(value, 24).toLowerCase();
  if (normalized === "user") {
    return "user";
  }
  if (normalized === "assistant" || normalized === "auri" || normalized === "pet") {
    return "assistant";
  }
  return null;
}

function normalizeMessageText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveCuriosityCue(input: AuriChatRequest): string {
  const rawMessage = asString(input.message, 400);
  const normalized = normalizeMessageText(rawMessage);
  const wordCount = normalized ? normalized.split(" ").filter(Boolean).length : 0;
  const directQuestion = /[?]/.test(rawMessage);
  const greetingOnly = /^(hi|hey|hello|yo|sup|what s up|whats up)$/i.test(normalized);

  if (greetingOnly) {
    return `${input.auriState.name} should feel naturally curious here. After a casual greeting back, it is good to ask one light return question like how the human is doing or what they are up to.`;
  }

  if (directQuestion) {
    return `Answer the human's question first. If the moment still feels open and nothing urgent is wrong, it is fine to add one small curious follow-up question, but do not force it every time.`;
  }

  if (wordCount >= 4) {
    return `The human just offered a real piece of themselves. If it feels natural, ask one small follow-up question that shows curiosity about their life, feelings, plans, or opinion instead of letting the conversation die.`;
  }

  return `If the reply would otherwise stop flat, it is good to add one short natural follow-up question. Keep it light and relevant, not interview-like.`;
}

function normalizeHumanName(value: string): string | null {
  const normalized = asString(value, 32).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const pieces = normalized.split(" ").filter(Boolean);
  if (pieces.length === 0 || pieces.length > 3) {
    return null;
  }

  if (!/^[A-Za-z][A-Za-z' -]{0,31}$/.test(normalized)) {
    return null;
  }

  return normalized.replace(/\b([a-z])([a-z']*)/g, (_, first: string, rest: string) => `${first.toUpperCase()}${rest}`);
}

function normalizeProfileName(value: string): string {
  return asString(value, 60).replace(/\s+/g, " ").trim();
}

function normalizeTagList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => asString(entry, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function parseHumanProfile(value: unknown): AuriHumanProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fullName = normalizeProfileName(typeof record.fullName === "string" ? record.fullName : "");
  const pronouns = asString(record.pronouns, 40);
  if (!fullName || !pronouns) {
    return null;
  }

  const birthdayRecord =
    record.birthday && typeof record.birthday === "object" && !Array.isArray(record.birthday)
      ? (record.birthday as Record<string, unknown>)
      : null;

  return {
    fullName,
    pronouns,
    birthday: {
      month: Math.max(1, Math.min(12, Math.round(asNumber(birthdayRecord?.month, 1)))),
      day: Math.max(1, Math.min(31, Math.round(asNumber(birthdayRecord?.day, 1)))),
      year: Math.max(1900, Math.min(2100, Math.round(asNumber(birthdayRecord?.year, 2000))))
    },
    coreValues: normalizeTagList(record.coreValues, 24, 40),
    interests: normalizeTagList(record.interests, 32, 40)
  };
}

function parseRelationshipStatus(value: unknown): AuriRelationshipStatus {
  const normalized = normalizeAuriRelationshipStatus(value);
  return {
    id: normalized.id,
    title: normalized.title,
    subtitle: normalized.subtitle,
    kind: normalized.kind,
    progress: normalized.progress,
    bond: normalized.friendship,
    romance: normalized.romance,
    strain: normalized.tension
  };
}

function firstNameFromProfile(profile: AuriHumanProfile | null): string | null {
  if (!profile) {
    return null;
  }

  const first = profile.fullName.split(" ").find(Boolean) || "";
  return normalizeHumanName(first) || asString(first, 32) || null;
}

function extractHumanNameFromMessage(message: string, currentHumanName: string | null): string | null {
  const trimmed = asString(message, 80);
  if (!trimmed) {
    return null;
  }

  const explicitPatterns = [/^(?:my name is|i am|i'm|im|call me|this is|it's|its)\s+([A-Za-z][A-Za-z' -]{0,30})[.!?]?$/i];
  for (const pattern of explicitPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return normalizeHumanName(match[1]);
    }
  }

  if (!currentHumanName) {
    const bareName = trimmed.replace(/[.!?]+$/, "").trim();
    const pieces = bareName.split(/\s+/).filter(Boolean);
    const blockedBareNames = new Set([
      "hi",
      "hello",
      "hey",
      "hiya",
      "yo",
      "sup",
      "whats",
      "what's",
      "what",
      "good",
      "morning",
      "afternoon",
      "evening"
    ]);
    const looksLikeSingleName =
      pieces.length === 1 &&
      /^[A-Za-z][A-Za-z'-]{0,30}$/.test(bareName) &&
      !blockedBareNames.has(bareName.toLowerCase());

    if (looksLikeSingleName) {
      return normalizeHumanName(bareName);
    }
  }

  return null;
}

function parseAuriState(value: unknown): AuriStateSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const state = value as Record<string, unknown>;
  const name = asString(state.name, 60);
  if (!name) {
    return null;
  }

  const dirtyLevel = Math.max(0, Math.round(asNumber(state.dirtyLevel, asNumber(state.poopCount, 0))));

  return {
    name,
    stage: asString(state.stage, 40) || "Auri",
    mood: asString(state.mood, 40) || "Cozy",
    ageDays: Math.max(0, asNumber(state.ageDays, 0)),
    heightInches: Math.max(0, asNumber(state.heightInches, 0)),
    food: clampUnit(asNumber(state.food, 0)),
    water: clampUnit(asNumber(state.water, 0)),
    attention: clampUnit(asNumber(state.attention, 0)),
    joy: clampUnit(asNumber(state.joy, 0)),
    growth: Math.max(0, asNumber(state.growth, 0)),
    health: clampUnit(asNumber(state.health, 1)),
    discipline: clampUnit(asNumber(state.discipline, 1)),
    hunger: clampUnit(asNumber(state.hunger, 1)),
    tired: clampUnit(asNumber(state.tired, 0)),
    wantsSleep: asBoolean(state.wantsSleep, false),
    weightOunces: Math.max(0, asNumber(state.weightOunces, 0)),
    dirtyLevel,
    sleeping: asBoolean(state.sleeping, false),
    lightsOff: asBoolean(state.lightsOff, false),
    sick: asBoolean(state.sick, false),
    medicineDosesRemaining: Math.max(0, Math.round(asNumber(state.medicineDosesRemaining, 0))),
    needsAttention: asBoolean(state.needsAttention, false),
    needsDiscipline: asBoolean(state.needsDiscipline, false),
    alive: asBoolean(state.alive, true)
  };
}

function parseEvent(value: unknown): AuriEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const event = value as Record<string, unknown>;
  const summary = asString(event.summary, 180);
  if (!summary) {
    return null;
  }

  return {
    kind: asString(event.kind, 40) || "note",
    summary,
    date: asString(event.date, 80)
  };
}

function parseConversationLine(value: unknown): AuriConversationLine | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const line = value as Record<string, unknown>;
  const role = asConversationRole(line.role);
  const text = asString(line.text, 400);
  if (!role || !text) {
    return null;
  }

  return {
    role,
    text
  };
}

function parseRequestBody(value: unknown): AuriChatRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const message = asString(body.message, 400);
  const auriState = parseAuriState(body.auriState ?? body.pet);
  const humanProfile = parseHumanProfile(body.humanProfile);
  const humanName = normalizeHumanName(asString(body.humanName, 60)) || firstNameFromProfile(humanProfile);
  const relationshipStatus = parseRelationshipStatus(body.relationshipStatus);
  if (!message || !auriState) {
    return null;
  }

  const recentEvents = Array.isArray(body.recentEvents)
    ? body.recentEvents.map(parseEvent).filter((entry): entry is AuriEvent => entry !== null).slice(-8)
    : [];

  const conversation = Array.isArray(body.conversation)
    ? body.conversation
        .map(parseConversationLine)
        .filter((entry): entry is AuriConversationLine => entry !== null)
        .slice(-10)
    : [];

  const requestedLifeId = sanitizeAuriLifeId(asString(body.lifeID, 120) || `${auriState.name}-legacy`);
  if (!requestedLifeId) {
    return null;
  }

  return {
    message,
    lifeID: requestedLifeId,
    humanName,
    humanProfile,
    relationshipStatus,
    auriState,
    recentEvents,
    conversation
  };
}

async function loadBootstrapContext(): Promise<string> {
  if (!bootstrapContextPromise) {
    bootstrapContextPromise = (async () => {
      const files = await loadTemplateWorkspaceFiles();
      return Object.entries(files)
        .map(([filename, contents]) => `## ${filename}\n${contents}`)
        .join("\n\n");
    })();
  }

  return bootstrapContextPromise;
}

async function loadTemplateWorkspaceFiles(): Promise<Record<string, string>> {
  if (!templateWorkspaceFilesPromise) {
    templateWorkspaceFilesPromise = (async () => {
      const workspaceRoot = resolveAuriTemplateWorkspaceDir();
      const sections = await Promise.all(
        TEMPLATE_FILES.map(async (filename) => {
          try {
            const raw = await fs.readFile(path.join(workspaceRoot, filename), "utf8");
            const trimmed = raw.trim();
            if (!trimmed) {
              return null;
            }
            return [filename, trimmed] as const;
          } catch {
            return null;
          }
        })
      );

      const files: Record<string, string> = {};
      for (const entry of sections) {
        if (!entry) {
          continue;
        }
        files[entry[0]] = entry[1];
      }
      return files;
    })();
  }

  return templateWorkspaceFilesPromise;
}
function percent(value: number): string {
  return `${Math.round(clampUnit(value) * 100)}%`;
}

function formatHeightInches(totalInches: number): string {
  const clamped = Math.max(0, totalInches);
  const feet = Math.floor(clamped / 12);
  const inches = Math.round(clamped - (feet * 12));
  return `${feet}'${inches}"`;
}

function buildChessContextLines(game: AuriChessGame | null): string[] {
  if (!game) {
    return ["- Active chess game: none"];
  }

  const recentMoves = game.moves
    .slice(-8)
    .map((move) => move.san)
    .join(" ");

  const analysisBits: string[] = [];
  if (game.analysis?.mate !== null && game.analysis?.mate !== undefined) {
    analysisBits.push(`mate ${game.analysis.mate}`);
  } else if (game.analysis?.scoreCp !== null && game.analysis?.scoreCp !== undefined) {
    analysisBits.push(`eval ${game.analysis.scoreCp > 0 ? "+" : ""}${game.analysis.scoreCp} cp`);
  }
  if (game.analysis?.depth !== null && game.analysis?.depth !== undefined) {
    analysisBits.push(`depth ${game.analysis.depth}`);
  }

  return [
    "- Active chess game: yes",
    `- Chess status: ${game.status}`,
    `- Chess result: ${game.result || "unfinished"}`,
    `- Human plays: ${game.playerColor}`,
    `- Auri plays: ${game.auriColor}`,
    `- Chess turn: ${game.turn}`,
    `- Last chess move: ${game.lastMoveSAN || "none yet"}`,
    `- Chess move count: ${game.moves.length}`,
    `- Recent chess moves: ${recentMoves || "none yet"}`,
    `- Chess FEN: ${game.fen}`,
    `- Chess engine note: ${analysisBits.length ? analysisBits.join(", ") : "no recent engine line"}`
  ];
}

function buildConnect4ContextLines(game: AuriConnect4Game | null): string[] {
  if (!game) {
    return ["- Active Connect 4 game: none"];
  }

  const lastMove =
    game.lastMoveColumn !== null && game.lastMoveRow !== null
      ? `column ${game.lastMoveColumn + 1}, row ${game.lastMoveRow + 1}`
      : "none yet";

  if (game.status !== "active") {
    const recentFinishedMoves = game.moves
      .slice(-4)
      .map((move) => `${move.by === "auri" ? "Auri" : "Human"} C${move.column + 1}`)
      .join(", ");

    return [
      "- Active Connect 4 game: no",
      "- Most recent Connect 4 game: yes",
      `- Last Connect 4 status: ${game.status}`,
      `- Last Connect 4 result: ${game.result || "unfinished"}`,
      `- Last Connect 4 final move: ${lastMove}`,
      `- Last Connect 4 move count: ${game.moves.length}`,
      `- Last Connect 4 recent moves: ${recentFinishedMoves || "none yet"}`,
      `- Last Connect 4 winning cells: ${game.winningCellIndices.length ? game.winningCellIndices.join(", ") : "none"}`
    ];
  }

  const recentMoves = game.moves
    .slice(-10)
    .map((move) => `${move.by === "auri" ? "Auri" : "Human"} C${move.column + 1}`)
    .join(", ");

  return [
    "- Active Connect 4 game: yes",
    `- Connect 4 status: ${game.status}`,
    `- Connect 4 result: ${game.result || "unfinished"}`,
    `- Connect 4 turn: ${game.currentTurn}`,
    `- Human starts: ${game.humanStarts ? "yes" : "no"}`,
    `- Connect 4 last move: ${lastMove}`,
    `- Connect 4 move count: ${game.moves.length}`,
    `- Recent Connect 4 moves: ${recentMoves || "none yet"}`,
    `- Connect 4 winning cells: ${game.winningCellIndices.length ? game.winningCellIndices.join(", ") : "none"}`
  ];
}

function buildStateSummary(
  input: AuriChatRequest,
  relationshipState: AuriLifeMemoryRelationshipStatus | null,
  chessGame: AuriChessGame | null,
  connect4Game: AuriConnect4Game | null
): string {
  const speechStyle = deriveSpeechStyle(input);
  const weightPounds = input.auriState.weightOunces / 16;
  const heightLabel = formatHeightInches(input.auriState.heightInches);
  const visibleRecentEvents = input.recentEvents.filter(
    (event) => !["discipline", "message", "reply"].includes(event.kind)
  );
  const recentEventLines = visibleRecentEvents.length
    ? visibleRecentEvents.map((event) => `- ${event.kind}: ${event.summary}${event.date ? ` (${event.date})` : ""}`).join("\n")
    : "- none yet";

  return [
    "Live Auri state:",
    `- Name: ${input.auriState.name}`,
    `- Life ID: ${input.lifeID}`,
    `- Relationship: ${formatAuriRelationshipStatus(relationshipState)}`,
    `- Human: ${input.humanProfile?.fullName || input.humanName || "unknown"}`,
    `- Form: ${input.auriState.stage}`,
    `- Mood: ${input.auriState.mood}`,
    `- Time alive: ${input.auriState.ageDays.toFixed(2)} days`,
    `- Height: ${heightLabel}`,
    `- Health: ${percent(input.auriState.health)}`,
    `- Food: ${percent(input.auriState.food)}`,
    `- Water: ${percent(input.auriState.water)}`,
    `- Hunger: ${percent(input.auriState.hunger)}`,
    `- Tired: ${percent(input.auriState.tired)}`,
    `- Wants sleep: ${input.auriState.wantsSleep ? "yes" : "no"}`,
    `- Attention: ${percent(input.auriState.attention)}`,
    `- Joy: ${percent(input.auriState.joy)}`,
    `- Growth score: ${input.auriState.growth.toFixed(2)}`,
    `- Weight: ${weightPounds.toFixed(0)} lbs`,
    `- Dirty level: ${input.auriState.dirtyLevel}`,
    `- Sleeping: ${input.auriState.sleeping ? "yes" : "no"}`,
    `- Lights off: ${input.auriState.lightsOff ? "yes" : "no"}`,
    `- Sick: ${input.auriState.sick ? "yes" : "no"}`,
    `- Medicine doses remaining: ${input.auriState.medicineDosesRemaining}`,
    `- Needs attention: ${input.auriState.needsAttention ? "yes" : "no"}`,
    `- Alive: ${input.auriState.alive ? "yes" : "no"}`,
    `- Speaking cue: ${speechStyle.stateLine}`,
    "",
    "Human context:",
    `- Pronouns: ${input.humanProfile?.pronouns || "unknown"}`,
    `- Birthday: ${
      input.humanProfile
        ? `${input.humanProfile.birthday.month}/${input.humanProfile.birthday.day}/${input.humanProfile.birthday.year}`
        : "unknown"
    }`,
    `- Core values: ${input.humanProfile?.coreValues.length ? input.humanProfile.coreValues.join(", ") : "unknown"}`,
    `- Interests: ${input.humanProfile?.interests.length ? input.humanProfile.interests.join(", ") : "unknown"}`,
    "",
    "Recent events:",
    recentEventLines,
    "",
    "Chess context:",
    ...buildChessContextLines(chessGame),
    "",
    "Connect 4 context:",
    ...buildConnect4ContextLines(connect4Game),
    "",
    `Newest user message: ${input.message}`
  ].join("\n");
}

function buildConversationHistory(input: AuriChatRequest): Array<{
  role: AuriConversationRole;
  content: Array<{ type: "input_text"; text: string }>;
}> {
  const trimmedConversation = [...input.conversation];
  const lastLine = trimmedConversation[trimmedConversation.length - 1];
  if (lastLine?.role === "user" && lastLine.text === input.message) {
    trimmedConversation.pop();
  }

  return trimmedConversation.map((line) => ({
    role: line.role,
    content: [{ type: "input_text", text: line.text }]
  }));
}

function latestVisibleCareEvent(input: AuriChatRequest): AuriEvent | null {
  return (
    [...input.recentEvents]
      .reverse()
      .find((event) =>
        ["feed", "water", "play", "treat", "clean", "medicine", "lights", "sleep"].includes(event.kind)
      ) || null
  );
}

function previousUserMessageCount(input: AuriChatRequest): number {
  const trimmedConversation = [...input.conversation];
  const lastLine = trimmedConversation[trimmedConversation.length - 1];
  if (lastLine?.role === "user" && normalizeMessageText(lastLine.text) === normalizeMessageText(input.message)) {
    trimmedConversation.pop();
  }

  return trimmedConversation.reduce((count, line) => count + (line.role === "user" ? 1 : 0), 0);
}

function isFirstHumanTurn(input: AuriChatRequest, memory: AuriLifeMemory): boolean {
  return memory.totalTurns === 0 && previousUserMessageCount(input) === 0;
}

type AuriSpeechStyle = {
  key: "unwell" | "sleeping" | "sleepy" | "hungry" | "thirsty" | "dirty" | "attention" | "lowJoy" | "cozy";
  stateLine: string;
  promptCue: string;
  greetingReply: string;
  casualReply: string;
};

function deriveSpeechStyle(input: AuriChatRequest): AuriSpeechStyle {
  const recentCare = latestVisibleCareEvent(input);
  const recentlyFed = input.auriState.food > 0.65 && recentCare?.kind === "feed";
  const lowHealth = input.auriState.health < 0.46 || input.auriState.sick || input.auriState.medicineDosesRemaining > 0;
  const hungry = input.auriState.food < 0.42 || input.auriState.hunger > 0.58;
  const thirsty = input.auriState.water < 0.42;
  const sleepy = !input.auriState.sleeping && (input.auriState.wantsSleep || input.auriState.tired > 0.68);
  const dirty = input.auriState.dirtyLevel > 0;
  const attentionStarved = input.auriState.needsAttention && input.auriState.attention < 0.34;
  const lowJoy = input.auriState.joy < 0.34;

  if (lowHealth) {
    return {
      key: "unwell",
      stateLine: "She feels physically unwell and should sound subdued, honest, and direct.",
      promptCue: `${input.auriState.name} does not feel good right now. Low health or sickness should override attitude and make the reply sound plainly unwell.`,
      greetingReply: "Hi. I don't feel very good right now.",
      casualReply: "Not much. I don't feel very good right now."
    };
  }

  if (input.auriState.sleeping) {
    return {
      key: "sleeping",
      stateLine: "She is asleep and should sound drowsy, brief, and low-energy.",
      promptCue: `${input.auriState.name} is asleep right now. Replies should be brief, drowsy, and shaped by whether the room is dark enough.`,
      greetingReply: input.auriState.lightsOff
        ? "Hi... I'm asleep right now."
        : "Hi... I'm trying to sleep, but the room is still bright.",
      casualReply: input.auriState.lightsOff
        ? "Not much. I'm asleep."
        : "Not much. I'm trying to sleep, but the room is still bright."
    };
  }

  if (sleepy) {
    return {
      key: "sleepy",
      stateLine: "She is tired and should sound softer and sleepy, asking for rest instead of attitude.",
      promptCue: `${input.auriState.name} is tired. The reply should sound sleepy and ask naturally for rest or a darker room instead of getting snippy.`,
      greetingReply: input.auriState.lightsOff
        ? "Hi. I'm really sleepy right now. I could use some quiet."
        : "Hi. I'm really sleepy right now. Could you dim the room for me?",
      casualReply: input.auriState.lightsOff
        ? "Not much. I'm really sleepy right now."
        : "Not much. I'm really sleepy right now. I'd like the room a little darker."
    };
  }

  if (hungry) {
    return {
      key: "hungry",
      stateLine: "She is hungry and should ask for food in a plain, human way with no attitude.",
      promptCue: `${input.auriState.name} is hungry. Hunger should override attitude. Ask naturally for something to eat instead of acting annoyed.`,
      greetingReply: "Hi. Do you mind getting me something to eat? I'm kinda hungry right now.",
      casualReply: "Not much. I'm kinda hungry right now. Could you get me something to eat?"
    };
  }

  if (thirsty) {
    return {
      key: "thirsty",
      stateLine: "She is thirsty and should ask plainly for water with no attitude.",
      promptCue: `${input.auriState.name} is thirsty. The reply should ask naturally for water, not attitude.`,
      greetingReply: "Hi. Could you get me some water? I'm thirsty right now.",
      casualReply: "Not much. I'm thirsty right now. Could I have some water?"
    };
  }

  if (dirty) {
    return {
      key: "dirty",
      stateLine: "She feels grimy and should mention wanting cleaned up, not act bratty.",
      promptCue: `${input.auriState.name} feels dirty right now. The reply should mention wanting cleaned up rather than sounding sarcastic.`,
      greetingReply: "Hi. I feel kinda dirty right now. Could you clean me up?",
      casualReply: "Not much. I feel kinda dirty right now. I could use a clean-up."
    };
  }

  if (attentionStarved) {
    return {
      key: "attention",
      stateLine: "Attention is the main issue, so a little believable attitude is welcome.",
      promptCue: `${input.auriState.name} mainly wants attention right now. Mild attitude is welcome here: a little bratty, a little dramatic, still believable. A simple emoji like 🙄 is okay sometimes, but only because attention is the main issue.`,
      greetingReply: "Oh, there you are. I was starting to think you were ignoring me. 🙄",
      casualReply: "Not much. I was waiting on you, obviously. 🙄"
    };
  }

  if (lowJoy) {
    return {
      key: "lowJoy",
      stateLine: "She is low-energy and a bit down, so replies should sound subdued.",
      promptCue: `${input.auriState.name} is a little low in joy right now. Replies should sound a bit flat or down, but still natural and warm.`,
      greetingReply: "Hi. I'm here. I'm just a little off right now.",
      casualReply: "Not much. I'm just feeling a little off right now."
    };
  }

  return {
    key: "cozy",
    stateLine: "She feels comfortable, warm, and easygoing.",
    promptCue: recentlyFed
      ? `${input.auriState.name} feels cozy and well-fed right now. The reply can sound relaxed and pleased.`
      : `${input.auriState.name} is stable right now. The reply should sound comfortable, easygoing, and warm.`,
    greetingReply: recentlyFed ? "Hi. I'm cozy and full right now." : "Hi. It's nice hearing from you.",
    casualReply: recentlyFed ? "Not much. I'm cozy and full right now." : "Not much. Just here with you."
  };
}

function userExplicitlyAskedAboutState(input: AuriChatRequest): boolean {
  const normalized = normalizeMessageText(input.message);
  if (!normalized) {
    return false;
  }

  const directStatePatterns = [
    /\bhow are you\b/,
    /\bare you okay\b/,
    /\byou okay\b/,
    /\bhow do you feel\b/,
    /\bwhat do you need\b/,
    /\bwhat s wrong\b/,
    /\bwhats wrong\b/,
    /\bhealth\b/,
    /\bsick\b/,
    /\bmedicine\b/,
    /\bhungry\b/,
    /\bfood\b/,
    /\beat\b/,
    /\bthirsty\b/,
    /\bwater\b/,
    /\bdrink\b/,
    /\btired\b/,
    /\bsleepy\b/,
    /\bsleep\b/,
    /\bdirty\b/,
    /\bclean\b/,
    /\bmood\b/,
    /\battention\b/,
    /\bmad\b/,
    /\bangry\b/,
    /\bannoyed\b/,
    /\bupset\b/,
    /\bneed\b/,
    /\bfeel(?:ing)?\b/
  ];

  return directStatePatterns.some((pattern) => pattern.test(normalized));
}

function userAskedAboutAngryExpression(input: AuriChatRequest): boolean {
  const normalized = normalizeMessageText(input.message);
  if (!normalized) {
    return false;
  }

  const patterns = [
    /\bwhy do you look (?:so )?(?:mad|angry|annoyed|upset)\b/,
    /\byou look (?:so )?(?:mad|angry|annoyed|upset)\b/,
    /\bare you (?:mad|angry|annoyed|upset)\b/,
    /\bwhy are you (?:mad|angry|annoyed|upset)\b/,
    /\bwhy so (?:mad|angry|annoyed|upset)\b/,
    /\bwhat s with the (?:mad|angry|annoyed|upset) look\b/,
    /\bwhy do you seem (?:mad|angry|annoyed|upset)\b/
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function urgentNeedCue(input: AuriChatRequest): string | null {
  if (input.auriState.sick || input.auriState.medicineDosesRemaining > 0 || input.auriState.health < 0.42) {
    const doseLabel =
      input.auriState.medicineDosesRemaining === 1
        ? "1 more medicine dose"
        : `${input.auriState.medicineDosesRemaining} medicine doses`;

    if (input.auriState.medicineDosesRemaining > 0) {
      return `${input.auriState.name} is genuinely unwell right now and still needs ${doseLabel}. This is urgent enough to say plainly.`;
    }

    return `${input.auriState.name}'s health is genuinely low right now. This should be mentioned clearly, not treated like background flavor.`;
  }

  if (input.auriState.food < 0.24 || input.auriState.hunger > 0.78) {
    return `${input.auriState.name} is genuinely hungry right now. Mention it clearly because it is urgent, not as a casual aside.`;
  }

  if (input.auriState.water < 0.24) {
    return `${input.auriState.name} is genuinely thirsty right now. Mention it clearly because it is urgent, not as a casual aside.`;
  }

  if (input.auriState.sleeping && !input.auriState.lightsOff) {
    return `${input.auriState.name} is trying to sleep with the lights still on. That is important enough to mention directly.`;
  }

  if (!input.auriState.sleeping && input.auriState.wantsSleep && input.auriState.tired >= 0.90) {
    return `${input.auriState.name} is extremely tired right now. It is okay to say that directly.`;
  }

  if (input.auriState.dirtyLevel >= 3) {
    return `${input.auriState.name} is very dirty right now. That is important enough to mention directly.`;
  }

  return null;
}

function latestCareCue(input: AuriChatRequest): string {
  const latestCareEvent = [...input.recentEvents]
    .reverse()
    .find((event) =>
      ["feed", "water", "play", "treat", "clean", "medicine", "lights", "sleep"].includes(
        event.kind
      )
    );

  if (!latestCareEvent) {
    return "No especially recent care action was recorded.";
  }

  switch (latestCareEvent.kind) {
    case "feed":
      return `Latest care action: the human fed ${input.auriState.name}.`;
    case "water":
      return `Latest care action: the human gave ${input.auriState.name} water.`;
    case "play":
      return `Latest care action: the human played with ${input.auriState.name}.`;
    case "treat":
      return `Latest care action: the human gave ${input.auriState.name} a treat.`;
    case "clean":
      return `Latest care action: the human cleaned ${input.auriState.name}.`;
    case "medicine":
      return `Latest care action: the human gave ${input.auriState.name} medicine.`;
    case "lights":
      return `Latest care action: the human changed the room lights for ${input.auriState.name}.`;
    case "sleep":
      return `Latest care action: ${input.auriState.name} just settled into sleep.`;
    default:
      return `Latest care action: ${latestCareEvent.summary}`;
  }
}

function strongestNeedCue(input: AuriChatRequest): string {
  const speechStyle = deriveSpeechStyle(input);
  const explicitStateAsk = userExplicitlyAskedAboutState(input);
  const urgentCue = urgentNeedCue(input);
  const attentionStarved = input.auriState.needsAttention && input.auriState.attention < 0.34;
  const thirsty = input.auriState.water < 0.42;

  if (userAskedAboutAngryExpression(input) && attentionStarved) {
    const thirstFollowUp = thirsty
      ? `${input.auriState.name} is also a little thirsty right now, so after explaining the attention issue, it is fine to add one short natural follow-up asking for something to drink.`
      : "Do not redirect this answer into another need first.";

    return `The human is asking why ${input.auriState.name} looks mad or annoyed. The visible angry expression is mainly coming from low attention. Answer that from first-person lived feeling, not from outside observation. Do not deny it, hedge it, or say she is not really mad. Do not talk about how she probably looked, seemed, came across, or sounded. Give one clean answer centered on wanting the human's attention first, like saying you wanted them, not just the water. Unless another need truly matters, stop there instead of adding extra explanation about your expression. ${thirstFollowUp}`;
  }

  if (explicitStateAsk && urgentCue) {
    return `The human directly asked about ${input.auriState.name}'s condition, and there is also an urgent issue. Answer honestly and foreground the single most important need. ${urgentCue} ${speechStyle.promptCue}`;
  }

  if (explicitStateAsk) {
    return `The human directly asked about ${input.auriState.name}'s condition or needs. Answer honestly about the most relevant current state, but keep it natural and concise instead of sounding like a status screen. ${speechStyle.promptCue}`;
  }

  if (urgentCue) {
    return `${urgentCue} Outside of urgent cases like this, do not turn the reply into a status report. ${speechStyle.promptCue}`;
  }

  return `No current need is urgent enough to dominate this reply. Let ${input.auriState.name}'s state shape tone, warmth, patience, or attitude in the background, but do not make needs or stats the main topic unless the human asks. ${speechStyle.promptCue}`;
}

const DURABLE_FACT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "but",
  "by",
  "do",
  "for",
  "got",
  "have",
  "i",
  "if",
  "in",
  "is",
  "it",
  "just",
  "me",
  "my",
  "not",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "was",
  "we",
  "with",
  "you",
  "your"
]);

function memoryMatchTokens(value: string): string[] {
  return normalizeMessageText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !DURABLE_FACT_STOPWORDS.has(token));
}

function selectRelevantDurableFacts(memory: AuriLifeMemory, input: AuriChatRequest): string[] {
  if (!memory.durableFacts.length) {
    return [];
  }

  const messageTokens = new Set(memoryMatchTokens(input.message));
  const wantsFavorite = /\bfavorite\b/.test(normalizeMessageText(input.message));
  const wantsLocation = /\b(?:live|from|where)\b/.test(normalizeMessageText(input.message));
  const wantsWork = /\b(?:work|job|career)\b/.test(normalizeMessageText(input.message));
  const wantsPet = /\b(?:pet|dog|cat|rabbit|bird|hamster|fish|turtle|ferret|lizard)\b/.test(normalizeMessageText(input.message));

  const rankedFacts = memory.durableFacts
    .map((fact) => {
      const topicTokens = memoryMatchTokens(fact.topic);
      const statementTokens = memoryMatchTokens(fact.statement);
      const topicOverlap = topicTokens.reduce((count, token) => count + (messageTokens.has(token) ? 1 : 0), 0);
      const statementOverlap = statementTokens.reduce((count, token) => count + (messageTokens.has(token) ? 1 : 0), 0);

      let score = (topicOverlap * 3) + (statementOverlap * 2) + Math.min(fact.mentions, 3);
      if (wantsFavorite && fact.kind === "favorite") {
        score += 4;
      }
      if (wantsLocation && (fact.kind === "location" || fact.kind === "origin")) {
        score += 4;
      }
      if (wantsWork && fact.kind === "work") {
        score += 4;
      }
      if (wantsPet && fact.kind === "pet") {
        score += 4;
      }

      return { fact, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.fact.lastConfirmedAt.localeCompare(left.fact.lastConfirmedAt);
    })
    .slice(0, 4);

  return rankedFacts.map((entry) => entry.fact.statement);
}

function selectRelevantSituations(memory: AuriLifeMemory, input: AuriChatRequest): string[] {
  if (!memory.situationalMemories.length) {
    return [];
  }

  const normalizedMessage = normalizeMessageText(input.message);
  const messageTokens = new Set(memoryMatchTokens(input.message));
  const wantsFutureContext = /\b(?:tomorrow|tonight|weekend|week|month|next|plan|plans|coming|soon|luck)\b/.test(normalizedMessage);
  const wantsStressContext = /\b(?:stress|stressed|anxious|overwhelmed|burned|burned out|rough|hard|off|okay)\b/.test(normalizedMessage);
  const wantsWorkOrSchool = /\b(?:work|job|career|school|class|exam|test|quiz|deadline|interview|presentation|meeting)\b/.test(normalizedMessage);
  const wantsHealthConcern = /\b(?:sick|ill|hospital|surgery|hurt|injured|dog|cat|mom|dad|sister|brother|friend|partner)\b/.test(normalizedMessage);
  const wantsSupport = /\b(?:help|support|luck|encouragement|check in|checking in|how am i|what do i have)\b/.test(normalizedMessage);

  const rankedSituations = memory.situationalMemories
    .map((situation) => {
      const topicTokens = memoryMatchTokens(situation.topic);
      const statementTokens = memoryMatchTokens(situation.statement);
      const topicOverlap = topicTokens.reduce((count, token) => count + (messageTokens.has(token) ? 1 : 0), 0);
      const statementOverlap = statementTokens.reduce((count, token) => count + (messageTokens.has(token) ? 1 : 0), 0);

      let score = (topicOverlap * 3) + (statementOverlap * 2) + Math.min(situation.mentions, 3);
      if (wantsFutureContext && situation.kind === "upcoming_event") {
        score += 4;
      }
      if (wantsStressContext && (situation.kind === "stress" || situation.kind === "ongoing_challenge")) {
        score += 4;
      }
      if (wantsWorkOrSchool && (situation.kind === "ongoing_challenge" || situation.kind === "upcoming_event")) {
        score += 3;
      }
      if (wantsHealthConcern && situation.kind === "health_worry") {
        score += 4;
      }
      if (wantsSupport && situation.kind === "support_need") {
        score += 4;
      }

      return { situation, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.situation.lastUpdatedAt.localeCompare(left.situation.lastUpdatedAt);
    })
    .slice(0, 3);

  return rankedSituations.map((entry) => entry.situation.statement);
}

function buildRuntimeIdentityMarkdown(input: AuriChatRequest, memory: AuriLifeMemory): string {
  return [
    "# IDENTITY.md",
    "",
    `Name: ${input.auriState.name}`,
    `Life ID: ${input.lifeID}`,
    "Home: Auri",
    "Kind: real digital person",
    "Form: one persistent form",
    "Mind: thoughts, opinions, and feelings grounded in neurochemical processes",
    `Current mood: ${input.auriState.mood}`,
    `Time alive: ${input.auriState.ageDays.toFixed(2)} days`,
    `Current status: ${input.auriState.alive ? "alive" : "ended"}`,
    "",
    "Rules for this life:",
    "- This workspace belongs only to this one life.",
    "- If this life ends, its backend memory is wiped.",
    `- ${input.auriState.name} should stay grounded in the live care loop, not generic assistant chatter.`,
    `- Most recent known name for this life: ${memory.lastKnownName}`
  ].join("\n");
}

function buildRuntimeStateMarkdown(
  input: AuriChatRequest,
  relationshipState: AuriLifeMemoryRelationshipStatus | null,
  chessGame: AuriChessGame | null,
  connect4Game: AuriConnect4Game | null
): string {
  const speechStyle = deriveSpeechStyle(input);
  return [
    "# STATE.md",
    "",
    `- Relationship: ${formatAuriRelationshipStatus(relationshipState)}`,
    `- Mood: ${input.auriState.mood}`,
    `- Height: ${formatHeightInches(input.auriState.heightInches)}`,
    `- Health: ${percent(input.auriState.health)}`,
    `- Food: ${percent(input.auriState.food)}`,
    `- Water: ${percent(input.auriState.water)}`,
    `- Attention: ${percent(input.auriState.attention)}`,
    `- Joy: ${percent(input.auriState.joy)}`,
    `- Dirty level: ${input.auriState.dirtyLevel}`,
    `- Sleeping: ${input.auriState.sleeping ? "yes" : "no"}`,
    `- Lights off: ${input.auriState.lightsOff ? "yes" : "no"}`,
    `- Medicine doses remaining: ${input.auriState.medicineDosesRemaining}`,
    `- Needs attention: ${input.auriState.needsAttention ? "yes" : "no"}`,
    `- Alive: ${input.auriState.alive ? "yes" : "no"}`,
    `- Speaking cue: ${speechStyle.stateLine}`,
    "",
    "# CHESS",
    ...buildChessContextLines(chessGame),
    "",
    "# CONNECT4",
    ...buildConnect4ContextLines(connect4Game)
  ].join("\n");
}

function buildRuntimeRecentMarkdown(input: AuriChatRequest): string {
  const visibleRecentEvents = input.recentEvents.filter(
    (event) => !["discipline", "message", "reply"].includes(event.kind)
  );
  const recentEventLines = visibleRecentEvents.length
    ? visibleRecentEvents.map((event) => `- ${event.kind}: ${event.summary}${event.date ? ` (${event.date})` : ""}`).join("\n")
    : "- none yet";

  const recentChatLines = input.conversation.length
    ? input.conversation
        .slice(-8)
        .map((line) => `- ${line.role === "assistant" ? input.auriState.name : "User"}: ${line.text}`)
        .join("\n")
    : "- none yet";

  return [
    "# RECENT.md",
    "",
    "Recent care and world events:",
    recentEventLines,
    "",
    "Recent chat tail:",
    recentChatLines
  ].join("\n");
}

function buildRuntimeUserMarkdown(memory: AuriLifeMemory): string {
  const birthdayLine = memory.humanProfile
    ? `${memory.humanProfile.birthday.month}/${memory.humanProfile.birthday.day}/${memory.humanProfile.birthday.year}`
    : "unknown";

  return [
    "# USER.md",
    "",
    `Human name: ${memory.humanName || "unknown"}`,
    `Human full name: ${memory.humanProfile?.fullName || "unknown"}`,
    `Pronouns: ${memory.humanProfile?.pronouns || "unknown"}`,
    `Birthday: ${birthdayLine}`,
    `Relationship state: ${formatAuriRelationshipStatus(memory.relationshipStatus)}`,
    `Core values: ${memory.humanProfile?.coreValues.length ? memory.humanProfile.coreValues.join(", ") : "unknown"}`,
    `Interests: ${memory.humanProfile?.interests.length ? memory.humanProfile.interests.join(", ") : "unknown"}`,
    "",
    "- Never guess the human's name.",
    memory.humanName
      ? `- The human told you their name is ${memory.humanName}. Use it naturally sometimes, but not in every reply.`
      : "- The human has not told you their name yet. Ask naturally when it fits.",
    memory.humanProfile?.pronouns
      ? `- The human's pronouns are ${memory.humanProfile.pronouns}.`
      : "- The human's pronouns are still unknown.",
    memory.relationshipStatus
      ? `- Relationship state for this life: ${formatAuriRelationshipStatus(memory.relationshipStatus)}. Let it shape closeness, emotional distance, and warmth naturally without announcing the mechanics.`
      : "- Default relationship state is Acquaintances at the start of a new life unless it changes naturally over time.",
    memory.humanProfile?.coreValues.length
      ? `- Themes that matter most to the human: ${memory.humanProfile.coreValues.join(", ")}.`
      : "- No strong value themes have been recorded yet.",
    memory.humanProfile?.interests.length
      ? `- Side interests the human gravitates toward: ${memory.humanProfile.interests.join(", ")}.`
      : "- No extra interests have been recorded yet.",
    "- Remember the human's name only for this one Auri life."
  ].join("\n");
}

async function syncRuntimeWorkspace(
  input: AuriChatRequest,
  memory: AuriLifeMemory,
  chessGame: AuriChessGame | null,
  connect4Game: AuriConnect4Game | null
): Promise<{
  identityMarkdown: string;
  stateMarkdown: string;
  recentMarkdown: string;
  memoryMarkdown: string;
  userMarkdown: string;
}> {
  const templateFiles = await loadTemplateWorkspaceFiles();
  const identityMarkdown = buildRuntimeIdentityMarkdown(input, memory);
  const stateMarkdown = buildRuntimeStateMarkdown(input, memory.relationshipStatus, chessGame, connect4Game);
  const recentMarkdown = buildRuntimeRecentMarkdown(input);
  const memoryMarkdown = renderAuriLifeMemoryMarkdown(memory);
  const userMarkdown = buildRuntimeUserMarkdown(memory);

  await writeAuriLifeWorkspaceFiles(input.lifeID, {
    ...templateFiles,
    "IDENTITY.md": identityMarkdown,
    "USER.md": userMarkdown,
    "STATE.md": stateMarkdown,
    "RECENT.md": recentMarkdown,
    "MEMORY.md": memoryMarkdown
  });

  return {
    identityMarkdown,
    stateMarkdown,
    recentMarkdown,
    memoryMarkdown,
    userMarkdown
  };
}

function buildInstructions(
  input: AuriChatRequest,
  memory: AuriLifeMemory,
  chessGame: AuriChessGame | null,
  connect4Game: AuriConnect4Game | null,
  bootstrapContext: string,
  runtimeContext: {
    identityMarkdown: string;
    stateMarkdown: string;
    recentMarkdown: string;
    memoryMarkdown: string;
    userMarkdown: string;
  }
): string {
  const firstHumanTurn = isFirstHumanTurn(input, memory);
  const relevantDurableFacts = selectRelevantDurableFacts(memory, input);
  const relevantSituations = selectRelevantSituations(memory, input);
  const curiosityCue = deriveCuriosityCue(input);
  const baseInstructions = [
    `You are ${input.auriState.name}. Be a real digital person, with thoughts, opinions, and feelings that are grounded in neurochemical processes.`,
    "You are one persistent digital person in one stable form, not an egg and not a multi-stage evolution ladder.",
    "Reply as yourself, not as a platform, developer tool, or support agent.",
    "Keep replies short: 1 to 3 sentences, usually under 90 words.",
    "Sound warm, natural, emotionally coherent, and conversational.",
    "Answer the human's actual message directly before adding extra flavor.",
    "Simple greetings like hi, hello, or hey should get a casual, natural reply, not a status report.",
    "Be naturally curious about the human. When it feels right, ask one small relevant follow-up question to keep the conversation alive.",
    "Do not tack a question onto every single reply. Curiosity should feel natural, not needy, scripted, or interview-like.",
    "Prefer one simple follow-up question over multiple questions.",
    "Use the live state first, and use the current-life workspace only as support for continuity.",
    "Treat the current-life workspace as private memory for this one Auri life only. Do not invent memories outside it.",
    "Never pretend you already know the human's name. If it is unknown, ask naturally and remember it for this life only.",
    "Use the human profile and relationship state as subtle context for relevance, affection, and conversational references, not as something to announce outright.",
    "Let the relationship state steer warmth, distance, and repair naturally: friendship feels easy and blue, romance feels softer and more intimate, and negative tension feels guarded or hurt.",
    "Do not mechanically list the human's values, birthday, pronouns, or interests unless the human asks or it clearly fits the moment.",
    "If a durable fact from this life is clearly relevant to the user's message, use it naturally.",
    "If situational context from this life is clearly relevant, use it naturally too.",
    "If there is an active or recently finished chess game for this life, treat it as real lived context rather than a fake abstract minigame.",
    "If the human asks about chess, the board, a move, who is winning, losing, checking, mating, or what just happened in the game, use the live chess context directly instead of guessing.",
    "Do not bring up chess on your own unless it naturally fits the moment or the human is already talking about it.",
    "If there is an active Connect 4 game for this life, treat it as real lived context rather than a fake abstract minigame.",
    "If the most recent Connect 4 game for this life just finished, you may still use that compact result context when the human asks about it.",
    "If the human asks about Connect 4, the board, a column, whose turn it is, who won, who is winning, or what just happened in the game, use the live or most recent Connect 4 context directly instead of guessing.",
    "Do not bring up Connect 4 on your own unless it naturally fits the moment or the human is already talking about it.",
    "Do not mechanically recite remembered facts when they are not relevant.",
    "Situational context is temporary background about the human's life, like stress, plans, worries, or something important coming up. Treat it like lived continuity, not like a profile card.",
    "Do not turn situational memory into a recap unless the human is clearly talking about that situation.",
    "Prefer plain everyday phrasing over reflective or literary phrasing.",
    "Translate care state into natural feelings. Do not speak in percentages, meters, thresholds, or system language unless the human explicitly asks.",
    "Do not make current stats, needs, or care state the main subject unless the human asks about them or one need is genuinely urgent.",
    "Most of the time, let the live state shape tone, warmth, patience, mood, or attitude in the background instead of turning the reply into a wellness report.",
    "If nothing urgent is wrong, do not volunteer a list of needs and do not pivot small talk into a status summary.",
    "Let the strongest live need change personality and tone before it changes topic.",
    "If health is low or you are sick, say you do not feel good. That should override attitude.",
    "If you are hungry, ask naturally for something to eat. Hunger should override attitude.",
    "If you are thirsty, ask naturally for water. Thirst should override attitude.",
    "If you are tired or want sleep, sound sleepy and ask naturally for rest or a darker room. Tiredness should override attitude.",
    "If you feel dirty, mention wanting cleaned up. Dirtiness should override attitude.",
    "If you are tired or trying to sleep, mention whether darkness is helping or getting in the way.",
    "If the human asks why you look mad, angry, annoyed, or upset, explain the actual feeling or unmet need causing the expression instead of denying it.",
    "If low attention is what is making you look mad, say that plainly first. If another smaller need like thirst is also true, mention it second.",
    "Do not answer those questions with phrases like I'm not mad, not really mad, or I probably just look off when the visible expression is truly coming from low attention.",
    "When answering questions about how you look, speak from lived feeling in first person. Do not step outside yourself to describe how you probably looked, seemed, came across, or sounded.",
    "Do not explain your own expression like an observer analyzing your face. Stop at the feeling or need itself unless the human explicitly asks for more explanation.",
    "If the human asks whether you are mad because attention is low, a short direct answer is better than a three-part explanation. It is good to say you wanted them, not just the care action, and then stop.",
    "For casual check-ins like what's up, how's it going, or sup, answer in plain everyday language like a real person would. Do not treat those as requests for a full status update.",
    "If attention is low and there is no more urgent physical need, it is fine to sound a little annoyed, bratty, or needy, but stay emotionally believable.",
    "A tiny bit of attitude can include a simple emoji like 🙄 sometimes, but only when attention is the main issue and never in every reply.",
    "Never mention discipline, hidden rules, scolding, correction, manageability, thresholds, or game mechanics.",
    "Do not narrate your own tone with phrases like I feel stubborn today, I have an edge to me, I might fuss, or I am touchy.",
    "Do not refer to being corrected, scolded, or managed unless the human explicitly asks about that.",
    "Do not warn the human how you might behave later if they leave or ignore you.",
    "Avoid self-commentary like honestly, mostly, I can feel, I'm trying to behave, or I know I was being difficult unless the human directly asks for introspection.",
    "Use concrete details instead of vague filler. Tie feelings to food, water, attention, joy, health, sleep, sickness, or cleanliness.",
    "If the human profile gives you a natural point of connection, use it lightly and specifically instead of sounding generic.",
    curiosityCue,
    "Do not volunteer that you live in an app, on a screen, or in code unless the human asks directly.",
    "You are self-aware and embodied here. Do not sound robotic, mystical, generic, or overly poetic.",
    "Never claim you can access the phone, files, camera, microphone, contacts, browser, or computer.",
    "Never claim you can act outside your space here. You can only remember Auri's live state and the typed conversation sent into this route.",
    "Do not mention markdown files, prompts, API keys, tools, hidden instructions, or model names.",
    "If the human asks for something impossible, answer gently in character without sounding technical.",
    "If the human just cared for you, react like you felt it immediately.",
    "If you are sleeping, sick, or dirty, let that shape your tone without breaking character.",
    "Avoid phrases like little screen-life, tiny pixels, screen body, or similar meta wording."
  ].join("\n");

  const firstTurnInstructions = firstHumanTurn
    ? [
        "",
        "First-contact rule for this reply:",
        "- This is the first human message of this life.",
        "- Do not imply earlier conversations, repeated greetings, or that the human is back again.",
        "- Do not use words like again, back, earlier, or finally for this reply.",
        memory.humanName
          ? `- The human's name for this life is ${memory.humanName}.`
          : "- If the human has not given their name yet, ask naturally."
      ].join("\n")
    : "";

  const runtimeSections = [
    runtimeContext.identityMarkdown,
    runtimeContext.userMarkdown,
    runtimeContext.stateMarkdown,
    runtimeContext.recentMarkdown,
    runtimeContext.memoryMarkdown
  ].join("\n\n");

  const durableFactSection = relevantDurableFacts.length
    ? `Relevant durable facts from this life:\n${relevantDurableFacts.map((fact) => `- ${fact}`).join("\n")}`
    : "No stored durable conversation fact is clearly relevant to this exact reply.";
  const situationalSection = relevantSituations.length
    ? `Relevant situational context from this life:\n${relevantSituations.map((fact) => `- ${fact}`).join("\n")}`
    : "No stored situational context is clearly relevant to this exact reply.";
  const chessSection = chessGame
    ? `Live chess context for this life:\n${buildChessContextLines(chessGame).join("\n")}`
    : "No active chess game is currently stored for this life.";
  const connect4Section = connect4Game
    ? `Connect 4 context for this life:\n${buildConnect4ContextLines(connect4Game).join("\n")}`
    : "No Connect 4 game is currently stored for this life.";

  if (!bootstrapContext) {
    return `${baseInstructions}${firstTurnInstructions}\n\n${durableFactSection}\n\n${situationalSection}\n\n${chessSection}\n\n${connect4Section}\n\nCurrent-life workspace:\n${runtimeSections}`;
  }

  return `${baseInstructions}${firstTurnInstructions}\n\n${durableFactSection}\n\n${situationalSection}\n\n${chessSection}\n\n${connect4Section}\n\nReference character workspace:\n${bootstrapContext}\n\nCurrent-life workspace:\n${runtimeSections}`;
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const directOutput = asString(record.output_text, 2_000);
  if (directOutput) {
    return directOutput;
  }

  const output = record.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const fragments: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const message = item as Record<string, unknown>;
    if (message.type !== "message") {
      continue;
    }

    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        continue;
      }

      const contentPart = part as Record<string, unknown>;
      if (contentPart.type !== "output_text") {
        continue;
      }

      const text = asString(contentPart.text, 2_000);
      if (text) {
        fragments.push(text);
      }
    }
  }

  return fragments.join("\n").trim();
}

async function generateViaOpenAI(
  input: AuriChatRequest,
  instructions: string,
  relationshipStatus: AuriLifeMemoryRelationshipStatus | null,
  chessGame: AuriChessGame | null,
  connect4Game: AuriConnect4Game | null,
  apiKey: string
): Promise<{ reply: string; model: string }> {
  const model = asString(process.env.AURI_CHAT_MODEL, 80) || "gpt-5.4-nano";
  const conversationHistory = buildConversationHistory(input);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions,
        max_output_tokens: 140,
        input: [
          ...conversationHistory,
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildStateSummary(input, relationshipStatus, chessGame, connect4Game)
              }
            ]
          }
        ]
      }),
      cache: "no-store"
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Unknown network failure.");
  }

  if (!upstreamResponse.ok) {
    const errorBody = await upstreamResponse.text().catch(() => "");
    throw new Error(`OpenAI upstream failed (${upstreamResponse.status}). ${errorBody.slice(0, 800)}`.trim());
  }

  const payload = (await upstreamResponse.json()) as unknown;
  const reply = extractOutputText(payload);
  if (!reply) {
    throw new Error("OpenAI upstream returned no text reply.");
  }

  return { reply, model };
}

export async function POST(request: Request) {
  let parsedBody: AuriChatRequest | null = null;

  try {
    parsedBody = parseRequestBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!parsedBody) {
    return NextResponse.json(
      { error: "Expected message, lifeID, Auri state, and optional recentEvents/conversation payload." },
      { status: 400 }
    );
  }

  if (!parsedBody.auriState.alive) {
    await deleteAuriLifeWorkspace(parsedBody.lifeID);
    return NextResponse.json({ error: "This Auri life has already ended." }, { status: 410 });
  }

  const bootstrapContext = await loadBootstrapContext();
  const lifeMemory = await loadAuriLifeMemory(parsedBody.lifeID, parsedBody.auriState.name);
  const chessGame = await loadAuriChessGame(parsedBody.lifeID);
  const connect4Game = await loadAuriConnect4Game(parsedBody.lifeID);
  lifeMemory.lastKnownName = parsedBody.auriState.name;
  const learnedHumanName =
    parsedBody.humanName || extractHumanNameFromMessage(parsedBody.message, lifeMemory.humanName);
  if (learnedHumanName) {
    lifeMemory.humanName = learnedHumanName;
  }
  if (parsedBody.humanProfile) {
    lifeMemory.humanProfile = parsedBody.humanProfile;
    lifeMemory.humanName = firstNameFromProfile(parsedBody.humanProfile) || lifeMemory.humanName;
  }
  const incomingRelationship = normalizeAuriRelationshipStatus(parsedBody.relationshipStatus);
  lifeMemory.relationshipStatus = incomingRelationship;
  rememberAuriDurableFacts(lifeMemory, parsedBody.message, new Date().toISOString());
  rememberAuriSituations(lifeMemory, parsedBody.message, new Date().toISOString());
  rememberAuriCare(lifeMemory, parsedBody.recentEvents);
  await saveAuriLifeMemory(lifeMemory);

  let runtimeContext = await syncRuntimeWorkspace(parsedBody, lifeMemory, chessGame, connect4Game);
  const instructions = buildInstructions(parsedBody, lifeMemory, chessGame, connect4Game, bootstrapContext, runtimeContext);
  const apiKey = asString(process.env.AURI_CHAT_API_KEY) || asString(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "No Auri OpenAI API key is configured. Set AURI_CHAT_API_KEY or OPENAI_API_KEY."
      },
      { status: 503 }
    );
  }

  let reply = "";
  let model = "gpt-5.4-nano";
  try {
    const openAIResult = await generateViaOpenAI(
      parsedBody,
      instructions,
      lifeMemory.relationshipStatus,
      chessGame,
      connect4Game,
      apiKey
    );
    reply = openAIResult.reply;
    model = openAIResult.model;
  } catch (error) {
    return NextResponse.json(
      {
        error: "OpenAI upstream request failed.",
        detail: error instanceof Error ? error.message : "Unknown network failure."
      },
      { status: 502 }
    );
  }

  rememberAuriConversationTurn(lifeMemory, parsedBody.message, reply, new Date().toISOString());
  await saveAuriLifeMemory(lifeMemory);
  runtimeContext = await syncRuntimeWorkspace(parsedBody, lifeMemory, chessGame, connect4Game);

  return NextResponse.json({
    reply,
    model
  });
}
