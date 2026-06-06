import { describe, expect, it } from "vitest";
import {
  applyMove,
  canRemoveTile,
  createInitialGameState,
  getBlockers,
  restartLevel,
  undoMove,
  type LevelDefinition,
} from "../../src/engine";

const level: LevelDefinition = {
  id: "ray-test",
  title: "Ray Test",
  width: 3,
  height: 3,
  tiles: [
    { id: "source", cell: { row: 2, col: 0 }, direction: "upRight" },
    { id: "front", cell: { row: 1, col: 1 }, direction: "up" },
    { id: "far", cell: { row: 1, col: 2 }, direction: "up" },
    { id: "free", cell: { row: 0, col: 1 }, direction: "up" },
  ],
};

describe("moves", () => {
  it("getBlockers_returns_visible_blockers_ahead_of_the_arrow", () => {
    const state = createInitialGameState(level);

    expect(getBlockers("source", state).map((tile) => tile.id)).toEqual([
      "front",
      "far",
    ]);
    expect(getBlockers("front", state).map((tile) => tile.id)).toEqual(["free"]);
  });

  it("canRemoveTile_returns_true_when_the_exit_ray_is_empty", () => {
    const state = createInitialGameState(level);

    expect(canRemoveTile("free", state)).toBe(true);
  });

  it("canRemoveTile_returns_false_when_the_exit_ray_is_blocked", () => {
    const state = createInitialGameState(level);

    expect(canRemoveTile("source", state)).toBe(false);
  });

  it("applyMove_removes_a_legal_tile_and_preserves_other_tiles", () => {
    const state = createInitialGameState(level);
    const move = applyMove("free", state);

    expect(move.type).toBe("removed");
    if (move.type !== "removed") {
      throw new Error("Expected free tile to be removed.");
    }
    expect(move.state.remainingTiles.map((tile) => tile.id)).toEqual([
      "source",
      "front",
      "far",
    ]);
    expect(move.state.moveCount).toBe(1);
    expect(move.state.status).toBe("playing");
  });

  it("applyMove_preserves_state_for_blocked_moves", () => {
    const state = createInitialGameState(level);
    const move = applyMove("source", state);

    expect(move.type).toBe("blocked");
    if (move.type !== "blocked") {
      throw new Error("Expected source tile to be blocked.");
    }
    expect(move.blockers.map((tile) => tile.id)).toEqual(["front", "far"]);
    expect(move.state).toBe(state);
  });

  it("applyMove_returns_a_named_error_for_unknown_tile_ids", () => {
    const state = createInitialGameState(level);
    const move = applyMove("missing", state);

    expect(move).toEqual({
      type: "not_found",
      tileId: "missing",
      state,
      error: "tile_not_found",
    });
  });

  it("undoMove_restores_the_exact_prior_board_state", () => {
    const state = createInitialGameState(level);
    const move = applyMove("free", state);

    if (move.type !== "removed") {
      throw new Error("Expected free tile to be removed.");
    }

    expect(undoMove(move.state)).toEqual(state);
  });

  it("restartLevel_restores_the_original_level_state", () => {
    const state = createInitialGameState(level);
    const move = applyMove("free", state);

    if (move.type !== "removed") {
      throw new Error("Expected free tile to be removed.");
    }

    expect(restartLevel(move.state)).toEqual(state);
  });

  it("applyMove_marks_the_level_complete_after_the_last_tile_is_removed", () => {
    const singleTileLevel: LevelDefinition = {
      id: "single",
      title: "Single",
      width: 1,
      height: 1,
      tiles: [{ id: "only", cell: { row: 0, col: 0 }, direction: "downRight" }],
    };
    const move = applyMove("only", createInitialGameState(singleTileLevel));

    expect(move.type).toBe("removed");
    if (move.type !== "removed") {
      throw new Error("Expected only tile to be removed.");
    }
    expect(move.state.status).toBe("complete");
    expect(move.state.remainingTiles).toHaveLength(0);
  });
});
