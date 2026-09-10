import { promises as fs } from "node:fs";
import path from "node:path";

import { resolveAuriLifeWorkspaceDir, sanitizeAuriLifeId } from "../chat/runtime";

export type AuriConnect4Player = "human" | "auri";
export type AuriConnect4Status = "active" | "connected" | "draw" | "resigned";
export type AuriConnect4Result = "human_win" | "auri_win" | "draw" | null;

export type AuriConnect4MoveRecord = {
  column: number;
  row: number;
  by: AuriConnect4Player;
  moveNumber: number;
  at: string;
};

export type AuriConnect4Game = {
  version: 1;
  lifeId: string;
  status: AuriConnect4Status;
  result: AuriConnect4Result;
  currentTurn: AuriConnect4Player;
  humanStarts: boolean;
  cells: number[];
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  rewardClaimedAt: string | null;
  lastMoveColumn: number | null;
  lastMoveRow: number | null;
  winningCellIndices: number[];
  moves: AuriConnect4MoveRecord[];
};

const ROWS = 6;
const COLUMNS = 7;
const TOTAL_CELLS = ROWS * COLUMNS;

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

function normalizePlayer(value: unknown, fallback: AuriConnect4Player): AuriConnect4Player {
  return value === "auri" ? "auri" : value === "human" ? "human" : fallback;
}

function normalizeStatus(value: unknown, fallback: AuriConnect4Status): AuriConnect4Status {
  switch (value) {
    case "active":
    case "connected":
    case "draw":
    case "resigned":
      return value;
    default:
      return fallback;
  }
}

function normalizeResult(value: unknown): AuriConnect4Result {
  switch (value) {
    case "human_win":
    case "auri_win":
    case "draw":
      return value;
    default:
      return null;
  }
}

function connect4JsonPath(lifeId: string): string {
  return path.join(resolveAuriLifeWorkspaceDir(lifeId), "connect4.json");
}

async function ensureLifeWorkspaceDir(lifeId: string): Promise<string> {
  const workspaceDir = resolveAuriLifeWorkspaceDir(lifeId);
  await fs.mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

function normalizeMoveRecord(raw: unknown): AuriConnect4MoveRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const column = typeof record.column === "number" && Number.isFinite(record.column) ? Math.round(record.column) : -1;
  const row = typeof record.row === "number" && Number.isFinite(record.row) ? Math.round(record.row) : -1;
  if (column < 0 || column >= COLUMNS || row < 0 || row >= ROWS) {
    return null;
  }

  const moveNumber =
    typeof record.moveNumber === "number" && Number.isFinite(record.moveNumber) ? Math.max(1, Math.round(record.moveNumber)) : 1;
  const at = normalizeIsoDate(typeof record.at === "string" ? record.at : "") || new Date().toISOString();

  return {
    column,
    row,
    by: normalizePlayer(record.by, "human"),
    moveNumber,
    at
  };
}

function normalizeCells(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return Array(TOTAL_CELLS).fill(0);
  }

  const cells = raw
    .map((value) => {
      if (value === 1 || value === 2) {
        return value;
      }
      return 0;
    })
    .slice(0, TOTAL_CELLS);

  while (cells.length < TOTAL_CELLS) {
    cells.push(0);
  }

  return cells;
}

function normalizeWinningCellIndices(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : -1))
    .filter((value) => value >= 0 && value < TOTAL_CELLS)
    .slice(0, 4);
}

function normalizeGame(raw: unknown, lifeId: string): AuriConnect4Game | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const sanitizedLifeId = sanitizeAuriLifeId(typeof record.lifeId === "string" ? record.lifeId : lifeId);
  if (!sanitizedLifeId) {
    return null;
  }

  const createdAt = normalizeIsoDate(typeof record.createdAt === "string" ? record.createdAt : "") || new Date().toISOString();
  const updatedAt = normalizeIsoDate(typeof record.updatedAt === "string" ? record.updatedAt : "") || createdAt;
  const finishedAt = normalizeIsoDate(typeof record.finishedAt === "string" ? record.finishedAt : "") || null;
  const rewardClaimedAt = normalizeIsoDate(typeof record.rewardClaimedAt === "string" ? record.rewardClaimedAt : "") || null;
  const lastMoveColumn =
    typeof record.lastMoveColumn === "number" && Number.isFinite(record.lastMoveColumn)
      ? Math.round(record.lastMoveColumn)
      : null;
  const lastMoveRow =
    typeof record.lastMoveRow === "number" && Number.isFinite(record.lastMoveRow) ? Math.round(record.lastMoveRow) : null;

  return {
    version: 1,
    lifeId: sanitizedLifeId,
    status: normalizeStatus(record.status, "active"),
    result: normalizeResult(record.result),
    currentTurn: normalizePlayer(record.currentTurn, "human"),
    humanStarts: typeof record.humanStarts === "boolean" ? record.humanStarts : true,
    cells: normalizeCells(record.cells),
    createdAt,
    updatedAt,
    finishedAt,
    rewardClaimedAt,
    lastMoveColumn: lastMoveColumn !== null && lastMoveColumn >= 0 && lastMoveColumn < COLUMNS ? lastMoveColumn : null,
    lastMoveRow: lastMoveRow !== null && lastMoveRow >= 0 && lastMoveRow < ROWS ? lastMoveRow : null,
    winningCellIndices: normalizeWinningCellIndices(record.winningCellIndices),
    moves: Array.isArray(record.moves)
      ? record.moves.map(normalizeMoveRecord).filter((entry): entry is AuriConnect4MoveRecord => entry !== null).slice(-84)
      : []
  };
}

export async function loadAuriConnect4Game(lifeId: string): Promise<AuriConnect4Game | null> {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  if (!sanitizedLifeId) {
    return null;
  }

  await ensureLifeWorkspaceDir(sanitizedLifeId);

  try {
    const raw = await fs.readFile(connect4JsonPath(sanitizedLifeId), "utf8");
    return normalizeGame(JSON.parse(raw), sanitizedLifeId);
  } catch {
    return null;
  }
}

export async function saveAuriConnect4Game(game: AuriConnect4Game): Promise<void> {
  const sanitizedLifeId = sanitizeAuriLifeId(game.lifeId);
  if (!sanitizedLifeId) {
    return;
  }

  await ensureLifeWorkspaceDir(sanitizedLifeId);
  await fs.writeFile(connect4JsonPath(sanitizedLifeId), `${JSON.stringify(game, null, 2)}\n`, "utf8");
}

export async function deleteAuriConnect4Game(lifeId: string): Promise<void> {
  const sanitizedLifeId = sanitizeAuriLifeId(lifeId);
  if (!sanitizedLifeId) {
    return;
  }

  await fs.rm(connect4JsonPath(sanitizedLifeId), { force: true });
}
