import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { LEGACY_ATTEMPT_SESSION_KEY } from "../../src/leaderboard/attemptSession";
import {
  completionItemId,
  migrateLegacyAttemptSession,
  openRankedOutbox,
  type CompletionOutboxItem,
} from "../../src/leaderboard/rankedOutbox";

const attempt = {
  attemptId: "123e4567-e89b-42d3-a456-426614174000",
  apiProtocolVersion: 2 as const,
  levelVersionId: `sha256:${"a".repeat(64)}`,
  replayContractVersion: 1 as const,
  startsAt: "2099-07-25T12:00:05.000Z",
  expiresAt: "2099-07-25T12:30:05.000Z",
  displayName: "Swift Fox 42",
};

function completion(): CompletionOutboxItem {
  return {
    id: completionItemId(attempt.attemptId),
    operation: "complete",
    attempt,
    ownerBinding: `legacy-attempt:${attempt.attemptId}`,
    commandLog: [{ type: "undo" }],
    createdAt: Date.parse(attempt.startsAt),
    expiresAt: Date.parse(attempt.expiresAt),
    retryCount: 0,
  };
}

describe("ranked IndexedDB outbox", () => {
  it("round_trips_validated_completion_items_and_deletes_only_the_named_item", async () => {
    const database = await openRankedOutbox(new IDBFactory());
    const item = completion();

    await database.put(item);
    expect(await database.get(item.id)).toEqual(item);
    expect(await database.list()).toEqual([item]);

    await database.delete(item.id);
    expect(await database.get(item.id)).toBeNull();
  });

  it("rejects_invalid_items_before_they_reach_durable_storage", async () => {
    const database = await openRankedOutbox(new IDBFactory());
    const invalid = { ...completion(), commandLog: [{ type: "restart" }] };

    await expect(database.put(invalid as never)).rejects.toThrow("Invalid ranked outbox item");
    expect(await database.list()).toEqual([]);
  });

  it("migrates_a_valid_session_only_after_verified_IndexedDB_readback", async () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_ATTEMPT_SESSION_KEY, JSON.stringify({ attempt, commandLog: [{ type: "undo" }] }));
    const database = await openRankedOutbox(new IDBFactory());

    await expect(migrateLegacyAttemptSession(database, storage)).resolves.toBe("migrated");
    expect(storage.getItem(LEGACY_ATTEMPT_SESSION_KEY)).toBeNull();
    expect(await database.get(completionItemId(attempt.attemptId))).toMatchObject({
      operation: "complete",
      attempt,
      commandLog: [{ type: "undo" }],
    });
  });

  it("quarantines_corrupt_legacy_data_instead_of_treating_it_as_a_run", async () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_ATTEMPT_SESSION_KEY, "not-json");
    const quarantined: string[] = [];
    const database = {
      put: async () => undefined,
      get: async () => null,
      list: async () => [],
      delete: async () => undefined,
      acquireLease: async () => null,
      releaseLease: async () => undefined,
      quarantineLegacy: async (raw: string) => { quarantined.push(raw); },
    };

    await expect(migrateLegacyAttemptSession(database, storage)).resolves.toBe("quarantined");
    expect(quarantined).toEqual(["not-json"]);
    expect(storage.getItem(LEGACY_ATTEMPT_SESSION_KEY)).toBeNull();
  });

  it("fences_cross_tab_writers_with_versioned_expiring_leases", async () => {
    const database = await openRankedOutbox(new IDBFactory());
    const first = await database.acquireLease("item", "tab-a", 1_000, 500);

    expect(first).toBe(1);
    await expect(database.acquireLease("item", "tab-b", 1_100, 500)).resolves.toBeNull();
    await database.releaseLease("item", "tab-b", 1);
    await expect(database.acquireLease("item", "tab-b", 1_501, 500)).resolves.toBe(2);
    await database.releaseLease("item", "tab-a", 1);
    await expect(database.acquireLease("item", "tab-c", 1_600, 500)).resolves.toBeNull();
  });
});

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
