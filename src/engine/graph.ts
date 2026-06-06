import { validateLevelShape } from "./board";
import { getBlockers } from "./moves";
import type { DependencyEdge, LevelDefinition, ValidationResult } from "./types";

export function buildDependencyEdges(level: LevelDefinition): readonly DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  for (const tile of level.tiles) {
    const blockers = getBlockers(tile.id, {
      level,
      remainingTiles: level.tiles,
    });

    for (const blocker of blockers) {
      edges.push({
        blockerId: blocker.id,
        blockedId: tile.id,
      });
    }
  }

  return edges;
}

export function validateSolvableLevel(level: LevelDefinition): ValidationResult {
  const shapeValidation = validateLevelShape(level);
  if (!shapeValidation.ok) {
    return shapeValidation;
  }

  const tileIds = new Set(level.tiles.map((tile) => tile.id));
  const outgoingByTile = new Map<string, string[]>();
  const indegreeByTile = new Map<string, number>();

  for (const tileId of tileIds) {
    outgoingByTile.set(tileId, []);
    indegreeByTile.set(tileId, 0);
  }

  for (const edge of buildDependencyEdges(level)) {
    outgoingByTile.get(edge.blockerId)?.push(edge.blockedId);
    indegreeByTile.set(edge.blockedId, (indegreeByTile.get(edge.blockedId) ?? 0) + 1);
  }

  const queue = [...indegreeByTile.entries()]
    .filter(([, indegree]) => indegree === 0)
    .map(([tileId]) => tileId);
  let visitedCount = 0;

  while (queue.length > 0) {
    const tileId = queue.shift();
    if (!tileId) {
      continue;
    }

    visitedCount += 1;

    for (const blockedId of outgoingByTile.get(tileId) ?? []) {
      const nextIndegree = (indegreeByTile.get(blockedId) ?? 0) - 1;
      indegreeByTile.set(blockedId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(blockedId);
      }
    }
  }

  if (visitedCount !== tileIds.size) {
    return {
      ok: false,
      issues: [
        {
          code: "unsolvable_cycle",
          message: "Level contains a directed dependency cycle.",
        },
      ],
    };
  }

  return { ok: true };
}
