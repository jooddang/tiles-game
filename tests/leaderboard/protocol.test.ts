import { describe, expect, it } from "vitest";
import {
  API_PROTOCOL_VERSION,
  PUBLIC_ERROR_CODES,
  isReplayCommand,
  type AttemptCompleteResponse,
  type AttemptStartRequest,
  type LeaderboardResponse,
} from "../../src/leaderboard/protocol";

describe("leaderboard protocol", () => {
  it("isReplayCommand_accepts_only_the_versioned_command_schema", () => {
    expect(isReplayCommand({ type: "remove", tileId: "tile-1" })).toBe(true);
    expect(isReplayCommand({ type: "undo" })).toBe(true);
    expect(isReplayCommand({ type: "remove", tileId: "" })).toBe(false);
    expect(isReplayCommand({ type: "undo", tileId: "tile-1" })).toBe(false);
    expect(isReplayCommand({ type: "restart" })).toBe(false);
  });

  it("exports_stable_public_error_codes_and_dto_types", () => {
    const request: AttemptStartRequest = {
      apiProtocolVersion: API_PROTOCOL_VERSION,
      levelVersionId: "sha256:level",
      clientRequestId: "request-id",
    };
    const response: LeaderboardResponse = {
      levelVersionId: request.levelVersionId,
      entries: [
        {
          scoreId: "score-1",
          rank: 1,
          displayName: "Swift Fox",
          elapsedSeconds: 12,
          achievedAt: "2026-07-25T00:00:00.000Z",
        },
      ],
    };

    expect(response).toEqual({
      levelVersionId: "sha256:level",
      entries: [
        {
          scoreId: "score-1",
          rank: 1,
          displayName: "Swift Fox",
          elapsedSeconds: 12,
          achievedAt: "2026-07-25T00:00:00.000Z",
        },
      ],
    });
    expect(PUBLIC_ERROR_CODES).toEqual([
      "LEADERBOARD_UNAVAILABLE",
      "LEADERBOARD_DISABLED",
      "LEVEL_VERSION_UNKNOWN",
      "LEVEL_VERSION_RETIRED",
      "LEVEL_VERSION_MISMATCH",
      "REPLAY_CONTRACT_VERSION_MISMATCH",
      "API_PROTOCOL_VERSION_MISMATCH",
      "IDENTITY_COOKIE_INVALID",
      "DISPLAY_NAME_UNAVAILABLE",
      "REQUEST_INVALID",
      "REQUEST_TOO_LARGE",
      "ORIGIN_NOT_ALLOWED",
      "ATTEMPT_RATE_LIMITED",
      "ATTEMPT_NOT_FOUND",
      "ATTEMPT_EXPIRED",
      "ATTEMPT_ALREADY_COMPLETED",
      "RUN_COMMAND_INVALID",
      "RUN_COMMAND_UNKNOWN_TILE",
      "RUN_COMMAND_BLOCKED",
      "RUN_UNDO_REDUNDANT",
      "RUN_COMMAND_AFTER_COMPLETE",
      "RUN_NOT_COMPLETE",
      "SCORE_WRITE_CONFLICT",
    ]);
  });

  it("completion_payloads_express_published_slower_and_under_review_results", () => {
    const publishedSlower: AttemptCompleteResponse = {
      status: "published",
      submittedScoreId: "score-2",
      levelVersionId: "sha256:level",
      elapsedSeconds: 20,
      isPersonalBest: false,
      personalBest: {
        scoreId: "score-1",
        elapsedSeconds: 15,
        rank: 12,
        isTopTen: false,
      },
    };
    const underReview: AttemptCompleteResponse = {
      status: "under_review",
      submittedScoreId: "score-3",
      levelVersionId: "sha256:level",
      elapsedSeconds: 8,
      isPersonalBest: false,
      personalBest: {
        scoreId: "score-1",
        elapsedSeconds: 15,
        rank: 12,
        isTopTen: false,
      },
    };

    expect([publishedSlower, underReview]).toEqual([
      {
        status: "published",
        submittedScoreId: "score-2",
        levelVersionId: "sha256:level",
        elapsedSeconds: 20,
        isPersonalBest: false,
        personalBest: {
          scoreId: "score-1",
          elapsedSeconds: 15,
          rank: 12,
          isTopTen: false,
        },
      },
      {
        status: "under_review",
        submittedScoreId: "score-3",
        levelVersionId: "sha256:level",
        elapsedSeconds: 8,
        isPersonalBest: false,
        personalBest: {
          scoreId: "score-1",
          elapsedSeconds: 15,
          rank: 12,
          isTopTen: false,
        },
      },
    ]);
  });

  it("under_review_payload_can_preserve_that_no_visible_personal_best_exists", () => {
    const underReview: AttemptCompleteResponse = {
      status: "under_review",
      submittedScoreId: "score-1",
      levelVersionId: "sha256:level",
      elapsedSeconds: 8,
      isPersonalBest: false,
      personalBest: null,
    };

    expect(underReview.personalBest).toBeNull();
  });
});
