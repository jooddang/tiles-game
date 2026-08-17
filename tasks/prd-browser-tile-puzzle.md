# PRD: Browser Tile Puzzle

## Document Status

- Status: In Progress
- File Mode: Split
- Current Phase: Phase 6
- Active Phase File: [Phase 6](./prd-browser-tile-puzzle/phase-06-ten-stage-progression.md)
- Context File: [context.md](./prd-browser-tile-puzzle/context.md)
- Last Updated: 2026-08-16
- PRD File: `tasks/prd-browser-tile-puzzle.md`
- Purpose: Living PRD and execution source of truth. Check off work here, update this document as implementation reveals new information, and revise future phases before continuing when the plan changes.

## Problem

The repo currently has the mathematical basis for a tile-removal puzzle but no playable browser game. The target product is a mobile and desktop web game where every level is solvable, readable, and satisfying to clear.

The main product risk is that the base rule has no wrong legal moves. If the game is implemented as plain clicking, it can feel like visual cleanup instead of a puzzle. The MVP must make board reading, level pacing, feedback, and progression strong enough before adding accounts, leaderboards, or monetization.

## Goals

- G-1: Ship a browser-playable MVP that works on mobile and desktop.
- G-2: Implement puzzle rules in a pure, tested TypeScript engine independent from React.
- G-3: Guarantee shipped levels are solvable by validating the dependency graph.
- G-4: Provide a single polished Hex Tower level matching the uploaded reference image.
- G-5: Support deterministic level generation and scoring for development and future daily/endless modes.
- G-6: Persist local progress without requiring an account or backend.
- G-7: Make interaction states clear: legal move, blocked move, undo, restart, completion, and level navigation.

## Non-Goals

- NG-1: No user accounts in MVP.
- NG-2: No cloud saves in MVP.
- NG-3: No leaderboards in MVP.
- NG-4: No monetization, ads, or purchases in MVP.
- NG-5: No multiplayer in MVP.
- NG-6: No production daily challenge in MVP.
- NG-7: No native mobile app packaging in MVP.
- NG-8: No direct user-authored arbitrary board importer in MVP.

## Success Criteria

- SC-1: A user can open the web app on mobile or desktop and play the first level without setup.
- SC-2: Every shipped level passes automated solvability validation.
- SC-3: A blocked tile interaction visibly explains why the tile cannot leave.
- SC-4: A completed level shows completion feedback and unlocks or advances to the next level.
- SC-5: Refreshing the browser preserves completed levels and current settings through local storage.
- SC-6: Engine tests cover legal moves, blocked moves, DAG solvability, cycle rejection, win detection, generator determinism, and difficulty scoring.
- SC-7: E2E tests cover visible Hex Tower blockers, restart, undo, keyboard removal, and mobile/desktop viewport playability.
- SC-8: The app builds successfully as a static web app.

## Key Scenarios

### Scenario 1: First-Time Hex Tower Play

- Actor: New player on mobile or desktop.
- Trigger: Opens the web app.
- Expected outcome: The player sees the dense Hex Tower board immediately, removes obvious legal edge tiles, and blocked feedback matches what appears visually blocked on the map.

### Scenario 2: Returning Player Continues Progress

- Actor: Returning player on the same browser.
- Trigger: Opens the web app after completing one or more levels.
- Expected outcome: Completed levels and current level position are restored from local storage.

### Scenario 3: Hard Level Search

- Actor: Player on a later level.
- Trigger: Attempts to find a removable tile among many tiles.
- Expected outcome: The board remains readable, blocked taps give useful feedback, and the player can use undo/restart without losing level access.

### Scenario 4: Developer Generates Candidate Levels

- Actor: Developer or AI agent.
- Trigger: Runs generator/scorer tests or a dev script.
- Expected outcome: Candidate levels are deterministic by seed, validated as solvable, scored by difficulty metrics, and eligible for manual curation.

## Discovery Summary

- Reviewed: `plan.md`, `AGENTS.md`, current repo file list, web puzzle/game landscape search.
- Current system: No app code exists. The repo has a cleaned mathematical/design note and project instructions.
- Validation surface: No package or test runner exists yet. The PRD assumes a Vite + React + TypeScript + Vitest + Playwright foundation unless implementation discovery finds a better existing scaffold.
- Design implications: The engine must be pure and testable; React must not own game rules; generated levels must be validated before shipping.
- Reference update: The user-provided visual target is a tall, dense 6-direction hex tile map. The shipped first level now uses that reference direction rather than the earlier square-grid/Cosmic Arcade visual pass.
- Confidence / gaps: High confidence on product and engine shape. Initial preteen visual assets still exist under `design/assets/preteen-visuals/`, but the active visual target is the reference-style light-background hex board.

## Requirements

### Functional Requirements

- FR-1: The app must render a playable tile board in a browser.
- FR-2: The app must support both pointer/touch and keyboard interaction.
- FR-3: The engine must represent tiles, directions, board cells, level metadata, game state, and move results with explicit TypeScript types.
- FR-4: The engine must determine whether a tile is removable by scanning its exit ray to the board edge.
- FR-5: The engine must remove legal tiles and preserve state on blocked moves.
- FR-6: The engine must return blocker information for blocked moves.
- FR-7: The engine must build the dependency graph for a level.
- FR-8: The engine must validate solvability with topological sort.
- FR-9: The engine must reject levels with directed cycles or invalid tile data.
- FR-10: The engine must detect level completion when all tiles are removed.
- FR-11: The app must include restart and undo controls.
- FR-12: The app must show level completion stats: moves and elapsed time.
- FR-13: The app must persist completed levels, current level, and basic settings in local storage.
- FR-14: The level manifest must include exactly ten ordered reference-style Hex Tower stages for this build.
- FR-15: The generator must produce deterministic candidates from a seed.
- FR-16: The generator must validate generated boards before they can be added to the manifest.
- FR-17: The difficulty scorer must compute tile count, dependency edge count, dependency depth, initial removable count, availability ratio, and blocker density.
- FR-18: The UI must provide blocked-move feedback without relying on color alone.

### Non-Functional Requirements

- NFR-1: Puzzle engine modules must be framework-independent.
- NFR-2: Legal move checks must feel instant for MVP board sizes.
- NFR-3: Dense reference boards may exceed 150 tiles only after browser profiling confirms responsive rendering.
- NFR-4: The app must be responsive across common mobile and desktop viewport widths.
- NFR-5: Controls must have touch targets suitable for mobile play.
- NFR-6: Core game controls must be accessible by keyboard.
- NFR-7: Level data must be validated before use.
- NFR-8: The app must degrade gracefully if local storage is unavailable or corrupt.
- NFR-9: The build output must be deployable as static files.

## Assumptions

- A-1: The project will use Vite, React, TypeScript, Vitest, Testing Library, and Playwright unless implementation discovery finds a concrete reason not to.
- A-2: Resolved: the active board is a 6-direction hex grid with `up`, `upRight`, `downRight`, `down`, `downLeft`, and `upLeft`.
- A-3: The MVP ships curated levels, not arbitrary generator output.
- A-4: Local-only persistence is enough for first release.
- A-5: Resolved: the user chose the uploaded reference image as the visual target; the app now uses a light-background dense hex board with colorful raised tiles.

## Dependencies / Constraints

- The repo is not currently a git repository.
- There is no existing package manager config, test framework, build command, or app scaffold.
- `plan.md` is the source of truth for solvability and level difficulty math.
- The app must run in a normal web browser on mobile and desktop.
- No backend should be introduced unless this PRD is revised.

## Risks / Edge Cases

- R-1: The game may feel tedious if hard levels reduce availability too far.
- R-2: Generator output may be mathematically solvable but not fun.
- R-3: DOM rendering may become slow for dense boards.
- R-4: Color-only direction encoding would hurt accessibility and readability.
- R-5: LocalStorage can be unavailable, full, or contain corrupt JSON.
- R-6: Seeded generator changes can invalidate expected level difficulty if not locked by tests.
- R-7: Mobile tap precision can make small tiles frustrating.

## Execution Rules

- Complete phases in order unless this PRD is explicitly revised.
- Before starting any phase, read the master PRD, active phase file, and relevant context notes.
- Use the PRD files as the only active plan; do not create a competing checklist.
- For minor ambiguities, choose the best reasonable option, record the assumption, and continue.
- Stop for help only for material blockers such as missing access, irreversible destructive change, major requirement conflict, or meaningful security/legal risk.
- Prefer minimal, reversible changes that satisfy the goals.
- Preserve existing code patterns unless there is a clear reason not to.
- Select validation methods according to risk and available tools; do not default to one testing tool for every phase.
- At the end of each phase, update this PRD and revise future phases based on what was learned.

## Phase Index

| Phase | Status | Objective | Validation Focus | File |
| --- | --- | --- | --- | --- |
| Phase 1: Project Foundation | Complete | Create the web app scaffold, tooling, and static build path. | Install/build/typecheck/test runner smoke checks. | [phase-01-project-foundation.md](./prd-browser-tile-puzzle/phase-01-project-foundation.md) |
| Phase 2: Puzzle Engine | Complete | Implement pure board, graph, move, and solvability logic. | Unit tests for legal moves, blockers, DAG validation, cycles, and win state. | [phase-02-puzzle-engine.md](./prd-browser-tile-puzzle/phase-02-puzzle-engine.md) |
| Phase 3: Generator and Level Manifest | Complete | Implement deterministic generation, scoring, and curated MVP levels. | Generator determinism, solvability, difficulty metric, and manifest validation tests. | [phase-03-generator-and-levels.md](./prd-browser-tile-puzzle/phase-03-generator-and-levels.md) |
| Phase 4: Game UI and Persistence | Complete | Build responsive gameplay UI, controls, feedback, and local progress. | Component tests plus E2E for core flows and storage behavior. | [phase-04-game-ui-and-persistence.md](./prd-browser-tile-puzzle/phase-04-game-ui-and-persistence.md) |
| Phase 5: Polish, Accessibility, and Release Readiness | Complete | Tune responsive play, accessibility, performance, and release checks. | Playwright mobile/desktop, accessibility checks, build, and manual smoke. | [phase-05-polish-accessibility-release.md](./prd-browser-tile-puzzle/phase-05-polish-accessibility-release.md) |
| Phase 6: Ten-Stage Progression | In Progress | Replace the two-level opening with ten ordered stages that grow from about one-quarter of the current board to the full board. | Manifest invariants, legacy level/hash preservation, progress restore, browser checks, and ranked contract activation. | [phase-06-ten-stage-progression.md](./prd-browser-tile-puzzle/phase-06-ten-stage-progression.md) |

## Final Multi-Pass Review After Current Phase

Complete in order:

- [ ] 1. Requirements coverage review: every FR, NFR, and success criterion is satisfied or explicitly deferred.
- [ ] 2. Cross-phase integration review: phase outputs work together without gaps, broken assumptions, or duplicated ownership.
- [ ] 3. Correctness review: happy paths, edge cases, errors, empty states, permissions, and state transitions are handled.
- [ ] 4. Simplicity/refactor review: the final design is no more complex than necessary.
- [ ] 5. Duplication/cleanup review: repeated logic, dead code, temporary code, noisy logs, commented leftovers, unused files, and unused dependencies are removed.
- [ ] 6. Security/privacy review: auth, access control, secrets, sensitive data, auditability, and data exposure are safe.
- [ ] 7. Performance/load review: bottlenecks, expensive queries, N+1 patterns, unnecessary renders, and avoidable network calls are addressed.
- [ ] 8. Validation review: the final mix of unit, integration, API E2E, UI/browser, simulator, visual, manual, or observability checks is appropriate for the risk.
- [ ] 9. Documentation/operability review: docs, runbooks, release notes, migrations, rollback, monitoring, or support notes are updated when needed.
- [ ] 10. PRD closeout review: status is Complete, change log is current, and follow-ups are recorded.

## Open Questions

- OQ-1: Resolved for MVP: the square-grid pass was replaced by a 6-direction hex grid matching the reference image intent.
- OQ-2: Resolved for MVP: the Cosmic Arcade pass was replaced by a light reference-style hex board.

## Residual Risks / Follow-Ups

- RF-1: Level fun is not proven by tests. It needs human playtesting before adding daily/endless modes.
- RF-2: E2E tests run each flow in both desktop and mobile projects. This gives coverage but is redundant; optimize later if runtime becomes annoying.
- RF-3: No backend observability exists because the MVP is static and local-only.
- RF-4: The first reference board is dense and validated in browser smoke checks, but longer play sessions should still be profiled on older mobile devices.

## Change Log

- 2026-06-05: Initial PRD created from `plan.md`, CEO review, and engineering review.
- 2026-06-05: Phase 1 completed with Vite/React/TypeScript scaffold, smoke tests, Playwright setup, static build, and audit cleanup.
- 2026-06-05: Phase 2 completed with pure puzzle engine, graph validation, move handling, undo/restart, and engine unit tests.
- 2026-06-05: Phase 3 completed with deterministic generator, difficulty scorer, curated levels, manifest validation, and generator/manifest tests.
- 2026-06-05: Phase 4 completed with playable UI, blocked feedback, undo/restart, level navigation, local progress persistence, and browser E2E coverage.
- 2026-06-05: Phase 5 completed with responsive polish, Cosmic Arcade styling, hard-level touch target fix, visual QA, full validation, and PRD closeout.
- 2026-06-05: Reference image follow-up replaced the square visual board with a 6-direction dense hex tile map, reduced the shipped manifest to the single 270-tile `Hex Tower` level, and revalidated typecheck, lint, unit tests, E2E, build, and Playwright screenshots.
- 2026-06-05: Direction follow-up made tile color derive from arrow direction and changed legal removals to animate out along the arrow path while the engine removes the tile immediately, allowing other tiles to move during the exit animation.
- 2026-06-05: Difficulty and motion follow-up slowed tile exit animation to 900ms and replaced the easy edge-biased Hex Tower direction map with a balanced six-direction split pattern that lowers initial removable tiles while preserving solvability.
- 2026-06-05: Randomized difficulty follow-up replaced the split-direction map with a fixed random-hard Hex Tower table, kept colors derived from direction, added a second solvable Hex Tower level, and verified Next can advance to it.
- 2026-06-05: Mobile motion follow-up changed tile exit animation to keep the tile opaque through the first half of motion, extended the removal timer to 1200ms, and added an E2E regression test for visible mobile exit animation.
- 2026-06-05: Difficulty follow-up removed long same-direction strips from Hex Tower, reduced maximum same-direction run across rows, columns, and diagonals to 4, and added a manifest regression test for that constraint.
- 2026-06-05: Engineering review follow-up unified blocker detection with rendered hex geometry so visually blocked tiles no longer disappear, and added an E2E regression for that behavior.
- 2026-08-16: Reopened the PRD for Phase 6 ten-stage progression. Historical account and leaderboard non-goals have been superseded by the existing integrated ranked-play system; Phase 6 changes neither contract.
