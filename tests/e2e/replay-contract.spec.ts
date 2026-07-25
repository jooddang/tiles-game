import { expect, test } from "@playwright/test";

test("browser_runtime_computes_the_golden_level_version_with_webcrypto", async ({
  page,
}) => {
  await page.goto("/games/tiles-game/");

  const versionId = await page.evaluate(async () => {
    const modulePath =
      "/games/tiles-game/src/leaderboard/serverContractEntry.ts";
    const contract = await import(modulePath);
    const goldenFixture = contract.GOLDEN_REPLAY_FIXTURES[0];

    return contract.levelVersionId(goldenFixture.input.level);
  });

  expect(versionId).toBe(
    "sha256:4ab54479899521a8b4d04b2d8a77caef9beabc8c87bb5c5e33a43e64c5bdb529",
  );
});
