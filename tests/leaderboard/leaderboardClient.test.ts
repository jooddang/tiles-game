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

  it("uses_the_frozen_claim_and_publication_routes_and_POST_bodies", async () => {
    const responses = [
      { continuationId: "continuation-1", expiresAt: "2026-08-18T00:00:00.000Z" },
      { scoreId: "score-1", bestScoreId: "score-1", claimed: true, publicHandle: "Player·A1B2" },
      { status: "claimed", scoreId: "score-1", bestScoreId: "score-1", claimed: true },
      { scoreId: "score-1", messageState: "visible", revision: 1 },
      { scoreId: "score-1", displayName: "Swift Fox", identityKind: "account", accountName: "Player·A1B2",
        message: "I own this ocean", messageState: "visible", publicationRevision: 1,
        requestId: "publication-1" },
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json(responses.shift()));
    const client = createLeaderboardClient(fetcher);

    await client.createClaimContinuation("score-1", "continuation-request");
    await client.claimScore("score-1", "continuation-request", "claim-request");
    await client.getClaimStatus("score-1", "continuation-request");
    await client.publishScore("score-1", {
      requestId: "publication-1", expectedCurrentRevision: null, message: "I own this ocean",
    });
    await client.getPublication("score-1");

    expect(fetcher.mock.calls.map(([path, init]) => [path, init?.method ?? "GET", init?.body])).toEqual([
      ["/api/tiles-game/scores/score-1/claim-continuation", "POST", JSON.stringify({ requestId: "continuation-request" })],
      ["/api/tiles-game/scores/claim", "POST", JSON.stringify({ scoreId: "score-1", continuationRequestId: "continuation-request", claimRequestId: "claim-request" })],
      ["/api/tiles-game/scores/claim-status?scoreId=score-1&continuationRequestId=continuation-request", "GET", undefined],
      ["/api/tiles-game/scores/score-1/publication", "POST", JSON.stringify({ requestId: "publication-1", expectedCurrentRevision: null, message: "I own this ocean" })],
      ["/api/tiles-game/scores/score-1/publication", "GET", undefined],
    ]);
  });

  it("preserves_legacy_rows_but_suppresses_an_incomplete_or_malformed_publication_group", async () => {
    const base = { scoreId: "score-1", rank: 1, displayName: "Swift Fox", elapsedSeconds: 12,
      achievedAt: "2026-08-10T00:00:00.000Z" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      levelVersionId: "sha256:level",
      entries: [
        base,
        { ...base, scoreId: "score-2", identityKind: "account", accountName: "Player·A1B2",
          message: "I own this maze", messageState: "visible", publicationRevision: 1 },
        { ...base, scoreId: "score-3", identityKind: "account", accountName: "Player·A1B2",
          message: { invalid: true }, messageState: "visible", publicationRevision: -1 },
      ],
    }));

    const result = await createLeaderboardClient(fetcher).getLeaderboard("sha256:level");
    expect(result.entries[0]).toEqual(base);
    expect(result.entries[1]).toMatchObject({ accountName: "Player·A1B2", message: "I own this maze" });
    expect(result.entries[2]).toEqual({ ...base, scoreId: "score-3" });
  });

  it.each([
    { status: "pending", scoreId: "score-1" },
    { status: "expired" },
    { status: "claimed_by_other" },
    { status: "invalid" },
    { status: "claimed", scoreId: "score-1" },
  ])("accepts_the_bounded_claim_status_union: $status", async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(
      createLeaderboardClient(fetcher).getClaimStatus("score-1", "continuation-1"),
    ).resolves.toEqual(body);
  });

  it("accepts_a_coherent_empty_publication_with_a_null_request_id", async () => {
    const body = { scoreId: "score-1", displayName: "Swift Fox", identityKind: "guest", accountName: null,
      message: null, messageState: "none", publicationRevision: null, requestId: null };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(createLeaderboardClient(fetcher).getPublication("score-1")).resolves.toEqual(body);
  });
});
