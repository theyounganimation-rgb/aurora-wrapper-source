import { createRequire } from "node:module";

import { NextResponse } from "next/server";

import { searchBestMoveForFen, type AuriChessEngineResult } from "./engine";
import {
  type AuriChessAnalysis,
  loadAuriChessGame,
  saveAuriChessGame,
  type AuriChessActor,
  type AuriChessColor,
  type AuriChessGame,
  type AuriChessMoveRecord,
  type AuriChessResult,
  type AuriChessStatus
} from "./runtime";
import { sanitizeAuriLifeId } from "../chat/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const require = createRequire(import.meta.url);
const { Chess } = require("../../../../vendor/chess.js/dist/cjs/chess.js") as {
  Chess: new (fen?: string) => ChessInstance;
};

type ChessColorCode = "w" | "b";

type ChessVerboseMove = {
  color: ChessColorCode;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  flags: string;
  san: string;
  lan: string;
  before: string;
  after: string;
};

type ChessBoardPiece = {
  square: string;
  type: string;
  color: ChessColorCode;
};

type ChessInstance = {
  fen(): string;
  pgn(): string;
  turn(): ChessColorCode;
  inCheck(): boolean;
  isCheckmate(): boolean;
  isStalemate(): boolean;
  isDraw(): boolean;
  board(): Array<Array<ChessBoardPiece | null>>;
  moves(options?: { verbose?: boolean }): ChessVerboseMove[] | string[];
  move(
    move:
      | string
      | {
          from: string;
          to: string;
          promotion?: string;
        }
  ): ChessVerboseMove | null;
};

type AuriChessRequestAction = "state" | "start" | "move" | "resign" | "claim_reward";

type AuriChessRequestBody = {
  action?: unknown;
  lifeID?: unknown;
  playerColor?: unknown;
  from?: unknown;
  to?: unknown;
  promotion?: unknown;
};

type SerializedChessPiece = {
  square: string;
  color: AuriChessColor;
  kind: string;
};

type SerializedChessMove = {
  from: string;
  to: string;
  san: string;
  uci: string;
  promotion: string | null;
};

type SerializedRecentMove = {
  san: string;
  uci: string;
  by: AuriChessActor;
  color: AuriChessColor;
  moveNumber: number;
};

type AuriChessEnvelope = {
  game: {
    lifeID: string;
    status: AuriChessStatus;
    result: AuriChessResult;
    playerColor: AuriChessColor;
    auriColor: AuriChessColor;
    turn: AuriChessColor;
    currentTurn: AuriChessActor;
    fen: string;
    pgn: string;
    inCheck: boolean;
    moveCount: number;
    rewardPending: boolean;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
    lastMoveUCI: string | null;
    lastMoveSAN: string | null;
    analysis: AuriChessAnalysis | null;
    board: SerializedChessPiece[];
    legalMoves: SerializedChessMove[];
    recentMoves: SerializedRecentMove[];
  } | null;
};

function asString(value: unknown, maxLength = 120): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asAction(value: unknown): AuriChessRequestAction | null {
  switch (asString(value, 40).toLowerCase()) {
    case "state":
    case "start":
    case "move":
    case "resign":
    case "claim_reward":
      return asString(value, 40).toLowerCase() as AuriChessRequestAction;
    default:
      return null;
  }
}

function asColor(value: unknown, fallback: AuriChessColor = "white"): AuriChessColor {
  return value === "black" ? "black" : value === "white" ? "white" : fallback;
}

function oppositeColor(color: AuriChessColor): AuriChessColor {
  return color === "white" ? "black" : "white";
}

function colorFromCode(color: ChessColorCode): AuriChessColor {
  return color === "b" ? "black" : "white";
}

function chessFromGame(game: AuriChessGame): ChessInstance {
  return new Chess(game.fen);
}

function buildBlankGame(lifeId: string, playerColor: AuriChessColor): AuriChessGame {
  const now = new Date().toISOString();
  const chess = new Chess();
  return {
    version: 1,
    lifeId,
    status: "active",
    result: null,
    playerColor,
    auriColor: oppositeColor(playerColor),
    fen: chess.fen(),
    pgn: chess.pgn(),
    turn: colorFromCode(chess.turn()),
    inCheck: chess.inCheck(),
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    rewardClaimedAt: null,
    lastMoveUCI: null,
    lastMoveSAN: null,
    analysis: null,
    moves: []
  };
}

function recordMove(
  game: AuriChessGame,
  move: ChessVerboseMove,
  by: AuriChessActor,
  at: string
): void {
  game.moves.push({
    uci: move.lan,
    san: move.san,
    from: move.from,
    to: move.to,
    promotion: move.promotion ?? null,
    by,
    color: colorFromCode(move.color),
    moveNumber: Math.ceil((game.moves.length + 1) / 2),
    at
  });
  game.lastMoveUCI = move.lan;
  game.lastMoveSAN = move.san;
}

function syncGameSnapshot(
  game: AuriChessGame,
  chess: ChessInstance,
  at: string,
  analysis?: AuriChessEngineResult | null
): void {
  game.fen = chess.fen();
  game.pgn = chess.pgn();
  game.turn = colorFromCode(chess.turn());
  game.inCheck = chess.inCheck();
  game.updatedAt = at;
  game.analysis = analysis ?? game.analysis;

  if (chess.isCheckmate()) {
    game.status = "checkmate";
    game.result = game.turn === game.playerColor ? "auri_win" : "human_win";
    game.finishedAt = at;
    return;
  }

  if (chess.isStalemate()) {
    game.status = "stalemate";
    game.result = "draw";
    game.finishedAt = at;
    return;
  }

  if (chess.isDraw()) {
    game.status = "draw";
    game.result = "draw";
    game.finishedAt = at;
    return;
  }

  game.status = "active";
  game.result = null;
  game.finishedAt = null;
}

async function maybeResolveAuriTurn(game: AuriChessGame): Promise<AuriChessGame> {
  if (game.status !== "active" || game.turn !== game.auriColor) {
    return game;
  }

  const chess = chessFromGame(game);
  const search = await searchBestMoveForFen(chess.fen());
  const bestMove = search.bestMove;
  const move = chess.move({
    from: bestMove.slice(0, 2),
    to: bestMove.slice(2, 4),
    promotion: bestMove.length > 4 ? bestMove.slice(4, 5) : undefined
  });

  if (!move) {
    throw new Error("Stockfish returned an illegal move for the current position.");
  }

  const now = new Date().toISOString();
  recordMove(game, move, "auri", now);
  syncGameSnapshot(game, chess, now, search);
  return game;
}

function serializeGame(game: AuriChessGame): AuriChessEnvelope["game"] {
  const chess = chessFromGame(game);
  const board = chess
    .board()
    .flat()
    .filter((piece): piece is ChessBoardPiece => piece !== null)
    .map((piece) => ({
      square: piece.square,
      color: colorFromCode(piece.color),
      kind: piece.type
    }));

  const legalMoves = game.status === "active"
    ? (chess.moves({ verbose: true }) as ChessVerboseMove[]).map((move) => ({
        from: move.from,
        to: move.to,
        san: move.san,
        uci: move.lan,
        promotion: move.promotion ?? null
      }))
    : [];

  return {
    lifeID: game.lifeId,
    status: game.status,
    result: game.result,
    playerColor: game.playerColor,
    auriColor: game.auriColor,
    turn: game.turn,
    currentTurn: game.turn === game.playerColor ? "human" : "auri",
    fen: game.fen,
    pgn: game.pgn,
    inCheck: game.inCheck,
    moveCount: game.moves.length,
    rewardPending: game.result !== null && game.rewardClaimedAt === null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    finishedAt: game.finishedAt,
    lastMoveUCI: game.lastMoveUCI,
    lastMoveSAN: game.lastMoveSAN,
    analysis: game.analysis,
    board,
    legalMoves,
    recentMoves: game.moves.slice(-12).map((move) => ({
      san: move.san,
      uci: move.uci,
      by: move.by,
      color: move.color,
      moveNumber: move.moveNumber
    }))
  };
}

function invalidRequest(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: AuriChessRequestBody;
  try {
    body = (await request.json()) as AuriChessRequestBody;
  } catch {
    return invalidRequest("Invalid JSON body.");
  }

  const action = asAction(body.action);
  const lifeId = sanitizeAuriLifeId(asString(body.lifeID, 120));
  if (!action || !lifeId) {
    return invalidRequest("Expected action and lifeID.");
  }

  try {
    switch (action) {
      case "state": {
        const game = await loadAuriChessGame(lifeId);
        if (!game) {
          return NextResponse.json({ game: null } satisfies AuriChessEnvelope);
        }

        const resolvedGame = await maybeResolveAuriTurn(game);
        await saveAuriChessGame(resolvedGame);
        return NextResponse.json({ game: serializeGame(resolvedGame) } satisfies AuriChessEnvelope);
      }

      case "start": {
        let game = buildBlankGame(lifeId, asColor(body.playerColor, "white"));
        game = await maybeResolveAuriTurn(game);
        await saveAuriChessGame(game);
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriChessEnvelope);
      }

      case "move": {
        const game = await loadAuriChessGame(lifeId);
        if (!game) {
          return invalidRequest("No chess game exists for this life.", 404);
        }
        if (game.status !== "active") {
          return invalidRequest("This chess game has already ended.", 409);
        }
        if (game.turn !== game.playerColor) {
          return invalidRequest("It is not the human player's turn.", 409);
        }

        const from = asString(body.from, 4).toLowerCase();
        const to = asString(body.to, 4).toLowerCase();
        const promotion = asString(body.promotion, 2).toLowerCase() || "q";
        if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
          return invalidRequest("Expected from/to chess squares like e2 and e4.");
        }

        const chess = chessFromGame(game);
        const moved = chess.move({ from, to, promotion });
        if (!moved) {
          return invalidRequest("Illegal chess move.", 409);
        }

        const now = new Date().toISOString();
        recordMove(game, moved, "human", now);
        syncGameSnapshot(game, chess, now, null);
        if (game.status === "active") {
          await maybeResolveAuriTurn(game);
        }

        await saveAuriChessGame(game);
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriChessEnvelope);
      }

      case "resign": {
        const game = await loadAuriChessGame(lifeId);
        if (!game) {
          return invalidRequest("No chess game exists for this life.", 404);
        }
        if (game.status !== "active") {
          return NextResponse.json({ game: serializeGame(game) } satisfies AuriChessEnvelope);
        }

        const now = new Date().toISOString();
        game.status = "resigned";
        game.result = "auri_win";
        game.finishedAt = now;
        game.updatedAt = now;
        await saveAuriChessGame(game);
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriChessEnvelope);
      }

      case "claim_reward": {
        const game = await loadAuriChessGame(lifeId);
        if (!game) {
          return invalidRequest("No chess game exists for this life.", 404);
        }
        if (game.result !== null && game.rewardClaimedAt === null) {
          game.rewardClaimedAt = new Date().toISOString();
          game.updatedAt = game.rewardClaimedAt;
          await saveAuriChessGame(game);
        }
        return NextResponse.json({ game: serializeGame(game) } satisfies AuriChessEnvelope);
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Auri chess route failed.",
        detail: error instanceof Error ? error.message.slice(0, 600) : "Unknown chess failure."
      },
      { status: 500 }
    );
  }
}
