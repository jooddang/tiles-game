import {
  API_PROTOCOL_VERSION,
  PUBLIC_ERROR_CODES,
  type AttemptCompleteRequest,
  type AttemptStartResponse,
  type PersonalBestResponse,
  type PublicErrorResponse,
} from "./protocol";
import {
  ACCOUNT_SCORE_ERROR_CODES,
  type AccountAttemptCompleteResponse,
  type AccountAttemptStatusResponse,
  type AccountLeaderboardEntry,
  type AccountLeaderboardResponse,
  type ClaimContinuationResponse,
  type PublicationReadResponse,
  type PublicationWriteResponse,
  type ScoreClaimResponse,
  type ScoreClaimStatusResponse,
} from "./accountScoreProtocol";

export type SafeClientErrorDetail = Omit<PublicErrorResponse["error"], "code"> & {
  readonly code: string;
};

export class LeaderboardClientError extends Error {
  constructor(readonly detail: SafeClientErrorDetail) {
    super(detail.message);
  }
}

export type LeaderboardClient = ReturnType<typeof createLeaderboardClient>;

export function createLeaderboardClient(fetcher: typeof fetch = fetch) {
  async function request<T>(
    path: string,
    validate: (value: unknown) => value is T,
    init?: RequestInit,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(path, {
        credentials: "same-origin",
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new LeaderboardClientError(networkError());
    }

    let body: T | PublicErrorResponse;
    try {
      body = (await response.json()) as T | PublicErrorResponse;
    } catch {
      throw new LeaderboardClientError(networkError());
    }
    if (!response.ok) {
      const originalDetail = isSafeError(body) ? body.error : networkError();
      const retryAfter = response.headers.get("Retry-After");
      const parsedRetryAfter = retryAfter === null ? undefined : Number(retryAfter);
      const detail =
        parsedRetryAfter !== undefined &&
        Number.isFinite(parsedRetryAfter) &&
        parsedRetryAfter >= 0 &&
        originalDetail.retryAfterSeconds === undefined
          ? { ...originalDetail, retryAfterSeconds: parsedRetryAfter }
          : originalDetail;
      throw new LeaderboardClientError(detail);
    }
    if (!validate(body)) {
      throw new LeaderboardClientError(networkError());
    }
    return body;
  }

  return {
    getLeaderboard(levelVersionId: string, signal?: AbortSignal) {
      return request<AccountLeaderboardResponse>(
        `/api/tiles-game/leaderboard/${encodeURIComponent(levelVersionId)}`,
        isLeaderboardResponse,
        { signal },
      ).then(normalizeLeaderboardResponse);
    },
    getPersonalBest(levelVersionId: string, signal?: AbortSignal) {
      return request<PersonalBestResponse>(
        `/api/tiles-game/leaderboard/${encodeURIComponent(levelVersionId)}/me`,
        isPersonalBestResponse,
        { signal },
      );
    },
    startAttempt(
      levelVersionId: string,
      clientRequestId: string,
      signal?: AbortSignal,
    ) {
      return request<AttemptStartResponse>(
        "/api/tiles-game/leaderboard/attempts",
        isAttemptStartResponse,
        {
          method: "POST",
          signal,
          body: JSON.stringify({
            apiProtocolVersion: API_PROTOCOL_VERSION,
            levelVersionId,
            clientRequestId,
          }),
        },
      );
    },
    getAttempt(attemptId: string, signal?: AbortSignal) {
      return request<AccountAttemptStatusResponse>(
        `/api/tiles-game/leaderboard/attempts/${encodeURIComponent(attemptId)}`,
        isAttemptStatusResponse,
        { signal },
      );
    },
    completeAttempt(
      attemptId: string,
      body: AttemptCompleteRequest,
      signal?: AbortSignal,
    ) {
      return request<AccountAttemptCompleteResponse>(
        `/api/tiles-game/leaderboard/attempts/${encodeURIComponent(attemptId)}/complete`,
        isAttemptCompleteResponse,
        { method: "POST", body: JSON.stringify(body), signal },
      );
    },
    createClaimContinuation(scoreId: string, requestId: string, signal?: AbortSignal) {
      return request<ClaimContinuationResponse>(
        `/api/tiles-game/scores/${encodeURIComponent(scoreId)}/claim-continuation`,
        isClaimContinuationResponse,
        { method: "POST", body: JSON.stringify({ requestId }), signal },
      );
    },
    claimScore(
      scoreId: string,
      continuationRequestId: string,
      claimRequestId: string,
      signal?: AbortSignal,
    ) {
      return request<ScoreClaimResponse>(
        "/api/tiles-game/scores/claim",
        isScoreClaimResponse,
        {
          method: "POST",
          body: JSON.stringify({ scoreId, continuationRequestId, claimRequestId }),
          signal,
        },
      );
    },
    getClaimStatus(scoreId: string, continuationRequestId: string, signal?: AbortSignal) {
      const query = new URLSearchParams({ scoreId, continuationRequestId });
      return request<ScoreClaimStatusResponse>(
        `/api/tiles-game/scores/claim-status?${query.toString()}`,
        isScoreClaimStatusResponse,
        { signal },
      );
    },
    publishScore(
      scoreId: string,
      body: { readonly requestId: string; readonly expectedCurrentRevision: number | null; readonly message: string },
      signal?: AbortSignal,
    ) {
      return request<PublicationWriteResponse>(
        `/api/tiles-game/scores/${encodeURIComponent(scoreId)}/publication`,
        isPublicationWriteResponse,
        { method: "POST", body: JSON.stringify(body), signal },
      );
    },
    getPublication(scoreId: string, signal?: AbortSignal) {
      return request<PublicationReadResponse>(
        `/api/tiles-game/scores/${encodeURIComponent(scoreId)}/publication`,
        isPublicationReadResponse,
        { signal },
      );
    },
  };
}

function isPublicError(value: unknown): value is PublicErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "code" in value.error &&
    typeof value.error.code === "string" &&
    (PUBLIC_ERROR_CODES as readonly string[]).includes(value.error.code) &&
    "message" in value.error &&
    typeof value.error.message === "string" &&
    "retryable" in value.error &&
    typeof value.error.retryable === "boolean" &&
    "requestId" in value.error &&
    typeof value.error.requestId === "string"
  );
}

function isSafeError(value: unknown): value is { readonly error: SafeClientErrorDetail } {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.code !== "string") return false;
  const known = (PUBLIC_ERROR_CODES as readonly string[]).includes(value.error.code)
    || (ACCOUNT_SCORE_ERROR_CODES as readonly string[]).includes(value.error.code);
  return known && typeof value.error.message === "string"
    && typeof value.error.retryable === "boolean" && typeof value.error.requestId === "string";
}

function isLeaderboardResponse(value: unknown): value is AccountLeaderboardResponse {
  return (
    isRecord(value) &&
    typeof value.levelVersionId === "string" &&
    Array.isArray(value.entries) &&
    value.entries.length <= 10 &&
    value.entries.every(isLeaderboardEntry)
  );
}

function isPersonalBestResponse(value: unknown): value is PersonalBestResponse {
  return (
    isRecord(value) &&
    typeof value.levelVersionId === "string" &&
    typeof value.displayName === "string" &&
    (value.personalBest === null || isLeaderboardEntry(value.personalBest))
  );
}

function isLeaderboardEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.scoreId === "string" &&
    Number.isInteger(value.rank) &&
    (value.rank as number) > 0 &&
    typeof value.displayName === "string" &&
    Number.isInteger(value.elapsedSeconds) &&
    (value.elapsedSeconds as number) >= 0 &&
    typeof value.achievedAt === "string"
  );
}

function normalizeLeaderboardResponse(value: AccountLeaderboardResponse): AccountLeaderboardResponse {
  return { ...value, entries: value.entries.map(normalizeLeaderboardEntry) };
}

function normalizeLeaderboardEntry(value: AccountLeaderboardEntry): AccountLeaderboardEntry {
  const legacy = {
    scoreId: value.scoreId,
    rank: value.rank,
    displayName: value.displayName,
    elapsedSeconds: value.elapsedSeconds,
    achievedAt: value.achievedAt,
  };
  return isPublicationFields(value) ? { ...legacy,
    identityKind: value.identityKind, accountName: value.accountName,
    message: value.message, messageState: value.messageState,
    publicationRevision: value.publicationRevision,
  } : legacy;
}

function isPublicationFields(value: Record<string, unknown>): value is Record<string, unknown> & Required<
  Pick<AccountLeaderboardEntry, "identityKind" | "accountName" | "message" | "messageState" | "publicationRevision">
> {
  if (value.identityKind === "guest") {
    return value.accountName === null && value.message === null && value.messageState === "none"
      && value.publicationRevision === null;
  }
  if (value.identityKind !== "account" || typeof value.accountName !== "string"
    || value.accountName.length === 0 || !isMessageState(value.messageState)) return false;
  if (value.messageState === "visible") {
    return typeof value.message === "string" && value.message.length > 0
      && Number.isInteger(value.publicationRevision) && (value.publicationRevision as number) > 0;
  }
  return value.message === null && value.publicationRevision === null;
}

function isAttemptStartResponse(value: unknown): value is AttemptStartResponse {
  return (
    isRecord(value) &&
    typeof value.attemptId === "string" &&
    value.apiProtocolVersion === API_PROTOCOL_VERSION &&
    typeof value.levelVersionId === "string" &&
    Number.isInteger(value.replayContractVersion) &&
    typeof value.startsAt === "string" &&
    Number.isFinite(Date.parse(value.startsAt)) &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    typeof value.displayName === "string"
  );
}

function isAttemptStatusResponse(value: unknown): value is AccountAttemptStatusResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    return false;
  }
  if (value.status === "started") {
    return isAttemptStartResponse(value.attempt);
  }
  if (value.status === "completed") {
    return isAttemptCompleteResponse(value.result)
      && (value.accountBinding === undefined || isAccountBinding(value.accountBinding));
  }
  return (
    (value.status === "expired" || value.status === "rejected") &&
    isPublicError({ error: value.error })
  );
}

function isAttemptCompleteResponse(value: unknown): value is AccountAttemptCompleteResponse {
  return (
    isRecord(value) &&
    (value.status === "published" || value.status === "under_review") &&
    typeof value.submittedScoreId === "string" &&
    typeof value.levelVersionId === "string" &&
    Number.isInteger(value.elapsedSeconds) &&
    (value.elapsedSeconds as number) >= 0 &&
    (value.personalBest === null || isPersonalBestSummary(value.personalBest)) &&
    typeof value.isPersonalBest === "boolean" &&
    (value.accountBinding === undefined || isAccountBinding(value.accountBinding))
  );
}

function isAccountBinding(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.state === "guest") return true;
  if (value.state === "pending") return value.retryable === true;
  return value.state === "linked" && typeof value.scoreId === "string"
    && (value.bestScoreId === null || typeof value.bestScoreId === "string");
}

function isClaimContinuationResponse(value: unknown): value is ClaimContinuationResponse {
  return isRecord(value) && typeof value.continuationId === "string"
    && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt));
}

function isScoreClaimResponse(value: unknown): value is ScoreClaimResponse {
  return isRecord(value) && typeof value.scoreId === "string"
    && (value.bestScoreId === null || typeof value.bestScoreId === "string")
    && value.claimed === true && typeof value.publicHandle === "string";
}

function isScoreClaimStatusResponse(value: unknown): value is ScoreClaimStatusResponse {
  if (!isRecord(value)) return false;
  if (value.status === "pending") return typeof value.scoreId === "string";
  if (value.status === "expired" || value.status === "claimed_by_other" || value.status === "invalid") return true;
  return value.status === "claimed" && typeof value.scoreId === "string"
    && (value.bestScoreId === undefined || value.bestScoreId === null || typeof value.bestScoreId === "string")
    && (value.claimed === undefined || value.claimed === true);
}

function isPublicationWriteResponse(value: unknown): value is PublicationWriteResponse {
  return isRecord(value) && typeof value.scoreId === "string"
    && (value.messageState === "none" || value.messageState === "visible")
    && (value.revision === null || (Number.isInteger(value.revision) && (value.revision as number) > 0));
}

function isPublicationReadResponse(value: unknown): value is PublicationReadResponse {
  return isRecord(value) && typeof value.scoreId === "string"
    && typeof value.displayName === "string"
    && (value.requestId === null || typeof value.requestId === "string") && isPublicationFields(value);
}

function isMessageState(value: unknown): value is "none" | "visible" | "hidden" | "locked" {
  return value === "none" || value === "visible" || value === "hidden" || value === "locked";
}

function isPersonalBestSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.scoreId === "string" &&
    Number.isInteger(value.elapsedSeconds) &&
    (value.elapsedSeconds as number) >= 0 &&
    Number.isInteger(value.rank) &&
    (value.rank as number) > 0 &&
    typeof value.isTopTen === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function networkError(): PublicErrorResponse["error"] {
  return {
    code: "LEADERBOARD_UNAVAILABLE",
    message: "Records are temporarily unavailable.",
    retryable: true,
    requestId: "client-network",
  };
}
