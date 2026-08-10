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
