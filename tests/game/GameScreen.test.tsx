import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelDefinition } from "../../src/engine";
import { GameScreen } from "../../src/game/GameScreen";
import { saveAttemptSession } from "../../src/leaderboard/attemptSession";
import type { LeaderboardClient } from "../../src/leaderboard/leaderboardClient";
import { levelVersionId } from "../../src/leaderboard/replayContract";

const testLevels: readonly LevelDefinition[] = [
  {
    id: "test-complete",
    title: "Test Complete",
    width: 2,
    height: 1,
    tiles: [
      { id: "test-a", cell: { row: 0, col: 0 }, direction: "up", color: "blue" },
      { id: "test-b", cell: { row: 0, col: 1 }, direction: "up", color: "red" },
    ],
  },
  {
    id: "test-blocked",
    title: "Test Blocked",
    width: 3,
    height: 2,
    tiles: [
      { id: "blocked-a", cell: { row: 1, col: 0 }, direction: "upRight" },
      { id: "blocker-a", cell: { row: 0, col: 1 }, direction: "up" },
    ],
  },
];

describe("GameScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("tiles-game-stage-choice-v1", "practice");
    vi.useRealTimers();
  });

  it("renders_the_first_level", () => {
    render(<GameScreen />);

    expect(screen.getByRole("heading", { name: "Hex Tower" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Hex Tower board/i)).toBeInTheDocument();
  });

  it("does_not_allow_a_move_before_ranked_attempt_is_active_or_practice_is_explicit", async () => {
    window.sessionStorage.removeItem("tiles-game-stage-choice-v1");
    const client = createLeaderboardClientFake();
    render(<GameScreen levels={testLevels} leaderboardEnabled={true} leaderboardClient={client} />);

    expect(screen.getByRole("dialog", { name: "Start stage" })).toBeInTheDocument();
    const tile = screen.getByRole("button", { name: /Tile test-a arrow up/i });
    expect(tile).toBeDisabled();
    fireEvent.click(tile);
    expect(screen.getByTestId("move-count")).toHaveTextContent("0");

    await waitFor(() => expect(client.getPersonalBest).toHaveBeenCalled());
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
    fireEvent.click(tile);
    expect(screen.getByTestId("move-count")).toHaveTextContent("0");
    await act(async () => {
      for (let index = 0; index < 30; index += 1) await Promise.resolve();
    });
    expect(client.startAttempt).toHaveBeenCalledTimes(1);
    expect(tile).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(4_100);
      await Promise.resolve();
    });
    expect(tile).toBeEnabled();
  });

  it("keeps_the_board_locked_after_ranked_start_failure_until_practice_is_chosen", async () => {
    window.sessionStorage.removeItem("tiles-game-stage-choice-v1");
    const client = {
      ...createLeaderboardClientFake(),
      startAttempt: vi.fn().mockRejectedValue(new TypeError("offline")),
    } as LeaderboardClient;
    render(<GameScreen levels={testLevels} leaderboardEnabled={true} leaderboardClient={client} />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue as guest" }));
    expect(await screen.findByText("Ranked play is unavailable")).toBeInTheDocument();
    const tile = screen.getByRole("button", { name: /Tile test-a arrow up/i });
    expect(tile).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Play practice" }));
    expect(tile).toBeEnabled();
  });

  it("locks_the_next_level_during_hash_resolution_and_fresh_attempt_start", async () => {
    window.sessionStorage.setItem("tiles-game-stage-choice-v1", "ranked");
    vi.useFakeTimers();
    const client = createLeaderboardClientFake();
    render(<GameScreen levels={testLevels} leaderboardEnabled={true} leaderboardClient={client} />);
    await act(async () => {
      for (let index = 0; index < 60; index += 1) await Promise.resolve();
    });
    expect(client.startAttempt).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(4_100);
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tile test-b arrow up/i }));
    await act(async () => {
      for (let index = 0; index < 20; index += 1) await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Next level" }));

    const nextTile = screen.getByRole("button", { name: /Tile blocker-a arrow up/i });
    expect(nextTile).toBeDisabled();
    fireEvent.click(nextTile);
    expect(screen.getByTestId("move-count")).toHaveTextContent("0");
    await act(async () => {
      for (let index = 0; index < 30; index += 1) await Promise.resolve();
    });
    expect(client.startAttempt).toHaveBeenCalledTimes(2);
  });

  it("removes_a_legal_tile_when_clicked", () => {
    vi.useFakeTimers();
    render(<GameScreen levels={testLevels} />);

    const tile = screen.getByRole("button", { name: /Tile test-a arrow up/i });
    fireEvent.click(tile);

    expect(screen.getByRole("button", { name: /Tile test-a arrow up/i })).toHaveAttribute(
      "data-exiting",
      "true",
    );
    expect(screen.getByTestId("move-count")).toHaveTextContent("1");

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.queryByRole("button", { name: /Tile test-a arrow up/i })).toBeNull();
  });

  it("keeps_state_and_shows_feedback_when_a_blocked_tile_is_clicked", () => {
    render(<GameScreen levels={testLevels} />);

    fireEvent.change(screen.getByLabelText(/pick level/i), { target: { value: "1" } });
    const blockedTile = screen.getByRole("button", {
      name: /Tile blocked-a arrow upRight/i,
    });
    fireEvent.click(blockedTile);

    expect(blockedTile).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByTestId("move-count")).toHaveTextContent("0");
  });

  it("undo_restores_the_previous_state", () => {
    render(<GameScreen levels={testLevels} />);

    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    expect(screen.getByRole("button", { name: /Tile test-a arrow up/i })).toHaveAttribute(
      "data-exiting",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(
      screen.getByRole("button", { name: /Tile test-a arrow up/i }),
    ).toBeInTheDocument();
  });

  it("restart_restores_the_original_state", () => {
    render(<GameScreen levels={testLevels} />);

    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      screen.getByRole("button", { name: /Tile test-a arrow up/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("move-count")).toHaveTextContent("0");
  });

  it("shows_completion_state_when_the_last_tile_is_removed", () => {
    render(<GameScreen levels={testLevels} />);

    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tile test-b arrow up/i }));

    expect(
      screen.getByRole("dialog", { name: "Level complete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Level complete" }),
    ).toHaveFocus();
    expect(screen.getByText("2 moves")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("completion_flow_starts_the_next_level_after_showing_the_score", () => {
    render(<GameScreen levels={testLevels} />);

    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tile test-b arrow up/i }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next level" }));

    expect(screen.getByRole("heading", { name: "Test Blocked" })).toBeInTheDocument();
    expect(screen.getByTestId("move-count")).toHaveTextContent("0");
  });

  it("ranked_flow_logs_only_effective_commands_and_submits_completion", async () => {
    const client = createLeaderboardClientFake();
    render(
      <GameScreen
        levels={testLevels}
        leaderboardEnabled={true}
        leaderboardClient={client}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Start ranked run" }),
      ).toBeEnabled(),
    );
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Start ranked run" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: "Cancel ranked run" }),
    ).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(4_100);
      await Promise.resolve();
    });
    expect(screen.getByText(/Server timing is active/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tile test-b arrow up/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(client.completeAttempt).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174000",
      {
        commandLog: [
          { type: "remove", tileId: "test-a" },
          { type: "undo" },
          { type: "remove", tileId: "test-a" },
          { type: "remove", tileId: "test-b" },
        ],
      },
      expect.any(AbortSignal),
    );
    expect(screen.getByText(/#1 · New personal best/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "Retry" }).find(
        (button) => button.className === "game-button",
      ),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByLabelText(/pick level/i)).toBeDisabled();
    expect(
      screen.getByRole("dialog", { name: "New high score" }),
    ).toBeInTheDocument();
    expect(screen.getByText("You placed #1")).toBeInTheDocument();
    expect(
      screen.getByText("Swift Fox 42", { selector: ".high-score-name strong" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Couldn’t refresh/)).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Server-validated all-time Top 10" }),
    ).toBeInTheDocument();

    const storedProgress = JSON.parse(
      window.localStorage.getItem("tiles-game-progress-v2") ?? "{}",
    ) as {
      bestStatsByLevelId?: Record<string, { seconds: number }>;
    };
    expect(storedProgress.bestStatsByLevelId?.["test-complete"]?.seconds).toBe(0);

    fireEvent.keyDown(window, { key: "r" });
    expect(
      screen.getByRole("dialog", { name: "New high score" }),
    ).toBeInTheDocument();
  });

  it("ranked_result_outside_the_top_ten_shows_the_board_before_continuing", async () => {
    const versionId = await levelVersionId(testLevels[0]);
    const client = {
      ...createLeaderboardClientFake(),
      getLeaderboard: vi.fn().mockImplementation((levelVersionId: string) =>
        Promise.resolve({
          levelVersionId,
          entries: Array.from({ length: 10 }, (_, index) => ({
            scoreId: `leader-${index + 1}`,
            rank: index + 1,
            displayName: `Player ${index + 1}`,
            elapsedSeconds: 8 + index,
            achievedAt: "2026-07-25T00:00:00.000Z",
          })),
        }),
      ),
      completeAttempt: vi.fn().mockImplementation(() =>
        Promise.resolve({
          status: "published",
          submittedScoreId: "score-12",
          levelVersionId: versionId,
          elapsedSeconds: 32,
          isPersonalBest: true,
          personalBest: {
            scoreId: "score-12",
            elapsedSeconds: 32,
            rank: 12,
            isTopTen: false,
          },
        }),
      ),
    } as LeaderboardClient;

    render(
      <GameScreen
        levels={testLevels}
        leaderboardEnabled={true}
        leaderboardClient={client}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Start ranked run" }),
      ).toBeEnabled(),
    );
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Start ranked run" }));
    await act(async () => {
      // Ranked start now waits for the start intent and accepted attempt to be
      // durably journaled before gameplay can begin.
      for (let index = 0; index < 30; index += 1) await Promise.resolve();
      vi.advanceTimersByTime(4_100);
      for (let index = 0; index < 4; index += 1) await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tile test-b arrow up/i }));

    await act(async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });

    expect(
      screen.getByRole("dialog", { name: "Level complete" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not in the Top 10 this time")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Server-validated all-time Top 10" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next level" }));
    expect(screen.getByRole("heading", { name: "Test Blocked" })).toBeInTheDocument();
  });

  it("level_switch_closes_records_before_the_previous_board_can_flash", async () => {
    let leaderboardReadCount = 0;
    const client = {
      ...createLeaderboardClientFake(),
      getLeaderboard: vi.fn().mockImplementation((levelVersionId: string) => {
        leaderboardReadCount += 1;
        return Promise.resolve({
          levelVersionId,
          entries: [
            {
              scoreId: `score-${leaderboardReadCount}`,
              rank: 1,
              displayName:
                leaderboardReadCount === 1 ? "Previous Level Fox" : "Next Level Otter",
              elapsedSeconds: 18,
              achievedAt: "2026-07-25T00:00:00.000Z",
            },
          ],
        });
      }),
    } as LeaderboardClient;
    render(
      <GameScreen
        levels={testLevels}
        leaderboardEnabled={true}
        leaderboardClient={client}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Records" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Records" }));
    await waitFor(() =>
      expect(screen.getByText("Previous Level Fox")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/pick level/i), {
      target: { value: "1" },
    });

    expect(screen.queryByText("Previous Level Fox")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Records" })).toHaveAttribute(
        "aria-expanded",
        "false",
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("Swift Fox 42")).toBeInTheDocument(),
    );
  });

  it("expired_offline_recovery_restores_commands_and_locks_the_doomed_run", async () => {
    const versionId = await levelVersionId(testLevels[0]);
    saveAttemptSession({
      attempt: {
        attemptId: "123e4567-e89b-42d3-a456-426614174000",
        apiProtocolVersion: 2,
        levelVersionId: versionId,
        replayContractVersion: 1,
        startsAt: "2020-07-25T12:00:00.000Z",
        expiresAt: "2020-07-25T12:30:00.000Z",
        displayName: "Swift Fox 42",
      },
      commandLog: [{ type: "remove", tileId: "test-a" }],
    });
    const client = {
      ...createLeaderboardClientFake(),
      getAttempt: vi.fn().mockRejectedValue(new TypeError("offline")),
    } as LeaderboardClient;

    render(
      <GameScreen
        levels={testLevels}
        leaderboardEnabled={true}
        leaderboardClient={client}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled(),
    );
    expect(screen.getByTestId("move-count")).toHaveTextContent("1");
    expect(
      screen.getByRole("button", { name: /Tile test-b arrow up/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(screen.getByLabelText(/pick level/i)).toBeDisabled();
    expect(window.sessionStorage.getItem("tiles-game-ranked-attempt-v1")).not.toBeNull();
  });
});

function createLeaderboardClientFake(): LeaderboardClient {
  let requestedLevel = `sha256:${"a".repeat(64)}`;
  return {
    getLeaderboard: vi.fn().mockImplementation((levelVersionId: string) => {
      requestedLevel = levelVersionId;
      return Promise.resolve({
        levelVersionId,
        entries: [],
      });
    }),
    getPersonalBest: vi.fn().mockImplementation((levelVersionId: string) => {
      requestedLevel = levelVersionId;
      return Promise.resolve({
        levelVersionId,
        displayName: "Swift Fox 42",
        personalBest: null,
      });
    }),
    startAttempt: vi.fn().mockImplementation((levelVersionId: string) => {
      requestedLevel = levelVersionId;
      return Promise.resolve({
        attemptId: "123e4567-e89b-42d3-a456-426614174000",
        apiProtocolVersion: 2,
        levelVersionId,
        replayContractVersion: 1,
        startsAt: new Date(Date.now() + 4_000).toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        displayName: "Swift Fox 42",
      });
    }),
    getAttempt: vi.fn(),
    completeAttempt: vi.fn().mockImplementation(() => Promise.resolve({
      status: "published",
      submittedScoreId: "score-1",
      levelVersionId: requestedLevel,
      elapsedSeconds: 18,
      isPersonalBest: true,
      personalBest: {
        scoreId: "score-1",
        elapsedSeconds: 18,
        rank: 1,
        isTopTen: true,
      },
    })),
    createClaimContinuation: vi.fn(),
    claimScore: vi.fn(),
    getClaimStatus: vi.fn(),
    publishScore: vi.fn(),
    getPublication: vi.fn(),
  };
}
