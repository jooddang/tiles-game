import {
  LEGACY_ATTEMPT_SESSION_KEY,
  loadAttemptSession,
  type StoredAttemptSession,
} from "./attemptSession";
import {
  API_PROTOCOL_VERSION,
  REPLAY_CONTRACT_VERSION,
  isReplayCommand,
  type AttemptStartResponse,
  type ReplayCommand,
} from "./protocol";
import type { AccountAttemptCompleteResponse } from "./accountScoreProtocol";

const DATABASE_NAME = "roadcrosser-tiles-ranked";
const DATABASE_VERSION = 1;
const ITEM_STORE = "outbox";
const LEASE_STORE = "leases";
const QUARANTINE_STORE = "quarantine";
const MAX_COMMANDS = 1_200;
const MAX_QUARANTINE_BYTES = 64_000;
const MAX_RAW_DRAFT_BYTES = 4_096;
const MAX_CANONICAL_MESSAGE_BYTES = 400;

export type StartIntentItem = {
  readonly id: string;
  readonly operation: "start";
  readonly requestId: string;
  readonly levelVersionId: string;
  readonly authGeneration: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
};

export type CompletionOutboxItem = {
  readonly id: string;
  readonly operation: "complete";
  readonly attempt: AttemptStartResponse;
  readonly ownerBinding: string;
  readonly commandLog: readonly ReplayCommand[];
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly retryCount: number;
  readonly phase: "playing" | "frozen" | "accepted_binding_pending" | "guest_claimable" | "account_linked";
  readonly lastSafeErrorCode?: string;
  readonly terminalResult?: AccountAttemptCompleteResponse;
};

export type ClaimOutboxItem = {
  readonly id: string;
  readonly operation: "claim";
  readonly scoreId: string;
  readonly ownerBinding: string;
  readonly requestId: string;
  readonly claimRequestId: string;
  readonly continuationId?: string;
  readonly phase: "creating_continuation" | "awaiting_auth" | "claiming";
  readonly authGeneration: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly retryCount: number;
  readonly lastSafeErrorCode?: string;
};

export type PublicationOutboxItem = {
  readonly id: string;
  readonly operation: "publish";
  readonly scoreId: string;
  readonly ownerBinding: string;
  readonly requestId: string;
  readonly authGeneration: string | null;
  readonly accountName: string | null;
  readonly rawDraft: string;
  readonly canonicalMessage: string;
  readonly phase: "draft" | "outcome_unknown";
  readonly expectedRevision: number | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly retryCount: number;
  readonly lastSafeErrorCode?: string;
};

export type RankedOutboxItem =
  | StartIntentItem
  | CompletionOutboxItem
  | ClaimOutboxItem
  | PublicationOutboxItem;

type LeaseRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly version: number;
  readonly expiresAt: number;
};

type QuarantineRecord = {
  readonly id: string;
  readonly source: "legacy-session";
  readonly capturedAt: number;
  readonly raw: string;
};

export type RankedOutboxDatabase = {
  readonly put: (item: RankedOutboxItem) => Promise<void>;
  readonly get: (id: string) => Promise<RankedOutboxItem | null>;
  readonly list: () => Promise<readonly RankedOutboxItem[]>;
  readonly delete: (id: string) => Promise<void>;
  readonly acquireLease: (
    id: string,
    ownerId: string,
    now: number,
    ttlMs: number,
  ) => Promise<number | null>;
  readonly releaseLease: (id: string, ownerId: string, version: number) => Promise<void>;
  readonly quarantineLegacy: (raw: string) => Promise<void>;
};

export async function openRankedOutbox(
  factory: IDBFactory = browserIndexedDatabase(),
): Promise<RankedOutboxDatabase> {
  const database = await openDatabase(factory);
  return {
    put: async (item) => {
      if (!isRankedOutboxItem(item)) throw new Error("Invalid ranked outbox item");
      await requestTransaction(database, ITEM_STORE, "readwrite", (store) => store.put(item));
    },
    get: async (id) => {
      const value = await requestTransaction(database, ITEM_STORE, "readonly", (store) => store.get(id));
      return isRankedOutboxItem(value) ? value : null;
    },
    list: async () => {
      const values = await requestTransaction(database, ITEM_STORE, "readonly", (store) => store.getAll());
      return Array.isArray(values) ? values.filter(isRankedOutboxItem) : [];
    },
    delete: async (id) => {
      await requestTransaction(database, ITEM_STORE, "readwrite", (store) => store.delete(id));
    },
    acquireLease: async (id, ownerId, now, ttlMs) => {
      const transaction = database.transaction(LEASE_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(LEASE_STORE);
      const existing = await requestResult<unknown>(store.get(id));
      if (isLease(existing) && existing.expiresAt > now && existing.ownerId !== ownerId) {
        await done;
        return null;
      }
      const version = isLease(existing) ? existing.version + 1 : 1;
      store.put({ id, ownerId, version, expiresAt: now + ttlMs } satisfies LeaseRecord);
      await done;
      return version;
    },
    releaseLease: async (id, ownerId, version) => {
      const transaction = database.transaction(LEASE_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(LEASE_STORE);
      const existing = await requestResult<unknown>(store.get(id));
      if (isLease(existing) && existing.ownerId === ownerId && existing.version === version) {
        store.delete(id);
      }
      await done;
    },
    quarantineLegacy: async (raw) => {
      const safeRaw = raw.slice(0, MAX_QUARANTINE_BYTES);
      await requestTransaction(database, QUARANTINE_STORE, "readwrite", (store) =>
        store.put({
          id: crypto.randomUUID(),
          source: "legacy-session",
          capturedAt: Date.now(),
          raw: safeRaw,
        } satisfies QuarantineRecord));
    },
  };
}

export async function migrateLegacyAttemptSession(
  database: RankedOutboxDatabase,
  storage: Storage | undefined = browserSessionStorage(),
): Promise<"none" | "migrated" | "quarantined" | "blocked"> {
  if (!storage) return "blocked";
  let raw: string | null;
  try {
    raw = storage.getItem(LEGACY_ATTEMPT_SESSION_KEY);
  } catch {
    return "blocked";
  }
  if (raw === null) return "none";
  const session = loadAttemptSession(storage);
  if (!session) {
    await database.quarantineLegacy(raw);
    return "quarantined";
  }
  const item = completionItemFromLegacy(session);
  await database.put(item);
  const readBack = await database.get(item.id);
  if (!readBack || JSON.stringify(readBack) !== JSON.stringify(item)) {
    throw new Error("Legacy attempt migration verification failed");
  }
  storage.removeItem(LEGACY_ATTEMPT_SESSION_KEY);
  return "migrated";
}

export function startIntentId(requestId: string) {
  return `tiles:start:${requestId}`;
}

export function completionItemId(attemptId: string) {
  return `tiles:${attemptId}:complete`;
}

export function claimItemId(scoreId: string) {
  return `tiles:${scoreId}:claim`;
}

export function publicationItemId(scoreId: string) {
  return `tiles:${scoreId}:publish`;
}

export function partitionRankedOutbox(
  items: readonly RankedOutboxItem[],
  ownerBinding: string | null,
  authGeneration: string | null,
  now = Date.now(),
) {
  const expired: RankedOutboxItem[] = [];
  const runnable: RankedOutboxItem[] = [];
  const parked: RankedOutboxItem[] = [];
  for (const item of items) {
    if (item.expiresAt <= now) {
      expired.push(item);
      continue;
    }
    if (item.operation === "start") {
      (item.authGeneration === authGeneration ? runnable : parked).push(item);
      continue;
    }
    const ownerMatches = item.ownerBinding === ownerBinding;
    const authMatches = item.operation === "complete" || item.authGeneration === authGeneration;
    (ownerMatches && authMatches ? runnable : parked).push(item);
  }
  return { runnable, parked, expired } as const;
}

export function attemptOwnerBinding(attempt: AttemptStartResponse): string {
  return `attempt:${attempt.attemptId}`;
}

export function isRankedOutboxItem(value: unknown): value is RankedOutboxItem {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.operation !== "string") return false;
  if (!isFiniteTime(value.createdAt) || !isFiniteTime(value.expiresAt) || value.expiresAt <= value.createdAt) return false;
  if (value.operation === "start") {
    return typeof value.requestId === "string" && isLevelVersion(value.levelVersionId)
      && (value.authGeneration === null || typeof value.authGeneration === "string");
  }
  if (value.operation === "complete") {
    return isAttempt(value.attempt) && typeof value.ownerBinding === "string"
      && value.ownerBinding.length >= 8 && Array.isArray(value.commandLog)
      && value.commandLog.length <= MAX_COMMANDS && value.commandLog.every(isReplayCommand)
      && Number.isSafeInteger(value.retryCount) && (value.retryCount as number) >= 0
      && (value.phase === "playing" || value.phase === "frozen"
        || value.phase === "accepted_binding_pending" || value.phase === "guest_claimable"
        || value.phase === "account_linked")
      && (value.terminalResult === undefined || isCompletionResult(value.terminalResult));
  }
  if (value.operation === "claim") {
    return typeof value.scoreId === "string" && typeof value.ownerBinding === "string"
      && typeof value.requestId === "string" && (value.authGeneration === null || typeof value.authGeneration === "string")
      && typeof value.claimRequestId === "string"
      && (value.continuationId === undefined || typeof value.continuationId === "string")
      && (value.phase === "creating_continuation" || value.phase === "awaiting_auth" || value.phase === "claiming")
      && Number.isSafeInteger(value.retryCount) && (value.retryCount as number) >= 0;
  }
  if (value.operation === "publish") {
    return typeof value.scoreId === "string" && typeof value.ownerBinding === "string"
      && typeof value.requestId === "string"
      && (value.authGeneration === null || typeof value.authGeneration === "string")
      && (value.accountName === null || typeof value.accountName === "string")
      && typeof value.rawDraft === "string"
      && typeof value.canonicalMessage === "string"
      && (value.phase === "draft" || value.phase === "outcome_unknown")
      && utf8Bytes(value.rawDraft) <= MAX_RAW_DRAFT_BYTES
      && utf8Bytes(value.canonicalMessage) <= MAX_CANONICAL_MESSAGE_BYTES
      && unicodeScalars(value.canonicalMessage) <= 100
      && graphemeCount(value.canonicalMessage) <= 100
      && (value.expectedRevision === null || Number.isSafeInteger(value.expectedRevision))
      && Number.isSafeInteger(value.retryCount) && (value.retryCount as number) >= 0;
  }
  return false;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function unicodeScalars(value: string): number {
  return [...value].length;
}

function graphemeCount(value: string): number {
  if (typeof Intl.Segmenter !== "function") return unicodeScalars(value);
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
}

function completionItemFromLegacy(session: StoredAttemptSession): CompletionOutboxItem {
  return {
    id: completionItemId(session.attempt.attemptId),
    operation: "complete",
    attempt: session.attempt,
    ownerBinding: attemptOwnerBinding(session.attempt),
    commandLog: session.commandLog,
    createdAt: Date.parse(session.attempt.startsAt),
    expiresAt: Math.max(Date.parse(session.attempt.expiresAt), Date.now() + 60_000),
    retryCount: 0,
    phase: session.commandLog.length > 0 ? "frozen" : "playing",
  };
}

function isAttempt(value: unknown): value is AttemptStartResponse {
  return isRecord(value) && typeof value.attemptId === "string"
    && value.apiProtocolVersion === API_PROTOCOL_VERSION
    && value.replayContractVersion === REPLAY_CONTRACT_VERSION
    && isLevelVersion(value.levelVersionId)
    && typeof value.startsAt === "string" && Number.isFinite(Date.parse(value.startsAt))
    && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))
    && typeof value.displayName === "string";
}

function isCompletionResult(value: unknown): value is AccountAttemptCompleteResponse {
  return isRecord(value) && (value.status === "published" || value.status === "under_review")
    && typeof value.submittedScoreId === "string" && typeof value.levelVersionId === "string"
    && Number.isSafeInteger(value.elapsedSeconds) && (value.elapsedSeconds as number) >= 0
    && typeof value.isPersonalBest === "boolean"
    && (value.personalBest === null || (isRecord(value.personalBest)
      && typeof value.personalBest.scoreId === "string"
      && Number.isSafeInteger(value.personalBest.elapsedSeconds)
      && Number.isSafeInteger(value.personalBest.rank)
      && typeof value.personalBest.isTopTen === "boolean"))
    && (value.accountBinding === undefined || isAccountBinding(value.accountBinding));
}

function isAccountBinding(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.state === "guest") return true;
  if (value.state === "pending") return value.retryable === true;
  return value.state === "linked" && typeof value.scoreId === "string"
    && (value.bestScoreId === null || typeof value.bestScoreId === "string")
    && typeof value.accountName === "string";
}

function isLevelVersion(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isFiniteTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isLease(value: unknown): value is LeaseRecord {
  return isRecord(value) && typeof value.id === "string" && typeof value.ownerId === "string"
    && Number.isSafeInteger(value.version) && (value.version as number) > 0 && isFiniteTime(value.expiresAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEM_STORE)) database.createObjectStore(ITEM_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(LEASE_STORE)) database.createObjectStore(LEASE_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(QUARANTINE_STORE)) database.createObjectStore(QUARANTINE_STORE, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function requestTransaction(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  const transaction = database.transaction(storeName, mode);
  const done = transactionDone(transaction);
  const request = operation(transaction.objectStore(storeName));
  const result = await requestResult<unknown>(request);
  await done;
  return result;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function browserSessionStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function browserIndexedDatabase(): IDBFactory {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB unavailable");
  }
  return window.indexedDB;
}
