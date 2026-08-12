import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AccountAttemptCompleteResponse } from "../../src/leaderboard/accountScoreProtocol";
import type { LeaderboardClient } from "../../src/leaderboard/leaderboardClient";
import type { RankedOutboxDatabase, RankedOutboxItem } from "../../src/leaderboard/rankedOutbox";
import { ScoreLifecyclePanel } from "../../src/game/ScoreLifecyclePanel";

const result: AccountAttemptCompleteResponse = {
  status: "published", submittedScoreId: "score-1", levelVersionId: `sha256:${"a".repeat(64)}`,
  elapsedSeconds: 12, isPersonalBest: true,
  personalBest: { scoreId: "score-1", elapsedSeconds: 12, rank: 1, isTopTen: true },
  accountBinding: { state: "guest" },
};

describe("ScoreLifecyclePanel", () => {
  it("does_not_expose_a_dead_account_action_when_the_bridge_is_disabled", async () => {
    render(<ScoreLifecyclePanel
      result={result}
      account={{ authRevision: 1, authGeneration: "guest-generation-123456", account: { state: "guest" } }}
      client={clientFake()}
      database={memoryDatabase()}
      onSignIn={vi.fn()}
      onRetryBinding={vi.fn()}
      signInAvailable={false}
    />);

    await waitFor(() => expect(screen.getByText(/standalone build has no account connection/i))
      .toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /save to account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

function clientFake(): LeaderboardClient {
  return {
    getLeaderboard: vi.fn(), getPersonalBest: vi.fn(), startAttempt: vi.fn(), getAttempt: vi.fn(),
    completeAttempt: vi.fn(), createClaimContinuation: vi.fn(), claimScore: vi.fn(),
    getClaimStatus: vi.fn(), publishScore: vi.fn(), getPublication: vi.fn(),
  } as LeaderboardClient;
}

function memoryDatabase(): RankedOutboxDatabase {
  const items = new Map<string, RankedOutboxItem>();
  return {
    put: async (item) => { items.set(item.id, item); },
    get: async (id) => items.get(id) ?? null,
    list: async () => [...items.values()],
    delete: async (id) => { items.delete(id); },
    acquireLease: async () => 1, releaseLease: async () => undefined,
    quarantineLegacy: async () => undefined,
  };
}
