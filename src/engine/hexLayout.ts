import type { Cell, Direction } from "./types";

export const HEX_TILE_WIDTH_UNITS = 1.18;
export const HEX_TILE_HEIGHT_UNITS = 1;
export const HEX_STEP_X_UNITS = 0.9;
export const HEX_STEP_Y_UNITS = 0.78;
export const HEX_COLUMN_OFFSET_UNITS = HEX_STEP_Y_UNITS / 2;

export type HexPoint = {
  readonly x: number;
  readonly y: number;
};

export const DIRECTION_RAYS: Record<Direction, HexPoint> = {
  up: { x: 0, y: -1 },
  upRight: { x: HEX_STEP_X_UNITS, y: -HEX_COLUMN_OFFSET_UNITS },
  downRight: { x: HEX_STEP_X_UNITS, y: HEX_COLUMN_OFFSET_UNITS },
  down: { x: 0, y: 1 },
  downLeft: { x: -HEX_STEP_X_UNITS, y: HEX_COLUMN_OFFSET_UNITS },
  upLeft: { x: -HEX_STEP_X_UNITS, y: -HEX_COLUMN_OFFSET_UNITS },
};

export function getHexPosition(cell: Cell): HexPoint {
  return {
    x: cell.col * HEX_STEP_X_UNITS,
    y:
      cell.row * HEX_STEP_Y_UNITS +
      (cell.col % 2 === 1 ? HEX_COLUMN_OFFSET_UNITS : 0),
  };
}

export function getHexBoardSize(width: number, height: number): HexPoint {
  return {
    x: (width - 1) * HEX_STEP_X_UNITS + HEX_TILE_WIDTH_UNITS,
    y:
      (height - 1) * HEX_STEP_Y_UNITS +
      HEX_COLUMN_OFFSET_UNITS +
      HEX_TILE_HEIGHT_UNITS,
  };
}
