import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type StockfishEngine = {
  listener?: (line: string) => void;
  sendCommand(command: string): void;
  terminate?: () => void;
  ccall?(name: string, returnType: string | null, argTypes: string[], args: unknown[], options?: unknown): void;
  _isReady?: () => boolean;
};

type StockfishBootstrap = (options?: {
  locateFile?: (path: string) => string;
}) => Promise<StockfishEngine>;

type StockfishModuleFactory = () => StockfishBootstrap;

export type AuriChessEngineResult = {
  depth: number | null;
  scoreCp: number | null;
  mate: number | null;
  bestMove: string;
  ponder: string | null;
};

const initStockfishModule = require("../../../../vendor/stockfish/bin/stockfish-18-lite-single.js") as StockfishModuleFactory;
const STOCKFISH_WASM_PATH = path.join(
  process.cwd(),
  "vendor",
  "stockfish",
  "bin",
  "stockfish-18-lite-single.wasm"
);

const DEFAULT_MOVE_TIME_MS = 450;
const DEFAULT_ENGINE_ELO = 1050;

function cleanupEngine(engine: StockfishEngine | null): void {
  if (!engine) {
    return;
  }

  try {
    engine.terminate?.();
  } catch {
    return;
  }
}

export async function searchBestMoveForFen(
  fen: string,
  options?: {
    moveTimeMs?: number;
    targetElo?: number;
  }
): Promise<AuriChessEngineResult> {
  const trimmedFen = fen.trim();
  if (!trimmedFen) {
    throw new Error("Missing FEN for engine search.");
  }

  const moveTimeMs = Math.max(80, Math.min(5_000, Math.round(options?.moveTimeMs ?? DEFAULT_MOVE_TIME_MS)));
  const targetElo = Math.max(800, Math.min(3190, Math.round(options?.targetElo ?? DEFAULT_ENGINE_ELO)));
  const originalFetch = globalThis.fetch;
  const engine = await initStockfishModule()({
    locateFile(filePath) {
      if (filePath.endsWith(".wasm")) {
        return STOCKFISH_WASM_PATH;
      }
      return filePath;
    }
  });
  globalThis.fetch = originalFetch;

  if (typeof engine._isReady === "function") {
    while (!engine._isReady()) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    delete engine._isReady;
  }

  engine.sendCommand = (command: string) => {
    setImmediate(() => {
      engine.ccall?.("command", null, ["string"], [command], { async: /^go\b/.test(command) });
    });
  };

  return await new Promise<AuriChessEngineResult>((resolve, reject) => {
    let resolved = false;
    let lastDepth: number | null = null;
    let lastScoreCp: number | null = null;
    let lastMate: number | null = null;

    const finish = (result: AuriChessEngineResult | null, error?: Error) => {
      if (resolved) {
        return;
      }
      resolved = true;
      globalThis.fetch = originalFetch;
      cleanupEngine(engine);
      if (result) {
        resolve(result);
      } else {
        reject(error ?? new Error("Stockfish search failed."));
      }
    };

    const timeout = setTimeout(() => {
      finish(null, new Error("Stockfish timed out while searching for a move."));
    }, moveTimeMs + 10_000);

    engine.listener = (rawLine) => {
      const line = String(rawLine || "").trim();
      if (!line) {
        return;
      }

      if (line === "uciok") {
        engine.sendCommand("setoption name UCI_LimitStrength value true");
        engine.sendCommand(`setoption name UCI_Elo value ${targetElo}`);
        engine.sendCommand("setoption name Threads value 1");
        engine.sendCommand("setoption name Hash value 16");
        engine.sendCommand("isready");
        return;
      }

      if (line === "readyok") {
        engine.sendCommand("ucinewgame");
        engine.sendCommand(`position fen ${trimmedFen}`);
        engine.sendCommand(`go movetime ${moveTimeMs}`);
        return;
      }

      if (line.startsWith("info ")) {
        const depthMatch = line.match(/\bdepth\s+(\d+)/);
        if (depthMatch?.[1]) {
          lastDepth = Number(depthMatch[1]);
        }

        const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
        if (mateMatch?.[1]) {
          lastMate = Number(mateMatch[1]);
          lastScoreCp = null;
        } else {
          const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
          if (cpMatch?.[1]) {
            lastScoreCp = Number(cpMatch[1]);
            lastMate = null;
          }
        }
        return;
      }

      if (line.startsWith("bestmove ")) {
        clearTimeout(timeout);
        const bestMoveMatch = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
        const bestMove = bestMoveMatch?.[1];
        if (!bestMove || bestMove === "(none)") {
          finish(null, new Error("Stockfish did not return a legal best move."));
          return;
        }

        finish({
          depth: lastDepth,
          scoreCp: lastScoreCp,
          mate: lastMate,
          bestMove,
          ponder: bestMoveMatch?.[2] ?? null
        });
      }
    };

    try {
      engine.sendCommand("uci");
    } catch (error) {
      clearTimeout(timeout);
      finish(null, error instanceof Error ? error : new Error("Failed to initialize Stockfish."));
    }
  });
}
