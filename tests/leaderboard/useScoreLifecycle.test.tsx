import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AccountSnapshot } from "../../src/account/protocol";
import type { AccountAttemptCompleteResponse } from "../../src/leaderboard/accountScoreProtocol";
import type { LeaderboardClient } from "../../src/leaderboard/leaderboardClient";
import type { RankedOutboxDatabase, RankedOutboxItem } from "../../src/leaderboard/rankedOutbox";
import { useScoreLifecycle } from "../../src/leaderboard/useScoreLifecycle";

const LEVEL = `sha256:${"a".repeat(64)}`;
const guestResult = resultWith({ state: "guest" });
const linkedResult = resultWith({ state: "linked", scoreId: "score-1", bestScoreId: "score-1",
  accountName: "Player·A1B2" });
const guest = snapshot("guest-generation-123456", { state: "guest" });
const accountA = snapshot("account-generation-a123", { state: "authenticated", publicName: "Player·A1B2" });
const accountB = snapshot("account-generation-b123", { state: "authenticated", publicName: "Player·B2C3" });

describe("score claim and publication lifecycle", () => {
  it("persists_continuation_before_sign_in_and_recovers_canceled_auth", async () => {
    const events: string[] = [];
    const database = memoryDatabase(events);
    const onSignIn = vi.fn(() => events.push("sign-in"));
    const client = clientFake({ createClaimContinuation: vi.fn(async () => {
      events.push("continuation");
      return { continuationId: "continuation-1", expiresAt: "2099-08-18T00:00:00.000Z" };
    }) });
    const first = renderHook(() => useScoreLifecycle({
      result: guestResult, account: guest, client, onSignIn, database,
    }));
    await waitFor(() => expect(first.result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await first.result.current.startClaim(); });

    expect(events.slice(0, 4)).toEqual([
      "put:tiles:score-1:claim", "continuation", "put:tiles:score-1:claim", "sign-in",
    ]);
    expect(first.result.current.state.claim).toBe("awaiting_auth");
    first.unmount();

    const canceled = renderHook(() => useScoreLifecycle({
      result: guestResult, account: guest, client, onSignIn, database,
    }));
    await waitFor(() => expect(canceled.result.current.state.claim).toBe("awaiting_auth"));
    act(() => canceled.result.current.retrySignIn());
    expect(onSignIn).toHaveBeenCalledTimes(2);
  });

  it("keeps_a_guest_draft_private_through_auth_and_publishes_only_after_explicit_claim", async () => {
    const database = memoryDatabase();
    let publicationRequestId = "";
    const client = clientFake({
      publishScore: vi.fn(async (_scoreId, body) => {
        publicationRequestId = body.requestId;
        return { scoreId: "score-1", messageState: "visible" as const, revision: 1 };
      }),
      getPublication: vi.fn(async () => ({ scoreId: "score-1", displayName: "Swift Fox",
        identityKind: "account" as const, accountName: "Player·A1B2", message: "I own this maze",
        messageState: "visible" as const, publicationRevision: 1, requestId: publicationRequestId })),
    });
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    act(() => result.current.setDraft("I own this maze"));
    await waitFor(async () => expect(await database.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "publish", authGeneration: null,
        ownerBinding: "score:score-1", rawDraft: "I own this maze" }),
    ])));
    expect(client.publishScore).not.toHaveBeenCalled();

    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });
    await waitFor(() => expect(result.current.state).toMatchObject({
      claim: "confirm_claim", draft: "I own this maze", publicHandle: "Player·A1B2",
    }));
    expect(client.publishScore).not.toHaveBeenCalled();
    await act(async () => { await result.current.confirmClaim(); });
    await waitFor(() => expect(result.current.state).toMatchObject({ claim: "claimed", canPublish: true }));
    expect(client.publishScore).not.toHaveBeenCalled();
    await act(async () => { await result.current.publish(); });
    expect(client.publishScore).toHaveBeenCalledWith("score-1", expect.objectContaining({
      message: "I own this maze",
    }));
  });

  it("replays_the_exact_continuation_request_after_a_committed_response_is_lost", async () => {
    const database = memoryDatabase();
    const requestIds: string[] = [];
    const createClaimContinuation = vi.fn(async (_scoreId: string, requestId: string) => {
      requestIds.push(requestId);
      if (requestIds.length === 1) throw new TypeError("response lost");
      return { continuationId: "continuation-1", expiresAt: "2099-08-18T00:00:00.000Z" };
    });
    const client = clientFake({ createClaimContinuation });
    const first = renderHook(() => useScoreLifecycle({
      result: guestResult, account: guest, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(first.result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await first.result.current.startClaim(); });
    expect(first.result.current.state.claim).toBe("error");
    first.unmount();

    const recovered = renderHook(() => useScoreLifecycle({
      result: guestResult, account: guest, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(recovered.result.current.state.claim).toBe("error"));
    await act(async () => { await recovered.result.current.retryClaim(); });
    expect(requestIds).toHaveLength(2);
    expect(requestIds[1]).toBe(requestIds[0]);
    expect(createClaimContinuation.mock.calls[1]?.[0]).toBe("score-1");
  });

  it("extends_completion_and_draft_through_a_continuation_created_on_day_five", async () => {
    const day = 24 * 60 * 60_000;
    const start = Date.parse("2026-08-01T00:00:00.000Z");
    const now = vi.spyOn(Date, "now").mockReturnValue(start + 5 * day);
    try {
      const database = memoryDatabase();
      await database.put({ ...guestCompletionItem(), expiresAt: start + 7 * day });
      const client = clientFake({ createClaimContinuation: vi.fn().mockResolvedValue({
        continuationId: "continuation-day-five", expiresAt: new Date(start + 12 * day).toISOString(),
      }) });
      const { result } = renderHook(() => useScoreLifecycle({
        result: guestResult, account: guest, client, onSignIn: vi.fn(), database,
      }));
      await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
      act(() => result.current.setDraft("late claim draft"));
      await act(async () => { await result.current.startClaim(); });
      expect(await database.get("tiles:attempt-1:complete")).toMatchObject({ expiresAt: start + 12 * day });
      expect(await database.get("tiles:score-1:publish")).toMatchObject({ expiresAt: start + 12 * day });

      now.mockReturnValue(start + 10 * day);
      const restartedJournal = await import("../../src/leaderboard/rankedAttemptJournal")
        .then(({ createRankedAttemptJournal }) => createRankedAttemptJournal(database));
      await expect(restartedJournal.recoverableAttempts()).resolves.toEqual([
        expect.objectContaining({ phase: "guest_claimable",
          terminalResult: expect.objectContaining({ submittedScoreId: "score-1" }) }),
      ]);
    } finally {
      now.mockRestore();
    }
  });

  it("requires_explicit_verified_name_confirmation_after_auth_return", async () => {
    const database = memoryDatabase();
    const client = clientFake();
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });

    await waitFor(() => expect(result.current.state).toMatchObject({
      claim: "confirm_claim", publicHandle: "Player·A1B2",
    }));
    expect(client.claimScore).not.toHaveBeenCalled();
    await act(async () => { await result.current.confirmClaim(); });
    expect(client.claimScore).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ claim: "claimed", publicHandle: "Player·A1B2" });
  });

  it("parks_a_claim_when_the_confirmed_auth_generation_switches", async () => {
    const database = memoryDatabase();
    const client = clientFake();
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });
    await waitFor(() => expect(result.current.state.claim).toBe("confirm_claim"));
    rerender({ account: accountB });
    await waitFor(() => expect(result.current.state.claim).toBe("parked"));
    expect(client.claimScore).not.toHaveBeenCalled();
  });

  it("parks_an_A_owned_linked_score_when_the_current_browser_account_is_B", async () => {
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountB, client: clientFake(), onSignIn: vi.fn(),
      database: memoryDatabase(),
    }));
    await waitFor(() => expect(result.current.state).toMatchObject({
      claim: "parked", publicHandle: "Player·A1B2", canPublish: false,
    }));
  });

  it("does_not_reveal_an_A_draft_when_auth_switches_to_B_during_rebind", async () => {
    const database = memoryDatabase();
    await database.put(guestCompletionItem());
    let releaseRebind: () => void = () => undefined;
    let markRebindStarted: () => void = () => undefined;
    const rebindGate = new Promise<void>((resolve) => { releaseRebind = resolve; });
    const rebindStarted = new Promise<void>((resolve) => { markRebindStarted = resolve; });
    const originalPut = database.put;
    Object.assign(database, { put: async (item: RankedOutboxItem) => {
      if (item.operation === "publish" && item.authGeneration === accountA.authGeneration) {
        markRebindStarted();
        await rebindGate;
      }
      return originalPut(item);
    } });
    const client = clientFake();
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    act(() => result.current.setDraft("A private draft"));
    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });
    await waitFor(() => expect(result.current.state.claim).toBe("confirm_claim"));
    await act(async () => { await result.current.confirmClaim(); });
    await rebindStarted;
    expect(await database.get("tiles:score-1:claim")).not.toBeNull();
    rerender({ account: accountB });
    await waitFor(() => expect(result.current.state.claim).toBe("parked"));
    releaseRebind();
    await waitFor(async () => expect(await database.get("tiles:score-1:publish"))
      .toMatchObject({ accountName: "Player·A1B2", authGeneration: accountA.authGeneration }));
    await waitFor(async () => expect(await database.get("tiles:score-1:claim")).toBeNull());
    await waitFor(() => expect(result.current.state).toMatchObject({
      claim: "parked", publication: "parked", canPublish: false,
    }));
    await act(async () => { await result.current.recoverDraft(); });
    expect(result.current.state.publication).toBe("parked");
    await act(async () => { await result.current.discardDraft(); });
    expect(result.current.state.publication).toBe("parked");
    await act(async () => { await result.current.publish(); });
    expect(client.publishScore).not.toHaveBeenCalled();
  });

  it("allows_the_same_public_name_to_recover_a_draft_after_auth_generation_rotation", async () => {
    const database = memoryDatabase();
    await database.put({
      id: "tiles:score-1:publish", operation: "publish", scoreId: "score-1",
      ownerBinding: "account:old-generation", requestId: "publication-request-1",
      authGeneration: "old-generation", accountName: "Player·A1B2", rawDraft: "safe draft",
      canonicalMessage: "safe draft", phase: "draft", expectedRevision: null,
      createdAt: 1, expiresAt: Date.now() + 60_000, retryCount: 0,
    });
    const client = clientFake();
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state).toMatchObject({
      claim: "claimed", publication: "parked", canRecoverDraft: true,
    }));
    await act(async () => { await result.current.recoverDraft(); });
    expect(result.current.state).toMatchObject({ publication: "draft", canRecoverDraft: false });
    expect(await database.get("tiles:score-1:publish")).toMatchObject({
      authGeneration: accountA.authGeneration, accountName: "Player·A1B2", phase: "draft",
    });
  });

  it("keeps_claimed_score_intact_when_publication_fails", async () => {
    const database = memoryDatabase();
    const client = clientFake({
      publishScore: vi.fn().mockRejectedValue(new TypeError("offline")),
      getPublication: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("I own this maze"));
    await act(async () => { await result.current.publish(); });

    expect(result.current.state.claim).toBe("claimed");
    expect(result.current.state.publication).toBe("outcome_unknown");
    expect((await database.list()).some((item) => item.operation === "publish")).toBe(true);
  });

  it("shows_terminal_claim_success_even_when_local_cleanup_never_resolves", async () => {
    const database = memoryDatabase();
    const originalDelete = database.delete;
    let hangCleanup = false;
    let releaseCleanup: () => void = () => undefined;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    Object.assign(database, { delete: async (id: string) => {
      if (hangCleanup) await cleanupGate;
      return originalDelete(id);
    } });
    const client = clientFake();
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });
    await waitFor(() => expect(result.current.state.claim).toBe("confirm_claim"));
    hangCleanup = true;
    let confirmation: Promise<void> | undefined;
    act(() => { confirmation = result.current.confirmClaim(); });
    await act(async () => { await confirmation; });
    try {
      expect(result.current.state).toMatchObject({ claim: "claimed", publicHandle: "Player·A1B2" });
    } finally {
      releaseCleanup();
    }
  });

  it("preserves_claim_evidence_and_does_not_regress_after_a_failed_draft_rebind_restart", async () => {
    const database = memoryDatabase();
    const originalPut = database.put;
    Object.assign(database, { put: async (item: RankedOutboxItem) => {
      if (item.operation === "publish" && item.authGeneration === accountA.authGeneration) {
        throw new Error("rebind storage offline");
      }
      return originalPut(item);
    } });
    const client = clientFake();
    const first = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(first.result.current.state.claim).toBe("guest_accepted"));
    act(() => first.result.current.setDraft("private draft"));
    await act(async () => { await first.result.current.startClaim(); });
    first.rerender({ account: accountA });
    await waitFor(() => expect(first.result.current.state.claim).toBe("confirm_claim"));
    await act(async () => { await first.result.current.confirmClaim(); });
    await waitFor(() => expect(first.result.current.state.draftWarning).toMatch(/could not be secured/i));
    expect(await database.get("tiles:score-1:claim")).not.toBeNull();
    first.unmount();

    const recoveredClient = clientFake({
      getClaimStatus: vi.fn().mockResolvedValue({ status: "claimed", scoreId: "score-1" }),
    });
    const recovered = renderHook(() => useScoreLifecycle({
      result: guestResult, account: accountA, client: recoveredClient, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(recovered.result.current.state.claim).toBe("claimed"));
    expect(recovered.result.current.state.claim).not.toBe("guest_accepted");
    expect(await database.get("tiles:score-1:claim")).not.toBeNull();
  });

  it("keeps_claim_and_guest_completion_when_linked_terminal_upgrade_fails", async () => {
    const database = memoryDatabase();
    await database.put(guestCompletionItem());
    const originalPut = database.put;
    const putItem = vi.fn(async (item: RankedOutboxItem) => {
      if (item.operation === "complete" && item.phase === "account_linked") {
        throw new Error("linked terminal upgrade failed");
      }
      return originalPut(item);
    });
    Object.assign(database, { put: putItem });
    const client = clientFake();
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });
    await waitFor(() => expect(result.current.state.claim).toBe("confirm_claim"));
    await act(async () => { await result.current.confirmClaim(); });
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    await waitFor(() => expect(putItem).toHaveBeenCalledWith(expect.objectContaining({
      operation: "complete", phase: "account_linked",
      terminalResult: expect.objectContaining({ accountBinding: expect.objectContaining({
        state: "linked", accountName: "Player·A1B2",
      }) }),
    })));
    expect(await database.get("tiles:score-1:claim")).not.toBeNull();
    expect(await database.get("tiles:attempt-1:complete")).toMatchObject({ phase: "guest_claimable" });
  });

  it("uses_the_authoritative_claim_best_when_the_account_already_has_a_better_score", async () => {
    const database = memoryDatabase();
    await database.put(guestCompletionItem());
    const client = clientFake({
      claimScore: vi.fn().mockResolvedValue({ scoreId: "score-1", bestScoreId: "existing-faster-score",
        claimed: true, publicHandle: "Player·A1B2" }),
    });
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });
    await waitFor(() => expect(result.current.state.claim).toBe("confirm_claim"));
    await act(async () => { await result.current.confirmClaim(); });
    await waitFor(async () => expect(await database.get("tiles:attempt-1:complete"))
      .toMatchObject({ phase: "account_linked", terminalResult: { accountBinding: {
        state: "linked", bestScoreId: "existing-faster-score", accountName: "Player·A1B2",
      } } }));
  });

  it("does_not_let_a_late_publication_hydration_overwrite_a_new_private_draft", async () => {
    const database = memoryDatabase();
    let resolvePublication!: (value: Awaited<ReturnType<LeaderboardClient["getPublication"]>>) => void;
    const publication = new Promise<Awaited<ReturnType<LeaderboardClient["getPublication"]>>>(
      (resolve) => { resolvePublication = resolve; });
    const client = clientFake({ getPublication: vi.fn(() => publication) });
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("new private draft"));
    resolvePublication({ scoreId: "score-1", displayName: "Swift Fox", identityKind: "account",
      accountName: "Player·A1B2", message: "old server message", messageState: "visible",
      publicationRevision: 3, requestId: "old-request" });
    await act(async () => { await publication; });
    expect(result.current.state).toMatchObject({
      draft: "new private draft", canonicalPreview: "new private draft", publication: "draft",
    });
    expect(await database.get("tiles:score-1:publish")).toMatchObject({ rawDraft: "new private draft" });
  });

  it("does_not_let_initial_hydration_overwrite_a_newly_published_message_after_ref_cleanup", async () => {
    const database = memoryDatabase();
    let resolveInitial!: (value: Awaited<ReturnType<LeaderboardClient["getPublication"]>>) => void;
    const initialRead = new Promise<Awaited<ReturnType<LeaderboardClient["getPublication"]>>>(
      (resolve) => { resolveInitial = resolve; });
    let reads = 0;
    const client = clientFake({
      publishScore: vi.fn().mockResolvedValue({ scoreId: "score-1", messageState: "visible", revision: 5 }),
      getPublication: vi.fn(() => {
        reads += 1;
        if (reads === 1) return initialRead;
        return Promise.resolve({ scoreId: "score-1", displayName: "Swift Fox",
          identityKind: "account" as const, accountName: "Player·A1B2", message: "new message",
          messageState: "visible" as const, publicationRevision: 5, requestId: null });
      }),
    });
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("new message"));
    await act(async () => { await result.current.publish(); });
    resolveInitial({ scoreId: "score-1", displayName: "Swift Fox", identityKind: "account",
      accountName: "Player·A1B2", message: "stale message", messageState: "visible",
      publicationRevision: 2, requestId: "stale-request" });
    await act(async () => { await initialRead; });
    expect(result.current.state).toMatchObject({ draft: "new message", message: "new message",
      canonicalPreview: "new message", publication: "published" });
  });

  it("retries_a_failed_terminal_draft_rebind_in_session_without_changing_the_draft_key", async () => {
    const database = memoryDatabase();
    const originalPut = database.put;
    let failRebind = true;
    let claimed = false;
    Object.assign(database, { put: async (item: RankedOutboxItem) => {
      if (failRebind && item.operation === "publish" && item.authGeneration === accountA.authGeneration) {
        throw new Error("rebind storage offline");
      }
      return originalPut(item);
    } });
    const client = clientFake({
      claimScore: vi.fn(async () => {
        claimed = true;
        return { scoreId: "score-1", bestScoreId: "score-1", claimed: true as const,
          publicHandle: "Player·A1B2" };
      }),
      getClaimStatus: vi.fn(async () => claimed
        ? { status: "claimed" as const, scoreId: "score-1" }
        : { status: "pending" as const, scoreId: "score-1" }),
    });
    const { result, rerender } = renderHook(({ account }: { account: AccountSnapshot }) =>
      useScoreLifecycle({ result: guestResult, account, client, onSignIn: vi.fn(), database }),
      { initialProps: { account: guest } },
    );
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    act(() => result.current.setDraft("same private draft"));
    await waitFor(async () => expect(await database.get("tiles:score-1:publish")).not.toBeNull());
    const originalRequestId = (await database.get("tiles:score-1:publish") as Extract<RankedOutboxItem,
      { operation: "publish" }>).requestId;
    await act(async () => { await result.current.startClaim(); });
    rerender({ account: accountA });
    await waitFor(() => expect(result.current.state.claim).toBe("confirm_claim"));
    await act(async () => { await result.current.confirmClaim(); });
    await waitFor(() => expect(result.current.state.draftWarning).toMatch(/could not be secured/i));
    failRebind = false;
    await act(async () => { await result.current.retryClaim(); });
    await waitFor(() => expect(result.current.state.canPublish).toBe(true));
    expect(await database.get("tiles:score-1:publish")).toMatchObject({
      requestId: originalRequestId, rawDraft: "same private draft", authGeneration: accountA.authGeneration,
    });
  });

  it("does_not_dispatch_when_the_durable_draft_queue_rejects", async () => {
    const database = memoryDatabase();
    const originalPut = database.put;
    Object.assign(database, { put: async (item: RankedOutboxItem) => {
      if (item.operation === "publish") throw new Error("storage offline");
      return originalPut(item);
    } });
    const client = clientFake();
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("hello"));
    await act(async () => { await result.current.publish(); });
    expect(client.publishScore).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ claim: "claimed", publication: "error" });
  });

  it("does_not_navigate_to_auth_when_a_guest_private_draft_is_not_durable", async () => {
    const database = memoryDatabase();
    const originalPut = database.put;
    Object.assign(database, { put: async (item: RankedOutboxItem) => {
      if (item.operation === "publish") throw new Error("draft storage offline");
      return originalPut(item);
    } });
    const client = clientFake();
    const onSignIn = vi.fn();
    const { result } = renderHook(() => useScoreLifecycle({
      result: guestResult, account: guest, client, onSignIn, database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    act(() => result.current.setDraft("keep me private"));
    await waitFor(() => expect(result.current.state.draftWarning).toMatch(/not secured yet/i));
    await act(async () => { await result.current.startClaim(); });
    expect(result.current.state.claim).toBe("error");
    expect(client.createClaimContinuation).not.toHaveBeenCalled();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("does_not_dispatch_without_a_durable_outcome_unknown_marker", async () => {
    const database = memoryDatabase();
    const originalPut = database.put;
    Object.assign(database, { put: async (item: RankedOutboxItem) => {
      if (item.operation === "publish" && item.phase === "outcome_unknown") {
        throw new Error("marker storage offline");
      }
      return originalPut(item);
    } });
    const client = clientFake();
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("hello"));
    await act(async () => { await result.current.publish(); });
    expect(client.publishScore).not.toHaveBeenCalled();
    expect(result.current.state.publication).toBe("error");
  });

  it("freezes_an_unknown_publication_then_uses_a_fresh_key_after_convergence", async () => {
    const database = memoryDatabase();
    let publishCount = 0;
    let currentRequestId = "";
    const bodies: Array<{ requestId: string; expectedCurrentRevision: number | null; message: string }> = [];
    const client = clientFake({
      publishScore: vi.fn(async (_scoreId, body) => {
        publishCount += 1;
        currentRequestId = body.requestId;
        bodies.push(body);
        if (publishCount === 1) throw new TypeError("response lost");
        return { scoreId: "score-1", messageState: "visible" as const, revision: publishCount - 1 };
      }),
      getPublication: vi.fn(async () => {
        if (publishCount === 1) throw new TypeError("status lost");
        return { scoreId: "score-1", displayName: "Swift Fox", identityKind: "account" as const,
          accountName: "Player·A1B2", message: publishCount >= 3 ? "two" : "later edit",
          messageState: "visible" as const, publicationRevision: publishCount === 2 ? 2 : publishCount - 1,
          requestId: publishCount === 2 ? "later-request" : currentRequestId || null };
      }),
    });
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("one"));
    await act(async () => { await result.current.publish(); });
    expect(result.current.state.publication).toBe("outcome_unknown");
    act(() => result.current.setDraft("two"));
    expect(result.current.state.draft).toBe("one");

    await act(async () => { await result.current.publish(); });
    expect(result.current.state.publication).toBe("published");
    expect(result.current.state.publicationNotice).toMatch(/newer account edit/i);
    expect(bodies[1]?.requestId).toBe(bodies[0]?.requestId);
    expect(bodies[1]?.message).toBe("one");
    act(() => result.current.setDraft("two"));
    await act(async () => { await result.current.publish(); });
    expect(bodies[2]?.requestId).not.toBe(bodies[1]?.requestId);
    expect(bodies[2]).toMatchObject({ expectedCurrentRevision: 2, message: "two" });
  });

  it("does_not_report_success_when_a_failed_POST_only_reads_the_previous_publication", async () => {
    const database = memoryDatabase();
    const client = clientFake({
      publishScore: vi.fn().mockRejectedValue(new TypeError("request did not reach server")),
      getPublication: vi.fn().mockResolvedValue({ scoreId: "score-1", displayName: "Swift Fox",
        identityKind: "account", accountName: "Player·A1B2", message: "old message",
        messageState: "visible", publicationRevision: 4, requestId: "old-request" }),
    });
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("new message"));
    await act(async () => { await result.current.publish(); });
    expect(result.current.state.publication).toBe("outcome_unknown");
    expect(result.current.state.publicationNotice).toBeUndefined();
  });

  it("treats_a_received_publication_receipt_as_terminal_when_the_followup_read_is_offline", async () => {
    const database = memoryDatabase();
    const client = clientFake({
      publishScore: vi.fn().mockResolvedValue({ scoreId: "score-1", messageState: "visible", revision: 5 }),
      getPublication: vi.fn().mockRejectedValue(new TypeError("read offline")),
    });
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("receipt wins"));
    await act(async () => { await result.current.publish(); });
    expect(result.current.state).toMatchObject({ publication: "published", draft: "receipt wins",
      canonicalPreview: "receipt wins", message: "receipt wins" });
  });

  it("discards_an_expired_continuation_and_starts_with_a_fresh_request", async () => {
    const database = memoryDatabase();
    await database.put({ id: "tiles:score-1:claim", operation: "claim", scoreId: "score-1",
      ownerBinding: "score:score-1", requestId: "expired-request", claimRequestId: "expired-claim",
      continuationId: "expired-continuation", phase: "awaiting_auth", authGeneration: null,
      createdAt: 1, expiresAt: Date.now() - 1, retryCount: 0 });
    const client = clientFake();
    const { result } = renderHook(() => useScoreLifecycle({
      result: guestResult, account: guest, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("guest_accepted"));
    await act(async () => { await result.current.retryClaim(); });
    const requestId = (client.createClaimContinuation as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(requestId).toEqual(expect.any(String));
    expect(requestId).not.toBe("expired-request");
  });

  it("converges_a_lost_publication_response_and_accepts_blank_removal_receipt", async () => {
    const database = memoryDatabase();
    let publicationRequestId = "";
    let removeMessage = false;
    const publishScore = vi.fn(async (_scoreId, body) => {
      if (removeMessage) return { scoreId: "score-1", messageState: "none" as const, revision: null };
      publicationRequestId = body.requestId;
      throw new TypeError("response lost");
    });
    const client = clientFake({
      publishScore,
      getPublication: vi.fn(async () => ({
        scoreId: "score-1", displayName: "Swift Fox", identityKind: "account" as const,
        accountName: "Player·A1B2", message: "hello", messageState: "visible" as const,
        publicationRevision: 1, requestId: publicationRequestId,
      })),
    });
    const { result } = renderHook(() => useScoreLifecycle({
      result: linkedResult, account: accountA, client, onSignIn: vi.fn(), database,
    }));
    await waitFor(() => expect(result.current.state.claim).toBe("claimed"));
    act(() => result.current.setDraft("hello"));
    await act(async () => { await result.current.publish(); });
    expect(result.current.state.publication).toBe("published");

    act(() => result.current.setDraft(""));
    removeMessage = true;
    await act(async () => { await result.current.publish(); });
    expect(result.current.state).toMatchObject({ publication: "published", canonicalPreview: "" });
  });
});

function resultWith(accountBinding: AccountAttemptCompleteResponse["accountBinding"]): AccountAttemptCompleteResponse {
  return { status: "published", submittedScoreId: "score-1", levelVersionId: LEVEL,
    elapsedSeconds: 12, isPersonalBest: true,
    personalBest: { scoreId: "score-1", elapsedSeconds: 12, rank: 1, isTopTen: true }, accountBinding };
}

function snapshot(authGeneration: string, account: AccountSnapshot["account"]): AccountSnapshot {
  return { authRevision: 1, authGeneration, account };
}

function clientFake(overrides: Partial<LeaderboardClient> = {}): LeaderboardClient {
  return {
    getLeaderboard: vi.fn(),
    getPersonalBest: vi.fn().mockResolvedValue({ levelVersionId: LEVEL, displayName: "Player·A1B2",
      personalBest: { scoreId: "score-1", rank: 1, displayName: "Swift Fox", elapsedSeconds: 12,
        achievedAt: "2026-08-11T00:00:00.000Z", identityKind: "account", accountName: "Player·A1B2",
        message: null, messageState: "none", publicationRevision: null } }),
    startAttempt: vi.fn(), getAttempt: vi.fn(), completeAttempt: vi.fn(),
    createClaimContinuation: vi.fn().mockResolvedValue({ continuationId: "continuation-1", expiresAt: "2099-08-18T00:00:00.000Z" }),
    claimScore: vi.fn().mockResolvedValue({ scoreId: "score-1", bestScoreId: "score-1", claimed: true, publicHandle: "Player·A1B2" }),
    getClaimStatus: vi.fn().mockResolvedValue({ status: "pending", scoreId: "score-1" }),
    publishScore: vi.fn().mockResolvedValue({ scoreId: "score-1", messageState: "visible", revision: 1 }),
    getPublication: vi.fn().mockResolvedValue({ scoreId: "score-1", displayName: "Swift Fox",
      identityKind: "guest", accountName: null, message: null, messageState: "none",
      publicationRevision: null, requestId: null }),
    ...overrides,
  } as LeaderboardClient;
}

function memoryDatabase(events: string[] = []): RankedOutboxDatabase {
  const items = new Map<string, RankedOutboxItem>();
  return {
    put: async (item) => { events.push(`put:${item.id}`); items.set(item.id, item); },
    get: async (id) => items.get(id) ?? null,
    list: async () => [...items.values()],
    delete: async (id) => { items.delete(id); },
    acquireLease: async () => 1, releaseLease: async () => undefined,
    quarantineLegacy: async () => undefined,
  };
}

function guestCompletionItem(): Extract<RankedOutboxItem, { operation: "complete" }> {
  return { id: "tiles:attempt-1:complete", operation: "complete",
    attempt: { attemptId: "attempt-1", apiProtocolVersion: 2, replayContractVersion: 1,
      levelVersionId: LEVEL, startsAt: "2026-08-11T00:00:00.000Z",
      expiresAt: "2099-08-11T00:30:00.000Z", displayName: "Swift Fox" },
    ownerBinding: "owner-binding", commandLog: [], createdAt: 1,
    expiresAt: Date.now() + 60_000, retryCount: 0, phase: "guest_claimable",
    terminalResult: guestResult };
}
