import { useEffect, useState } from "react";
import type { AccountSnapshot } from "../account/protocol";
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
import { StageStartPanel } from "./StageStartPanel";
import { useGameController } from "./useGameController";

export type GameScreenProps = {
  readonly levels?: readonly LevelDefinition[];
  readonly leaderboardEnabled?: boolean;
  readonly leaderboardClient?: LeaderboardClient;
  readonly accountSnapshot?: AccountSnapshot | null;
  readonly onSignIn?: () => void;
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
  accountSnapshot,
  onSignIn = () => undefined,
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
  const [stageMode, setStageMode] = useState<"ranked" | "practice" | null>(() => readStageMode());
  const effectiveAccountSnapshot = accountSnapshot === undefined ? STANDALONE_GUEST : accountSnapshot;
  const ranked = useRankedAttempt({
    enabled: leaderboardEnabled,
    levelVersionId: currentLevelVersionId,
    client: leaderboardClient,
    authGeneration: accountSnapshot?.authGeneration ?? null,
    restoreCommands: controller.restoreCommandLog,
  });
  const rankedControlsFrozen =
    ranked.journalState.navigationBlocked ||
    ranked.attemptState.status === "result_pending" ||
    (isRankedGameplayFrozen(ranked.attemptState) &&
      controller.gameState.status === "complete");
  const displayedElapsedSeconds =
    ranked.rankedElapsedSeconds ?? controller.elapsedSeconds;
  const isLevelComplete = controller.gameState.status === "complete"
    || ranked.attemptState.status === "accepted";
  const rankedStartFailed = ranked.attemptState.status === "unavailable"
    || ranked.attemptState.status === "rejected";
  const stageGateActive = leaderboardEnabled && !isLevelComplete
    && (stageMode === null || (stageMode === "ranked" && rankedStartFailed));
  const rankedInputGate = leaderboardEnabled && !isLevelComplete && stageMode === "ranked"
    && ranked.attemptState.status !== "active";

  useEffect(() => {
    if (!leaderboardEnabled || !ranked.recoveryReady || stageMode !== "ranked" || isLevelComplete || !currentLevelVersionId) return;
    if (ranked.attemptState.status === "unranked") void ranked.startRankedRun();
  }, [currentLevelVersionId, isLevelComplete, leaderboardEnabled, ranked, stageMode]);

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

      if (isRecordsOpen || rankedControlsFrozen || stageGateActive || rankedInputGate) {
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
  }, [controller, isRecordsOpen, ranked, rankedControlsFrozen, rankedInputGate, stageGateActive]);

  function playTile(tileId: string) {
    if (
      isBoardInputLocked(ranked.attemptState) ||
      rankedControlsFrozen || stageGateActive || rankedInputGate
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
        isInteractionLocked={rankedControlsFrozen || isLevelComplete || stageGateActive || rankedInputGate}
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
            onCancel={() => {
              writeStageMode("practice");
              setStageMode("practice");
              ranked.cancelRankedRun();
            }}
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
            isBoardInputLocked(ranked.attemptState) || rankedControlsFrozen || stageGateActive || rankedInputGate
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
          accountSnapshot={effectiveAccountSnapshot}
          accountClient={accountSnapshot === undefined ? undefined : leaderboardClient}
          onSignIn={onSignIn}
          signInAvailable={accountSnapshot !== undefined}
        />
      ) : null}
      {stageGateActive ? (
        <StageStartPanel
          snapshot={effectiveAccountSnapshot}
          rankedAvailable={leaderboardEnabled}
          signInAvailable={accountSnapshot !== undefined}
          onSignIn={onSignIn}
          onContinue={() => {
            writeStageMode("ranked");
            setStageMode("ranked");
          }}
          startFailed={rankedStartFailed}
          onPractice={() => {
            writeStageMode("practice");
            setStageMode("practice");
            ranked.cancelRankedRun();
          }}
        />
      ) : null}
    </main>
  );
}

const STAGE_CHOICE_KEY = "tiles-game-stage-choice-v1";
const STANDALONE_GUEST: AccountSnapshot = {
  authRevision: 1,
  authGeneration: "standalone_guest_generation",
  account: { state: "guest" },
};

function readStageMode(): "ranked" | "practice" | null {
  try {
    const value = window.sessionStorage.getItem(STAGE_CHOICE_KEY);
    return value === "ranked" || value === "practice" ? value : null;
  } catch { return null; }
}

function writeStageMode(mode: "ranked" | "practice") {
  try { window.sessionStorage.setItem(STAGE_CHOICE_KEY, mode); }
  catch { /* The choice remains in React state for this page. */ }
}
