import {
  API_PROTOCOL_VERSION,
  REPLAY_CONTRACT_VERSION,
  isReplayCommand,
  type AttemptStartResponse,
  type ReplayCommand,
} from "./protocol";

const SESSION_KEY = "tiles-game-ranked-attempt-v1";
const MAX_COMMANDS = 1_200;

export type StoredAttemptSession = {
  readonly attempt: AttemptStartResponse;
  readonly commandLog: readonly ReplayCommand[];
};

export function loadAttemptSession(
  storage: Storage | undefined = browserSessionStorage(),
): StoredAttemptSession | null {
  if (!storage) {
    return null;
  }
  try {
    const rawSession = storage.getItem(SESSION_KEY);
    const parsed = JSON.parse(rawSession ?? "null") as unknown;
    if (!isRecord(parsed) || !isAttempt(parsed.attempt)) {
      if (rawSession !== null) {
        storage.removeItem(SESSION_KEY);
      }
      return null;
    }
    if (
      !Array.isArray(parsed.commandLog) ||
      parsed.commandLog.length > MAX_COMMANDS ||
      !parsed.commandLog.every(isReplayCommand)
    ) {
      storage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      attempt: parsed.attempt,
      commandLog: parsed.commandLog,
    };
  } catch {
    try {
      storage.removeItem(SESSION_KEY);
    } catch {
      // A blocked cleanup surface remains non-recoverable.
    }
    return null;
  }
}

export function saveAttemptSession(
  session: StoredAttemptSession,
  storage: Storage | undefined = browserSessionStorage(),
): boolean {
  if (!storage || session.commandLog.length > MAX_COMMANDS) {
    return false;
  }
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearAttemptSession(
  storage: Storage | undefined = browserSessionStorage(),
) {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    // A blocked storage surface is equivalent to no recoverable session.
  }
}

function isAttempt(value: unknown): value is AttemptStartResponse {
  return (
    isRecord(value) &&
    typeof value.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.attemptId,
    ) &&
    value.apiProtocolVersion === API_PROTOCOL_VERSION &&
    typeof value.levelVersionId === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(value.levelVersionId) &&
    typeof value.replayContractVersion === "number" &&
    Number.isInteger(value.replayContractVersion) &&
    value.replayContractVersion === REPLAY_CONTRACT_VERSION &&
    typeof value.startsAt === "string" &&
    typeof value.expiresAt === "string" &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0 &&
    value.displayName.length <= 64 &&
    Number.isFinite(Date.parse(value.startsAt)) &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    Date.parse(value.startsAt) < Date.parse(value.expiresAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserSessionStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
