import { NextResponse } from "next/server";

import {
  chooseAuriConnect4Column,
  detectAuriConnect4Winner,
  dropAuriConnect4Disc,
  legalAuriConnect4Columns,
  occupiedAuriConnect4Cells
} from "./engine";
import {
  loadAuriConnect4Game,
  saveAuriConnect4Game,
  type AuriConnect4Game,
  type AuriConnect4Player,
  type AuriConnect4Result,
  type AuriConnect4Status
} from "./runtime";
import { sanitizeAuriLifeId } from "../chat/runtime";

const ROWS = 6;
const COLUMNS = 7;
const HUMAN = 1;
const AURI = 2;

type AuriConnect4RequestAction = "state" | "start" | "drop" | "resign" | "claim_reward";

type AuriConnect4RequestBody = {
  action?: string;
  lifeID?: string;
  humanStarts?: boolean;
  column?: number;
};

type AuriConnect4Envelope = {
  game: {
    lifeID: string;
    status: AuriConnect4Status;
    result: AuriConnect4Result;
    currentTurn: AuriConnect4Player;
    humanStarts: boolean;
    rows: number;
    columns: number;
    moveCount: number;
    rewardPending: boolean;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
    lastMoveColumn: number | null;
    lastMoveRow: number | null;
    board: Array<{
      row: number;
      column: number;
      player: AuriConnect4Player;
    }>;
    legalColumns: number[];
    winningCells: Array<{
      row: number;
      column: number;
    }>;
    recentMoves: Array<{
      column: number;
      row: number;
      by: AuriConnect4Player;
      moveNumber: number;
    }>;
  } | null;
};

function invalidRequest(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function asAction(value: unknown): AuriConnect4RequestAction | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  switch (normalized) {
    case "state":
    case "start":
    case "drop":
    case "resign":
    case "claim_reward":
      return normalized as AuriConnect4RequestAction;
    default:
      return null;
  }
}

function asColumn(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function buildBlankGame(lifeId: string, humanStarts: boolean): AuriConnect4Game {
  const now = new Date().toISOString();
  return {
    version: 1,
    lifeId,
    status: "active",
    result: null,
    currentTurn: humanStarts ? "human" : "auri",
    humanStarts,
    cells: Array(ROWS * COLUMNS).fill(0),
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    rewardClaimedAt: null,
    lastMoveColumn: null,
    lastMoveRow: null,
    winningCellIndices: [],
    moves: []
  };
}

function indexFor(row: number, column: number): number {
  return row * COLUMNS + column;
}

function recordMove(game: AuriConnect4Game, by: AuriConnect4Player, column: number, row: number, at: string): void {
  game.moves.push({
    column,
    row,
    by,
    moveNumber: game.moves.length + 1,
    at
  });
  game.moves = game.moves.slice(-84);
  game.lastMoveColumn = column;
  game.lastMoveRow = row;
  game.updatedAt = at;
}

function syncGameSnapshot(game: AuriConnect4Game, at: string): void {
  const winner = detectAuriConnect4Winner(game.cells);
  game.updatedAt = at;
  game.winningCellIndices = winner.cellIndices;

  if (winner.winner === HUMAN) {
    game.status = "connected";
    game.result = "human_win";
    game.finishedAt = at;
    game.currentTurn = "human";
    return;
  }

  if (winner.winner === AURI) {
    game.status = "connected";
    game.result = "auri_win";
    game.finishedAt = at;
    game.currentTurn = "auri";
    return;
  }

  if (occupiedAuriConnect4Cells(game.cells) >= ROWS * COLUMNS) {
    game.status = "draw";
    game.result = "draw";
    game.finishedAt = at;
    return;
  }

  game.status = "active";
  game.result = null;
  game.finishedAt = null;
}

async function maybeResolveAuriTurn(game: AuriConnect4Game): Promise<AuriConnect4Game> {
  if (game.status !== "active" || game.currentTurn !== "auri") {
    return game;
  }

  const search = chooseAuriConnect4Column(game.cells);
  const row = dropAuriConnect4Disc(game.cells, search.column, AURI);
  if (row === null) {
    throw new Error("Connect 4 engine returned a full column.");
  }

  const now = new Date().toISOString();
  recordMove(game, "auri", search.column, row, now);
  game.currentTurn = "human";
  syncGameSnapshot(game, now);
  return game;
}

function serializeGame(game: AuriConnect4Game): AuriConnect4Envelope["game"] {
  const board: Array<{ row: number; column: number; player: AuriConnect4Player }> = game.cells.flatMap((value, cellIndex) => {
    if (value !== HUMAN && value !== AURI) {
      return [];
    }

    return [
      {
        row: Math.floor(cellIndex / COLUMNS),
        column: cellIndex % COLUMNS,
        player: value === HUMAN ? "human" : "auri"
      }
    ];
  });

  const winningCells = game.winningCellIndices.map((cellIndex) => ({
    row: Math.floor(cellIndex / COLUMNS),
    column: cellIndex % COLUMNS
  }));

  return {
    lifeID: game.lifeId,
    status: game.status,
    result: game.result,
    currentTurn: game.currentTurn,
    humanStarts: game.humanStarts,
    rows: ROWS,
    columns: COLUMNS,
    moveCount: game.moves.length,
    rewardPending: game.result !== null && game.rewardClaimedAt === null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    finishedAt: game.finishedAt,
    lastMoveColumn: game.lastMoveColumn,
    lastMoveRow: game.lastMoveRow,
    board,
    legalColumns: game.status === "active" ? legalAuriConnect4Columns(game.cells) : [],
    winningCells,
    recentMoves: game.moves.slice(-12).map((move) => ({
      column: move.column,
      row: move.row,
      by: move.by,
      moveNumber: move.moveNumber
    }))
  };
}

export async function POST(request: Request) {
  let body: AuriConnect4RequestBody;
  try {
    body = (await request.json()) as AuriConnect4RequestBody;
  } catch {
    return invalidRequest("Invalid JSON body.");
  }

  const action = asAction(body.action);
  const lifeId = sanitizeAuriLifeId(typeof body.lifeID === "string" ? body.lifeID : "");
  if (!action || !lifeId) {
    return invalidRequest("Expected action and lifeID.");
  }

  try {
    switch (action) {
      case "state": {
        const game = await loadAuriConnect4Game(lifeId);
        if (!game) {
          return NextResponse.json({ game: null } satisfies AuriConnect4Envelope);
        }

        const resolvedGame = await maybeResolveAuriTurn(game);
        await saveAuriConnect4Game(resolvedGame);
        return NextResponse.json({ game: serializeGame(resolvedGame) } satisfies AuriConnect4Envelope);
      }

      case "start": {
        let game = buildBlankGame(lifeId, body.humanStarts !== false);
        game = await maybeResolveAuriTurn(game);
        await saveAuriConnect4Game(game);
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriConnect4Envelope);
      }

      case "drop": {
        const game = await loadAuriConnect4Game(lifeId);
        if (!game) {
          return invalidRequest("No Connect 4 game exists for this life.", 404);
        }
        if (game.status !== "active") {
          return invalidRequest("This Connect 4 game has already ended.", 409);
        }
        if (game.currentTurn !== "human") {
          return invalidRequest("It is not the human player's turn.", 409);
        }

        const column = asColumn(body.column);
        if (column === null || column < 0 || column >= COLUMNS) {
          return invalidRequest("Expected a Connect 4 column between 0 and 6.");
        }

        const row = dropAuriConnect4Disc(game.cells, column, HUMAN);
        if (row === null) {
          return invalidRequest("That Connect 4 column is already full.", 409);
        }

        const now = new Date().toISOString();
        recordMove(game, "human", column, row, now);
        game.currentTurn = "auri";
        syncGameSnapshot(game, now);
        if (game.status === "active") {
          await maybeResolveAuriTurn(game);
        }

        await saveAuriConnect4Game(game);
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriConnect4Envelope);
      }

      case "resign": {
        const game = await loadAuriConnect4Game(lifeId);
        if (!game) {
          return invalidRequest("No Connect 4 game exists for this life.", 404);
        }
        if (game.status !== "active") {
          return NextResponse.json({ game: serializeGame(game) } satisfies AuriConnect4Envelope);
        }

        const now = new Date().toISOString();
        game.status = "resigned";
        game.result = "auri_win";
        game.finishedAt = now;
        game.updatedAt = now;
        await saveAuriConnect4Game(game);
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriConnect4Envelope);
      }

      case "claim_reward": {
        const game = await loadAuriConnect4Game(lifeId);
        if (!game) {
          return invalidRequest("No Connect 4 game exists for this life.", 404);
        }
        if (game.result !== null && game.rewardClaimedAt === null) {
          game.rewardClaimedAt = new Date().toISOString();
          game.updatedAt = game.rewardClaimedAt;
          await saveAuriConnect4Game(game);
        }
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriConnect4Envelope);
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Auri Connect 4 route failed.",
        detail: error instanceof Error ? error.message.slice(0, 600) : "Unknown Connect 4 failure."
      },
      { status: 500 }
    );
  }
}
