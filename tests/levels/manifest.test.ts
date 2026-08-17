import { describe, expect, it } from "vitest";
import { scoreDifficulty, type LevelDefinition } from "../../src/engine";
import { levelManifest, validateLevelManifest } from "../../src/levels/manifest";
import { levelVersionId } from "../../src/leaderboard/replayContract";

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

  it("full_hex_tower_has_dense_reference_map_scale", () => {
    const metrics = scoreDifficulty(levelManifest[8]);

    expect(levelManifest[8].title).toBe("Hex Tower");
    expect(metrics.tileCount).toBe(270);
    expect(metrics.initialRemovableCount).toBeGreaterThan(0);
    expect(metrics.initialRemovableCount).toBeLessThanOrEqual(40);
    expect(metrics.blockerDensity).toBeGreaterThanOrEqual(6);
    expect(findLongestSameDirectionRun(levelManifest[8])).toBeLessThanOrEqual(4);
  });

  it("exports_ten_ordered_levels_with_increasing_length", () => {
    expect(levelManifest.map((level) => level.id)).toEqual([
      "reference-hex-tower-stage-1",
      "reference-hex-tower-stage-2",
      "reference-hex-tower-stage-3",
      "reference-hex-tower-stage-4",
      "reference-hex-tower-stage-5",
      "reference-hex-tower-stage-6",
      "reference-hex-tower-stage-7",
      "reference-hex-tower-stage-8",
      "reference-hex-tower-1",
      "reference-hex-tower-2",
    ]);
    expect(levelManifest.map(({ width, height, tiles }) => ({
      width,
      height,
      tileCount: tiles.length,
    }))).toEqual([
      { width: 9, height: 8, tileCount: 72 },
      { width: 9, height: 11, tileCount: 99 },
      { width: 9, height: 14, tileCount: 126 },
      { width: 9, height: 17, tileCount: 153 },
      { width: 9, height: 20, tileCount: 180 },
      { width: 9, height: 23, tileCount: 207 },
      { width: 9, height: 26, tileCount: 234 },
      { width: 9, height: 28, tileCount: 252 },
      { width: 9, height: 30, tileCount: 270 },
      { width: 9, height: 30, tileCount: 270 },
    ]);
    for (const level of levelManifest) {
      expect(new Set(level.tiles.map((tile) => tile.id)).size).toBe(level.tiles.length);
    }
  });

  it("preserves_the_legacy_full_board_version_hashes", async () => {
    expect(levelManifest[8]).toMatchObject({
      id: "reference-hex-tower-1",
      title: "Hex Tower",
      width: 9,
      height: 30,
    });
    expect(levelManifest[8].tiles).toHaveLength(270);
    expect(await levelVersionId(levelManifest[8])).toBe(
      "sha256:d3f9f30c607ee8a93522025eee2c4c546052cfac9f4d10755db833f47e3abb33",
    );
    expect(levelManifest[9]).toMatchObject({
      id: "reference-hex-tower-2",
      title: "Hex Tower II",
      width: 9,
      height: 30,
    });
    expect(levelManifest[9].tiles).toHaveLength(270);
    expect(await levelVersionId(levelManifest[9])).toBe(
      "sha256:a42bcaebd0dda403614577c8f3d77941ff9fde34076246e471b30616f0dfce9a",
    );
  });

  it("assigns_a_distinct_version_hash_to_every_stage", async () => {
    const versionIds = await Promise.all(
      levelManifest.map((level) => levelVersionId(level)),
    );

    expect(versionIds).toHaveLength(10);
    expect(new Set(versionIds).size).toBe(10);
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
