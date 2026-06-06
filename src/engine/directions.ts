import type { Cell, Direction } from "./types";

export const DIRECTION_VECTORS: Record<
  Direction,
  Readonly<{ rowDelta: number; colDelta: number }>
> = {
  up: { rowDelta: -1, colDelta: 0 },
  upRight: { rowDelta: -1, colDelta: 1 },
  downRight: { rowDelta: 0, colDelta: 1 },
  down: { rowDelta: 1, colDelta: 0 },
  downLeft: { rowDelta: 1, colDelta: -1 },
  upLeft: { rowDelta: 0, colDelta: -1 },
};

export function isDirection(value: string): value is Direction {
  return value in DIRECTION_VECTORS;
}

export function stepCell(cell: Cell, direction: Direction): Cell {
  const vector = DIRECTION_VECTORS[direction];

  return {
    row: cell.row + vector.rowDelta,
    col: cell.col + vector.colDelta,
  };
}

export function cellKey(cell: Cell): string {
  return `${cell.row}:${cell.col}`;
}
