# Phase 6: Ten-Stage Progression

Parent PRD: [PRD: Browser Tile Puzzle](../prd-browser-tile-puzzle.md)
Status: Complete
Last Updated: 2026-08-16

## Objective

Give new players a shorter first board and ten ordered stages whose length grows gradually, while preserving every existing full-board progress key, replay hash, and leaderboard score.

## Product Decisions

- Interpret “about one-quarter of the current size” as tile count, not quartering both dimensions. The current board has `9 x 30 = 270` tiles; Stage 1 has `9 x 8 = 72` tiles, or 26.7%.
- Keep width and tile size unchanged. Grow only board height because the request calls for increasing length and this preserves the established board geometry and touch targets.
- Ship heights `8, 11, 14, 17, 20, 23, 26, 28, 30, 30`, producing tile counts `72, 99, 126, 153, 180, 207, 234, 252, 270, 270`.
- Create deterministic Stage 1–8 boards from prefixes of the validated Hex Tower rows. Do not add generation, randomness, or a new level format.
- Preserve the existing `reference-hex-tower-1` and `reference-hex-tower-2` definitions byte-for-byte as Stages 9 and 10. Their IDs, titles, tiles, and replay hashes must not change.
- Keep existing free level navigation. Do not add locking, cloud-progress schema, scoring changes, or replay protocol changes.
- Existing players whose local `currentLevelId` is one of the old full-board IDs resume at Stage 9 or 10. New players start at Stage 1.

## Requirements

- [x] The ordered manifest contains exactly ten unique, solvable levels.
- [x] Stage dimensions and tile counts exactly match the table above and never decrease.
- [x] Stages 1–8 have new unique level IDs, and tile IDs are unique within each level; no shortened board reuses a legacy level ID.
- [x] Stages 9–10 preserve both legacy level definitions and version hashes.
- [x] First load without progress opens Stage 1; saved legacy IDs restore the corresponding full board.
- [x] Next/previous navigation and completion advancement work across all ten stages.
- [x] Ranked play remains isolated by level version, and the generated replay contract contains all ten levels.
- [x] The eight new level versions are active before the new static game is deployed; the two legacy versions remain active.

## Implementation Scope

### Tile source

- Update `src/levels/reference.ts` only as needed to derive eight prefixes and retain the two legacy definitions.
- Add focused manifest tests for order, dimensions, counts, uniqueness, solvability, monotonic length, and the pinned legacy hashes `sha256:d3f9f30c607ee8a93522025eee2c4c546052cfac9f4d10755db833f47e3abb33` and `sha256:a42bcaebd0dda403614577c8f3d77941ff9fde34076246e471b30616f0dfce9a`.
- Update only UI/E2E assertions made stale by Stage 1’s title or tile count.
- Do not modify the engine, score formula, ranked-attempt lifecycle, persistence schema, or replay command format unless a failing contract test proves it necessary.

### Roadcrosser publication

- Build, commit, and push the Tile source; require Tile CI to pass before publication.
- Regenerate the ten-level leaderboard contract, activate/upsert that exact artifact, and query the database to prove exactly those ten hashes are active before publishing the static snapshot.
- Sync the clean canonical Tile commit into Roadcrosser with `scripts/sync-tiles-game.mjs`.
- Verify the vendored replay contract and public snapshot match the same Tile commit.

## Validation Gates

### Gate 1: source contract

- [x] Focused level and replay tests pass.
- [x] Existing Stage 9/10 version hashes equal their pre-change values.
- [x] Stage 9/10 remain exactly `9 x 30` with 270 tiles, and hash assertions use the pinned pre-change constants rather than values derived from modified source.
- [x] Typecheck, lint, unit tests, and production build pass.
- [x] Independent implementation review reports no P1/P2 issue or missing required test.

### Gate 2: browser behavior

- [x] Stage 1 renders 72 tiles and identifies itself as the first of ten stages.
- [x] Completion advances from Stage 1 to Stage 2.
- [x] A stored-progress fixture with legacy current/completed IDs and best stats restores Stage 9/10, navigates and saves, and retains all legacy values unchanged.
- [x] Mobile and desktop gameplay, stage picker, completion panel, and leaderboard panel remain usable.
- [x] At 320px and 390px widths, all nine board columns remain reachable through existing scrolling and controls/modals are not clipped.
- [x] Independent browser review reports no P1/P2 regression.

### Gate 3: release contract

- [x] The generated contract contains exactly ten distinct version IDs and both pinned legacy hashes.
- [x] Production database reports exactly the intended ten active version IDs before static publication, with no unintended retirement or extra active version.
- [x] Roadcrosser contract/snapshot tests pass after sync.
- [x] Tile and Roadcrosser CI/deploys succeed.
- [x] Production smoke verifies the ten-stage UI, both legacy Top-10 reads, and a new-stage ranked completion without `LEVEL_VERSION_UNKNOWN` or `LEVEL_VERSION_RETIRED`.

## Rollback

- If submissions are unsafe, disable ranked writes first and redeploy the previous Roadcrosser static snapshot.
- Do not delete level-version rows or historical scores. Leave all ten versions active when safe because the old client uses the preserved hashes; reactivate only the previous two-level artifact if contract isolation is required.

## Phase-End Review

- [x] Requirements-to-diff review completed.
- [x] Correctness, compatibility, simplicity, cleanup, security, performance, and validation reviewed.
- [x] PRD evidence and change log updated only after each gate passes.

## Change Log

- 2026-08-16: Phase created. Product and architecture reviews selected fixed-width, increasing-height stages and immutable legacy Stages 9–10.
- 2026-08-16: Gates 1–2 passed with 196 unit tests, 38 Playwright tests, typecheck, lint, build, generated-contract inspection, screenshots, and independent P1/P2 reviews.
- 2026-08-16: Gate 3 passed. Supabase reported the exact ten active hashes at the existing zero-second quarantine floor, both legacy hashes remained active, Roadcrosser and Tile CI/deploys passed, production host smoke passed, and a 72-command Stage 1 replay was published and read back.
