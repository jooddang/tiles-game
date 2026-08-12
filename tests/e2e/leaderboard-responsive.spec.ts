import { expect, test } from "@playwright/test";

const viewports = [
  { name: "small-phone", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-boundary", width: 760, height: 800 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "short-landscape-embed", width: 844, height: 390 },
] as const;

for (const viewport of viewports) {
  test(`records_fit_the_${viewport.name}_viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
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
                personalBest: {
                  scoreId: "score-player",
                  rank: 2,
                  displayName: "Swift Fox 42",
                  elapsedSeconds: 21,
                  achievedAt: "2026-07-25T00:00:00.000Z",
                },
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
                  {
                    scoreId: "score-player",
                    rank: 2,
                    displayName: "Swift Fox 42",
                    elapsedSeconds: 21,
                    achievedAt: "2026-07-25T00:00:00.000Z",
                  },
                ],
              },
        ),
      });
    });
    await page.goto("/");

    await expect(page.getByText("Ranked as")).toBeVisible();
    await expect(page.getByText("Swift Fox 42").first()).toBeVisible();
    await page.getByRole("button", { name: "Records" }).click();

    const panel =
      viewport.width <= 760
        ? page.getByRole("dialog")
        : page.locator(".leaderboard-panel-inline");
    await expect(panel).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Server-validated all-time Top 10" }),
    ).toBeVisible();

    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);

    if (viewport.width <= 760) {
      await expect(page.locator("body > div").first()).toHaveAttribute("inert", "");
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByLabel(/Hex Tower board/i)).toBeVisible();
    }

    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}.png`),
      fullPage: false,
    });

    if (viewport.name === "phone") {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Records" })).toBeFocused();
      await page.getByRole("button", { name: "Records" }).click();
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("button", { name: "Records" })).toBeFocused();
    }
  });
}
