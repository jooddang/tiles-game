import { describe, expect, it } from "vitest";
import { validateLevelShape, type LevelDefinition } from "../../src/engine";

describe("board", () => {
  it("validateLevelShape_rejects_duplicate_ids_duplicate_cells_and_bounds_errors", () => {
    const level: LevelDefinition = {
      id: "invalid",
      title: "Invalid",
      width: 2,
      height: 2,
      tiles: [
        { id: "same", cell: { row: 0, col: 0 }, direction: "downRight" },
        { id: "same", cell: { row: 0, col: 0 }, direction: "down" },
        { id: "outside", cell: { row: 9, col: 9 }, direction: "upLeft" },
        {
          id: "bad-direction",
          cell: { row: 1, col: 1 },
          direction: "north-east",
        },
      ],
    } as unknown as LevelDefinition;

    const validation = validateLevelShape(level);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.code)).toEqual([
        "duplicate_tile_id",
        "duplicate_tile_cell",
        "tile_out_of_bounds",
        "invalid_direction",
      ]);
    }
  });
});
