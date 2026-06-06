import { buildDependencyEdges } from "./graph";
import { createInitialGameState } from "./board";
import { applyMove, canRemoveTile } from "./moves";
import type { DependencyEdge, GameState, LevelDefinition } from "./types";

export type DifficultyMetrics = {
  readonly tileCount: number;
  readonly edgeCount: number;
  readonly dependencyDepth: number;
  readonly initialRemovableCount: number;
  readonly medianAvailabilityRatio: number;
  readonly blockerDensity: number;
  readonly visualComplexity: number;
};

export function scoreDifficulty(level: LevelDefinition): DifficultyMetrics {
  const edges = buildDependencyEdges(level);
  const availabilityRatios = simulateAvailabilityRatios(createInitialGameState(level));
  const tileCount = level.tiles.length;

  return {
    tileCount,
    edgeCount: edges.length,
    dependencyDepth: findLongestDependencyPath(level, edges),
    initialRemovableCount: countRemovableTiles(createInitialGameState(level)),
    medianAvailabilityRatio: median(availabilityRatios),
    blockerDensity: tileCount === 0 ? 0 : edges.length / tileCount,
    visualComplexity: estimateVisualComplexity(level),
  };
}

export function countRemovableTiles(state: GameState): number {
  return state.remainingTiles.filter((tile) => canRemoveTile(tile.id, state)).length;
}

function simulateAvailabilityRatios(initialState: GameState): readonly number[] {
  const ratios: number[] = [];
  let state = initialState;

  while (state.remainingTiles.length > 0) {
    const removableTiles = state.remainingTiles.filter((tile) =>
      canRemoveTile(tile.id, state),
    );

    ratios.push(removableTiles.length / state.remainingTiles.length);

    const nextTile = removableTiles[0];
    if (!nextTile) {
      break;
    }

    const move = applyMove(nextTile.id, state);
    if (move.type !== "removed") {
      break;
    }
    state = move.state;
  }

  return ratios;
}

function findLongestDependencyPath(
  level: LevelDefinition,
  edges: readonly DependencyEdge[],
): number {
  const outgoingByTile = new Map<string, string[]>();
  const memo = new Map<string, number>();

  for (const tile of level.tiles) {
    outgoingByTile.set(tile.id, []);
  }

  for (const edge of edges) {
    outgoingByTile.get(edge.blockerId)?.push(edge.blockedId);
  }

  function visit(tileId: string): number {
    const cached = memo.get(tileId);
    if (cached !== undefined) {
      return cached;
    }

    const childDepths = (outgoingByTile.get(tileId) ?? []).map((blockedId) =>
      visit(blockedId),
    );
    const depth = childDepths.length === 0 ? 1 : 1 + Math.max(...childDepths);
    memo.set(tileId, depth);
    return depth;
  }

  return level.tiles.length === 0
    ? 0
    : Math.max(...level.tiles.map((tile) => visit(tile.id)));
}

function estimateVisualComplexity(level: LevelDefinition): number {
  const directionCount = new Set(level.tiles.map((tile) => tile.direction)).size;
  const colorCount = new Set(level.tiles.map((tile) => tile.color ?? "")).size;
  const directionComplexity = directionCount / 6;
  const colorComplexity = Math.min(colorCount / 9, 1);

  return Number(((directionComplexity + colorComplexity) / 2).toFixed(3));
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return Number(sorted[middle].toFixed(3));
  }

  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}
