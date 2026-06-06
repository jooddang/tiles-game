# Phase 3: Generator and Level Manifest

Parent PRD: [PRD: Browser Tile Puzzle](../prd-browser-tile-puzzle.md)
Status: Complete
Last Updated: 2026-06-05

## Objective

Implement deterministic level generation, difficulty scoring, and a curated MVP level manifest that only includes validated solvable levels.

## Context From Master PRD

- Goals covered: G-3, G-4, G-5
- Success Criteria: SC-2, SC-6
- Requirements covered: FR-14 through FR-17, NFR-7
- Key scenarios touched: Developer Generates Candidate Levels, Hard Level Search

## Phase Discovery Gate

Before editing code, re-check:

- [x] Relevant code/files: `src/engine/`, `src/levels/`, `tests/engine/`, `plan.md`
- [x] Relevant tests/fixtures: Phase 2 engine tests
- [x] Relevant docs/specs/external references: deterministic PRNG implementation references only if adding a tiny local PRNG is not enough
- [x] Relevant commands or tools: `npm run test`, `npm run typecheck`
- [x] Assumptions from the master PRD still hold
- [x] If discoveries change this phase or later phases, update PRD files before implementation

## Scope

### In Scope

- Deterministic seeded candidate generation.
- Reverse-construction generation strategy.
- Difficulty metric calculation.
- Manifest validation.
- Reference follow-up reduced shipped levels to the single `Hex Tower` map.
- Development diagnostics for rejected candidates.

### Out of Scope

- Runtime endless mode.
- Production daily challenge publishing.
- User-generated levels.
- Backend storage for levels.

## Implementation Checklist

- [x] Create `src/engine/generator.ts` with deterministic seed input and reverse-construction board generation.
- [x] Create `src/engine/difficulty.ts` with metrics from `plan.md`: `N`, `E`, `D`, `F_0`, median availability, blocker density, and visual complexity placeholder.
- [x] Create manifest validation that checks tile IDs, cell bounds, direction validity, duplicate cells, and solvability.
- [x] Create `src/levels/reference.ts` with the single curated Hex Tower definition.
- [x] Create `src/levels/manifest.ts` that exports ordered levels and validates them in tests.
- [x] Add generator diagnostics that report seed, target tier, attempts, rejection reason, and score.
- [x] Keep generated candidates out of shipped manifest until manually selected.

## Validation Strategy

Use unit tests for generator/scorer determinism and manifest validation. Avoid relying on snapshots for generated boards unless the seed output is intentionally locked and reviewed.

## Validation Checklist

- [x] Same seed and target returns the same candidate.
- [x] Different seeds can produce different candidates.
- [x] Generated candidates pass solvability validation.
- [x] Generator fails with diagnostics after a bounded number of attempts when targets cannot be met.
- [x] Difficulty scorer computes expected metrics for small known boards.
- [x] Manifest rejects duplicate tile IDs.
- [x] Manifest rejects duplicate occupied cells.
- [x] Manifest rejects invalid directions.
- [x] Manifest rejects unsolvable cycles.
- [x] Every shipped manifest level passes validation.
- [x] Tutorial levels have high initial availability.
- [x] Hex Tower has dense reference-map scale and manifest validation.
- [x] Static checks pass: `npm run typecheck`
- [x] Unit tests pass: `npm run test`

## Exit Criteria

- [x] Phase objective is satisfied
- [x] Requirements listed above are implemented or explicitly deferred
- [x] Validation checklist is complete or gaps are recorded with rationale
- [x] No known blocker remains for the next phase

## Phase-End Multi-Pass Review

Complete in order before moving to the next phase:

- [x] 1. Intent/coverage review: this phase achieves its objective and mapped requirements.
- [x] 2. Correctness review: happy paths, edge cases, errors, empty states, state transitions, and permissions are handled.
- [x] 3. Simplicity review: the solution is no more complex than necessary.
- [x] 4. Code quality review: names, boundaries, abstractions, and local consistency are clean.
- [x] 5. Duplication/cleanup review: repeated logic, dead code, temporary code, noisy logs, commented leftovers, unused files, and unused dependencies are removed.
- [x] 6. Security/privacy review: level data is validated and never evaluated as code.
- [x] 7. Performance/load review: generation is bounded and does not run unbounded in user-facing paths.
- [x] 8. Validation review: chosen checks are appropriate for phase risk; missing checks are justified.
- [x] 9. Future-phase review: later phase files and checklists are still correct; revise them if implementation changed the plan.
- [x] 10. PRD sync review: master PRD status, active phase, assumptions, risks, validation surface, and change log are updated.

## Discoveries / Decisions

- Ship curated levels, not arbitrary generated boards.
- Implementation created deterministic generator, difficulty scorer, curated level files, and manifest validation.
- Verification evidence: `npm run typecheck`, `npm run lint`, `npm run test -- tests/engine tests/levels`, full `npm run test`, `npm run build`, and `npm audit --audit-level=high` passed.
- Review-implementation finding fixed: `easy-2` initially formed a cycle; manifest validation caught it and the level direction was corrected.

## Phase Change Log

- 2026-06-05: Phase file created.
- 2026-06-05: Phase completed and verified.
