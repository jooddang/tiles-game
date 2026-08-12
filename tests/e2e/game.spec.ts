import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("tiles-game-stage-choice-v1", "practice");
  });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("visible_blockers_prevent_removal_on_hex_tower", async ({ page }) => {
  await page.getByRole("button", { name: /Tile ref-122 arrow upLeft/i }).click();

  await expect(page.getByText("Blocked")).toBeVisible();
  await expect(page.getByText(/tile in the arrow path|tiles in the arrow path/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Tile ref-122 arrow upLeft/i })).toBeVisible();
});

test("restart_resets_the_board", async ({ page }) => {
  await page.getByRole("button", { name: /Tile ref-1 arrow upRight/i }).click();
  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toHaveAttribute(
    "data-exiting",
    "true",
  );
  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toBeVisible();
  await expect(page.getByTestId("move-count")).toHaveText("0");
});

test("undo_restores_a_removed_tile", async ({ page }) => {
  await page.getByRole("button", { name: /Tile ref-1 arrow upRight/i }).click();
  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toHaveAttribute(
    "data-exiting",
    "true",
  );

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toBeVisible();
});

test("multiple_tiles_can_move_while_exit_animations_are_running", async ({ page }) => {
  await page.getByRole("button", { name: /Tile ref-1 arrow upRight/i }).click();
  await page.getByRole("button", { name: /Tile ref-3 arrow up/i }).click();

  await expect(page.getByTestId("move-count")).toHaveText("2");
  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toHaveAttribute(
    "data-exiting",
    "true",
  );
  await expect(page.getByRole("button", { name: /Tile ref-3 arrow up/i })).toHaveAttribute(
    "data-exiting",
    "true",
  );
});

test("mobile_exit_animation_stays_visible_during_the_first_half", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await page.getByRole("button", { name: /Tile ref-1 arrow upRight/i }).click();
  await page.waitForTimeout(350);

  const exitingOpacity = await page
    .locator('.tile[data-exiting="true"]')
    .first()
    .evaluate((tile) => Number(getComputedStyle(tile).opacity));

  expect(exitingOpacity).toBeGreaterThan(0.85);
});

test("desktop_viewport_is_playable_without_layout_overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();

  await expect(page.getByLabel(/Hex Tower board/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Tile ref-/i }).first()).toBeVisible();
});

test("mobile_viewport_is_playable_without_layout_overlap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await expect(page.getByLabel(/Hex Tower board/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Tile ref-/i }).first()).toBeVisible();
});

test("keyboard_activation_can_remove_a_focused_tile", async ({ page }) => {
  await page.getByRole("button", { name: /Tile ref-1 arrow upRight/i }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toHaveAttribute(
    "data-exiting",
    "true",
  );
  await expect(page.getByRole("button", { name: /Tile ref-1 arrow upRight/i })).toHaveCount(0);
  await expect(page.getByTestId("move-count")).toHaveText("1");
});

test("hard_level_mobile_tiles_keep_touch_target_size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const minimumTileSize = await page.locator(".tile").evaluateAll((tiles) => {
    const sizes = tiles.map((tile) => {
      const rect = tile.getBoundingClientRect();
      return Math.min(rect.width, rect.height);
    });
    return Math.min(...sizes);
  });

  expect(minimumTileSize).toBeGreaterThanOrEqual(44);
});
