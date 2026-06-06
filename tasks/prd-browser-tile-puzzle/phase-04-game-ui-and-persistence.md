# Phase 4: Game UI and Persistence

Parent PRD: [PRD: Browser Tile Puzzle](../prd-browser-tile-puzzle.md)
Status: Complete
Last Updated: 2026-06-05

## Objective

Build the responsive game UI, tile interactions, blocked-move feedback, completion flow, undo/restart controls, level navigation, and local progress persistence.

## Context From Master PRD

- Goals covered: G-1, G-6, G-7
- Success Criteria: SC-1, SC-3, SC-4, SC-5, SC-7
- Requirements covered: FR-1, FR-2, FR-11, FR-12, FR-13, FR-18, NFR-4, NFR-5, NFR-6, NFR-8
- Key scenarios touched: First-Time Tutorial Play, Returning Player Continues Progress, Hard Level Search

## Phase Discovery Gate

Before editing code, re-check:

- [x] Relevant code/files: `src/app/`, `src/game/`, `src/engine/`, `src/levels/`, `src/storage/`, `src/styles/`
- [x] Relevant tests/fixtures: engine tests, manifest tests, app smoke tests
- [x] Relevant docs/specs/external references: React, Testing Library, Playwright docs only if component or E2E patterns are unclear
- [x] Relevant commands or tools: `npm run test`, `npm run test:e2e`, `npm run typecheck`
- [x] Assumptions from the master PRD still hold
- [x] If discoveries change this phase or later phases, update PRD files before implementation

## Scope

### In Scope

- Game screen layout.
- Board rendering.
- Tile arrow/color rendering.
- Legal and blocked tile interactions.
- Blocker highlighting.
- Move count and elapsed time.
- Undo and restart.
- Level completion flow.
- Local progress persistence.
- Mobile and desktop responsive behavior.

### Out of Scope

- Full visual brand system.
- Leaderboards.
- Share cards.
- Cloud sync.
- Sound effects unless trivial and non-blocking.

## Implementation Checklist

- [x] Create `src/game/useGameController.ts` that connects manifest levels to engine commands without embedding rules in components.
- [x] Create `src/game/GameScreen.tsx` for page layout and level state orchestration.
- [x] Create `src/game/BoardView.tsx` for board geometry and tile placement.
- [x] Create `src/game/TileView.tsx` with arrow and color rendering.
- [x] Create `src/game/GameHud.tsx` with moves, timer, undo, restart, level navigation, and completion state.
- [x] Create `src/storage/progressStorage.ts` with safe read/write wrappers.
- [x] Handle localStorage unavailable by continuing in memory.
- [x] Handle corrupt localStorage JSON by resetting progress and avoiding a crash.
- [x] Add blocked-move feedback that highlights the blocking ray or blocking tiles.
- [x] Add keyboard controls for focus, activation, restart, and undo.
- [x] Ensure tile direction is represented by arrow/icon shape and not only color.
- [x] Ensure completion advances or unlocks the next level.

## Validation Strategy

Use component tests for UI state behavior and Playwright for real browser interactions. E2E is required because touch/pointer behavior, persistence, and responsive layout are user-visible.

## Validation Checklist

- [x] Component test: game screen renders the first level.
- [x] Component test: legal tile click removes the tile.
- [x] Component test: blocked tile click keeps state and shows blocker feedback.
- [x] Component test: undo restores previous state.
- [x] Component test: restart restores original state.
- [x] Component test: completion state appears when the last tile is removed.
- [x] Unit test: progress storage returns empty progress when localStorage is unavailable.
- [x] Unit test: corrupt localStorage data is ignored safely.
- [x] E2E: Hex Tower visible blocker feedback, restart, undo, keyboard activation, and responsive rendering.
- [x] E2E: blocked move feedback is visible.
- [x] E2E: restart resets the board.
- [x] E2E: undo restores a removed tile.
- [x] E2E: progress survives browser reload.
- [x] E2E: mobile viewport is playable without layout overlap.
- [x] E2E: desktop viewport is playable without layout overlap.
- [x] Static checks pass: `npm run typecheck`
- [x] Unit/component tests pass: `npm run test`
- [x] E2E tests pass: `npm run test:e2e`

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
- [x] 6. Security/privacy review: local storage contains no sensitive data and level data is not executable.
- [x] 7. Performance/load review: board rendering remains responsive for MVP tile counts.
- [x] 8. Validation review: chosen checks are appropriate for phase risk; missing checks are justified.
- [x] 9. Future-phase review: later phase files and checklists are still correct; revise them if implementation changed the plan.
- [x] 10. PRD sync review: master PRD status, active phase, assumptions, risks, validation surface, and change log are updated.

## Discoveries / Decisions

- UI components should dispatch engine commands and render results; they should not duplicate move legality logic.
- Implementation created `src/game/` UI components and `src/storage/progressStorage.ts`.
- Reference follow-up replaced the Cosmic Arcade UI pass with a light-background dense hex board matching the uploaded image target.
- Verification evidence: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run build`, and `npm audit --audit-level=high` passed.
- Review note for Phase 5: Playwright currently runs every E2E test in both desktop and mobile projects; this is valid but redundant for viewport-specific tests.

## Phase Change Log

- 2026-06-05: Phase file created.
- 2026-06-05: Phase completed and verified.
