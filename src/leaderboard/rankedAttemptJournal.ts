import type { AttemptStartResponse, ReplayCommand } from "./protocol";
import type { AccountAttemptCompleteResponse } from "./accountScoreProtocol";
import { migrateLegacyAttemptSession } from "./rankedOutbox";
import {
  attemptOwnerBinding,
  completionItemId,
  openRankedOutbox,
  startIntentId,
  type CompletionOutboxItem,
  type RankedOutboxDatabase,
  type StartIntentItem,
} from "./rankedOutbox";

export type JournalDurability = "durable" | "memory-only";

export type RankedAttemptJournal = {
  readonly durability: JournalDurability;
  readonly navigationBlocked: boolean;
  readonly beginStart: (levelVersionId: string, authGeneration: string | null) => Promise<StartIntentItem>;
  readonly acceptStart: (intent: StartIntentItem, attempt: AttemptStartResponse) => Promise<CompletionOutboxItem>;
  readonly appendCommand: (attempt: AttemptStartResponse, command: ReplayCommand) => Promise<CompletionOutboxItem>;
  readonly freezeCompletion: (attempt: AttemptStartResponse) => Promise<CompletionOutboxItem>;
  readonly recordReceipt: (attempt: AttemptStartResponse, result: AccountAttemptCompleteResponse) => Promise<CompletionOutboxItem>;
  readonly abandonUnplayed: (attemptId: string) => Promise<void>;
  readonly terminalize: (attemptId: string) => Promise<void>;
  readonly itemForAttempt: (attemptId: string) => Promise<CompletionOutboxItem | null>;
  readonly recoverableAttempts: () => Promise<readonly CompletionOutboxItem[]>;
};

/**
 * Serializes every mutation of a ranked run. If IndexedDB is denied, the exact
 * same envelope remains in memory and navigation must be blocked until the
 * server returns a terminal receipt or durable storage becomes available.
 */
export async function createRankedAttemptJournal(
  database?: RankedOutboxDatabase,
): Promise<RankedAttemptJournal> {
  let durable = true;
  let resolvedDatabase = database;
  const memory = new Map<string, StartIntentItem | CompletionOutboxItem>();
  try {
    resolvedDatabase ??= await openRankedOutbox();
    await migrateLegacyAttemptSession(resolvedDatabase);
    for (const item of await resolvedDatabase.list()) {
      if (item.operation === "start" || item.operation === "complete") memory.set(item.id, item);
    }
  } catch {
    durable = false;
    resolvedDatabase = undefined;
  }
  let queue = Promise.resolve();

  function hasUnsecuredResult() {
    return [...memory.values()].some((item) => item.operation === "complete" && item.phase !== "playing");
  }

  async function read(id: string) {
    const cached = memory.get(id);
    if (cached || !resolvedDatabase) return cached;
    try {
      return await resolvedDatabase.get(id) ?? undefined;
    } catch {
      durable = false;
      resolvedDatabase = undefined;
      return undefined;
    }
  }

  async function write<T extends StartIntentItem | CompletionOutboxItem>(item: T): Promise<T> {
    memory.set(item.id, item);
    if (resolvedDatabase) {
      try {
        await resolvedDatabase.put(item);
      } catch {
        durable = false;
        resolvedDatabase = undefined;
      }
    }
    return item;
  }

  async function remove(id: string) {
    memory.delete(id);
    if (resolvedDatabase) {
      try {
        await resolvedDatabase.delete(id);
      } catch {
        durable = false;
        resolvedDatabase = undefined;
      }
    }
  }

  function ordered<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  const journal: RankedAttemptJournal = {
    get durability() { return durable ? "durable" : "memory-only"; },
    get navigationBlocked() { return !durable && hasUnsecuredResult(); },
    beginStart: (levelVersionId, authGeneration) => ordered(async () => {
      const requestId = crypto.randomUUID();
      const now = Date.now();
      return write({
        id: startIntentId(requestId),
        operation: "start",
        requestId,
        levelVersionId,
        authGeneration,
        createdAt: now,
        expiresAt: now + 2 * 60 * 60_000,
      });
    }),
    acceptStart: (intent, attempt) => ordered(async () => {
      const item: CompletionOutboxItem = {
        id: completionItemId(attempt.attemptId),
        operation: "complete",
        attempt,
        ownerBinding: attemptOwnerBinding(attempt),
        commandLog: [],
        createdAt: Date.now(),
        expiresAt: Date.parse(attempt.expiresAt) + 2 * 60 * 60_000,
        retryCount: 0,
        phase: "playing",
      };
      await write(item);
      await remove(intent.id);
      return item;
    }),
    appendCommand: (attempt, command) => ordered(async () => {
      const id = completionItemId(attempt.attemptId);
      const current = await read(id);
      if (!current || current.operation !== "complete") throw new Error("Ranked attempt journal missing");
      const item = { ...current, commandLog: [...current.commandLog, command] };
      await write(item);
      return item;
    }),
    freezeCompletion: (attempt) => ordered(async () => {
      const id = completionItemId(attempt.attemptId);
      const current = await read(id);
      if (!current || current.operation !== "complete") throw new Error("Ranked attempt journal missing");
      const item = { ...current, phase: "frozen" as const };
      await write(item);
      return item;
    }),
    recordReceipt: (attempt, result) => ordered(async () => {
      const id = completionItemId(attempt.attemptId);
      const current = await read(id);
      if (!current || current.operation !== "complete") throw new Error("Ranked attempt journal missing");
      const phase = result.accountBinding?.state === "pending"
        ? "accepted_binding_pending" as const
        : result.accountBinding?.state === "guest"
          ? "guest_claimable" as const
          : "frozen" as const;
      const item = { ...current, terminalResult: result, phase };
      await write(item);
      return item;
    }),
    abandonUnplayed: (attemptId) => ordered(async () => {
      const id = completionItemId(attemptId);
      const current = await read(id);
      if (!current || current.operation !== "complete" || current.commandLog.length > 0 || current.terminalResult) {
        throw new Error("Only an unplayed attempt can be abandoned");
      }
      await remove(id);
    }),
    terminalize: (attemptId) => ordered(async () => {
      await remove(completionItemId(attemptId));
    }),
    itemForAttempt: (attemptId) => ordered(async () => {
      const id = completionItemId(attemptId);
      const item = await read(id);
      return item?.operation === "complete" ? item : null;
    }),
    recoverableAttempts: () => ordered(async () => {
      let items = [...memory.values()];
      if (resolvedDatabase) {
        try {
          items = (await resolvedDatabase.list()).filter(
            (item): item is StartIntentItem | CompletionOutboxItem =>
              item.operation === "start" || item.operation === "complete",
          );
        } catch {
          durable = false;
          resolvedDatabase = undefined;
        }
      }
      const now = Date.now();
      const expired = items.filter((item) => item.operation === "complete" && item.expiresAt <= now);
      for (const item of expired) await remove(item.id);
      return items.filter((item): item is CompletionOutboxItem =>
        item.operation === "complete" && item.expiresAt > now);
    }),
  };
  return journal;
}
