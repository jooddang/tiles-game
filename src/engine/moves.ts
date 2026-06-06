import { createInitialGameState, createTileById } from "./board";
import { DIRECTION_RAYS, getHexPosition } from "./hexLayout";
import type { GameState, MoveResult, Tile } from "./types";

const RAY_WIDTH_UNITS = 0.46;
const RAY_EPSILON = 0.001;

export function getBlockers(
  tileId: string,
  state: Pick<GameState, "level" | "remainingTiles">,
): readonly Tile[] {
  const tileById = createTileById(state.remainingTiles);
  const tile = tileById.get(tileId);

  if (!tile) {
    return [];
  }

  const origin = getHexPosition(tile.cell);
  const ray = DIRECTION_RAYS[tile.direction];
  const rayLength = Math.hypot(ray.x, ray.y);

  return state.remainingTiles
    .filter((candidate) => candidate.id !== tile.id)
    .map((candidate) => {
      const point = getHexPosition(candidate.cell);
      const deltaX = point.x - origin.x;
      const deltaY = point.y - origin.y;
      const distanceAlongRay = deltaX * ray.x + deltaY * ray.y;
      const distanceFromRay =
        Math.abs(deltaX * ray.y - deltaY * ray.x) / rayLength;

      return { candidate, distanceAlongRay, distanceFromRay };
    })
    .filter(
      ({ distanceAlongRay, distanceFromRay }) =>
        distanceAlongRay > RAY_EPSILON && distanceFromRay <= RAY_WIDTH_UNITS,
    )
    .sort((left, right) => left.distanceAlongRay - right.distanceAlongRay)
    .map(({ candidate }) => candidate);
}

export function canRemoveTile(
  tileId: string,
  state: Pick<GameState, "level" | "remainingTiles">,
): boolean {
  const tileById = createTileById(state.remainingTiles);

  return tileById.has(tileId) && getBlockers(tileId, state).length === 0;
}

export function applyMove(tileId: string, state: GameState): MoveResult {
  const tileById = createTileById(state.remainingTiles);

  if (!tileById.has(tileId)) {
    return {
      type: "not_found",
      tileId,
      state,
      error: "tile_not_found",
    };
  }

  const blockers = getBlockers(tileId, state);
  if (blockers.length > 0) {
    return {
      type: "blocked",
      tileId,
      blockers,
      state,
    };
  }

  const nextTiles = state.remainingTiles.filter((tile) => tile.id !== tileId);
  const nextState: GameState = {
    ...state,
    remainingTiles: nextTiles,
    moveHistory: [...state.moveHistory, state.remainingTiles],
    moveCount: state.moveCount + 1,
    status: nextTiles.length === 0 ? "complete" : "playing",
  };

  return {
    type: "removed",
    tileId,
    state: nextState,
  };
}

export function undoMove(state: GameState): GameState {
  const previousTiles = state.moveHistory.at(-1);

  if (!previousTiles) {
    return state;
  }

  return {
    ...state,
    remainingTiles: previousTiles,
    moveHistory: state.moveHistory.slice(0, -1),
    moveCount: Math.max(0, state.moveCount - 1),
    status: previousTiles.length === 0 ? "complete" : "playing",
  };
}

export function restartLevel(state: GameState): GameState {
  return createInitialGameState(state.level);
}
