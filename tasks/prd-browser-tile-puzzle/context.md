# Context: Browser Tile Puzzle

Parent PRD: [PRD: Browser Tile Puzzle](../prd-browser-tile-puzzle.md)
Last Updated: 2026-06-05

## Reviewed Inputs

- `plan.md`
  - Solvability is modeled as a blocking dependency graph.
  - A level is solvable iff the dependency graph is acyclic.
  - Difficulty should be controlled with tile count, initial removable ratio, dependency depth, blocker density, unlock impact, visual complexity, and board shape.
  - Reverse construction and topological validation are the core generator strategies.
- `AGENTS.md`
  - Prefer simple, surgical changes.
  - Keep business logic independent from UI/framework code.
  - Test behavior, not implementation.
  - Avoid unnecessary dependencies.
- Repository file list
  - Current repo has no app scaffold, package config, source directory, tests, or design system.
- Web landscape search, 2026-06-05
  - Browser puzzle games commonly use instant play, daily challenge loops, level archives, local or account-based progress, leaderboards, and shareable results.
  - For this product, daily/leaderboard mechanics are attractive but should not precede proof that the core board interaction is fun.

## Current System Summary

The current system is a Vite/React/TypeScript browser game:

```text
tiles-game/
  AGENTS.md
  plan.md
  package.json
  scripts/dev.mjs
  src/
    engine/
    game/
    levels/
    storage/
    styles/
  tasks/
    browser-tile-puzzle-product-plan.md
    prd-browser-tile-puzzle.md
    prd-browser-tile-puzzle/
      context.md
      phase files
```

The runtime has a 6-direction hex puzzle engine, a dense reference-style first level, local progress persistence, Vitest coverage, and Playwright E2E coverage.

## Key Domain Model

```text
Board
  ├── axial-style hex cells
  ├── tiles
  └── six directions

Tile
  ├── id
  ├── cell
  ├── direction
  └── visual attributes

GameState
  ├── level id
  ├── remaining tiles
  ├── move history
  ├── elapsed time
  └── status

DependencyGraph
  ├── tile nodes
  └── blocker -> blocked edges
```

## Solvability Rule

For tile `v`, scan from its cell along its arrow direction to the board edge.

- If no remaining tile is on that ray, `v` is removable.
- If one or more remaining tiles are on that ray, `v` is blocked.
- For graph validation, every blocker `u` on that ray adds edge `u -> v`.
- The level is solvable iff the graph has no directed cycle.

The active directions are `up`, `upRight`, `downRight`, `down`, `downLeft`, and `upLeft`.

## Product Implications

- Because every legal removal is safe, the base game has limited strategic punishment.
- Fun must come from readable visual search, progression pacing, feedback, and satisfying cascades.
- Tutorial and early levels must teach the player to scan rays.
- Hard levels should hide legal moves among many tiles, but not rely on tiny targets or color confusion.
- The first level should visually match the user reference: a tall, dense, colorful hex map on a light background with arrows on every tile and a central contrast ring.

## Validation Surface

The project currently has no validation tooling. Expected validation after Phase 1:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run build`

If the scaffold chooses different commands, update the PRD and all phase files.

## Existing Patterns

No code patterns exist yet. Use these project-level patterns from `AGENTS.md`:

- Pure logic outside presentation code.
- Domain-specific names.
- Explicit result types for expected domain failures.
- Behavior-first tests.
- No dependencies for trivial logic.

## Constraints

- Browser-only MVP.
- Mobile and desktop responsive behavior are both first-class.
- No backend in MVP.
- No secrets.
- No user accounts.
- LocalStorage can be used only for non-sensitive progress and settings.

## Risks and Design Implications

- Generator risk: mathematically valid boards may still feel bad. Ship curated levels only.
- Rendering risk: dense DOM boards may slow down. The current 270-tile reference board passed Playwright desktop/mobile smoke checks, but older-device profiling remains useful.
- Accessibility risk: color-only direction encoding is insufficient. Use arrows/icons plus color.
- Scope risk: daily, endless, accounts, and leaderboards are all tempting but should wait.
- Data risk: local storage can fail. Treat progress persistence as best-effort.

## Recommended Follow-Up Reviews

- Run `/plan-design-review` before implementation polish if a visual direction is chosen.
- Run `/qa` after a playable local build exists.
- Run `/design-review` after UI implementation to inspect actual mobile and desktop rendering.
