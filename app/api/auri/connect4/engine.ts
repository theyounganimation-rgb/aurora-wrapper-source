const ROWS = 6;
const COLUMNS = 7;
const HUMAN = 1;
const AURI = 2;
const WIN_SCORE = 100_000;
const SEARCH_DEPTH = 4;
const MOVE_ORDER = [3, 2, 4, 1, 5, 0, 6] as const;

export type AuriConnect4SearchResult = {
  column: number;
  score: number;
};

type WinnerInfo = {
  winner: 1 | 2 | null;
  cellIndices: number[];
};

function indexFor(row: number, column: number): number {
  return row * COLUMNS + column;
}

function legalColumns(cells: readonly number[]): number[] {
  return MOVE_ORDER.filter((column) => cells[indexFor(0, column)] === 0);
}

function cloneCells(cells: readonly number[]): number[] {
  return cells.slice(0, ROWS * COLUMNS);
}

function dropIntoColumn(cells: number[], column: number, player: 1 | 2): number | null {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    const cellIndex = indexFor(row, column);
    if (cells[cellIndex] === 0) {
      cells[cellIndex] = player;
      return row;
    }
  }
  return null;
}

function cellCount(cells: readonly number[]): number {
  return cells.reduce((count, value) => count + (value === 0 ? 0 : 1), 0);
}

function detectWinner(cells: readonly number[]): WinnerInfo {
  const directions: Array<[rowStep: number, colStep: number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1]
  ];

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const player = cells[indexFor(row, column)];
      if (player !== HUMAN && player !== AURI) {
        continue;
      }

      for (const [rowStep, colStep] of directions) {
        const cellIndices = [indexFor(row, column)];
        let valid = true;
        for (let offset = 1; offset < 4; offset += 1) {
          const nextRow = row + (rowStep * offset);
          const nextColumn = column + (colStep * offset);
          if (nextRow < 0 || nextRow >= ROWS || nextColumn < 0 || nextColumn >= COLUMNS) {
            valid = false;
            break;
          }
          const nextIndex = indexFor(nextRow, nextColumn);
          if (cells[nextIndex] !== player) {
            valid = false;
            break;
          }
          cellIndices.push(nextIndex);
        }

        if (valid) {
          return { winner: player, cellIndices };
        }
      }
    }
  }

  return { winner: null, cellIndices: [] };
}

function evaluateWindow(window: readonly number[]): number {
  const auriCount = window.filter((value) => value === AURI).length;
  const humanCount = window.filter((value) => value === HUMAN).length;
  const emptyCount = 4 - auriCount - humanCount;

  if (auriCount > 0 && humanCount > 0) {
    return 0;
  }

  if (auriCount === 4) {
    return WIN_SCORE;
  }
  if (humanCount === 4) {
    return -WIN_SCORE;
  }

  if (auriCount === 3 && emptyCount === 1) {
    return 90;
  }
  if (auriCount === 2 && emptyCount === 2) {
    return 18;
  }
  if (auriCount === 1 && emptyCount === 3) {
    return 3;
  }

  if (humanCount === 3 && emptyCount === 1) {
    return -110;
  }
  if (humanCount === 2 && emptyCount === 2) {
    return -22;
  }
  if (humanCount === 1 && emptyCount === 3) {
    return -3;
  }

  return 0;
}

function evaluateBoard(cells: readonly number[]): number {
  const winner = detectWinner(cells);
  if (winner.winner === AURI) {
    return WIN_SCORE;
  }
  if (winner.winner === HUMAN) {
    return -WIN_SCORE;
  }

  let score = 0;

  for (let row = 0; row < ROWS; row += 1) {
    const centerCell = cells[indexFor(row, 3)];
    if (centerCell === AURI) {
      score += 8;
    } else if (centerCell === HUMAN) {
      score -= 8;
    }
  }

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column <= COLUMNS - 4; column += 1) {
      score += evaluateWindow([
        cells[indexFor(row, column)],
        cells[indexFor(row, column + 1)],
        cells[indexFor(row, column + 2)],
        cells[indexFor(row, column + 3)]
      ]);
    }
  }

  for (let row = 0; row <= ROWS - 4; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      score += evaluateWindow([
        cells[indexFor(row, column)],
        cells[indexFor(row + 1, column)],
        cells[indexFor(row + 2, column)],
        cells[indexFor(row + 3, column)]
      ]);
    }
  }

  for (let row = 0; row <= ROWS - 4; row += 1) {
    for (let column = 0; column <= COLUMNS - 4; column += 1) {
      score += evaluateWindow([
        cells[indexFor(row, column)],
        cells[indexFor(row + 1, column + 1)],
        cells[indexFor(row + 2, column + 2)],
        cells[indexFor(row + 3, column + 3)]
      ]);
    }
  }

  for (let row = 3; row < ROWS; row += 1) {
    for (let column = 0; column <= COLUMNS - 4; column += 1) {
      score += evaluateWindow([
        cells[indexFor(row, column)],
        cells[indexFor(row - 1, column + 1)],
        cells[indexFor(row - 2, column + 2)],
        cells[indexFor(row - 3, column + 3)]
      ]);
    }
  }

  return score;
}

function minimax(
  cells: readonly number[],
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): AuriConnect4SearchResult {
  const winner = detectWinner(cells);
  const legal = legalColumns(cells);
  if (winner.winner === AURI) {
    return { column: legal[0] ?? 3, score: WIN_SCORE + depth };
  }
  if (winner.winner === HUMAN) {
    return { column: legal[0] ?? 3, score: -WIN_SCORE - depth };
  }
  if (legal.length === 0) {
    return { column: 3, score: 0 };
  }
  if (depth <= 0) {
    return { column: legal[0] ?? 3, score: evaluateBoard(cells) };
  }

  if (maximizing) {
    let bestColumn = legal[0] ?? 3;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const column of legal) {
      const next = cloneCells(cells);
      dropIntoColumn(next, column, AURI);
      const child = minimax(next, depth - 1, alpha, beta, false);
      if (child.score > bestScore) {
        bestScore = child.score;
        bestColumn = column;
      }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) {
        break;
      }
    }
    return { column: bestColumn, score: bestScore };
  }

  let bestColumn = legal[0] ?? 3;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const column of legal) {
    const next = cloneCells(cells);
    dropIntoColumn(next, column, HUMAN);
    const child = minimax(next, depth - 1, alpha, beta, true);
    if (child.score < bestScore) {
      bestScore = child.score;
      bestColumn = column;
    }
    beta = Math.min(beta, bestScore);
    if (beta <= alpha) {
      break;
    }
  }
  return { column: bestColumn, score: bestScore };
}

export function chooseAuriConnect4Column(cells: readonly number[]): AuriConnect4SearchResult {
  const legal = legalColumns(cells);
  if (legal.length === 0) {
    return { column: 3, score: 0 };
  }

  for (const column of legal) {
    const next = cloneCells(cells);
    dropIntoColumn(next, column, AURI);
    if (detectWinner(next).winner === AURI) {
      return { column, score: WIN_SCORE };
    }
  }

  const blockingColumns: number[] = [];
  for (const column of legal) {
    const next = cloneCells(cells);
    dropIntoColumn(next, column, HUMAN);
    if (detectWinner(next).winner === HUMAN) {
      blockingColumns.push(column);
    }
  }

  if (blockingColumns.length === 1) {
    return { column: blockingColumns[0]!, score: WIN_SCORE / 2 };
  }
  if (blockingColumns.length > 1) {
    const centeredBlock = blockingColumns.sort((left, right) => Math.abs(left - 3) - Math.abs(right - 3))[0];
    return { column: centeredBlock!, score: WIN_SCORE / 3 };
  }

  return minimax(cells, SEARCH_DEPTH, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true);
}

export function detectAuriConnect4Winner(cells: readonly number[]): WinnerInfo {
  return detectWinner(cells);
}

export function dropAuriConnect4Disc(cells: number[], column: number, player: 1 | 2): number | null {
  return dropIntoColumn(cells, column, player);
}

export function legalAuriConnect4Columns(cells: readonly number[]): number[] {
  return legalColumns(cells);
}

export function occupiedAuriConnect4Cells(cells: readonly number[]): number {
  return cellCount(cells);
}

