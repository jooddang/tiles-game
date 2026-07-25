import {
  API_PROTOCOL_VERSION,
  PUBLIC_ERROR_CODES,
  type AttemptCompleteRequest,
  type AttemptCompleteResponse,
  type AttemptStartResponse,
  type AttemptStatusResponse,
  type LeaderboardResponse,
  type PersonalBestResponse,
  type PublicErrorResponse,
} from "./protocol";

export class LeaderboardClientError extends Error {
  constructor(readonly detail: PublicErrorResponse["error"]) {
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
      const originalDetail = isPublicError(body) ? body.error : networkError();
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
      return request<LeaderboardResponse>(
        `/api/tiles-game/leaderboard/${encodeURIComponent(levelVersionId)}`,
        isLeaderboardResponse,
        { signal },
      );
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
      return request<AttemptStatusResponse>(
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
      return request<AttemptCompleteResponse>(
        `/api/tiles-game/leaderboard/attempts/${encodeURIComponent(attemptId)}/complete`,
        isAttemptCompleteResponse,
        { method: "POST", body: JSON.stringify(body), signal },
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

function isLeaderboardResponse(value: unknown): value is LeaderboardResponse {
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

function isAttemptStatusResponse(value: unknown): value is AttemptStatusResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    return false;
  }
  if (value.status === "started") {
    return isAttemptStartResponse(value.attempt);
  }
  if (value.status === "completed") {
    return isAttemptCompleteResponse(value.result);
  }
  return (
    (value.status === "expired" || value.status === "rejected") &&
    isPublicError({ error: value.error })
  );
}

function isAttemptCompleteResponse(value: unknown): value is AttemptCompleteResponse {
  return (
    isRecord(value) &&
    (value.status === "published" || value.status === "under_review") &&
    typeof value.submittedScoreId === "string" &&
    typeof value.levelVersionId === "string" &&
    Number.isInteger(value.elapsedSeconds) &&
    (value.elapsedSeconds as number) >= 0 &&
    (value.personalBest === null || isPersonalBestSummary(value.personalBest)) &&
    typeof value.isPersonalBest === "boolean"
  );
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
