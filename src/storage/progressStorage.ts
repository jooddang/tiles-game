export type LevelStats = {
  readonly moves: number;
  readonly seconds: number;
};

export type StoredProgress = {
  readonly currentLevelId?: string;
  readonly completedLevelIds: readonly string[];
  readonly bestStatsByLevelId: Readonly<Record<string, LevelStats>>;
};

const STORAGE_KEY = "tiles-game-progress-v2";
const LEGACY_STORAGE_KEY = "tiles-game-progress-v1";

export const emptyProgress: StoredProgress = {
  completedLevelIds: [],
  bestStatsByLevelId: {},
};

export function loadProgress(storage: Storage | undefined = getBrowserStorage()): StoredProgress {
  if (!storage) {
    return emptyProgress;
  }

  try {
    const currentProgress = storage.getItem(STORAGE_KEY);
    const legacyProgress = storage.getItem(LEGACY_STORAGE_KEY);
    const rawProgress = currentProgress ?? legacyProgress;
    if (!rawProgress) {
      return emptyProgress;
    }

    const parsedProgress = JSON.parse(rawProgress) as Partial<StoredProgress>;
    const normalized = normalizeProgress(parsedProgress);
    if (!currentProgress && legacyProgress) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // Valid legacy progress remains usable when best-effort migration is blocked.
      }
    }
    return normalized;
  } catch {
    return emptyProgress;
  }
}

export function saveProgress(
  progress: StoredProgress,
  storage: Storage | undefined = getBrowserStorage(),
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function chooseBestStats(
  existingStats: LevelStats | undefined,
  candidateStats: LevelStats,
): LevelStats {
  if (!existingStats) {
    return candidateStats;
  }

  if (candidateStats.seconds !== existingStats.seconds) {
    return candidateStats.seconds < existingStats.seconds
      ? candidateStats
      : existingStats;
  }

  return candidateStats.moves < existingStats.moves
    ? candidateStats
    : existingStats;
}

function normalizeProgress(progress: Partial<StoredProgress>): StoredProgress {
  return {
    currentLevelId:
      typeof progress.currentLevelId === "string"
        ? progress.currentLevelId
        : undefined,
    completedLevelIds: Array.isArray(progress.completedLevelIds)
      ? progress.completedLevelIds.filter(
          (levelId): levelId is string => typeof levelId === "string",
        )
      : [],
    bestStatsByLevelId:
      progress.bestStatsByLevelId && typeof progress.bestStatsByLevelId === "object"
        ? normalizeStats(progress.bestStatsByLevelId)
        : {},
  };
}

function normalizeStats(
  statsByLevelId: Readonly<Record<string, unknown>>,
): Record<string, LevelStats> {
  const normalizedStats: Record<string, LevelStats> = {};

  for (const [levelId, stats] of Object.entries(statsByLevelId)) {
    if (!stats || typeof stats !== "object") {
      continue;
    }

    const candidate = stats as Partial<LevelStats>;
    if (
      typeof candidate.moves !== "number" ||
      !Number.isFinite(candidate.moves) ||
      candidate.moves < 0 ||
      typeof candidate.seconds !== "number" ||
      !Number.isFinite(candidate.seconds) ||
      candidate.seconds < 0
    ) {
      continue;
    }

    normalizedStats[levelId] = {
      moves: candidate.moves,
      seconds: candidate.seconds,
    };
  }

  return normalizedStats;
}

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
