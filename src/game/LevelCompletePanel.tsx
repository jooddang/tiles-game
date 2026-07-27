import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { AttemptState } from "../leaderboard/attemptMachine";
import { RecordsContent } from "../leaderboard/LeaderboardPanel";
import type { RecordsState } from "../leaderboard/useRankedAttempt";

export type LevelCompletePanelProps = {
  readonly moves: number;
  readonly elapsedSeconds: number;
  readonly canGoNext: boolean;
  readonly leaderboardEnabled: boolean;
  readonly records: RecordsState;
  readonly attempt: AttemptState;
  readonly onRefreshRecords: () => void;
  readonly onRetrySubmission: () => void;
  readonly onTryRanked: () => void;
  readonly onContinue: () => void;
};

export function LevelCompletePanel({
  moves,
  elapsedSeconds,
  canGoNext,
  leaderboardEnabled,
  records,
  attempt,
  onRefreshRecords,
  onRetrySubmission,
  onTryRanked,
  onContinue,
}: LevelCompletePanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const result = attempt.status === "accepted" ? attempt.result : null;
  const best = result?.personalBest;
  const isNewTopTen =
    result?.status === "published" &&
    result.isPersonalBest &&
    best?.isTopTen === true &&
    result.submittedScoreId === best.scoreId;
  const displayName = recordsSnapshot(records)?.personal?.displayName;
  const presentation = completionPresentation(attempt, isNewTopTen);

  useEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = dialog?.closest(".level-complete-backdrop");
    const inertElements = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== backdrop &&
        !element.hasAttribute("inert"),
    );
    for (const element of inertElements) {
      element.setAttribute("inert", "");
    }
    dialog?.focus({ preventScroll: true });

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key !== "Tab") {
        return;
      }
      const focusable = dialog
        ? [
            ...dialog.querySelectorAll<HTMLElement>(
              "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
            ),
          ]
        : [];
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", keepFocusInside);
      for (const element of inertElements) {
        element.removeAttribute("inert");
      }
    };
  }, []);

  return createPortal(
    <div className="level-complete-backdrop">
      <div
        ref={dialogRef}
        className="level-complete-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isNewTopTen ? "New high score" : "Level complete"}
        tabIndex={-1}
      >
        <div className="level-complete-hero" aria-live="polite">
          <p className="eyebrow">{presentation.eyebrow}</p>
          <h2>{presentation.title}</h2>
          <p>{presentation.message}</p>
          {isNewTopTen && displayName ? (
            <p className="high-score-name">
              Saved as <strong>{displayName}</strong>
            </p>
          ) : null}
        </div>

        <dl className="completion-score">
          <div>
            <dt>Time</dt>
            <dd>{formatCompletionTime(result?.elapsedSeconds ?? elapsedSeconds)}</dd>
          </div>
          <div>
            <dt>Moves</dt>
            <dd>{moves} moves</dd>
          </div>
        </dl>

        {leaderboardEnabled ? (
          <section className="completion-records" aria-label="Level leaderboard">
            <div className="completion-records-heading">
              <div>
                <p className="eyebrow">All-time records</p>
                <h3>Top 10</h3>
              </div>
              {attempt.status === "retry_available" ||
              attempt.status === "result_pending" ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={onRetrySubmission}
                >
                  {attempt.status === "retry_available"
                    ? "Retry score"
                    : "Check score"}
                </button>
              ) : null}
            </div>
            <RecordsContent records={records} onRefresh={onRefreshRecords} />
          </section>
        ) : null}

        <div className="completion-actions">
          {leaderboardEnabled ? (
            <button
              type="button"
              className="game-button completion-secondary"
              onClick={onTryRanked}
            >
              {attempt.status === "accepted" ? "Replay ranked" : "Try ranked"}
            </button>
          ) : canGoNext ? (
            <button
              type="button"
              className="game-button completion-secondary"
              onClick={onTryRanked}
            >
              Play again
            </button>
          ) : null}
          <button
            type="button"
            className="game-button completion-primary"
            onClick={onContinue}
          >
            {canGoNext ? "Next level" : "Play again"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function completionPresentation(
  attempt: AttemptState,
  isNewTopTen: boolean,
): {
  readonly eyebrow: string;
  readonly title: string;
  readonly message: string;
} {
  if (isNewTopTen && attempt.status === "accepted") {
    return {
      eyebrow: "New high score",
      title: `You placed #${attempt.result.personalBest?.rank}`,
      message: "Your server-verified score is now on the leaderboard.",
    };
  }

  switch (attempt.status) {
    case "submitting":
      return {
        eyebrow: "Level complete",
        title: "Checking your score…",
        message: "We’re verifying the run and finding your place.",
      };
    case "retry_available":
    case "result_pending":
      return {
        eyebrow: "Level complete",
        title: "Your score is still pending",
        message: "Retry now, or continue without waiting for the result.",
      };
    case "accepted":
      if (attempt.result.status === "under_review") {
        return {
          eyebrow: "Score received",
          title: "Your run is under review",
          message: "The level is cleared. The leaderboard will update after review.",
        };
      }
      return {
        eyebrow: "Level complete",
        title: "Not in the Top 10 this time",
        message: "Here’s the leaderboard to beat on your next ranked run.",
      };
    case "rejected":
    case "unavailable":
      return {
        eyebrow: "Level complete",
        title: "Score not submitted",
        message: "Your local clear is saved. You can still continue.",
      };
    case "unranked":
    case "starting":
    case "countdown":
    case "active":
      return {
        eyebrow: "Level complete",
        title: "Level complete",
        message: "This casual run wasn’t submitted. Try ranked to chart your time.",
      };
  }
}

function recordsSnapshot(records: RecordsState) {
  return records.status === "ready" ||
    records.status === "empty" ||
    records.status === "partial" ||
    records.status === "stale"
    ? records
    : null;
}

function formatCompletionTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
