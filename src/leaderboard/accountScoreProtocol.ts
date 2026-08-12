import type { AttemptCompleteResponse, LeaderboardEntry, LeaderboardResponse } from "./protocol";

export const ACCOUNT_SCORE_ERROR_CODES = [
  "ACCOUNT_UNAVAILABLE", "AUTH_REQUIRED", "CLAIM_EXPIRED", "CLAIM_INVALID",
  "FEATURE_DISABLED", "MESSAGE_ERASED", "MESSAGE_INVALID", "MESSAGE_LOCKED",
  "ORIGIN_NOT_ALLOWED", "PLAYER_OWNERSHIP_CONFLICT", "REQUEST_CONFLICT",
  "REQUEST_INVALID", "REQUEST_TOO_LARGE", "REVISION_CONFLICT",
  "SCORE_ALREADY_CLAIMED", "SCORE_NOT_FOUND", "SCORE_NOT_OWNED",
] as const;

export type AccountBinding =
  | { readonly state: "guest" }
  | { readonly state: "linked"; readonly scoreId: string; readonly bestScoreId: string | null }
  | { readonly state: "pending"; readonly retryable: true };

export type AccountAttemptCompleteResponse = AttemptCompleteResponse & {
  readonly accountBinding?: AccountBinding;
};

export type AccountLeaderboardEntry = LeaderboardEntry & {
  readonly identityKind?: "guest" | "account";
  readonly accountName?: string | null;
  readonly message?: string | null;
  readonly messageState?: "none" | "visible" | "hidden" | "locked";
  readonly publicationRevision?: number | null;
};

export type AccountLeaderboardResponse = Omit<LeaderboardResponse, "entries"> & {
  readonly entries: readonly AccountLeaderboardEntry[];
};

export type ClaimContinuationResponse = { readonly continuationId: string; readonly expiresAt: string };
export type ScoreClaimResponse = {
  readonly scoreId: string; readonly bestScoreId: string | null;
  readonly claimed: true; readonly publicHandle: string;
};
export type ScoreClaimStatusResponse =
  | { readonly status: "pending"; readonly scoreId: string }
  | { readonly status: "expired" | "claimed_by_other" | "invalid" }
  | { readonly status: "claimed"; readonly scoreId: string;
      readonly bestScoreId?: string | null; readonly claimed?: true };
export type PublicationWriteResponse = {
  readonly scoreId: string; readonly messageState: "none" | "visible"; readonly revision: number | null;
};
export type PublicationReadResponse = {
  readonly scoreId: string; readonly displayName: string; readonly identityKind: "guest" | "account";
  readonly accountName: string | null; readonly message: string | null;
  readonly messageState: "none" | "visible" | "hidden" | "locked";
  readonly publicationRevision: number | null; readonly requestId: string | null;
};
