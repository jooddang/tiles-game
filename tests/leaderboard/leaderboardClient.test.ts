import { describe, expect, it, vi } from "vitest";
import {
  createLeaderboardClient,
  LeaderboardClientError,
} from "../../src/leaderboard/leaderboardClient";

describe("leaderboardClient", () => {
  it("uses_same_origin_credentials_and_protocol_for_attempt_start", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        attemptId: "attempt-1",
        apiProtocolVersion: 2,
        levelVersionId: "sha256:level",
        replayContractVersion: 1,
        startsAt: "2026-07-25T12:00:05.000Z",
        expiresAt: "2026-07-25T12:30:05.000Z",
        displayName: "Swift Fox 42",
      }),
    );

    await createLeaderboardClient(fetcher).startAttempt(
      "sha256:level",
      "request-1",
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/tiles-game/leaderboard/attempts",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          apiProtocolVersion: 2,
          levelVersionId: "sha256:level",
          clientRequestId: "request-1",
        }),
      }),
    );
  });

  it("maps_network_failure_to_retryable_service_error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));

    await expect(
      createLeaderboardClient(fetcher).getLeaderboard("sha256:level"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<LeaderboardClientError>>({
        detail: expect.objectContaining({
          code: "LEADERBOARD_UNAVAILABLE",
          retryable: true,
        }),
      }),
    );
  });

  it("maps_malformed_success_body_to_retryable_service_error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>bad gateway</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(
      createLeaderboardClient(fetcher).getLeaderboard("sha256:level"),
    ).rejects.toEqual(
      expect.objectContaining({
        detail: expect.objectContaining({ code: "LEADERBOARD_UNAVAILABLE" }),
      }),
    );
  });

  it("accepts_only_finite_nonnegative_retry_after", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "ATTEMPT_RATE_LIMITED",
            message: "limited",
            retryable: true,
            requestId: "request-1",
          },
        },
        { status: 429, headers: { "Retry-After": "-1" } },
      ),
    );

    await expect(
      createLeaderboardClient(fetcher).startAttempt("sha256:level", "request-1"),
    ).rejects.toEqual(
      expect.objectContaining({
        detail: expect.not.objectContaining({ retryAfterSeconds: expect.anything() }),
      }),
    );
  });
});
