import { useEffect, useState } from "react";
import type { LevelDefinition } from "../engine";
import {
  isBoardInputLocked,
  isRankedGameplayFrozen,
} from "../leaderboard/attemptMachine";
import {
  createLeaderboardClient,
  type LeaderboardClient,
} from "../leaderboard/leaderboardClient";
import { LeaderboardPanel } from "../leaderboard/LeaderboardPanel";
import { levelVersionId } from "../leaderboard/replayContract";
import { useRankedAttempt } from "../leaderboard/useRankedAttempt";
import { BoardView } from "./BoardView";
import { GameHud } from "./GameHud";
import { LevelCompletePanel } from "./LevelCompletePanel";
import { useGameController } from "./useGameController";

export type GameScreenProps = {
  readonly levels?: readonly LevelDefinition[];
  readonly leaderboardEnabled?: boolean;
  readonly leaderboardClient?: LeaderboardClient;
};

const defaultClient = createLeaderboardClient();
const runtimeLeaderboardEnabled =
  (
    import.meta as ImportMeta & {
      readonly env?: Readonly<Record<string, string | undefined>>;
    }
  ).env?.VITE_TILES_LEADERBOARD_ENABLED === "true";

export function GameScreen({
  levels,
  leaderboardEnabled = runtimeLeaderboardEnabled,
  leaderboardClient = defaultClient,
}: GameScreenProps) {
  const controller = useGameController(levels);
  const blockedCount = controller.blockedFeedback?.blockerIds.length ?? 0;
  const [resolvedLevelVersion, setResolvedLevelVersion] = useState<{
    readonly levelId: string;
    readonly versionId: string;
  } | null>(null);
  const currentLevelVersionId =
    resolvedLevelVersion?.levelId === controller.currentLevel.id
      ? resolvedLevelVersion.versionId
      : null;
  const [isRecordsOpen, setIsRecordsOpen] = useState(false);
  const ranked = useRankedAttempt({
    enabled: leaderboardEnabled,
    levelVersionId: currentLevelVersionId,
    client: leaderboardClient,
    restoreCommands: controller.restoreCommandLog,
  });
  const rankedControlsFrozen =
    ranked.journalState.navigationBlocked ||
    ranked.attemptState.status === "result_pending" ||
    (isRankedGameplayFrozen(ranked.attemptState) &&
      controller.gameState.status === "complete");
  const displayedElapsedSeconds =
    ranked.rankedElapsedSeconds ?? controller.elapsedSeconds;
  const isLevelComplete = controller.gameState.status === "complete";

  useEffect(() => {
    let isCurrent = true;
    const levelId = controller.currentLevel.id;
    void levelVersionId(controller.currentLevel).then((versionId) => {
      if (isCurrent) {
        setResolvedLevelVersion({ levelId, versionId });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [controller.currentLevel]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const target = event.target;
      const isFormField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;

      if (isFormField) {
        return;
      }

      if (isRecordsOpen || rankedControlsFrozen) {
        return;
      }

      if (event.key.toLowerCase() === "u" || event.key.toLowerCase() === "z") {
        const outcome = controller.undo();
        if (outcome) {
          ranked.recordCommand(outcome.command, outcome.isComplete);
        }
      }

      if (event.key.toLowerCase() === "r") {
        ranked.cancelRankedRun();
        controller.restart();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [controller, isRecordsOpen, ranked, rankedControlsFrozen]);

  function playTile(tileId: string) {
    if (
      isBoardInputLocked(ranked.attemptState) ||
      rankedControlsFrozen
    ) {
      return;
    }
    const outcome = controller.playTile(tileId, displayedElapsedSeconds);
    if (outcome) {
      ranked.recordCommand(outcome.command, outcome.isComplete);
    }
  }

  function undo() {
    const outcome = controller.undo();
    if (outcome) {
      ranked.recordCommand(outcome.command, outcome.isComplete);
    }
    return outcome;
  }

  function restart() {
    ranked.cancelRankedRun();
    controller.restart();
  }

  return (
    <main className="game-screen" data-theme="cosmic-arcade">
      <GameHud
        isInteractionLocked={rankedControlsFrozen || isLevelComplete}
        controller={{
          ...controller,
          elapsedSeconds: displayedElapsedSeconds,
          undo,
          restart,
          goToLevel: (index) => {
            setIsRecordsOpen(false);
            ranked.cancelRankedRun();
            controller.goToLevel(index);
          },
          goNextLevel: () => {
            setIsRecordsOpen(false);
            ranked.cancelRankedRun();
            controller.goNextLevel();
          },
          goPreviousLevel: () => {
            setIsRecordsOpen(false);
            ranked.cancelRankedRun();
            controller.goPreviousLevel();
          },
        }}
      >
        {leaderboardEnabled && currentLevelVersionId ? (
          <LeaderboardPanel
            levelTitle={controller.currentLevel.title}
            records={ranked.recordsState}
            attempt={ranked.attemptState}
            countdown={ranked.countdown}
            onStart={() => {
              controller.restart();
              void ranked.startRankedRun();
            }}
            onCancel={ranked.cancelRankedRun}
            onRetrySubmission={ranked.retrySubmission}
            onRefresh={() => void ranked.refreshRecords()}
            isOpen={isRecordsOpen}
            onOpenChange={setIsRecordsOpen}
          />
        ) : null}
      </GameHud>

      <section className="play-area">
        <BoardView
          gameState={controller.gameState}
          exitingTiles={controller.exitingTiles}
          blockedFeedback={controller.blockedFeedback}
          onPlayTile={playTile}
          isInputLocked={
            isBoardInputLocked(ranked.attemptState) || rankedControlsFrozen
          }
        />

        <div className="feedback-panel">
          {isLevelComplete ? (
            <div className="completion" role="status">
              <strong>Level clear</strong>
              <span>
                Review your score and the leaderboard to continue.
              </span>
            </div>
          ) : controller.blockedFeedback ? (
            <div className="blocked-message" role="status">
              <strong>Blocked</strong>
              <span>
                {blockedCount} tile{blockedCount === 1 ? "" : "s"} in the arrow
                path must leave first.
              </span>
            </div>
          ) : (
            <div className="hint-message" role="status">
              <strong>Find an open arrow</strong>
              <span>Remove tiles whose arrow path reaches the edge.</span>
            </div>
          )}
        </div>
      </section>

      {isLevelComplete ? (
        <LevelCompletePanel
          moves={controller.gameState.moveCount}
          elapsedSeconds={displayedElapsedSeconds}
          canGoNext={controller.canGoNext}
          leaderboardEnabled={leaderboardEnabled && currentLevelVersionId !== null}
          records={ranked.recordsState}
          attempt={ranked.attemptState}
          onRefreshRecords={() => void ranked.refreshRecords()}
          onRetrySubmission={() => void ranked.retrySubmission()}
          onTryRanked={() => {
            controller.restart();
            if (leaderboardEnabled && currentLevelVersionId) {
              void ranked.startRankedRun();
            } else {
              ranked.cancelRankedRun();
            }
          }}
          onContinue={() => {
            setIsRecordsOpen(false);
            ranked.cancelRankedRun();
            if (controller.canGoNext) {
              controller.goNextLevel();
            } else {
              controller.restart();
            }
          }}
          navigationBlocked={ranked.journalState.navigationBlocked}
        />
      ) : null}
    </main>
  );
}
