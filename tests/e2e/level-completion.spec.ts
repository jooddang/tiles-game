import { expect, test } from "@playwright/test";
import {
  applyMove,
  createInitialGameState,
  type LevelDefinition,
} from "../../src/engine";
import { levelManifest } from "../../src/levels/manifest";
import { levelVersionId } from "../../src/leaderboard/replayContract";
import { isRankedOutboxItem } from "../../src/leaderboard/rankedOutbox";

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

test("guest_completion_recovers_before_ranked_auto_start_after_a_document_reload", async ({ page }) => {
  const versionId = await levelVersionId(levelManifest[0]);
  const attemptId = "123e4567-e89b-42d3-a456-426614174000";
  const scoreId = "223e4567-e89b-42d3-a456-426614174000";
  let starts = 0;
  const attempt = {
    attemptId, apiProtocolVersion: 2, levelVersionId: versionId, replayContractVersion: 1,
    startsAt: new Date(Date.now() + 2_500).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), displayName: "Calm-Otter-101",
  };
  const completion = {
    submittedScoreId: scoreId, levelVersionId: versionId, elapsedSeconds: 1,
    status: "published", isPersonalBest: true,
    personalBest: { scoreId, elapsedSeconds: 1, rank: 1, isTopTen: true },
    accountBinding: { state: "guest" },
  };
  await page.route("**/api/tiles-game/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && pathname.endsWith("/attempts")) {
      starts += 1;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(attempt) });
    } else if (request.method() === "POST" && pathname.endsWith("/complete")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(completion) });
    } else if (request.method() === "GET" && pathname.endsWith(`/${attemptId}`)) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        status: "completed", result: completion, accountBinding: completion.accountBinding,
      }) });
    } else if (request.method() === "GET" && pathname.endsWith("/me")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        levelVersionId: versionId, displayName: "Calm-Otter-101", personalBest: null,
      }) });
    } else if (request.method() === "GET" && pathname.includes("/leaderboard/")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        levelVersionId: versionId, entries: [],
      }) });
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
  });
  await page.addInitScript(() => sessionStorage.setItem("tiles-game-stage-choice-v1", "ranked"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Tile / }).first()).toBeEnabled();
  for (const tileId of solveLevel(levelManifest[0])) {
    await page.getByRole("button", { name: new RegExp(`^Tile ${tileId} arrow`) })
      .evaluate((button: HTMLButtonElement) => button.click());
  }
  await expect(page.getByRole("dialog", { name: /Level complete|New high score/ })).toBeVisible();
  expect(starts).toBe(1);
  const readRawItems = () => page.evaluate(async () => {
    const request = indexedDB.open("roadcrosser-tiles-ranked");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const getAll = database.transaction("outbox", "readonly").objectStore("outbox").getAll();
    return new Promise<unknown[]>((resolve, reject) => {
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
  });
  await expect.poll(async () => (await readRawItems()).filter(isRankedOutboxItem).some((item) =>
    item.operation === "complete" && item.phase === "guest_claimable")).toBe(true);
  const rawItems = await readRawItems();
  expect(rawItems.filter(isRankedOutboxItem).some((item) =>
    item.operation === "complete" && item.phase === "guest_claimable")).toBe(true);

  await page.reload();
  expect((await readRawItems()).filter(isRankedOutboxItem).some((item) =>
    item.operation === "complete" && item.phase === "guest_claimable")).toBe(true);
  await expect(page.getByRole("dialog", { name: /Level complete|New high score/ })).toBeVisible();
  expect(starts).toBe(1);
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
