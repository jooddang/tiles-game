# Browser Tile Puzzle Product Plan

Last Updated: 2026-06-05

## Source Inputs

- `plan.md`: mathematical solvability model, DAG proof, level difficulty metrics, and generator strategy.
- `AGENTS.md`: project engineering rules, especially simplicity, surgical changes, explicit assumptions, and behavior-first tests.
- Web landscape check, 2026-06-05: browser puzzle examples and current web-game discussions show strong patterns around instant play, daily challenges, leaderboards, and mobile performance constraints.

## CEO Review

### Positioning

This should not ship as a generic "remove all tiles" game. The product should be a browser-first spatial puzzle where the core promise is:

> Every board is solvable. The player is not guessing. They are reading the board faster and cleaner.

The mechanic has one important product consequence: every legal move is safe. That means the game is not about avoiding wrong choices unless extra mechanics are added later. The MVP must make visual search, board readability, progress rhythm, and level pacing feel good.

### Recommended Mode

Selective Expansion.

Reason: this is a greenfield game, but the repo currently has no app code. The right move is to preserve a small implementable MVP while choosing architecture that can later support daily puzzles, seeded generation, and analytics without rewriting the core.

### Product Shape Decision

Recommended first version: Level Pack MVP.

The MVP should include:

- A playable mobile and desktop web game.
- A fixed level sequence from tutorial to hard.
- A deterministic solvable level generator used during development.
- A curated level manifest checked into source.
- Local-only progress persistence.
- Lightweight completion stats: moves, time, and level complete state.
- Responsive UI tuned for touch and pointer input.

Daily Puzzle should be prepared structurally but not shipped in the first scope. Endless Generator should remain out of scope until the generator quality can be validated with play data.

### 12-Month Dream State

```text
CURRENT STATE
  plan.md describes the math and level design.

THIS PLAN
  build a browser MVP with deterministic solvable levels,
  clean mobile/desktop interaction, and testable puzzle logic.

12-MONTH IDEAL
  a daily spatial puzzle with curated packs, seeded challenges,
  shareable results, optional accounts, leaderboards, and a
  generator pipeline that can produce fair levels by target difficulty.
```

### Implementation Alternatives

#### Approach A: Static Level Pack MVP

Summary: Build a small web app with hand-curated JSON levels and pure puzzle logic.

- Effort: S
- Risk: Low
- Completeness: 6/10
- Pros:
  - Fastest path to a playable browser game.
  - Easy to test because levels are static fixtures.
  - Avoids generator quality risk in the first user-facing version.
- Cons:
  - Does not prove the generator can produce enough content.
  - Harder to scale content without manual level work.
  - Daily/endless modes remain speculative.

#### Approach B: Level Pack Plus Generator Pipeline

Summary: Build the playable app, pure puzzle engine, deterministic generator, difficulty scorer, and curated level manifest.

- Effort: M
- Risk: Medium
- Completeness: 9/10
- Pros:
  - Creates the real foundation for future daily and endless modes.
  - Keeps gameplay deterministic, testable, and reproducible.
  - Lets development produce many candidate boards while shipping only curated ones.
- Cons:
  - More engine work before the first polished screen.
  - Generator quality still needs human curation.
  - Requires stronger tests around graph logic and seeded randomness.

#### Approach C: Daily-First Web Game

Summary: Build the app around a daily puzzle, share results, and persistent date-based challenge seeds.

- Effort: M/L
- Risk: Medium/High
- Completeness: 8/10 for retention, 6/10 for core mechanics.
- Pros:
  - Stronger repeat-visit loop from day one.
  - Makes sharing and habit formation first-class.
  - Gives a clear marketing hook.
- Cons:
  - Requires more product surface before core feel is proven.
  - Share/result states can distract from board readability.
  - Ranking or account features increase scope quickly.

Recommendation: Approach B. It is the smallest plan that builds the real engine foundation instead of only a demo.

### Accepted Scope

- Browser-based responsive game for mobile and desktop.
- Pure TypeScript puzzle engine for board state, legal moves, removal, dependency graph, topological validation, and win detection.
- Deterministic level generator and difficulty scorer used for development and tests.
- Curated level manifest for MVP progression.
- Game UI with board, tile arrows/colors, selection/removal animation, level navigation, restart, undo, hint, and completion stats.
- LocalStorage progress persistence.
- Accessibility basics: keyboard play, visible focus, non-color-only arrows, touch targets.
- Test coverage for engine, generator, UI interactions, and critical responsive behavior.

### NOT in Scope

- User accounts: not needed to prove the core web game.
- Cloud saves: local progress is enough for MVP.
- Leaderboards: requires backend, abuse handling, and identity.
- Payments, ads, or monetization: premature before retention is proven.
- Multiplayer: not aligned with the current single-player mechanic.
- Full endless mode: generator quality must be validated first.
- Production daily challenge: seed architecture should support it, but daily publishing and share cards wait.
- App Store/native packaging: the requested target is browser-based mobile and desktop.

### Product Requirements From CEO Review

- The first screen must be the actual game, not a marketing landing page.
- The tutorial must teach by doing, not through long text.
- Legal move feedback must be instant and readable.
- The game must never generate an unsolvable shipped level.
- The player must understand failure states. Invalid taps should show why a tile cannot leave.
- Hard levels must not rely on eye strain. Difficulty comes from low availability, longer chains, and denser blockers.
- Every level should be reproducible by ID or seed.

## Engineering Review

### Architecture Recommendation

Use a boring frontend stack:

- Vite
- React
- TypeScript
- Vitest
- Testing Library
- Playwright

Keep the puzzle engine framework-independent. The React layer should render state and dispatch commands. It should not own solvability logic.

### System Architecture

```text
                 ┌────────────────────────┐
                 │      Browser App       │
                 │  React + TypeScript    │
                 └───────────┬────────────┘
                             │
               user actions  │ render state
                             ▼
                 ┌────────────────────────┐
                 │     Game Controller    │
                 │ command reducer/hooks  │
                 └──────┬─────────┬───────┘
                        │         │
          pure commands │         │ persistence
                        ▼         ▼
      ┌────────────────────┐   ┌────────────────────┐
      │   Puzzle Engine    │   │ Progress Storage   │
      │ legal moves / DAG  │   │ LocalStorage only  │
      └─────────┬──────────┘   └────────────────────┘
                │
                ▼
      ┌────────────────────┐
      │ Level Generator    │
      │ seed -> candidates │
      └─────────┬──────────┘
                │
                ▼
      ┌────────────────────┐
      │ Level Manifest     │
      │ curated JSON data  │
      └────────────────────┘
```

### Proposed Source Layout

```text
src/
  app/
    App.tsx
    routes.ts
  game/
    GameScreen.tsx
    BoardView.tsx
    TileView.tsx
    GameHud.tsx
    useGameController.ts
  engine/
    board.ts
    directions.ts
    graph.ts
    moves.ts
    generator.ts
    difficulty.ts
    types.ts
  levels/
    manifest.ts
    tutorial.ts
    easy.ts
    medium.ts
  storage/
    progressStorage.ts
  styles/
    global.css
tests/
  engine/
  game/
  e2e/
```

### Core Data Flow

```text
Level ID / seed
  │
  ▼
Load level manifest entry
  │
  ├── missing id ──▶ show level-not-found state
  ├── invalid data ──▶ fail fast in validation/test, show fallback in app
  ▼
Create GameState
  │
  ▼
Render board
  │
  ▼
Player selects tile
  │
  ├── legal move ──▶ remove tile ──▶ update stats ──▶ persist progress
  └── blocked move ──▶ keep state ──▶ show blockers / reason
```

### State Machine

```text
        ┌─────────────┐
        │  loading    │
        └──────┬──────┘
               ▼
        ┌─────────────┐
        │  playing    │
        └──┬─────┬────┘
           │     │
 invalid   │     │ all tiles removed
 move      │     ▼
           │  ┌─────────────┐
           └─▶│  feedback   │
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │  complete   │
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │ next level  │
              └─────────────┘
```

Invalid transitions:

- `complete -> playing` only through restart or next level.
- `feedback -> complete` only if the triggering move removed the last tile.
- `loading -> complete` is never valid.

### Error and Rescue Map

| Codepath | What can go wrong | Rescue action | User sees |
| --- | --- | --- | --- |
| Load level manifest | Level ID missing | Route to first level or not-found state | "Level not found" |
| Validate level | Duplicate tile IDs or invalid direction | Fail tests; in app show fallback error | "Level data is invalid" |
| Apply move | Tile ID not found | Return domain error, keep state | No board mutation |
| Apply move | Tile is blocked | Return blocked result with blockers | Highlight blocking ray |
| Persist progress | LocalStorage unavailable | Continue in memory | Small non-blocking warning |
| Restore progress | Corrupt JSON | Ignore saved data, reset progress | Fresh progress |
| Generator | Cannot satisfy target after max attempts | Return failure with diagnostics | Dev-only error, not user-facing |

### Security and Privacy

- No backend in MVP.
- No accounts or personal data.
- LocalStorage stores only level progress, completion times, move counts, and settings.
- Never evaluate level data as code.
- Validate all level JSON at load/build time.
- Avoid URL parameters that can inject arbitrary board payloads in MVP.

### Test Coverage Plan

```text
CODE PATHS                                      USER FLOWS
[+] engine/graph.ts                             [+] Tutorial first play
  ├── [NEEDS TEST] blockers along ray             ├── [NEEDS E2E] remove obvious legal tile
  ├── [NEEDS TEST] topological solvability        ├── [NEEDS E2E] blocked tap shows reason
  └── [NEEDS TEST] cycle rejection                └── [NEEDS E2E] complete level advances

[+] engine/moves.ts                             [+] Level controls
  ├── [NEEDS TEST] legal removal                  ├── [NEEDS E2E] restart resets board
  ├── [NEEDS TEST] blocked removal                ├── [NEEDS E2E] undo restores previous state
  └── [NEEDS TEST] win detection                  └── [NEEDS E2E] progress survives reload

[+] engine/generator.ts                         [+] Responsive play
  ├── [NEEDS TEST] deterministic seed             ├── [NEEDS E2E] mobile viewport playable
  ├── [NEEDS TEST] generated board is solvable    └── [NEEDS E2E] desktop viewport playable
  └── [NEEDS TEST] difficulty metrics in range
```

### Performance Plan

- Board sizes in MVP should stay below 150 tiles until rendering is profiled.
- Legal move checks should be fast enough for every tap; precompute directional rays per board.
- Graph validation can run when levels are loaded or generated, not on every render.
- Use CSS transforms for tile removal animation.
- Avoid Canvas for MVP unless DOM rendering fails performance checks; DOM buttons preserve accessibility and simplify testing.

### Observability and Debuggability

MVP has no backend observability. Add local debug affordances instead:

- Dev-only level diagnostics panel behind a development flag.
- Console warnings only for invalid level data and storage failures.
- Generator diagnostics in test output: seed, target tier, attempts, score, rejection reason.

### Deployment and Rollback

- Static web app deployment is sufficient.
- Build output must be cacheable and hostable on any static host.
- Rollback is redeploying the prior static build.
- Seeded levels and manifest changes should be reviewed like code because they change gameplay.

### Worktree Parallelization Strategy

Parallel lanes are useful after project scaffolding.

| Step | Modules touched | Depends on |
| --- | --- | --- |
| Engine and generator | `src/engine/`, `tests/engine/` | project scaffold |
| UI and interaction | `src/game/`, `src/styles/`, `tests/game/` | engine types |
| Level content | `src/levels/`, `tests/engine/` | engine validation |
| E2E and responsive QA | `tests/e2e/` | UI and levels |

Execution order:

```text
1. Scaffold project.
2. Build engine + level content in parallel after shared types exist.
3. Build UI once engine commands are stable.
4. Add E2E after UI has the first playable flow.
```

### Review Findings

- CRITICAL: Do not put puzzle rules inside React components. Keep them in pure engine modules.
- WARNING: Do not ship random generated levels directly. Generate candidates, score them, curate manifest entries.
- WARNING: Hard levels can become tedious because legal moves are always safe. Difficulty must be visual-search difficulty, not forced single-move chains.
- OK: No backend is needed for the MVP.
- OK: Daily challenge is a good future expansion but should not block first playable version.

### Product Plan Completion Summary

```text
+====================================================================+
| PRODUCT PLAN SUMMARY                                                |
+====================================================================+
| CEO mode             | SELECTIVE EXPANSION                          |
| Recommended product  | Level Pack MVP                               |
| Architecture         | Static React/Vite app + pure TS engine       |
| Generator posture    | Build generator, ship curated levels         |
| Persistence          | LocalStorage only                            |
| Backend              | Not in MVP                                   |
| Test focus           | Engine unit tests + UI/E2E critical paths    |
| Main product risk    | Game feels like visual chore, not puzzle     |
| Main technical risk  | Generator quality and level validation       |
+====================================================================+
```
