import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const bytes = readFileSync(new URL("../../contracts/tiles-leaderboard-publication-v1.json", import.meta.url));
const fixture = JSON.parse(bytes.toString("utf8"));

test("publication fixture preserves old/new producer-consumer behavior before client support", () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "89e9fded28abff6d709b489adeb5b7a1db949058259a8f0365620cbbd8410d8a");
  assert.deepEqual(Object.keys(fixture.legacyEntry), [
    "scoreId", "rank", "displayName", "elapsedSeconds", "achievedAt",
  ]);
  assert.equal(fixture.accountEntry.identityKind, "account");
  assert.equal(fixture.guestEntry.identityKind, "guest");
  assert.equal(fixture.compatibility.oldClientNewServer,
    "ignore publication fields and preserve the legacy entry");
  assert.equal(fixture.compatibility.newClientOldServer,
    "render the legacy guest identity without fabricating an account or message");
})
