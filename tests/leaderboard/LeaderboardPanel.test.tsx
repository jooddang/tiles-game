import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaderboardPanel } from "../../src/leaderboard/LeaderboardPanel";
import type { AttemptState } from "../../src/leaderboard/attemptMachine";
import type { RecordsState } from "../../src/leaderboard/useRankedAttempt";

const callbacks = {
  onStart: vi.fn(),
  onCancel: vi.fn(),
  onRetrySubmission: vi.fn(),
  onRefresh: vi.fn(),
};

const readyRecords = {
  status: "ready",
  levelVersionId: "sha256:level",
  leaderboard: {
    levelVersionId: "sha256:level",
    entries: [
      {
        scoreId: "score-1",
        rank: 1,
        displayName: "Swift Fox 42",
        elapsedSeconds: 18,
        achievedAt: "2026-07-25T12:00:00Z",
      },
    ],
  },
  personal: {
    levelVersionId: "sha256:level",
    displayName: "Swift Fox 42",
    personalBest: {
      scoreId: "score-1",
      rank: 1,
      displayName: "Swift Fox 42",
      elapsedSeconds: 18,
      achievedAt: "2026-07-25T12:00:00Z",
    },
  },
  updatedAt: Date.now(),
} satisfies RecordsState;

function renderPanel(
  records: RecordsState = readyRecords,
  attempt: AttemptState = { status: "unranked" },
) {
  return render(
    <>
      <div className="play-area">Board</div>
      <LeaderboardPanel
        levelTitle="Hex Tower"
        records={records}
        attempt={attempt}
        {...callbacks}
      />
    </>,
  );
}

describe("LeaderboardPanel", () => {
  it("keeps_ranked_start_eligible_while_display_only_identity_reads_load", () => {
    const { rerender } = renderPanel({ status: "loading" });
    expect(
      screen.getByRole("button", { name: "Start ranked run" }),
    ).toBeEnabled();
    expect(screen.getByText("Loading ranked identity…")).toBeInTheDocument();

    rerender(
      <LeaderboardPanel
        levelTitle="Hex Tower"
        records={readyRecords}
        attempt={{ status: "unranked" }}
        {...callbacks}
      />,
    );
    expect(screen.getByText(/Ranked as/)).toHaveTextContent("Swift Fox 42");
    expect(
      screen.getByRole("button", { name: "Start ranked run" }),
    ).toBeEnabled();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  it("renders_semantic_top_ten_and_marks_player_with_text", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Records" }));

    expect(
      screen.getByRole("table", { name: "Server-validated all-time Top 10" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rank" })).toBeInTheDocument();
    expect(screen.getByText("(You)")).toBeInTheDocument();
    expect(screen.getByText("00:18.00")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders_account_authority_and_an_inert_public_message_additively", () => {
    const records = {
      ...readyRecords,
      leaderboard: { ...readyRecords.leaderboard, entries: [{
        ...readyRecords.leaderboard.entries[0], identityKind: "account" as const,
        accountName: "Player·A1B2", message: "<b>I own this maze</b>",
        messageState: "visible" as const, publicationRevision: 1,
      }] },
    } as unknown as RecordsState;
    renderPanel(records);
    fireEvent.click(screen.getByRole("button", { name: "Records" }));

    expect(screen.getByText("Player·A1B2")).toBeInTheDocument();
    expect(screen.getByText("<b>I own this maze</b>")).toBeInTheDocument();
    expect(document.querySelector(".leaderboard-message b")).toBeNull();
  });

  it("shows_loading_empty_stale_and_unavailable_read_states", () => {
    const { rerender } = renderPanel({ status: "loading" });
    fireEvent.click(screen.getByRole("button", { name: "Records" }));
    expect(screen.getByLabelText("Loading records")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    rerender(
      <LeaderboardPanel
        levelTitle="Hex Tower"
        records={{
          status: "empty",
          levelVersionId: "sha256:level",
          leaderboard: { levelVersionId: "sha256:level", entries: [] },
          personal: null,
          updatedAt: Date.now(),
        }}
        attempt={{ status: "unranked" }}
        {...callbacks}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Records" }));
    expect(screen.getByText("No records yet. Start a ranked run.")).toBeInTheDocument();

    rerender(
      <LeaderboardPanel
        levelTitle="Hex Tower"
        records={{ ...readyRecords, status: "stale" }}
        attempt={{ status: "unranked" }}
        {...callbacks}
      />,
    );
    expect(screen.getByText(/Couldn’t refresh/)).toBeInTheDocument();

    rerender(
      <LeaderboardPanel
        levelTitle="Hex Tower"
        records={{
          status: "error",
          error: {
            code: "LEADERBOARD_UNAVAILABLE",
            message: "offline",
            retryable: true,
            requestId: "request-1",
          },
        }}
        attempt={{ status: "unranked" }}
        {...callbacks}
      />,
    );
    expect(
      screen.getByText("Records are unavailable. You can still play."),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "submitting",
      {
        status: "submitting",
        attempt: sampleAttempt(),
        commandLog: [],
      } satisfies AttemptState,
      "Level clear · Checking ranked run…",
    ],
    [
      "top ten",
      acceptedAttempt({ rank: 4, isTopTen: true, isPersonalBest: true }),
      "#4 · New personal best · 00:18.00",
    ],
    [
      "outside",
      acceptedAttempt({ rank: 24, isTopTen: false, isPersonalBest: true }),
      "New personal best · Rank #24",
    ],
    [
      "slower",
      acceptedAttempt({ rank: 4, isTopTen: true, isPersonalBest: false }),
      "Record accepted · Your best remains 00:18.00",
    ],
    [
      "under review",
      {
        status: "accepted",
        result: {
          status: "under_review",
          submittedScoreId: "score-review",
          levelVersionId: "sha256:level",
          elapsedSeconds: 18,
          isPersonalBest: false,
          personalBest: null,
        },
      } satisfies AttemptState,
      "Record received and under review. Your local level clear is saved.",
    ],
    [
      "expired",
      rejectedAttempt("ATTEMPT_EXPIRED"),
      "This ranked run expired. Start another.",
    ],
    [
      "outdated",
      rejectedAttempt("LEVEL_VERSION_RETIRED"),
      "This level version is outdated. Reload before starting another ranked run.",
    ],
    [
      "rate limit",
      rejectedAttempt("ATTEMPT_RATE_LIMITED", 12),
      "Too many ranked runs. Try again in 12 seconds.",
    ],
  ])("renders_%s_attempt_state", (_name, attempt, copy) => {
    renderPanel(readyRecords, attempt);
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it.each([
    [
      "retryable outage",
      {
        status: "retry_available",
        attempt: sampleAttempt(),
        commandLog: [],
        error: {
          code: "LEADERBOARD_UNAVAILABLE",
          message: "offline",
          retryable: true,
          requestId: "request-1",
        },
      } satisfies AttemptState,
      "Retry submission",
    ],
    [
      "lost response",
      {
        status: "result_pending",
        attempt: sampleAttempt(),
        commandLog: [],
      } satisfies AttemptState,
      "Check again",
    ],
  ])("offers_submission_recovery_for_%s", (_name, attempt, buttonName) => {
    renderPanel(readyRecords, attempt);
    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(callbacks.onRetrySubmission).toHaveBeenCalledTimes(1);
  });

  it("traps_focus_closes_on_escape_and_restores_records_trigger", () => {
    vi.stubGlobal("matchMedia", createMatchMedia(true));
    renderPanel();
    const trigger = screen.getByRole("button", { name: "Records" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(screen.getByText("Board").parentElement).toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByText("Board").parentElement).not.toHaveAttribute("inert");
  });
});

function createMatchMedia(matches: boolean): typeof window.matchMedia {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function sampleAttempt() {
  return {
    attemptId: "attempt-1",
    apiProtocolVersion: 2 as const,
    levelVersionId: "sha256:level",
    replayContractVersion: 1,
    startsAt: "2026-07-25T12:00:05Z",
    expiresAt: "2026-07-25T12:30:05Z",
    displayName: "Swift Fox 42",
  };
}

function acceptedAttempt(options: {
  rank: number;
  isTopTen: boolean;
  isPersonalBest: boolean;
}): AttemptState {
  return {
    status: "accepted",
    result: {
      status: "published",
      submittedScoreId: "score-1",
      levelVersionId: "sha256:level",
      elapsedSeconds: 18,
      isPersonalBest: options.isPersonalBest,
      personalBest: {
        scoreId: "score-1",
        elapsedSeconds: 18,
        rank: options.rank,
        isTopTen: options.isTopTen,
      },
    },
  };
}

function rejectedAttempt(
  code: "ATTEMPT_EXPIRED" | "LEVEL_VERSION_RETIRED" | "ATTEMPT_RATE_LIMITED",
  retryAfterSeconds?: number,
): AttemptState {
  return {
    status: "rejected",
    error: {
      code,
      message: "rejected",
      retryable: false,
      requestId: "request-1",
      retryAfterSeconds,
    },
  };
}
