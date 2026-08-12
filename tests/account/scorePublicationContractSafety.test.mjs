import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const bytes = readFileSync(new URL("../../contracts/tiles-leaderboard-publication-v1.json", import.meta.url));
const fixture = JSON.parse(bytes.toString("utf8"));
const accountScoreBytes = readFileSync(new URL("../../contracts/tiles-account-score-v1.json", import.meta.url));
const accountScoreFixture = JSON.parse(accountScoreBytes.toString("utf8"));
const legacyProtocolBytes = readFileSync(new URL("../../src/leaderboard/protocol.ts", import.meta.url));
const contractTsconfig = JSON.parse(readFileSync(
  new URL("../../tsconfig.contract.json", import.meta.url), "utf8"));
const messageFixtureBytes = readFileSync(new URL(
  "../../contracts/tiles-message-canonicalization-v1.json", import.meta.url));

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

test("account score fixture stays byte-identical to the frozen Road producer contract", () => {
  assert.equal(createHash("sha256").update(accountScoreBytes).digest("hex"),
    "cc2dcc99920daecf1bf8b7479ebb30c73f25698bb24f7c665851fd6a009dc51b");
  assert.equal(accountScoreFixture.attemptStart.response.accountBinding, undefined);
  assert.equal(accountScoreFixture.completion.response.accountBinding.state, "linked");
  assert.equal(accountScoreFixture.completion.response.accountBinding.accountName, "Player·A1B2");
  assert.equal(accountScoreFixture.claimContinuation.method, "POST");
  assert.equal(accountScoreFixture.claim.method, "POST");
  assert.equal(accountScoreFixture.claimStatus.method, "GET");
  assert.equal(accountScoreFixture.claimStatus.states.claimedByOther.status, "claimed_by_other");
  assert.equal(accountScoreFixture.publication.postResponse.messageState, "visible");
  assert.equal(accountScoreFixture.publication.states.locked.accountName, "Former Player");
  assert.equal(accountScoreFixture.attemptStatus.pending.result.accountBinding.state, "pending");
  assert.equal(accountScoreFixture.errorCodes[0], "ACCOUNT_RATE_LIMITED");
});

test("message canonicalization vectors stay byte-identical to Road", () => {
  assert.equal(createHash("sha256").update(messageFixtureBytes).digest("hex"),
    "fc376a00bac5579c86d8d76995f7a0fd6d6bb449f3e78f9f6631b4d2cd2e80b2");
});

test("Phase 3 declarations cannot mutate the API v2 replay contract fingerprint", () => {
  assert.equal(createHash("sha256").update(legacyProtocolBytes).digest("hex"),
    "4148c512dbf94be77e783592e88eab696eb6287b86e375d71bff02ec26927ace");
  assert.deepEqual(contractTsconfig.include, ["src/leaderboard/protocol.ts"]);
  assert.equal(contractTsconfig.include.includes("src/leaderboard/accountScoreProtocol.ts"), false);
});
