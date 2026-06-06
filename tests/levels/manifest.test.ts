import { describe, expect, it } from "vitest";
import { scoreDifficulty, type LevelDefinition } from "../../src/engine";
import { levelManifest, validateLevelManifest } from "../../src/levels/manifest";

describe("levelManifest", () => {
  it("validateLevelManifest_accepts_every_shipped_level", () => {
    expect(validateLevelManifest()).toEqual({ ok: true });
  });

  it("validateLevelManifest_rejects_duplicate_tile_ids", () => {
    const invalid: LevelDefinition = {
      id: "duplicate-tiles",
      title: "Duplicate Tiles",
      width: 2,
      height: 1,
      tiles: [
        { id: "same", cell: { row: 0, col: 0 }, direction: "downRight" },
        { id: "same", cell: { row: 0, col: 1 }, direction: "downRight" },
      ],
    };

    const validation = validateLevelManifest([invalid]);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.code)).toContain(
        "duplicate_tile_id",
      );
    }
  });

  it("validateLevelManifest_rejects_duplicate_occupied_cells", () => {
    const invalid: LevelDefinition = {
      id: "duplicate-cells",
      title: "Duplicate Cells",
      width: 2,
      height: 1,
      tiles: [
        { id: "a", cell: { row: 0, col: 0 }, direction: "downRight" },
        { id: "b", cell: { row: 0, col: 0 }, direction: "downRight" },
      ],
    };

    const validation = validateLevelManifest([invalid]);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.code)).toContain(
        "duplicate_tile_cell",
      );
    }
  });

  it("validateLevelManifest_rejects_invalid_directions", () => {
    const invalid = {
      id: "invalid-direction",
      title: "Invalid Direction",
      width: 1,
      height: 1,
      tiles: [{ id: "a", cell: { row: 0, col: 0 }, direction: "diagonal" }],
    } as unknown as LevelDefinition;

    const validation = validateLevelManifest([invalid]);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.code)).toContain(
        "invalid_direction",
      );
    }
  });

  it("validateLevelManifest_rejects_unsolvable_cycles", () => {
    const invalid: LevelDefinition = {
      id: "cycle",
      title: "Cycle",
      width: 2,
      height: 2,
      tiles: [
        { id: "left", cell: { row: 1, col: 0 }, direction: "upRight" },
        { id: "right", cell: { row: 0, col: 1 }, direction: "downLeft" },
      ],
    };

    const validation = validateLevelManifest([invalid]);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.code)).toContain(
        "unsolvable_cycle",
      );
    }
  });

  it("hex_tower_has_dense_reference_map_scale", () => {
    const metrics = scoreDifficulty(levelManifest[0]);

    expect(levelManifest[0].title).toBe("Hex Tower");
    expect(metrics.tileCount).toBe(270);
    expect(metrics.initialRemovableCount).toBeGreaterThan(0);
    expect(metrics.initialRemovableCount).toBeLessThanOrEqual(40);
    expect(metrics.blockerDensity).toBeGreaterThanOrEqual(6);
    expect(findLongestSameDirectionRun(levelManifest[0])).toBeLessThanOrEqual(4);
  });

  it("exports_ordered_levels_for_mvp_progression", () => {
    expect(levelManifest.map((level) => level.id)).toEqual([
      "reference-hex-tower-1",
      "reference-hex-tower-2",
    ]);
  });
});

function findLongestSameDirectionRun(level: LevelDefinition): number {
  const axes: readonly (readonly [rowDelta: number, colDelta: number])[] = [
    [1, 0],
    [0, 1],
    [1, -1],
    [1, 1],
  ];
  const directionByCell = new Map(
    level.tiles.map((tile) => [`${tile.cell.row}:${tile.cell.col}`, tile.direction]),
  );
  let longestRun = 1;

  for (const [rowDelta, colDelta] of axes) {
    for (let row = 0; row < level.height; row += 1) {
      for (let col = 0; col < level.width; col += 1) {
        const previousRow = row - rowDelta;
        const previousCol = col - colDelta;
        if (
          previousRow >= 0 &&
          previousRow < level.height &&
          previousCol >= 0 &&
          previousCol < level.width
        ) {
          continue;
        }

        let cursorRow = row;
        let cursorCol = col;
        let previousDirection: string | undefined;
        let currentRun = 0;

        while (
          cursorRow >= 0 &&
          cursorRow < level.height &&
          cursorCol >= 0 &&
          cursorCol < level.width
        ) {
          const direction = directionByCell.get(`${cursorRow}:${cursorCol}`);
          if (direction === previousDirection) {
            currentRun += 1;
          } else {
            longestRun = Math.max(longestRun, currentRun);
            previousDirection = direction;
            currentRun = direction ? 1 : 0;
          }

          cursorRow += rowDelta;
          cursorCol += colDelta;
        }

        longestRun = Math.max(longestRun, currentRun);
      }
    }
  }

  return longestRun;
}
