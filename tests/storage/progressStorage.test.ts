import { describe, expect, it } from "vitest";
import { emptyProgress, loadProgress, saveProgress } from "../../src/storage/progressStorage";

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
});
