import { describe, expect, it, vi } from "vitest";
import { createRankedAttemptJournal } from "../../src/leaderboard/rankedAttemptJournal";
import type { RankedOutboxDatabase, RankedOutboxItem } from "../../src/leaderboard/rankedOutbox";

const LEVEL = `sha256:${"a".repeat(64)}`;
const attempt = {
  attemptId: "123e4567-e89b-42d3-a456-426614174000",
  apiProtocolVersion: 2 as const,
  levelVersionId: LEVEL,
  replayContractVersion: 1 as const,
  startsAt: "2099-07-25T12:00:05.000Z",
  expiresAt: "2099-07-25T12:30:05.000Z",
  displayName: "Swift Fox 42",
  ownerBinding: "guest-binding-1",
};

describe("ranked attempt journal", () => {
  it("commits_the_start_UUID_before_the_caller_can_send_HTTP", async () => {
    const events: string[] = [];
    const database = memoryDatabase(events);
    const journal = await createRankedAttemptJournal(database);

    const intent = await journal.beginStart(LEVEL, "auth-1");
    events.push(`http:${intent.requestId}`);

    expect(events).toEqual([`put:${intent.id}`, `http:${intent.requestId}`]);
    expect(intent.authGeneration).toBe("auth-1");
  });

  it("serializes_every_command_and_the_final_freeze", async () => {
    const events: string[] = [];
    const database = memoryDatabase(events);
    const journal = await createRankedAttemptJournal(database);
    const intent = await journal.beginStart(LEVEL, null);
    await journal.acceptStart(intent, attempt);
    events.length = 0;

    const first = journal.appendCommand(attempt, { type: "remove", tileId: "one" });
    const second = journal.appendCommand(attempt, { type: "remove", tileId: "two" });
    const final = journal.freezeCompletion(attempt);
    await Promise.all([first, second, final]);

    expect((await journal.itemForAttempt(attempt.attemptId))?.commandLog).toEqual([
      { type: "remove", tileId: "one" },
      { type: "remove", tileId: "two" },
    ]);
    expect(events).toEqual([
      `put:tiles:${attempt.attemptId}:complete`,
      `put:tiles:${attempt.attemptId}:complete`,
      `put:tiles:${attempt.attemptId}:complete`,
    ]);
  });

  it("keeps_a_lost_response_until_an_explicit_terminal_receipt", async () => {
    const database = memoryDatabase();
    const journal = await createRankedAttemptJournal(database);
    const intent = await journal.beginStart(LEVEL, null);
    await journal.acceptStart(intent, attempt);
    await journal.appendCommand(attempt, { type: "undo" });
    await journal.freezeCompletion(attempt);

    expect(await journal.itemForAttempt(attempt.attemptId)).not.toBeNull();
    await journal.terminalize(attempt.attemptId);
    expect(await journal.itemForAttempt(attempt.attemptId)).toBeNull();
  });

  it("enumerates_durable_receipts_after_a_browser_restart_and_keeps_pending_account_binding", async () => {
    const database = memoryDatabase();
    const firstTab = await createRankedAttemptJournal(database);
    const intent = await firstTab.beginStart(LEVEL, "auth-1");
    await firstTab.acceptStart(intent, attempt);
    await firstTab.recordReceipt(attempt, {
      status: "published",
      submittedScoreId: "score-1",
      levelVersionId: LEVEL,
      elapsedSeconds: 12,
      isPersonalBest: true,
      personalBest: { scoreId: "score-1", elapsedSeconds: 12, rank: 1, isTopTen: true },
      accountBinding: { state: "pending", retryable: true },
    });

    const restartedTab = await createRankedAttemptJournal(database);
    expect(await restartedTab.recoverableAttempts()).toEqual([
      expect.objectContaining({
        operation: "complete",
        terminalResult: expect.objectContaining({ accountBinding: { state: "pending", retryable: true } }),
      }),
    ]);
  });

  it("allows_only_an_unplayed_too_short_attempt_to_be_abandoned", async () => {
    const journal = await createRankedAttemptJournal(memoryDatabase());
    const intent = await journal.beginStart(LEVEL, null);
    await journal.acceptStart(intent, attempt);
    await journal.abandonUnplayed(attempt.attemptId);
    expect(await journal.itemForAttempt(attempt.attemptId)).toBeNull();

    const nextIntent = await journal.beginStart(LEVEL, null);
    await journal.acceptStart(nextIntent, attempt);
    await journal.appendCommand(attempt, { type: "undo" });
    await expect(journal.abandonUnplayed(attempt.attemptId)).rejects.toThrow("unplayed");
  });

  it("falls_back_to_memory_and_blocks_navigation_after_a_local_clear_when_storage_is_denied", async () => {
    const database = memoryDatabase([], true);
    const journal = await createRankedAttemptJournal(database);
    const intent = await journal.beginStart(LEVEL, null);
    await journal.acceptStart(intent, attempt);

    expect(journal.durability).toBe("memory-only");
    expect(journal.navigationBlocked).toBe(false);
    await journal.freezeCompletion(attempt);
    expect(journal.navigationBlocked).toBe(true);
    await journal.terminalize(attempt.attemptId);
    expect(journal.navigationBlocked).toBe(false);
  });
});

function memoryDatabase(events: string[] = [], failPut = false): RankedOutboxDatabase {
  const items = new Map<string, RankedOutboxItem>();
  return {
    put: vi.fn(async (item) => {
      if (failPut) throw new DOMException("denied", "SecurityError");
      events.push(`put:${item.id}`);
      items.set(item.id, item);
    }),
    get: async (id) => items.get(id) ?? null,
    list: async () => [...items.values()],
    delete: async (id) => { events.push(`delete:${id}`); items.delete(id); },
    acquireLease: async () => 1,
    releaseLease: async () => undefined,
    quarantineLegacy: async () => undefined,
  };
}
