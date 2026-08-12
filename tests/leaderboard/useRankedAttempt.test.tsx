import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardClient } from "../../src/leaderboard/leaderboardClient";
import { saveAttemptSession } from "../../src/leaderboard/attemptSession";
import type {
  AttemptCompleteResponse,
  AttemptStartResponse,
} from "../../src/leaderboard/protocol";
import { useRankedAttempt } from "../../src/leaderboard/useRankedAttempt";
import { createRankedAttemptJournal } from "../../src/leaderboard/rankedAttemptJournal";
import type { RankedOutboxDatabase, RankedOutboxItem } from "../../src/leaderboard/rankedOutbox";

const LEVEL_A = `sha256:${"a".repeat(64)}`;
const LEVEL_B = `sha256:${"b".repeat(64)}`;

describe("useRankedAttempt", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it("cancel_owns_late_start_and_prevents_session_resurrection", async () => {
    const start = deferred<AttemptStartResponse>();
    const client = clientFake({ startAttempt: vi.fn(() => start.promise) });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();

    act(() => {
      void result.current.startRankedRun();
    });
    act(() => result.current.cancelRankedRun());
    await act(async () => start.resolve(attemptFor(LEVEL_A)));

    expect(result.current.attemptState).toEqual({ status: "unranked" });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("cancel_owns_a_late_completion_response", async () => {
    vi.useFakeTimers();
    const completion = deferred<AttemptCompleteResponse>();
    const client = clientFake({
      startAttempt: vi.fn().mockResolvedValue(attemptFor(LEVEL_A, 100)),
      completeAttempt: vi.fn(() => completion.promise),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();
    await act(async () => {
      void result.current.startRankedRun();
      await Promise.resolve();
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    act(() =>
      result.current.recordCommand({ type: "remove", tileId: "tile-a" }, true),
    );
    act(() => result.current.cancelRankedRun());
    await act(async () => completion.resolve(completionFor(LEVEL_A)));

    expect(result.current.attemptState).toEqual({ status: "unranked" });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("level_switch_ignores_late_reads_from_the_previous_level", async () => {
    const oldBoard = deferred<Awaited<ReturnType<LeaderboardClient["getLeaderboard"]>>>();
    const oldPersonal = deferred<Awaited<ReturnType<LeaderboardClient["getPersonalBest"]>>>();
    const client = clientFake({
      getLeaderboard: vi.fn((level: string) =>
        level === LEVEL_A
          ? oldBoard.promise
          : Promise.resolve({ levelVersionId: LEVEL_B, entries: [] }),
      ),
      getPersonalBest: vi.fn((level: string) =>
        level === LEVEL_A
          ? oldPersonal.promise
          : Promise.resolve(personalFor(LEVEL_B, "Copper Otter 7")),
      ),
    });
    const { result, rerender } = renderHook(
      ({ level }) =>
        useRankedAttempt({ enabled: true, levelVersionId: level, client }),
      { initialProps: { level: LEVEL_A } },
    );

    rerender({ level: LEVEL_B });
    await waitFor(() =>
      expect(result.current.recordsState).toMatchObject({
        levelVersionId: LEVEL_B,
      }),
    );
    await act(async () => {
      oldBoard.resolve({ levelVersionId: LEVEL_A, entries: [] });
      oldPersonal.resolve(personalFor(LEVEL_A, "Stale Fox 1"));
    });

    expect(result.current.recordsState).toMatchObject({
      levelVersionId: LEVEL_B,
      personal: { displayName: "Copper Otter 7" },
    });
  });

  it("recovers_a_future_server_start_into_countdown_before_active_play", async () => {
    vi.useFakeTimers();
    const attempt = attemptFor(LEVEL_A, 2_500);
    saveAttemptSession({ attempt, commandLog: [] });
    const restoreCommands = vi.fn();
    const client = clientFake({
      getAttempt: vi.fn().mockResolvedValue({ status: "started", attempt }),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({
        enabled: true,
        levelVersionId: LEVEL_A,
        client,
        restoreCommands,
      }),
    );
    await act(async () => Promise.resolve());

    expect(result.current.attemptState.status).toBe("countdown");
    expect(result.current.countdown).toBe(3);
    expect(restoreCommands).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2_600);
      await Promise.resolve();
    });
    expect(result.current.attemptState.status).toBe("active");
  });

  it("merges_same_level_partial_reads_and_exposes_identity_before_start", async () => {
    const client = clientFake({
      getLeaderboard: vi.fn().mockRejectedValue(new Error("offline")),
      getPersonalBest: vi
        .fn()
        .mockResolvedValue(personalFor(LEVEL_A, "Copper Otter 7")),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );

    await waitFor(() =>
      expect(result.current.recordsState).toMatchObject({
        status: "partial",
        levelVersionId: LEVEL_A,
        leaderboard: null,
        personal: { displayName: "Copper Otter 7" },
      }),
    );
  });

  it("preserves_a_completed_recovery_session_during_an_outage", async () => {
    const attempt = attemptFor(LEVEL_A, -2_000);
    saveAttemptSession({
      attempt,
      commandLog: [{ type: "remove", tileId: "tile-a" }],
    });
    const client = clientFake({
      getAttempt: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({
        enabled: true,
        levelVersionId: LEVEL_A,
        client,
        restoreCommands: () => "complete",
      }),
    );

    await waitFor(() =>
      expect(result.current.attemptState.status).toBe("result_pending"),
    );
    expect(window.sessionStorage.length).toBe(1);
  });

  it("rejects_a_start_response_bound_to_another_level", async () => {
    const client = clientFake({
      startAttempt: vi.fn().mockResolvedValue(attemptFor(LEVEL_B)),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();

    await act(async () => {
      await result.current.startRankedRun();
    });

    expect(result.current.attemptState).toMatchObject({
      status: "rejected",
      error: { code: "API_PROTOCOL_VERSION_MISMATCH" },
    });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps_authoritative_completion_ahead_of_a_stale_followup_read", async () => {
    vi.useFakeTimers();
    const completion = completionFor(LEVEL_A);
    const attempt = attemptFor(LEVEL_A, 500);
    const client = clientFake({
      startAttempt: vi.fn().mockResolvedValue(attempt),
      completeAttempt: vi.fn().mockResolvedValue(completion),
      getPersonalBest: vi.fn().mockResolvedValue(personalFor(LEVEL_A, "Swift Fox 42")),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();

    await act(async () => {
      void result.current.startRankedRun();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    act(() =>
      result.current.recordCommand({ type: "remove", tileId: "tile-a" }, true),
    );

    vi.useRealTimers();
    await waitFor(() =>
      expect(result.current.attemptState.status).toBe("accepted"),
    );
    expect(result.current.recordsState).toMatchObject({
      status: "stale",
      authoritativeResult: completion,
      leaderboard: {
        entries: [],
      },
      personal: {
        personalBest: {
          scoreId: "score-1",
          rank: 1,
        },
      },
    });
  });

  it("keeps_cached_top_ten_stale_when_concurrent_rank_changes_are_unknown", async () => {
    vi.useFakeTimers();
    const previousBest = {
      scoreId: "old-score",
      rank: 2,
      displayName: "Swift Fox 42",
      elapsedSeconds: 24,
      achievedAt: "2026-07-24T00:00:00.000Z",
    };
    const staleEntries = [
      {
        scoreId: "leader-score",
        rank: 1,
        displayName: "Copper Otter 7",
        elapsedSeconds: 20,
        achievedAt: "2026-07-23T00:00:00.000Z",
      },
      previousBest,
      {
        scoreId: "third-score",
        rank: 3,
        displayName: "Amber Crane 3",
        elapsedSeconds: 27,
        achievedAt: "2026-07-22T00:00:00.000Z",
      },
      {
        scoreId: "fourth-score",
        rank: 4,
        displayName: "Violet Lynx 9",
        elapsedSeconds: 29,
        achievedAt: "2026-07-21T00:00:00.000Z",
      },
    ];
    const completion = {
      ...completionFor(LEVEL_A),
      submittedScoreId: "slower-score",
      isPersonalBest: false,
      personalBest: {
        scoreId: "old-score",
        elapsedSeconds: 24,
        rank: 4,
        isTopTen: true,
      },
    } satisfies AttemptCompleteResponse;
    const client = clientFake({
      getLeaderboard: vi.fn().mockResolvedValue({
        levelVersionId: LEVEL_A,
        entries: staleEntries,
      }),
      getPersonalBest: vi.fn().mockResolvedValue({
        levelVersionId: LEVEL_A,
        displayName: "Swift Fox 42",
        personalBest: previousBest,
      }),
      startAttempt: vi.fn().mockResolvedValue(attemptFor(LEVEL_A, 1_500)),
      completeAttempt: vi.fn().mockResolvedValue(completion),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();

    await act(async () => {
      await result.current.startRankedRun();
      vi.advanceTimersByTime(1_600);
      await Promise.resolve();
    });
    act(() =>
      result.current.recordCommand({ type: "remove", tileId: "tile-a" }, true),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const snapshot = result.current.recordsState;
    expect(snapshot.status).toBe("stale");
    if (
      snapshot.status === "ready" ||
      snapshot.status === "empty" ||
      snapshot.status === "partial" ||
      snapshot.status === "stale"
    ) {
      expect(snapshot.leaderboard?.entries).toEqual(staleEntries);
      expect(snapshot.personal?.personalBest).toMatchObject({
        scoreId: "old-score",
        rank: 4,
      });
      expect(snapshot.authoritativeResult).toEqual(completion);
    }
  });

  it("requests_a_fresh_attempt_when_the_start_window_is_too_short", async () => {
    vi.useFakeTimers();
    const startAttempt = vi
      .fn()
      .mockResolvedValueOnce(attemptFor(LEVEL_A, 500))
      .mockResolvedValueOnce(attemptFor(LEVEL_A, 2_000));
    const client = clientFake({ startAttempt });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();

    await act(async () => {
      await result.current.startRankedRun();
    });

    expect(startAttempt).toHaveBeenCalledTimes(2);
    expect(result.current.attemptState).toMatchObject({
      status: "countdown",
      attempt: { startsAt: expect.any(String) },
    });
  });

  it("retries_a_failed_start_with_the_same_UUID_already_in_the_durable_journal", async () => {
    const items = new Map<string, RankedOutboxItem>();
    const put = vi.fn(async (item: RankedOutboxItem) => { items.set(item.id, item); });
    const database: RankedOutboxDatabase = {
      put,
      get: async (id) => items.get(id) ?? null,
      list: async () => [...items.values()],
      delete: async (id) => { items.delete(id); },
      acquireLease: async () => 1,
      releaseLease: async () => undefined,
      quarantineLegacy: async () => undefined,
    };
    const journal = await createRankedAttemptJournal(database);
    const startAttempt = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(attemptFor(LEVEL_A));
    const client = clientFake({ startAttempt });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client, journal }),
    );
    await settleReads();

    await act(async () => { await result.current.startRankedRun(); });
    await act(async () => { await result.current.startRankedRun(); });

    expect(startAttempt).toHaveBeenCalledTimes(2);
    expect(startAttempt.mock.calls[0][1]).toBe(startAttempt.mock.calls[1][1]);
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(startAttempt.mock.invocationCallOrder[0]);
  });

  it("enumerates_and_converges_a_durable_completion_after_browser_restart", async () => {
    const items = new Map<string, RankedOutboxItem>();
    const database = journalDatabase(items);
    const firstTab = await createRankedAttemptJournal(database);
    const attempt = attemptFor(LEVEL_A, -2_000);
    const intent = await firstTab.beginStart(LEVEL_A, null);
    await firstTab.acceptStart(intent, attempt);
    await firstTab.appendCommand(attempt, { type: "remove", tileId: "tile-a" });
    await firstTab.freezeCompletion(attempt);
    const restartedJournal = await createRankedAttemptJournal(database);
    const completion = completionFor(LEVEL_A);
    const client = clientFake({
      getAttempt: vi.fn().mockResolvedValue({ status: "completed", result: completion }),
    });

    const { result } = renderHook(() => useRankedAttempt({
      enabled: true, levelVersionId: LEVEL_A, client, journal: restartedJournal,
      restoreCommands: () => "complete",
    }));

    await waitFor(() => expect(result.current.attemptState.status).toBe("accepted"));
    expect(await restartedJournal.itemForAttempt(attempt.attemptId)).toBeNull();
  });

  it("restores_a_guest_receipt_before_reporting_recovery_ready", async () => {
    const items = new Map<string, RankedOutboxItem>();
    const database = journalDatabase(items);
    const firstTab = await createRankedAttemptJournal(database);
    const attempt = attemptFor(LEVEL_A, -2_000);
    const intent = await firstTab.beginStart(LEVEL_A, null);
    await firstTab.acceptStart(intent, attempt);
    await firstTab.appendCommand(attempt, { type: "remove", tileId: "tile-a" });
    await firstTab.recordReceipt(attempt, {
      ...completionFor(LEVEL_A),
      accountBinding: { state: "guest" },
    });
    const status = deferred<Awaited<ReturnType<LeaderboardClient["getAttempt"]>>>();
    const client = clientFake({ getAttempt: vi.fn(() => status.promise) });
    const restartedJournal = await createRankedAttemptJournal(database);
    const { result } = renderHook(() => useRankedAttempt({
      enabled: true, levelVersionId: LEVEL_A, client, journal: restartedJournal,
      restoreCommands: () => "complete",
    }));

    expect(result.current.recoveryReady).toBe(false);
    await waitFor(() => expect(result.current.attemptState.status).toBe("result_pending"));
    expect(result.current.recoveryReady).toBe(false);
    expect(result.current.attemptState.status).toBe("result_pending");
    await act(async () => status.resolve({ status: "completed", result: completionFor(LEVEL_A),
      accountBinding: { state: "guest" } }));
    await waitFor(() => expect(result.current.attemptState.status).toBe("accepted"));
    expect(result.current.recoveryReady).toBe(true);
  });

  it("retains_an_accepted_receipt_while_account_binding_is_pending", async () => {
    vi.useFakeTimers();
    const items = new Map<string, RankedOutboxItem>();
    const journal = await createRankedAttemptJournal(journalDatabase(items));
    const attempt = attemptFor(LEVEL_A, 100);
    const completion = {
      ...completionFor(LEVEL_A), accountBinding: { state: "pending", retryable: true } as const,
    };
    const client = clientFake({
      startAttempt: vi.fn().mockResolvedValue(attempt),
      completeAttempt: vi.fn().mockResolvedValue(completion),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client, journal }),
    );
    await settleReads();
    await act(async () => {
      await result.current.startRankedRun();
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    act(() => result.current.recordCommand({ type: "remove", tileId: "tile-a" }, true));
    vi.useRealTimers();

    await waitFor(() => expect(result.current.attemptState.status).toBe("accepted"));
    expect(await journal.itemForAttempt(attempt.attemptId)).toMatchObject({ terminalResult: completion });
  });

  it("repairs_a_nested_pending_binding_with_the_same_completion_before_terminal_delete", async () => {
    const attempt = attemptFor(LEVEL_A, -2_000);
    saveAttemptSession({ attempt, commandLog: [{ type: "remove", tileId: "tile-a" }] });
    const pendingResult = completionFor(LEVEL_A);
    const linkedResult = {
      ...pendingResult,
      accountBinding: { state: "linked", scoreId: "score-1", bestScoreId: "score-1",
        accountName: "Player·A1B2" } as const,
    };
    const completeAttempt = vi.fn().mockResolvedValue(linkedResult);
    const client = clientFake({
      getAttempt: vi.fn().mockResolvedValue({ status: "completed", result: {
        ...pendingResult, accountBinding: { state: "pending", retryable: true },
      } }),
      completeAttempt,
    });

    const { result } = renderHook(() => useRankedAttempt({
      enabled: true, levelVersionId: LEVEL_A, client, restoreCommands: () => "complete",
    }));

    await waitFor(() => expect(result.current.attemptState.status).toBe("accepted"));
    expect(completeAttempt).toHaveBeenCalledWith(
      attempt.attemptId,
      { commandLog: [{ type: "remove", tileId: "tile-a" }] },
      expect.any(AbortSignal),
    );
  });

  it("keeps_an_active_ranked_run_on_server_time_when_the_page_is_hidden", async () => {
    vi.useFakeTimers();
    const client = clientFake({
      startAttempt: vi.fn().mockResolvedValue(attemptFor(LEVEL_A, 100)),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();
    await act(async () => {
      await result.current.startRankedRun();
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(result.current.attemptState.status).toBe("active");
    expect(window.sessionStorage.length).toBe(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    expect(result.current.attemptState.status).toBe("active");
    expect(result.current.rankedElapsedSeconds).toBe(1);
    expect(window.sessionStorage.length).toBe(1);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("recovers_a_committed_lost_response_after_submit_expiry", async () => {
    vi.useFakeTimers();
    const client = clientFake({
      startAttempt: vi.fn().mockResolvedValue(attemptFor(LEVEL_A, 100, 1_000)),
      completeAttempt: vi.fn().mockRejectedValue(new TypeError("offline")),
      getAttempt: vi.fn().mockResolvedValue({
        status: "completed",
        result: completionFor(LEVEL_A),
      }),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();

    await act(async () => {
      await result.current.startRankedRun();
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    act(() =>
      result.current.recordCommand({ type: "remove", tileId: "tile-a" }, true),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.attemptState.status).toBe("result_pending");
    expect(window.sessionStorage.length).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
    });
    expect(result.current.attemptState.status).toBe("result_pending");
    expect(window.sessionStorage.length).toBe(1);

    await act(async () => {
      await result.current.retrySubmission();
    });
    expect(result.current.attemptState.status).toBe("accepted");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps_an_expired_incomplete_session_locked_while_status_is_offline", async () => {
    const expired = attemptFor(LEVEL_A, -60_000, -1);
    saveAttemptSession({ attempt: expired, commandLog: [] });
    const client = clientFake({
      getAttempt: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );

    await waitFor(() =>
      expect(result.current.attemptState.status).toBe("result_pending"),
    );
    expect(window.sessionStorage.length).toBe(1);
  });

  it("terminalizes_an_expired_recovery_when_status_is_still_started", async () => {
    const expired = attemptFor(LEVEL_A, -60_000, -1);
    saveAttemptSession({ attempt: expired, commandLog: [] });
    const client = clientFake({
      getAttempt: vi.fn().mockResolvedValue({
        status: "started",
        attempt: expired,
      }),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );

    await waitFor(() =>
      expect(result.current.attemptState).toMatchObject({
        status: "rejected",
        error: { code: "ATTEMPT_EXPIRED" },
      }),
    );
    expect(window.sessionStorage.length).toBe(0);
  });

  it("expires_an_active_attempt_without_losing_local_play", async () => {
    vi.useFakeTimers();
    const client = clientFake({
      startAttempt: vi.fn().mockResolvedValue(attemptFor(LEVEL_A, 100, 500)),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();
    await act(async () => {
      await result.current.startRankedRun();
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(result.current.attemptState.status).toBe("active");

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(result.current.attemptState).toMatchObject({
      status: "rejected",
      error: { code: "ATTEMPT_EXPIRED" },
    });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("checks_an_expired_recovery_before_clearing_a_terminal_attempt", async () => {
    const expired = attemptFor(LEVEL_A, -60_000, -1);
    window.sessionStorage.setItem(
      "tiles-game-ranked-attempt-v1",
      JSON.stringify({ attempt: expired, commandLog: [] }),
    );
    const client = clientFake({
      getAttempt: vi.fn().mockResolvedValue({
        status: "expired",
        error: {
          code: "ATTEMPT_EXPIRED",
          message: "expired",
          retryable: false,
          requestId: "request-expired",
        },
      }),
    });
    const { result } = renderHook(() =>
      useRankedAttempt({ enabled: true, levelVersionId: LEVEL_A, client }),
    );
    await settleReads();

    await waitFor(() =>
      expect(result.current.attemptState).toMatchObject({
        status: "rejected",
        error: { code: "ATTEMPT_EXPIRED" },
      }),
    );
    expect(client.getAttempt).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.length).toBe(0);
  });
});

function clientFake(
  overrides: Partial<LeaderboardClient> = {},
): LeaderboardClient {
  return {
    getLeaderboard: vi
      .fn()
      .mockImplementation((level: string) =>
        Promise.resolve({ levelVersionId: level, entries: [] }),
      ),
    getPersonalBest: vi
      .fn()
      .mockImplementation((level: string) =>
        Promise.resolve(personalFor(level, "Swift Fox 42")),
      ),
    startAttempt: vi
      .fn()
      .mockImplementation((level: string) => Promise.resolve(attemptFor(level))),
    getAttempt: vi.fn().mockResolvedValue({
      status: "rejected",
      error: publicError("RUN_COMMAND_INVALID"),
    }),
    completeAttempt: vi
      .fn()
      .mockImplementation(() => Promise.resolve(completionFor(LEVEL_A))),
    ...overrides,
  } as LeaderboardClient;
}

function attemptFor(
  levelVersionId: string,
  startsInMs = 1_500,
  expiresInMs = 30 * 60_000,
): AttemptStartResponse {
  const now = Date.now();
  return {
    attemptId: "123e4567-e89b-42d3-a456-426614174000",
    apiProtocolVersion: 2,
    levelVersionId,
    replayContractVersion: 1,
    startsAt: new Date(now + startsInMs).toISOString(),
    expiresAt: new Date(now + expiresInMs).toISOString(),
    displayName: "Swift Fox 42",
  };
}

function personalFor(levelVersionId: string, displayName: string) {
  return { levelVersionId, displayName, personalBest: null };
}

function completionFor(levelVersionId: string): AttemptCompleteResponse {
  return {
    status: "published",
    submittedScoreId: "score-1",
    levelVersionId,
    elapsedSeconds: 18,
    isPersonalBest: true,
    personalBest: {
      scoreId: "score-1",
      elapsedSeconds: 18,
      rank: 1,
      isTopTen: true,
    },
  };
}

function publicError(code: "RUN_COMMAND_INVALID") {
  return {
    code,
    message: "Rejected",
    retryable: false,
    requestId: "request-1",
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settleReads() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function journalDatabase(items: Map<string, RankedOutboxItem>): RankedOutboxDatabase {
  return {
    put: async (item) => { items.set(item.id, item); },
    get: async (id) => items.get(id) ?? null,
    list: async () => [...items.values()],
    delete: async (id) => { items.delete(id); },
    acquireLease: async () => 1,
    releaseLease: async () => undefined,
    quarantineLegacy: async () => undefined,
  };
}
