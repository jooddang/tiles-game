import type { RankedOutboxDatabase } from "./rankedOutbox";

const LEASE_TTL_MS = 15_000;

export type OutboxCoordinator = {
  readonly runExclusive: <T>(itemId: string, work: () => Promise<T>) => Promise<T | undefined>;
  readonly notify: (itemId: string) => void;
  readonly subscribe: (listener: (itemId: string) => void) => () => void;
  readonly close: () => void;
};

export function createOutboxCoordinator(
  database: RankedOutboxDatabase,
  ownerId: string = crypto.randomUUID(),
  broadcast: BroadcastChannel | null = createBroadcastChannel(),
  locks: LockManager | undefined = browserLockManager(),
): OutboxCoordinator {
  const listeners = new Set<(itemId: string) => void>();
  if (broadcast) {
    broadcast.onmessage = (event) => {
      if (typeof event.data === "string") listeners.forEach((listener) => listener(event.data));
    };
  }

  async function runWithLease<T>(itemId: string, work: () => Promise<T>) {
    const version = await database.acquireLease(itemId, ownerId, Date.now(), LEASE_TTL_MS);
    if (version === null) return undefined;
    try {
      return await work();
    } finally {
      await database.releaseLease(itemId, ownerId, version);
    }
  }

  return {
    runExclusive: async <T>(itemId: string, work: () => Promise<T>) => {
      if (!locks) return runWithLease(itemId, work);
      return locks.request(
        `roadcrosser-tiles:${itemId}`,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => lock ? work() : undefined,
      );
    },
    notify: (itemId) => {
      broadcast?.postMessage(itemId);
      listeners.forEach((listener) => listener(itemId));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      listeners.clear();
      broadcast?.close();
    },
  };
}

function browserLockManager(): LockManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.locks;
}

function createBroadcastChannel() {
  try {
    return typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel("roadcrosser-tiles-ranked-v1");
  } catch {
    return null;
  }
}
