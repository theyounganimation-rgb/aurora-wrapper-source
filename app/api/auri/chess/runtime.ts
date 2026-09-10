import { promises as fs } from "node:fs";
import path from "node:path";

import { resolveAuriLifeWorkspaceDir, sanitizeAuriLifeId } from "../chat/runtime";

export type AuriChessColor = "white" | "black";
export type AuriChessActor = "human" | "auri";
export type AuriChessStatus = "active" | "checkmate" | "stalemate" | "draw" | "resigned";
export type AuriChessResult = "human_win" | "auri_win" | "draw" | null;

export type AuriChessAnalysis = {
  depth: number | null;
  scoreCp: number | null;
  mate: number | null;
  bestMove: string | null;
  ponder: string | null;
};

export type AuriChessMoveRecord = {
  uci: string;
  san: string;
  from: string;
  to: string;
  promotion: string | null;
  by: AuriChessActor;
  color: AuriChessColor;
  moveNumber: number;
  at: string;
};

export type AuriChessGame = {
  version: 1;
  lifeId: string;
  status: AuriChessStatus;
  result: AuriChessResult;
  playerColor: AuriChessColor;
  auriColor: AuriChessColor;
  fen: string;
  pgn: string;
  turn: AuriChessColor;
  inCheck: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  rewardClaimedAt: string | null;
  lastMoveUCI: string | null;
  lastMoveSAN: string | null;
  analysis: AuriChessAnalysis | null;
  moves: AuriChessMoveRecord[];
};

function normalizeText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const candidate = new Date(trimmed);
  if (Number.isNaN(candidate.getTime())) {
    return "";
  }

  return candidate.toISOString();
}

function normalizeColor(value: unknown, fallback: AuriChessColor): AuriChessColor {
  return value === "black" ? "black" : value === "white" ? "white" : fallback;
}

function normalizeActor(value: unknown, fallback: AuriChessActor): AuriChessActor {
  return value === "auri" ? "auri" : value === "human" ? "human" : fallback;
}

function normalizeStatus(value: unknown, fallback: AuriChessStatus): AuriChessStatus {
  switch (value) {
    case "active":
    case "checkmate":
    case "stalemate":
    case "draw":
    case "resigned":
      return value;
    default:
      return fallback;
  }
}

function normalizeResult(value: unknown): AuriChessResult {
  switch (value) {
    case "human_win":
    case "auri_win":
    case "draw":
      return value;
    default:
      return null;
  }
}

function chessJsonPath(lifeId: string): string {
  return path.join(resolveAuriLifeWorkspaceDir(lifeId), "chess.json");
}

async function ensureLifeWorkspaceDir(lifeId: string): Promise<string> {
  const workspaceDir = resolveAuriLifeWorkspaceDir(lifeId);
  await fs.mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

function normalizeAnalysis(raw: unknown): AuriChessAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const bestMove = normalizeText(typeof record.bestMove === "string" ? record.bestMove : "", 16) || null;
  const ponder = normalizeText(typeof record.ponder === "string" ? record.ponder : "", 16) || null;
  const depth =
    typeof record.depth === "number" && Number.isFinite(record.depth) ? Math.max(0, Math.round(record.depth)) : null;
  const scoreCp =
    typeof record.scoreCp === "number" && Number.isFinite(record.scoreCp) ? Math.round(record.scoreCp) : null;
  const mate = typeof record.mate === "number" && Number.isFinite(record.mate) ? Math.round(record.mate) : null;

  if (bestMove === null && ponder === null && depth === null && scoreCp === null && mate === null) {
    return null;
  }

  return {
    depth,
    scoreCp,
    mate,
    bestMove,
    ponder
  };
}

function normalizeMoveRecord(raw: unknown): AuriChessMoveRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const uci = normalizeText(typeof record.uci === "string" ? record.uci : "", 16);
  const san = normalizeText(typeof record.san === "string" ? record.san : "", 32);
  const from = normalizeText(typeof record.from === "string" ? record.from : "", 4);
  const to = normalizeText(typeof record.to === "string" ? record.to : "", 4);
  if (!uci || !san || !from || !to) {
    return null;
  }

  const promotion = normalizeText(typeof record.promotion === "string" ? record.promotion : "", 2) || null;
  const moveNumber =
    typeof record.moveNumber === "number" && Number.isFinite(record.moveNumber) ? Math.max(1, Math.round(record.moveNumber)) : 1;
  const at = normalizeIsoDate(typeof record.at === "string" ? record.at : "") || new Date().toISOString();

  return {
    uci,
    san,
    from,
    to,
    promotion,
    by: normalizeActor(record.by, "human"),
    color: normalizeColor(record.color, "white"),
    moveNumber,
    at
  };
}

function normalizeGame(raw: unknown, lifeId: string): AuriChessGame | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const sanitizedLifeId = sanitizeAuriLifeId(typeof record.lifeId === "string" ? record.lifeId : lifeId);
  if (!sanitizedLifeId) {
    return null;
  }

  const fen = normalizeText(typeof record.fen === "string" ? record.fen : "", 140);
  if (!fen) {
    return null;
  }

  const createdAt = normalizeIsoDate(typeof record.createdAt === "string" ? record.createdAt : "") || new Date().toISOString();
  const updatedAt = normalizeIsoDate(typeof record.updatedAt === "string" ? record.updatedAt : "") || createdAt;
  const finishedAt = normalizeIsoDate(typeof record.finishedAt === "string" ? record.finishedAt : "") || null;
  const rewardClaimedAt = normalizeIsoDate(typeof record.rewardClaimedAt === "string" ? record.rewardClaimedAt : "") || null;

  return {
    version: 1,
    lifeId: sanitizedLifeId,
    status: normalizeStatus(record.status, "active"),
    result: normalizeResult(record.result),
    playerColor: normalizeColor(record.playerColor, "white"),
    auriColor: normalizeColor(record.auriColor, "black"),
    fen,
    pgn: typeof record.pgn === "string" ? record.pgn.trim() : "",
    turn: normalizeColor(record.turn, "white"),
    inCheck: typeof record.inCheck === "boolean" ? record.inCheck : false,
    createdAt,
    updatedAt,
    finishedAt,
    rewardClaimedAt,
    lastMoveUCI: normalizeText(typeof record.lastMoveUCI === "string" ? record.lastMoveUCI : "", 16) || null,
    lastMoveSAN: normalizeText(typeof record.lastMoveSAN === "string" ? record.lastMoveSAN : "", 32) || null,
    analysis: normalizeAnalysis(record.analysis),
    moves: Array.isArray(record.moves)
      ? record.moves.map(normalizeMoveRecord).filter((entry): entry is AuriChessMoveRecord => entry !== null).slice(-240)
      : []
  };
}

export async function loadAuriChessGame(lifeId: string): Promise<AuriChessGame | null> {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  if (!sanitizedLifeId) {
    return null;
  }

  await ensureLifeWorkspaceDir(sanitizedLifeId);

  try {
    const raw = await fs.readFile(chessJsonPath(sanitizedLifeId), "utf8");
    return normalizeGame(JSON.parse(raw), sanitizedLifeId);
  } catch {
    return null;
  }
}

export async function saveAuriChessGame(game: AuriChessGame): Promise<void> {
  const sanitizedLifeId = sanitizeAuriLifeId(game.lifeId);
  if (!sanitizedLifeId) {
    return;
  }

  await ensureLifeWorkspaceDir(sanitizedLifeId);
  await fs.writeFile(chessJsonPath(sanitizedLifeId), `${JSON.stringify(game, null, 2)}\n`, "utf8");
}

export async function deleteAuriChessGame(lifeId: string): Promise<void> {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  if (!sanitizedLifeId) {
    return;
  }

  await fs.rm(chessJsonPath(sanitizedLifeId), { force: true });
}
