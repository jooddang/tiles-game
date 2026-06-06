export type LevelStats = {
  readonly moves: number;
  readonly seconds: number;
};

export type StoredProgress = {
  readonly currentLevelId?: string;
  readonly completedLevelIds: readonly string[];
  readonly bestStatsByLevelId: Readonly<Record<string, LevelStats>>;
};

const STORAGE_KEY = "tiles-game-progress-v1";

export const emptyProgress: StoredProgress = {
  completedLevelIds: [],
  bestStatsByLevelId: {},
};

export function loadProgress(storage: Storage | undefined = getBrowserStorage()): StoredProgress {
  if (!storage) {
    return emptyProgress;
  }

  try {
    const rawProgress = storage.getItem(STORAGE_KEY);
    if (!rawProgress) {
      return emptyProgress;
    }

    const parsedProgress = JSON.parse(rawProgress) as Partial<StoredProgress>;
    return normalizeProgress(parsedProgress);
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
    if (typeof candidate.moves !== "number" || typeof candidate.seconds !== "number") {
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
