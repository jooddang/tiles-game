import { describe, expect, it } from "vitest";
import {
  chooseBestStats,
  emptyProgress,
  loadProgress,
  saveProgress,
} from "../../src/storage/progressStorage";

describe("progressStorage", () => {
  it("loadProgress_returns_empty_progress_when_storage_is_unavailable", () => {
    expect(loadProgress(undefined)).toEqual(emptyProgress);
  });

  it("loadProgress_ignores_corrupt_json_without_throwing", () => {
    const storage = {
      getItem: () => "{bad json",
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 1,
    } satisfies Storage;

    expect(loadProgress(storage)).toEqual(emptyProgress);
  });

  it("saveProgress_returns_false_when_storage_write_fails", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } satisfies Storage;

    expect(saveProgress(emptyProgress, storage)).toBe(false);
  });

  it("loadProgress_migrates_valid_v1_completion_data", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tiles-game-progress-v1",
      JSON.stringify({
        currentLevelId: "level-a",
        completedLevelIds: ["level-a"],
        bestStatsByLevelId: { "level-a": { moves: 20, seconds: 12 } },
      }),
    );

    const expected = {
      currentLevelId: "level-a",
      completedLevelIds: ["level-a"],
      bestStatsByLevelId: { "level-a": { moves: 20, seconds: 12 } },
    };
    expect(loadProgress(storage)).toEqual(expected);
    expect(storage.getItem("tiles-game-progress-v2")).toBe(
      JSON.stringify(expected),
    );
  });

  it("loadProgress_keeps_valid_legacy_data_when_migration_write_fails", () => {
    const legacy = JSON.stringify({
      currentLevelId: "level-a",
      completedLevelIds: ["level-a"],
      bestStatsByLevelId: { "level-a": { moves: 20, seconds: 12 } },
    });
    const storage = {
      getItem: (key: string) =>
        key === "tiles-game-progress-v1" ? legacy : null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 1,
    } satisfies Storage;

    expect(loadProgress(storage)).toEqual({
      currentLevelId: "level-a",
      completedLevelIds: ["level-a"],
      bestStatsByLevelId: { "level-a": { moves: 20, seconds: 12 } },
    });
  });

  it("chooseBestStats_prefers_faster_completion_before_move_count", () => {
    expect(
      chooseBestStats(
        { moves: 10, seconds: 30 },
        { moves: 20, seconds: 20 },
      ),
    ).toEqual({ moves: 20, seconds: 20 });
  });

  it("chooseBestStats_uses_moves_only_to_break_equal_time", () => {
    expect(
      chooseBestStats(
        { moves: 20, seconds: 20 },
        { moves: 10, seconds: 20 },
      ),
    ).toEqual({ moves: 10, seconds: 20 });
  });

  it("loadProgress_rejects_non_finite_and_negative_stats", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tiles-game-progress-v2",
      JSON.stringify({
        completedLevelIds: [],
        bestStatsByLevelId: {
          negative: { moves: 1, seconds: -1 },
          infinite: { moves: 1, seconds: "NaN" },
        },
      }),
    );

    expect(loadProgress(storage).bestStatsByLevelId).toEqual({});
  });
});

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
