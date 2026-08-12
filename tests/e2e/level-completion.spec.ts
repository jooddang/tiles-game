import { expect, test } from "@playwright/test";
import {
  applyMove,
  createInitialGameState,
  type LevelDefinition,
} from "../../src/engine";
import { levelManifest } from "../../src/levels/manifest";

test("level_clear_shows_score_and_records_before_the_next_level", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    window.sessionStorage.setItem("tiles-game-stage-choice-v1", "practice");
  });
  await page.route("**/api/tiles-game/leaderboard/**", async (route) => {
    const url = new URL(route.request().url());
    const levelVersionId = decodeURIComponent(
      url.pathname.split("/").at(-2) ?? "",
    );
    const isPersonalBest = url.pathname.endsWith("/me");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        isPersonalBest
          ? {
              levelVersionId,
              displayName: "Swift Fox 42",
              personalBest: null,
            }
          : {
              levelVersionId: decodeURIComponent(
                url.pathname.split("/").at(-1) ?? "",
              ),
              entries: [
                {
                  scoreId: "score-leader",
                  rank: 1,
                  displayName: "Copper Otter 7",
                  elapsedSeconds: 18,
                  achievedAt: "2026-07-24T00:00:00.000Z",
                },
              ],
            },
      ),
    });
  });
  await page.goto("/");
  await expect(page.getByText("Ranked as")).toBeVisible();

  for (const tileId of solveLevel(levelManifest[0])) {
    await page
      .getByRole("button", { name: new RegExp(`^Tile ${tileId} arrow`) })
      .evaluate((button: HTMLButtonElement) => button.click());
  }

  const dialog = page.getByRole("dialog", { name: "Level complete" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("270 moves")).toBeVisible();
  await expect(
    dialog.getByRole("table", {
      name: "Server-validated all-time Top 10",
    }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Next level" })).toBeVisible();

  const viewport = page.viewportSize();
  const bounds = await dialog.boundingBox();
  expect(viewport).not.toBeNull();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1);

  await page.screenshot({
    path: testInfo.outputPath("level-complete.png"),
    fullPage: false,
  });

  await dialog.getByRole("button", { name: "Next level" }).click();
  await expect(page.getByRole("heading", { name: "Hex Tower II" })).toBeVisible();
});

function solveLevel(level: LevelDefinition): readonly string[] {
  let state = createInitialGameState(level);
  const solution: string[] = [];

  while (state.status === "playing") {
    const nextMove = state.remainingTiles
      .map((tile) => applyMove(tile.id, state))
      .find((move) => move.type === "removed");
    if (!nextMove || nextMove.type !== "removed") {
      throw new Error(`No legal move found while solving ${level.id}`);
    }
    solution.push(nextMove.tileId);
    state = nextMove.state;
  }

  return solution;
}
