import { cellKey, DIRECTION_VECTORS } from "./directions";
import { isCellInBounds } from "./board";
import { scoreDifficulty, type DifficultyMetrics } from "./difficulty";
import { validateSolvableLevel } from "./graph";
import type { Cell, Direction, LevelDefinition, Tile } from "./types";

export type DifficultyTier = "tutorial" | "easy" | "medium" | "hard";

export type GeneratorTarget = {
  readonly seed: string;
  readonly width: number;
  readonly height: number;
  readonly tileCount: number;
  readonly tier: DifficultyTier;
  readonly maxAttempts?: number;
  readonly constraints?: Partial<{
    readonly minInitialRemovableCount: number;
    readonly maxInitialRemovableCount: number;
    readonly minDependencyDepth: number;
    readonly maxDependencyDepth: number;
  }>;
};

export type GeneratorResult =
  | {
      readonly ok: true;
      readonly level: LevelDefinition;
      readonly metrics: DifficultyMetrics;
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly seed: string;
      readonly attempts: number;
      readonly rejectionReason: string;
      readonly lastMetrics?: DifficultyMetrics;
    };

const DIRECTIONS = Object.keys(DIRECTION_VECTORS) as Direction[];
const COLORS = ["blue", "red", "orange", "yellow", "green", "purple"] as const;

export function generateCandidateLevel(target: GeneratorTarget): GeneratorResult {
  const maxAttempts = target.maxAttempts ?? 50;

  if (target.width <= 0 || target.height <= 0) {
    return fail(target, 0, "dimensions must be greater than zero");
  }

  if (target.tileCount > target.width * target.height) {
    return fail(target, 0, "tileCount exceeds available cells");
  }

  let lastMetrics: DifficultyMetrics | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const random = createSeededRandom(`${target.seed}:${attempt}`);
    const level = buildReverseConstructedLevel(target, random);
    const validation = validateSolvableLevel(level);

    if (!validation.ok) {
      continue;
    }

    const metrics = scoreDifficulty(level);
    lastMetrics = metrics;

    if (!metricsSatisfyTarget(metrics, target)) {
      continue;
    }

    return { ok: true, level, metrics, attempts: attempt };
  }

  return fail(
    target,
    maxAttempts,
    "no candidate satisfied target constraints",
    lastMetrics,
  );
}

function buildReverseConstructedLevel(
  target: GeneratorTarget,
  random: () => number,
): LevelDefinition {
  const placedTiles: Tile[] = [];
  const occupiedCells = new Set<string>();

  while (placedTiles.length < target.tileCount) {
    const candidates = getInsertionCandidates(target, occupiedCells);

    if (candidates.length === 0) {
      break;
    }

    const choice = candidates[Math.floor(random() * candidates.length)];
    const tileIndex = placedTiles.length;

    placedTiles.push({
      id: `${target.tier}-${tileIndex + 1}`,
      cell: choice.cell,
      direction: choice.direction,
      color: COLORS[tileIndex % COLORS.length],
    });
    occupiedCells.add(cellKey(choice.cell));
  }

  return {
    id: `generated-${target.tier}-${slugSeed(target.seed)}`,
    title: `Generated ${target.tier}`,
    width: target.width,
    height: target.height,
    tiles: placedTiles,
  };
}

function getInsertionCandidates(
  target: Pick<GeneratorTarget, "width" | "height">,
  occupiedCells: ReadonlySet<string>,
): readonly { readonly cell: Cell; readonly direction: Direction }[] {
  const candidates: { cell: Cell; direction: Direction }[] = [];

  for (let row = 0; row < target.height; row += 1) {
    for (let col = 0; col < target.width; col += 1) {
      const cell = { row, col };
      if (occupiedCells.has(cellKey(cell))) {
        continue;
      }

      for (const direction of DIRECTIONS) {
        if (rayIsClear(cell, direction, target, occupiedCells)) {
          candidates.push({ cell, direction });
        }
      }
    }
  }

  return candidates;
}

function rayIsClear(
  cell: Cell,
  direction: Direction,
  bounds: Pick<GeneratorTarget, "width" | "height">,
  occupiedCells: ReadonlySet<string>,
): boolean {
  const vector = DIRECTION_VECTORS[direction];
  let cursor = {
    row: cell.row + vector.rowDelta,
    col: cell.col + vector.colDelta,
  };

  while (isCellInBounds(cursor, bounds)) {
    if (occupiedCells.has(cellKey(cursor))) {
      return false;
    }
    cursor = {
      row: cursor.row + vector.rowDelta,
      col: cursor.col + vector.colDelta,
    };
  }

  return true;
}

function metricsSatisfyTarget(
  metrics: DifficultyMetrics,
  target: GeneratorTarget,
): boolean {
  const constraints = target.constraints ?? defaultConstraints(target.tier);

  if (
    constraints.minInitialRemovableCount !== undefined &&
    metrics.initialRemovableCount < constraints.minInitialRemovableCount
  ) {
    return false;
  }

  if (
    constraints.maxInitialRemovableCount !== undefined &&
    metrics.initialRemovableCount > constraints.maxInitialRemovableCount
  ) {
    return false;
  }

  if (
    constraints.minDependencyDepth !== undefined &&
    metrics.dependencyDepth < constraints.minDependencyDepth
  ) {
    return false;
  }

  if (
    constraints.maxDependencyDepth !== undefined &&
    metrics.dependencyDepth > constraints.maxDependencyDepth
  ) {
    return false;
  }

  return true;
}

function defaultConstraints(tier: DifficultyTier): NonNullable<GeneratorTarget["constraints"]> {
  if (tier === "tutorial") {
    return { minInitialRemovableCount: 2, maxDependencyDepth: 4 };
  }
  if (tier === "easy") {
    return { minInitialRemovableCount: 2 };
  }
  if (tier === "medium") {
    return { minDependencyDepth: 2 };
  }
  return { minDependencyDepth: 3 };
}

function fail(
  target: GeneratorTarget,
  attempts: number,
  rejectionReason: string,
  lastMetrics?: DifficultyMetrics,
): GeneratorResult {
  return {
    ok: false,
    seed: target.seed,
    attempts,
    rejectionReason,
    lastMetrics,
  };
}

function createSeededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function slugSeed(seed: string): string {
  return seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
