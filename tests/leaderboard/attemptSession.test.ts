import { describe, expect, it } from "vitest";
import {
  loadAttemptSession,
  saveAttemptSession,
} from "../../src/leaderboard/attemptSession";

describe("attemptSession", () => {
  it("round_trips_only_recoverable_attempt_fields_and_commands", () => {
    const storage = new MemoryStorage();
    const session = {
      attempt: {
        attemptId: "123e4567-e89b-42d3-a456-426614174000",
        apiProtocolVersion: 2 as const,
        levelVersionId: `sha256:${"a".repeat(64)}`,
        replayContractVersion: 1,
        startsAt: "2099-07-25T12:00:05.000Z",
        expiresAt: "2099-07-25T12:30:05.000Z",
        displayName: "Swift Fox 42",
      },
      commandLog: [{ type: "undo" as const }],
    };

    expect(saveAttemptSession(session, storage)).toBe(true);
    expect(loadAttemptSession(storage)).toEqual(session);
  });

  it("rejects_corrupt_or_unbounded_command_logs", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tiles-game-ranked-attempt-v1",
      JSON.stringify({
        attempt: { attemptId: "attempt-1" },
        commandLog: Array.from({ length: 1_201 }, () => ({ type: "undo" })),
      }),
    );

    expect(loadAttemptSession(storage)).toBeNull();
  });

  it("retains_an_expired_attempt_for_completed_result_recovery", () => {
    const storage = new MemoryStorage();
    const session = {
      attempt: {
        attemptId: "123e4567-e89b-42d3-a456-426614174000",
        apiProtocolVersion: 2 as const,
        levelVersionId: `sha256:${"a".repeat(64)}`,
        replayContractVersion: 1,
        startsAt: "2020-07-25T12:00:05.000Z",
        expiresAt: "2020-07-25T12:30:05.000Z",
        displayName: "Swift Fox 42",
      },
      commandLog: [{ type: "undo" as const }],
    };

    expect(saveAttemptSession(session, storage)).toBe(true);
    expect(loadAttemptSession(storage)).toEqual(session);
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
