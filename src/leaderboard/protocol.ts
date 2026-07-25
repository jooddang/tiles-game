export const REPLAY_CONTRACT_VERSION = 1 as const;
export const API_PROTOCOL_VERSION = 1 as const;

export const PUBLIC_ERROR_CODES = [
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
] as const;

export type PublicErrorCode = (typeof PUBLIC_ERROR_CODES)[number];

export {
  isReplayCommand,
  type RemoveReplayCommand,
  type ReplayCommand,
  type UndoReplayCommand,
} from "./replayCommand";

import type { ReplayCommand } from "./replayCommand";

export type LeaderboardEntry = {
  readonly scoreId: string;
  readonly rank: number;
  readonly displayName: string;
  readonly elapsedSeconds: number;
  readonly achievedAt: string;
};

export type LeaderboardResponse = {
  readonly levelVersionId: string;
  readonly entries: readonly LeaderboardEntry[];
};

export type PersonalBestResponse = {
  readonly levelVersionId: string;
  readonly displayName: string;
  readonly personalBest: LeaderboardEntry | null;
};

export type AttemptStartRequest = {
  readonly apiProtocolVersion: typeof API_PROTOCOL_VERSION;
  readonly levelVersionId: string;
  readonly clientRequestId: string;
};

export type AttemptStartResponse = {
  readonly attemptId: string;
  readonly apiProtocolVersion: typeof API_PROTOCOL_VERSION;
  readonly levelVersionId: string;
  readonly replayContractVersion: typeof REPLAY_CONTRACT_VERSION;
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly displayName: string;
};

export type AttemptCompleteRequest = {
  readonly commandLog: readonly ReplayCommand[];
};

export type PersonalBestSummary = {
  readonly scoreId: string;
  readonly elapsedSeconds: number;
  readonly rank: number;
  readonly isTopTen: boolean;
};

type AttemptCompletionBase = {
  readonly submittedScoreId: string;
  readonly levelVersionId: string;
  readonly elapsedSeconds: number;
  readonly personalBest: PersonalBestSummary | null;
};

export type AttemptPublishedResponse = AttemptCompletionBase & {
  readonly status: "published";
  readonly isPersonalBest: boolean;
};

export type AttemptUnderReviewResponse = AttemptCompletionBase & {
  readonly status: "under_review";
  readonly isPersonalBest: false;
};

export type AttemptCompleteResponse =
  | AttemptPublishedResponse
  | AttemptUnderReviewResponse;

export type AttemptStatusResponse =
  | { readonly status: "started"; readonly attempt: AttemptStartResponse }
  | { readonly status: "completed"; readonly result: AttemptCompleteResponse }
  | {
      readonly status: "expired" | "rejected";
      readonly error: PublicErrorResponse["error"];
    };

export type PublicErrorResponse = {
  readonly error: {
    readonly code: PublicErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly requestId: string;
    readonly retryAfterSeconds?: number;
  };
};
