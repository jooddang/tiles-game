import { describe, expect, it, vi } from "vitest";
import { createOutboxCoordinator } from "../../src/leaderboard/outboxCoordinator";
import type { RankedOutboxDatabase } from "../../src/leaderboard/rankedOutbox";

describe("outbox coordinator", () => {
  it("uses_the_durable_lease_fallback_and_always_releases_it", async () => {
    const acquireLease = vi.fn(async () => 3);
    const releaseLease = vi.fn(async () => undefined);
    const database = leaseDatabase(acquireLease, releaseLease);
    const coordinator = createOutboxCoordinator(database, "tab-a", null, undefined);

    await expect(coordinator.runExclusive("completion-1", async () => "sent")).resolves.toBe("sent");
    expect(acquireLease).toHaveBeenCalledWith("completion-1", "tab-a", expect.any(Number), 15_000);
    expect(releaseLease).toHaveBeenCalledWith("completion-1", "tab-a", 3);
  });

  it("does_not_run_work_when_another_tab_owns_the_fallback_lease", async () => {
    const work = vi.fn(async () => "sent");
    const database = leaseDatabase(vi.fn(async () => null), vi.fn(async () => undefined));
    const coordinator = createOutboxCoordinator(database, "tab-b", null, undefined);

    await expect(coordinator.runExclusive("completion-1", work)).resolves.toBeUndefined();
    expect(work).not.toHaveBeenCalled();
  });

  it("prefers_Web_Locks_and_skips_the_IDB_lease_when_supported", async () => {
    const acquireLease = vi.fn(async () => 1);
    const request = vi.fn(async (_name, _options, callback) => callback({ name: "lock", mode: "exclusive" }));
    const locks = { request } as unknown as LockManager;
    const coordinator = createOutboxCoordinator(
      leaseDatabase(acquireLease, vi.fn(async () => undefined)),
      "tab-c",
      null,
      locks,
    );

    await expect(coordinator.runExclusive("completion-1", async () => "sent")).resolves.toBe("sent");
    expect(request).toHaveBeenCalledWith(
      "roadcrosser-tiles:completion-1",
      { mode: "exclusive", ifAvailable: true },
      expect.any(Function),
    );
    expect(acquireLease).not.toHaveBeenCalled();
  });
});

function leaseDatabase(
  acquireLease: RankedOutboxDatabase["acquireLease"],
  releaseLease: RankedOutboxDatabase["releaseLease"],
): RankedOutboxDatabase {
  return {
    put: async () => undefined,
    get: async () => null,
    list: async () => [],
    delete: async () => undefined,
    acquireLease,
    releaseLease,
    quarantineLegacy: async () => undefined,
  };
}
