import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelDefinition } from "../../src/engine";
import { GameScreen } from "../../src/game/GameScreen";

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
    vi.useRealTimers();
  });

  it("renders_the_first_level", () => {
    render(<GameScreen />);

    expect(screen.getByRole("heading", { name: "Hex Tower" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Hex Tower board/i)).toBeInTheDocument();
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

    expect(screen.getByText("Level clear")).toBeInTheDocument();
    expect(screen.getByText(/Solved in 2 moves/i)).toBeInTheDocument();
  });

  it("next_starts_the_next_level_after_completion", () => {
    render(<GameScreen levels={testLevels} />);

    fireEvent.click(screen.getByRole("button", { name: /Tile test-a arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: /Tile test-b arrow up/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Test Blocked" })).toBeInTheDocument();
    expect(screen.getByTestId("move-count")).toHaveTextContent("0");
  });
});
