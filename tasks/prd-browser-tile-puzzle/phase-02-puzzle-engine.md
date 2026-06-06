# Phase 2: Puzzle Engine

Parent PRD: [PRD: Browser Tile Puzzle](../prd-browser-tile-puzzle.md)
Status: Complete
Last Updated: 2026-06-05

## Objective

Implement the pure TypeScript puzzle engine that owns board state, directions, legal moves, dependency graph construction, solvability validation, undo history, and win detection.

## Context From Master PRD

- Goals covered: G-2, G-3
- Success Criteria: SC-2, SC-6
- Requirements covered: FR-3 through FR-10, NFR-1, NFR-2, NFR-7
- Key scenarios touched: First-Time Tutorial Play, Hard Level Search

## Phase Discovery Gate

Before editing code, re-check:

- [x] Relevant code/files: `src/`, `tests/`, `plan.md`, `tasks/prd-browser-tile-puzzle/context.md`
- [x] Relevant tests/fixtures: Phase 1 smoke tests and test config
- [x] Relevant docs/specs/external references: TypeScript and Vitest docs only if syntax/config questions arise
- [x] Relevant commands or tools: `npm run test`, `npm run typecheck`
- [x] Assumptions from the master PRD still hold, especially the resolved hex grid direction
- [x] If discoveries change this phase or later phases, update PRD files before implementation

## Scope

### In Scope

- Core domain types.
- Direction and ray-scanning helpers.
- Legal move detection.
- Move application.
- Blocker reporting.
- Dependency graph construction.
- Topological solvability validation.
- Win detection.
- Undo-ready immutable state transitions.

### Out of Scope

- React UI.
- Level generation.
- Difficulty scoring.
- Persistence.

## Implementation Checklist

- [x] Create `src/engine/types.ts` with explicit types for `Cell`, `Tile`, `Direction`, `LevelDefinition`, `GameState`, `MoveResult`, and `ValidationResult`.
- [x] Create `src/engine/directions.ts` with direction vectors and helpers.
- [x] Create `src/engine/board.ts` with board lookup and level validation helpers.
- [x] Create `src/engine/moves.ts` with `getBlockers`, `canRemoveTile`, `applyMove`, `restartLevel`, and `undoMove`.
- [x] Create `src/engine/graph.ts` with dependency edge construction and topological validation.
- [x] Ensure blocked moves return structured blocker data instead of mutating state.
- [x] Ensure legal moves return a new state and append to move history.
- [x] Ensure invalid tile IDs return a named domain error result.
- [x] Ensure win detection is based on zero remaining tiles.

## Validation Strategy

Use unit tests for pure logic. These tests should not mock internal engine collaborators.

## Validation Checklist

- [x] `getBlockers` returns blockers along the tile exit ray and ignores tiles behind the selected tile.
- [x] `canRemoveTile` returns true when the ray is empty.
- [x] `canRemoveTile` returns false with blocker IDs when the ray is blocked.
- [x] `applyMove` removes a legal tile and leaves all other tiles unchanged.
- [x] `applyMove` preserves state for blocked moves.
- [x] `applyMove` returns a named error for unknown tile IDs.
- [x] `undoMove` restores the exact prior board state.
- [x] `restartLevel` restores the original level state.
- [x] Dependency graph creates `blocker -> blocked` edges.
- [x] Topological validation accepts acyclic boards.
- [x] Topological validation rejects a two-tile cycle.
- [x] Topological validation rejects larger cycles.
- [x] Win detection returns complete only after the last tile is removed.
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
- [x] 6. Security/privacy review: access control, secrets, sensitive data, injection risks, unsafe client exposure, and audit needs are handled.
- [x] 7. Performance/load review: ray scanning and graph construction are acceptable for MVP board sizes.
- [x] 8. Validation review: chosen checks are appropriate for phase risk; missing checks are justified.
- [x] 9. Future-phase review: later phase files and checklists are still correct; revise them if implementation changed the plan.
- [x] 10. PRD sync review: master PRD status, active phase, assumptions, risks, validation surface, and change log are updated.

## Discoveries / Decisions

- The engine must stay pure and framework-independent.
- Implementation created pure TypeScript engine modules under `src/engine/`.
- Reference follow-up replaced the square-grid MVP with a 6-direction hex model: `up`, `upRight`, `downRight`, `down`, `downLeft`, and `upLeft`.
- Verification evidence: `npm run typecheck`, `npm run lint`, and `npm run test -- tests/engine` passed.
- Review-implementation finding fixed: runtime invalid direction validation was added before manifest work.

## Phase Change Log

- 2026-06-05: Phase file created.
- 2026-06-05: Phase completed and verified.
