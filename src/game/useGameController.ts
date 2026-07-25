import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyMove,
  createInitialGameState,
  restartLevel,
  undoMove,
  type GameState,
  type LevelDefinition,
  type Tile,
} from "../engine";
import { levelManifest } from "../levels/manifest";
import type { ReplayCommand } from "../leaderboard/protocol";
import {
  emptyProgress,
  loadProgress,
  saveProgress,
  chooseBestStats,
  type LevelStats,
  type StoredProgress,
} from "../storage/progressStorage";

const EXIT_ANIMATION_MS = 1200;

export type BlockedFeedback = {
  readonly tileId: string;
  readonly blockerIds: readonly string[];
};

export type ExitingTile = {
  readonly tile: Tile;
};

export type GameController = {
  readonly levels: readonly LevelDefinition[];
  readonly currentLevel: LevelDefinition;
  readonly currentLevelIndex: number;
  readonly gameState: GameState;
  readonly exitingTiles: readonly ExitingTile[];
  readonly blockedFeedback?: BlockedFeedback;
  readonly progress: StoredProgress;
  readonly elapsedSeconds: number;
  readonly storageAvailable: boolean;
  readonly canUndo: boolean;
  readonly canGoPrevious: boolean;
  readonly canGoNext: boolean;
  readonly playTile: (
    tileId: string,
    completionSeconds?: number,
  ) => GameCommandOutcome | undefined;
  readonly undo: () => GameCommandOutcome | undefined;
  readonly restart: () => void;
  readonly goToLevel: (levelIndex: number) => void;
  readonly goNextLevel: () => void;
  readonly goPreviousLevel: () => void;
  readonly restoreCommandLog: (
    commands: readonly ReplayCommand[],
  ) => "playing" | "complete" | false;
};

export type GameCommandOutcome = {
  readonly command:
    | { readonly type: "remove"; readonly tileId: string }
    | { readonly type: "undo" };
  readonly isComplete: boolean;
};

export function useGameController(
  levels: readonly LevelDefinition[] = levelManifest,
): GameController {
  const initialProgress = useMemo(() => loadProgress(), []);
  const initialLevelIndex = findInitialLevelIndex(levels, initialProgress.currentLevelId);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(initialLevelIndex);
  const [gameState, setGameState] = useState(() =>
    createInitialGameState(levels[initialLevelIndex]),
  );
  const [blockedFeedback, setBlockedFeedback] = useState<BlockedFeedback>();
  const [progress, setProgress] = useState(initialProgress);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [exitingTiles, setExitingTiles] = useState<readonly ExitingTile[]>([]);
  const exitTimerIds = useRef<Set<number>>(new Set());

  const currentLevel = levels[currentLevelIndex];

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (gameState.status === "playing") {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [gameState.status, startedAt]);

  useEffect(() => {
    const timerIds = exitTimerIds.current;
    return () => {
      for (const timerId of timerIds) {
        window.clearTimeout(timerId);
      }
      timerIds.clear();
    };
  }, []);

  function persist(nextProgress: StoredProgress) {
    setProgress(nextProgress);
    setStorageAvailable(saveProgress(nextProgress));
  }

  function resetToLevel(levelIndex: number) {
    const nextLevel = levels[levelIndex];
    setCurrentLevelIndex(levelIndex);
    setGameState(createInitialGameState(nextLevel));
    setBlockedFeedback(undefined);
    clearExitingTiles();
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    persist({ ...progress, currentLevelId: nextLevel.id });
  }

  function playTile(tileId: string, completionSeconds = elapsedSeconds) {
    const selectedTile = gameState.remainingTiles.find((tile) => tile.id === tileId);
    const move = applyMove(tileId, gameState);

    if (move.type === "blocked") {
      setBlockedFeedback({
        tileId,
        blockerIds: move.blockers.map((tile) => tile.id),
      });
      return undefined;
    }

    if (move.type === "not_found") {
      setBlockedFeedback(undefined);
      return undefined;
    }

    setGameState(move.state);
    setBlockedFeedback(undefined);
    if (selectedTile) {
      queueExitingTile(selectedTile);
    }

    if (move.state.status === "complete") {
      const stats = { moves: move.state.moveCount, seconds: completionSeconds };
      persist(markLevelComplete(progress, currentLevel.id, stats));
    }

    return {
      command: { type: "remove", tileId },
      isComplete: move.state.status === "complete",
    } satisfies GameCommandOutcome;
  }

  function undo() {
    const nextState = undoMove(gameState);
    if (nextState === gameState) {
      return undefined;
    }
    setGameState(nextState);
    setBlockedFeedback(undefined);
    clearExitingTiles();
    return {
      command: { type: "undo" },
      isComplete: false,
    } satisfies GameCommandOutcome;
  }

  function restart() {
    setGameState((state) => restartLevel(state));
    setBlockedFeedback(undefined);
    clearExitingTiles();
    setStartedAt(Date.now());
    setElapsedSeconds(0);
  }

  return {
    levels,
    currentLevel,
    currentLevelIndex,
    gameState,
    exitingTiles,
    blockedFeedback,
    progress,
    elapsedSeconds,
    storageAvailable,
    canUndo: gameState.moveHistory.length > 0,
    canGoPrevious: currentLevelIndex > 0,
    canGoNext: currentLevelIndex < levels.length - 1,
    playTile,
    undo,
    restart,
    goToLevel: resetToLevel,
    goNextLevel: () => {
      if (currentLevelIndex < levels.length - 1) {
        resetToLevel(currentLevelIndex + 1);
      }
    },
    goPreviousLevel: () => {
      if (currentLevelIndex > 0) {
        resetToLevel(currentLevelIndex - 1);
      }
    },
    restoreCommandLog,
  };

  function restoreCommandLog(
    commands: readonly ReplayCommand[],
  ): "playing" | "complete" | false {
    let restoredState = createInitialGameState(currentLevel);
    for (const command of commands) {
      if (command.type === "undo") {
        const nextState = undoMove(restoredState);
        if (nextState === restoredState) {
          return false;
        }
        restoredState = nextState;
        continue;
      }
      const move = applyMove(command.tileId, restoredState);
      if (move.type !== "removed") {
        return false;
      }
      restoredState = move.state;
    }
    setGameState(restoredState);
    setBlockedFeedback(undefined);
    clearExitingTiles();
    return restoredState.status;
  }

  function queueExitingTile(tile: Tile) {
    setExitingTiles((tiles) => [...tiles, { tile }]);
    const timerId = window.setTimeout(() => {
      setExitingTiles((tiles) =>
        tiles.filter((exitingTile) => exitingTile.tile.id !== tile.id),
      );
      exitTimerIds.current.delete(timerId);
    }, EXIT_ANIMATION_MS);
    exitTimerIds.current.add(timerId);
  }

  function clearExitingTiles() {
    for (const timerId of exitTimerIds.current) {
      window.clearTimeout(timerId);
    }
    exitTimerIds.current.clear();
    setExitingTiles([]);
  }
}

function findInitialLevelIndex(
  levels: readonly LevelDefinition[],
  currentLevelId: string | undefined,
): number {
  const levelIndex = levels.findIndex((level) => level.id === currentLevelId);

  return levelIndex >= 0 ? levelIndex : 0;
}

function markLevelComplete(
  progress: StoredProgress,
  levelId: string,
  stats: LevelStats,
): StoredProgress {
  const completedLevelIds = new Set(progress.completedLevelIds);
  completedLevelIds.add(levelId);

  return {
    ...emptyProgress,
    ...progress,
    currentLevelId: levelId,
    completedLevelIds: [...completedLevelIds],
    bestStatsByLevelId: {
      ...progress.bestStatsByLevelId,
      [levelId]: chooseBestStats(progress.bestStatsByLevelId[levelId], stats),
    },
  };
}
