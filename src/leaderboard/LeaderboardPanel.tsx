import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AttemptState } from "./attemptMachine";
import type { LeaderboardEntry } from "./protocol";
import type { AccountLeaderboardEntry } from "./accountScoreProtocol";
import type { RecordsState } from "./useRankedAttempt";

export type LeaderboardPanelProps = {
  readonly levelTitle: string;
  readonly records: RecordsState;
  readonly attempt: AttemptState;
  readonly countdown?: number;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly onRetrySubmission: () => void;
  readonly onRefresh: () => void;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (isOpen: boolean) => void;
};

export function LeaderboardPanel({
  levelTitle,
  records,
  attempt,
  countdown,
  onStart,
  onCancel,
  onRetrySubmission,
  onRefresh,
  isOpen: controlledIsOpen,
  onOpenChange,
}: LeaderboardPanelProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? uncontrolledIsOpen;
  const isMobile = useMobileRecords();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback((nextOpen: boolean) => {
    setUncontrolledIsOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen || !isMobile) {
      return;
    }
    const dialog = dialogRef.current;
    const backdrop = dialog?.closest(".leaderboard-backdrop");
    const trigger = triggerRef.current;
    const inertElements = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== backdrop &&
        !element.hasAttribute("inert"),
    );
    for (const element of inertElements) {
      element.setAttribute("inert", "");
    }
    getFocusable(dialog)[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      const focusable = getFocusable(dialog);
      if (event.key !== "Tab" || focusable.length === 0) {
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

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      for (const element of inertElements) {
        element.removeAttribute("inert");
      }
      trigger?.focus();
    };
  }, [isMobile, isOpen, setOpen]);

  const personal =
    records.status === "ready" ||
    records.status === "empty" ||
    records.status === "partial" ||
    records.status === "stale"
      ? records.personal
      : null;
  const canStart =
    attempt.status === "unranked" ||
      attempt.status === "unavailable" ||
      attempt.status === "rejected" ||
      attempt.status === "accepted";

  return (
    <section className="leaderboard-disclosure" aria-label="Ranked records">
      <div className="ranked-actions">
        <button
          ref={triggerRef}
          type="button"
          className="game-button"
          aria-expanded={isOpen}
          onClick={() => setOpen(true)}
        >
          Records
        </button>
        {attempt.status === "unranked" ||
        attempt.status === "unavailable" ||
        attempt.status === "rejected" ||
        attempt.status === "accepted" ? (
          <button
            type="button"
            className="game-button ranked-start"
            onClick={onStart}
            disabled={!canStart}
          >
            Start ranked run
          </button>
        ) : attempt.status === "starting" || attempt.status === "countdown" ? (
          <button type="button" className="game-button" onClick={onCancel}>
            Cancel ranked run
          </button>
        ) : null}
      </div>

      {personal ? (
        <p className="ranked-identity">
          Ranked as <strong>{personal.displayName}</strong>
        </p>
      ) : (
        <p className="ranked-identity">
          {records.status === "loading"
            ? "Loading ranked identity…"
            : "Ranked identity unavailable. Retry records to start a ranked run."}
        </p>
      )}

      <div className="ranked-status" aria-live="polite">
        <AttemptMessage
          attempt={attempt}
          countdown={countdown}
          onRetry={onRetrySubmission}
        />
      </div>

      {isOpen && !isMobile ? (
        <div className="leaderboard-panel leaderboard-panel-inline">
          <RecordsHeader levelTitle={levelTitle} onClose={() => setOpen(false)} />
          <RecordsContent records={records} onRefresh={onRefresh} />
        </div>
      ) : null}

      {isOpen && isMobile ? createPortal(
        <div className="leaderboard-backdrop">
          <div
            ref={dialogRef}
            className="leaderboard-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leaderboard-title"
          >
            <RecordsHeader
              levelTitle={levelTitle}
              onClose={() => {
                setOpen(false);
              }}
            />
            <RecordsContent records={records} onRefresh={onRefresh} />
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

function RecordsHeader({
  levelTitle,
  onClose,
}: {
  readonly levelTitle: string;
  readonly onClose: () => void;
}) {
  return (
    <header>
      <div>
        <p className="eyebrow">All-time records</p>
        <h2 id="leaderboard-title">{levelTitle}</h2>
      </div>
      <button type="button" className="game-button" onClick={onClose}>
        Close
      </button>
    </header>
  );
}

export function RecordsContent({
  records,
  onRefresh,
}: {
  readonly records: RecordsState;
  readonly onRefresh: () => void;
}) {
  if (records.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading records">
        <p>Loading records…</p>
        <div className="leaderboard-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (records.status === "error") {
    return (
      <div className="records-message">
        <p>Records are unavailable. You can still play.</p>
        <button type="button" className="game-button" onClick={onRefresh}>
          Retry records
        </button>
      </div>
    );
  }

  const { leaderboard, personal, authoritativeResult } = records;
  const authoritativeBest = authoritativeResult?.personalBest;
  const entries = leaderboard
    ? mergeAuthoritativeTopTenEntry(
        leaderboard.entries,
        authoritativeBest,
        personal?.displayName,
      )
    : null;
  return (
    <>
      {personal ? (
        <p className="personal-best">
          <strong>{personal.displayName}</strong>
          {authoritativeBest
            ? ` · Your best #${authoritativeBest.rank} · ${formatTime(
                authoritativeBest.elapsedSeconds,
              )}`
            : personal.personalBest
            ? ` · Your best #${personal.personalBest.rank} · ${formatTime(
                personal.personalBest.elapsedSeconds,
              )}`
            : " · No ranked time yet"}
        </p>
      ) : null}
      {records.status === "stale" ? (
        <div className="records-stale">
          <span>
            Couldn’t refresh · Last updated{" "}
            {new Date(records.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button type="button" className="text-button" onClick={onRefresh}>
            Retry
          </button>
        </div>
      ) : null}
      {records.status === "partial" ? (
        <div className="records-stale">
          <span>Some record details couldn’t refresh.</span>
          <button type="button" className="text-button" onClick={onRefresh}>
            Retry
          </button>
        </div>
      ) : null}
      {!entries ? (
        <p>Top 10 is temporarily unavailable.</p>
      ) : entries.length === 0 ? (
        <p>No records yet. Start a ranked run.</p>
      ) : (
        <table className="leaderboard-table">
          <caption>Server-validated all-time Top 10</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const accountEntry = entry as AccountLeaderboardEntry;
              const isPlayer =
                authoritativeBest?.scoreId === entry.scoreId ||
                personal?.personalBest?.scoreId === entry.scoreId;
              return (
                <tr key={entry.scoreId} data-player={isPlayer || undefined}>
                  <td>#{entry.rank}</td>
                  <td title={entry.displayName}>
                    {accountEntry.identityKind === "account"
                      ? accountEntry.accountName
                      : accountEntry.identityKind === "guest"
                        ? `Guest · ${entry.displayName}`
                        : entry.displayName}
                    {isPlayer ? <span className="you-label"> (You)</span> : null}
                    {accountEntry.messageState === "visible" && accountEntry.message ? (
                      <span className="leaderboard-message">{accountEntry.message}</span>
                    ) : null}
                  </td>
                  <td>{formatTime(entry.elapsedSeconds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function mergeAuthoritativeTopTenEntry(
  entries: readonly LeaderboardEntry[],
  authoritativeBest:
    | {
        readonly scoreId: string;
        readonly elapsedSeconds: number;
        readonly rank: number;
        readonly isTopTen: boolean;
      }
    | null
    | undefined,
  displayName: string | undefined,
): readonly LeaderboardEntry[] {
  if (
    !authoritativeBest?.isTopTen ||
    !displayName ||
    entries.some((entry) => entry.scoreId === authoritativeBest.scoreId)
  ) {
    return entries;
  }

  return [
    ...entries,
    {
      scoreId: authoritativeBest.scoreId,
      rank: authoritativeBest.rank,
      displayName,
      elapsedSeconds: authoritativeBest.elapsedSeconds,
      achievedAt: new Date().toISOString(),
    },
  ]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 10);
}

function getFocusable(container: HTMLElement | null | undefined) {
  return container
    ? [...container.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], select:not(:disabled), [tabindex]:not([tabindex='-1'])",
      )]
    : [];
}

function useMobileRecords() {
  const query = "(max-width: 760px)";
  const [isMobile, setIsMobile] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(query);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function AttemptMessage({
  attempt,
  countdown,
  onRetry,
}: {
  readonly attempt: AttemptState;
  readonly countdown?: number;
  readonly onRetry: () => void;
}) {
  switch (attempt.status) {
    case "unranked":
      return null;
    case "starting":
      return <p>Preparing ranked run…</p>;
    case "countdown":
      return countdown === undefined ? (
        <p className="ranked-countdown">Get ready for the ranked countdown…</p>
      ) : (
        <p className="ranked-countdown">Ranked run starts in {countdown}</p>
      );
    case "active":
      return <p><strong>Ranked</strong> · Server timing is active.</p>;
    case "submitting":
      return <p>Level clear · Checking ranked run…</p>;
    case "retry_available":
      return (
        <p>
          Your local level clear is saved. The service is unavailable.{" "}
          <button type="button" className="text-button" onClick={onRetry}>
            Retry submission
          </button>
        </p>
      );
    case "result_pending":
      return (
        <p>
          Result pending.{" "}
          <button type="button" className="text-button" onClick={onRetry}>
            Check again
          </button>
        </p>
      );
    case "accepted": {
      const best = attempt.result.personalBest;
      if (attempt.result.status === "under_review") {
        return <p>Record received and under review. Your local level clear is saved.</p>;
      }
      if (!best) {
        return <p>Record accepted.</p>;
      }
      if (attempt.result.isPersonalBest && best.isTopTen) {
        return <p>#{best.rank} · New personal best · {formatTime(best.elapsedSeconds)}</p>;
      }
      if (attempt.result.isPersonalBest) {
        return <p>New personal best · Rank #{best.rank}</p>;
      }
      return <p>Record accepted · Your best remains {formatTime(best.elapsedSeconds)}</p>;
    }
    case "unavailable":
    case "rejected":
      return <p>{errorCopy(attempt.error.code, attempt.error.retryAfterSeconds)}</p>;
  }
}

function errorCopy(code: string, retryAfterSeconds?: number): string {
  switch (code) {
    case "ATTEMPT_EXPIRED":
      return "This ranked run expired. Start another.";
    case "ATTEMPT_RATE_LIMITED":
      return `Too many ranked runs. Try again${
        retryAfterSeconds ? ` in ${retryAfterSeconds} seconds` : " later"
      }.`;
    case "LEVEL_VERSION_UNKNOWN":
      return "This level is not ranked yet.";
    case "LEVEL_VERSION_RETIRED":
    case "LEVEL_VERSION_MISMATCH":
    case "REPLAY_CONTRACT_VERSION_MISMATCH":
    case "API_PROTOCOL_VERSION_MISMATCH":
      return "This level version is outdated. Reload before starting another ranked run.";
    case "LEADERBOARD_UNAVAILABLE":
    case "LEADERBOARD_DISABLED":
      return "Ranked records are unavailable. You can still play.";
    default:
      return "Run could not be validated. Your local level clear is saved.";
  }
}

export function formatTime(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.00`;
}
