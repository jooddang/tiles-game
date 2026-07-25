import { describe, expect, it } from "vitest";
import {
  attemptReducer,
  canRetryAttempt,
  initialAttemptState,
  isBoardInputLocked,
} from "../../src/leaderboard/attemptMachine";
import type { AttemptStartResponse } from "../../src/leaderboard/protocol";

const attempt: AttemptStartResponse = {
  attemptId: "attempt-1",
  apiProtocolVersion: 2,
  levelVersionId: "sha256:level",
  replayContractVersion: 1,
  startsAt: "2026-07-25T12:00:05.000Z",
  expiresAt: "2026-07-25T12:30:05.000Z",
  displayName: "Swift Fox 42",
};

describe("attemptReducer", () => {
  it("locks_board_until_countdown_finishes", () => {
    const starting = attemptReducer(initialAttemptState, { type: "START_REQUESTED" });
    const countdown = attemptReducer(starting, {
      type: "START_SUCCEEDED",
      attempt,
    });

    expect(isBoardInputLocked(starting)).toBe(true);
    expect(isBoardInputLocked(countdown)).toBe(true);
    expect(
      attemptReducer(countdown, { type: "COUNTDOWN_FINISHED" }),
    ).toEqual({ status: "active", attempt, commandLog: [] });
  });

  it("records_only_active_commands_and_freezes_log_at_completion", () => {
    const active = {
      status: "active" as const,
      attempt,
      commandLog: [] as const,
    };
    const recorded = attemptReducer(active, {
      type: "COMMAND_RECORDED",
      command: { type: "remove", tileId: "tile-a" },
    });
    const submitting = attemptReducer(recorded, { type: "RUN_COMPLETED" });

    expect(submitting).toMatchObject({
      status: "submitting",
      commandLog: [{ type: "remove", tileId: "tile-a" }],
    });
    expect(
      attemptReducer(submitting, {
        type: "COMMAND_RECORDED",
        command: { type: "undo" },
      }),
    ).toEqual(submitting);
  });

  it("preserves_retry_only_until_attempt_expiry", () => {
    const retry = attemptReducer(
      { status: "submitting", attempt, commandLog: [] },
      {
        type: "SUBMIT_FAILED",
        error: {
          code: "LEADERBOARD_UNAVAILABLE",
          message: "offline",
          retryable: true,
          requestId: "request-1",
        },
      },
    );

    expect(canRetryAttempt(retry, Date.parse("2026-07-25T12:10:00Z"))).toBe(true);
    expect(canRetryAttempt(retry, Date.parse("2026-07-25T12:31:00Z"))).toBe(false);
  });

  it("separates_response_loss_from_terminal_rejection", () => {
    const submitting = { status: "submitting" as const, attempt, commandLog: [] };
    const error = {
      code: "ATTEMPT_EXPIRED" as const,
      message: "expired",
      retryable: false,
      requestId: "request-2",
    };

    expect(
      attemptReducer(submitting, {
        type: "SUBMIT_FAILED",
        error,
        responseLost: true,
      }).status,
    ).toBe("result_pending");
    expect(
      attemptReducer(submitting, { type: "SUBMIT_FAILED", error }).status,
    ).toBe("rejected");
  });
});
