import { describe, expect, it } from "vitest";
import { generateCandidateLevel, validateSolvableLevel } from "../../src/engine";

describe("generator", () => {
  it("generateCandidateLevel_returns_the_same_candidate_for_the_same_seed_and_target", () => {
    const target = {
      seed: "repeatable",
      width: 5,
      height: 5,
      tileCount: 8,
      tier: "easy" as const,
    };

    const first = generateCandidateLevel(target);
    const second = generateCandidateLevel(target);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.level).toEqual(second.level);
      expect(first.metrics).toEqual(second.metrics);
    }
  });

  it("generateCandidateLevel_can_produce_different_candidates_for_different_seeds", () => {
    const first = generateCandidateLevel({
      seed: "alpha",
      width: 5,
      height: 5,
      tileCount: 8,
      tier: "easy",
    });
    const second = generateCandidateLevel({
      seed: "beta",
      width: 5,
      height: 5,
      tileCount: 8,
      tier: "easy",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.level.tiles.map((tile) => tile.cell)).not.toEqual(
        second.level.tiles.map((tile) => tile.cell),
      );
    }
  });

  it("generateCandidateLevel_returns_solvable_candidates", () => {
    const result = generateCandidateLevel({
      seed: "solvable",
      width: 6,
      height: 6,
      tileCount: 12,
      tier: "medium",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validateSolvableLevel(result.level)).toEqual({ ok: true });
    }
  });

  it("generateCandidateLevel_fails_with_diagnostics_after_bounded_attempts", () => {
    const result = generateCandidateLevel({
      seed: "impossible",
      width: 2,
      height: 2,
      tileCount: 5,
      tier: "hard",
      maxAttempts: 3,
    });

    expect(result).toEqual({
      ok: false,
      seed: "impossible",
      attempts: 0,
      rejectionReason: "tileCount exceeds available cells",
      lastMetrics: undefined,
    });
  });

  it("generateCandidateLevel_reports_last_metrics_when_constraints_cannot_be_met", () => {
    const result = generateCandidateLevel({
      seed: "too-strict",
      width: 4,
      height: 4,
      tileCount: 5,
      tier: "tutorial",
      maxAttempts: 2,
      constraints: {
        minInitialRemovableCount: 99,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(2);
      expect(result.rejectionReason).toBe("no candidate satisfied target constraints");
      expect(result.lastMetrics?.tileCount).toBe(5);
    }
  });
});
