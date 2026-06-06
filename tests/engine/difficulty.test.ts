import { describe, expect, it } from "vitest";
import { scoreDifficulty, type LevelDefinition } from "../../src/engine";

describe("difficulty", () => {
  it("scoreDifficulty_computes_metrics_for_a_known_small_board", () => {
    const level: LevelDefinition = {
      id: "metrics",
      title: "Metrics",
      width: 3,
      height: 3,
      tiles: [
        { id: "left", cell: { row: 2, col: 0 }, direction: "upRight", color: "green" },
        { id: "middle", cell: { row: 1, col: 1 }, direction: "upRight", color: "red" },
        { id: "right", cell: { row: 1, col: 2 }, direction: "upRight", color: "yellow" },
      ],
    };

    expect(scoreDifficulty(level)).toMatchObject({
      tileCount: 3,
      edgeCount: 3,
      dependencyDepth: 3,
      initialRemovableCount: 1,
      medianAvailabilityRatio: 0.5,
      blockerDensity: 1,
    });
  });
});
