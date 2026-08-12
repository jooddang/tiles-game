import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("default_branch_push_runs_ci_for_every_change", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/leaderboard-contract.yml", import.meta.url),
    "utf8",
  );
  const pushTrigger = workflow.match(
    /\n {2}push:\n([\s\S]*?)\n {2}workflow_dispatch:/,
  );

  assert.ok(pushTrigger, "workflow must define push before workflow_dispatch");
  assert.match(pushTrigger[1], /branches: \[main\]/);
  assert.doesNotMatch(pushTrigger[1], /^\s+paths:/m);
});

test("browser CI enables the paired leaderboard and Roadcrosser bridge build", async () => {
  const config = await readFile(
    new URL("../../playwright.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(config, /VITE_TILES_LEADERBOARD_ENABLED=true/);
  assert.match(config, /VITE_ROADCROSSER_AUTH_BRIDGE_ENABLED=true/);
});
