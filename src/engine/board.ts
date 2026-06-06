import { cellKey, isDirection } from "./directions";
import type {
  GameState,
  LevelDefinition,
  Tile,
  ValidationError,
  ValidationResult,
} from "./types";

export function isCellInBounds(
  cell: Tile["cell"],
  level: Pick<LevelDefinition, "width" | "height">,
): boolean {
  return (
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.col >= 0 &&
    cell.row < level.height &&
    cell.col < level.width
  );
}

export function createTileByCell(tiles: readonly Tile[]): Map<string, Tile> {
  return new Map(tiles.map((tile) => [cellKey(tile.cell), tile]));
}

export function createTileById(tiles: readonly Tile[]): Map<string, Tile> {
  return new Map(tiles.map((tile) => [tile.id, tile]));
}

export function createInitialGameState(level: LevelDefinition): GameState {
  return {
    level,
    remainingTiles: level.tiles,
    moveHistory: [],
    moveCount: 0,
    status: level.tiles.length === 0 ? "complete" : "playing",
  };
}

export function validateLevelShape(level: LevelDefinition): ValidationResult {
  const issues: ValidationError[] = [];

  if (level.width <= 0 || level.height <= 0) {
    issues.push({
      code: "invalid_dimensions",
      message: "Level dimensions must be greater than zero.",
    });
  }

  if (level.tiles.length === 0) {
    issues.push({
      code: "empty_board",
      message: "Level must contain at least one tile.",
    });
  }

  const seenIds = new Set<string>();
  const seenCells = new Set<string>();

  for (const tile of level.tiles) {
    if (seenIds.has(tile.id)) {
      issues.push({
        code: "duplicate_tile_id",
        message: `Tile id '${tile.id}' is duplicated.`,
        tileId: tile.id,
      });
    }
    seenIds.add(tile.id);

    const key = cellKey(tile.cell);
    if (seenCells.has(key)) {
      issues.push({
        code: "duplicate_tile_cell",
        message: `Cell '${key}' contains more than one tile.`,
        tileId: tile.id,
      });
    }
    seenCells.add(key);

    if (!isCellInBounds(tile.cell, level)) {
      issues.push({
        code: "tile_out_of_bounds",
        message: `Tile '${tile.id}' is outside the board.`,
        tileId: tile.id,
      });
    }

    if (!isDirection(String(tile.direction))) {
      issues.push({
        code: "invalid_direction",
        message: `Tile '${tile.id}' has an invalid direction.`,
        tileId: tile.id,
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
