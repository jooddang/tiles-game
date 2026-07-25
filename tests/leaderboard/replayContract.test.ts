import { describe, expect, it } from "vitest";
import {
  GOLDEN_LEVEL_HASHES,
  GOLDEN_REPLAY_FIXTURES,
} from "../../src/leaderboard/goldenReplay";
import {
  REPLAY_CONTRACT_VERSION,
  canonicalGameplayJson,
  levelVersionId,
  replayCommandLog,
} from "../../src/leaderboard/replayContract";

const goldenLevel = GOLDEN_REPLAY_FIXTURES[0].input.level;

describe("replay contract", () => {
  it("canonicalGameplayJson_sorts_tiles_and_excludes_presentation_fields", () => {
    expect(canonicalGameplayJson(goldenLevel)).toBe(
      '{"width":2,"height":1,"tiles":[{"id":"first","row":0,"col":0,"direction":"downLeft"},{"id":"second","row":0,"col":1,"direction":"downRight"}]}',
    );
  });

  it("levelVersionId_hashes_contract_version_and_canonical_gameplay", async () => {
    expect(await levelVersionId(goldenLevel)).toBe(GOLDEN_LEVEL_HASHES.golden);
    expect(
      await levelVersionId({
        ...goldenLevel,
        title: "Changed title",
        tiles: goldenLevel.tiles.map((tile) => ({
          ...tile,
          color: "changed",
        })),
      }),
    ).toBe(GOLDEN_LEVEL_HASHES.golden);
    expect(await levelVersionId(goldenLevel, REPLAY_CONTRACT_VERSION + 1)).not.toBe(
      GOLDEN_LEVEL_HASHES.golden,
    );
  });

  it.each(GOLDEN_REPLAY_FIXTURES)(
    "replayCommandLog_matches_golden_fixture_$name",
    async ({ input, expected }) => {
      expect(await replayCommandLog(input)).toEqual(expected);
    },
  );
});
