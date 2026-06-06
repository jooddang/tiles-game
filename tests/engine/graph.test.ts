import { describe, expect, it } from "vitest";
import {
  buildDependencyEdges,
  validateSolvableLevel,
  type LevelDefinition,
} from "../../src/engine";

describe("graph", () => {
  it("buildDependencyEdges_creates_blocker_to_blocked_edges", () => {
    const level: LevelDefinition = {
      id: "edges",
      title: "Edges",
      width: 3,
      height: 3,
      tiles: [
        { id: "left", cell: { row: 2, col: 0 }, direction: "upRight" },
        { id: "middle", cell: { row: 1, col: 1 }, direction: "upRight" },
        { id: "right", cell: { row: 1, col: 2 }, direction: "upRight" },
      ],
    };

    expect(buildDependencyEdges(level)).toEqual([
      { blockerId: "middle", blockedId: "left" },
      { blockerId: "right", blockedId: "left" },
      { blockerId: "right", blockedId: "middle" },
    ]);
  });

  it("validateSolvableLevel_accepts_acyclic_boards", () => {
    const level: LevelDefinition = {
      id: "solvable",
      title: "Solvable",
      width: 2,
      height: 2,
      tiles: [
        { id: "left", cell: { row: 1, col: 0 }, direction: "upRight" },
        { id: "right", cell: { row: 0, col: 1 }, direction: "up" },
      ],
    };

    expect(validateSolvableLevel(level)).toEqual({ ok: true });
  });

  it("validateSolvableLevel_rejects_a_two_tile_cycle", () => {
    const level: LevelDefinition = {
      id: "two-cycle",
      title: "Two Cycle",
      width: 2,
      height: 2,
      tiles: [
        { id: "left", cell: { row: 1, col: 0 }, direction: "upRight" },
        { id: "right", cell: { row: 0, col: 1 }, direction: "downLeft" },
      ],
    };

    expect(validateSolvableLevel(level)).toEqual({
      ok: false,
      issues: [
        {
          code: "unsolvable_cycle",
          message: "Level contains a directed dependency cycle.",
        },
      ],
    });
  });

  it("validateSolvableLevel_rejects_cycles_with_extra_tiles", () => {
    const level: LevelDefinition = {
      id: "large-cycle",
      title: "Large Cycle",
      width: 3,
      height: 3,
      tiles: [
        { id: "cycle-a", cell: { row: 1, col: 0 }, direction: "upRight" },
        { id: "cycle-b", cell: { row: 0, col: 1 }, direction: "downLeft" },
        { id: "extra", cell: { row: 2, col: 2 }, direction: "down" },
      ],
    };

    const validation = validateSolvableLevel(level);

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.code)).toContain(
        "unsolvable_cycle",
      );
    }
  });
});
