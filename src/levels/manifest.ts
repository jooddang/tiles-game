import { validateSolvableLevel, type LevelDefinition, type ValidationResult } from "../engine";
import { referenceLevels } from "./reference";

export const levelManifest: readonly LevelDefinition[] = [
  ...referenceLevels,
];

export function validateLevelManifest(
  levels: readonly LevelDefinition[] = levelManifest,
): ValidationResult {
  const issues: Exclude<ValidationResult, { ok: true }>["issues"][number][] = [];
  const seenIds = new Set<string>();

  for (const level of levels) {
    if (seenIds.has(level.id)) {
      issues.push({
        code: "duplicate_tile_id",
        message: `Level id '${level.id}' is duplicated.`,
      });
    }
    seenIds.add(level.id);

    const validation = validateSolvableLevel(level);
    if (!validation.ok) {
      issues.push(
        ...validation.issues.map((issue) => ({
          ...issue,
          message: `${level.id}: ${issue.message}`,
        })),
      );
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
