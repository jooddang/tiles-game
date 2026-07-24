<!-- /autoplan restore point: /Users/jooddang/.gstack/projects/jooddang-tiles-game/main-autoplan-restore-20260724-135948.md -->
# All-Time Top 10 Leaderboard Plan

Status: rough draft for `/autoplan`
Date: 2026-07-24

## Goal

Add a public, all-time Top 10 leaderboard to the tile game so a player can compare a completed level against the best verified completion times.

## Initial Product Decisions

- Rank entries per immutable level version. Times from different boards are not comparable.
- Primary ordering: lowest verified completion time in milliseconds.
- Tie-breakers: earlier `achieved_at`, then stable entry ID.
- Keep only one best entry per player identity and level version in leaderboard reads.
- Show the Top 10 for the current level plus the player's resulting rank after a valid submission.
- Do not require a permanent account for the first release. Use a server-issued anonymous player identity stored in the browser.
- Treat the existing client timer and move count as display data, not authoritative score evidence.

## Proposed User Flow

1. The game loads the current level's Top 10 without blocking play.
2. A player starts a fresh attempt.
3. The server issues an attempt token tied to player, level version, and server start time.
4. The client records legal tile removals for that attempt.
5. On completion, the client submits the attempt token and move sequence.
6. The server replays the sequence against the canonical level, verifies completion, computes elapsed time from server timestamps, and upserts the player's personal best.
7. The completion panel shows accepted rank, not-in-Top-10 status, or a named failure with retry guidance.

## Proposed Components

- `src/leaderboard/`: typed client API, leaderboard state, and UI panel.
- `src/game/useGameController.ts`: begin attempt, append accepted moves, submit completion.
- Server API:
  - `POST /api/leaderboard/attempts`
  - `POST /api/leaderboard/attempts/:attemptId/complete`
  - `GET /api/leaderboard?levelVersionId=...&limit=10`
- Persistent tables:
  - anonymous players
  - immutable level versions
  - attempts
  - personal-best leaderboard entries

## Trust Boundary

- The browser is untrusted.
- The server validates the level version, attempt ownership, expiration, legal move order, full completion, rate limits, and idempotency key.
- Display names are optional, length-limited, normalized, and escaped.
- Raw anonymous identifiers are never rendered.

## UI States

- Loading: skeleton rows that do not block the board.
- Empty: “Be the first to set a time.”
- Ready: rank, name, and formatted time for up to ten entries.
- Submission pending: completion remains visible with “Verifying run…”.
- Accepted Top 10: highlight the player's row and rank.
- Accepted outside Top 10: show personal best and resulting rank.
- Offline or service unavailable: preserve the local completion result and offer retry only while the attempt remains valid.
- Rejected: explain expired attempt, invalid run, rate limit, or outdated level separately.

## Rollout

- Keep the current static game path and nested asset base unchanged.
- Put the leaderboard behind a runtime feature flag.
- Deploy schema and API before enabling the UI.
- Disable the flag to roll back while retaining accepted scores.

## Tests

- Unit: ranking, tie-breaking, display-name validation, attempt expiry, idempotency.
- Integration: start → legal replay → personal-best upsert → Top 10 read.
- Integration failure cases: illegal move, wrong level version, expired attempt, duplicate completion, rate limit.
- UI: loading, empty, accepted, outside Top 10, offline, rejected.
- E2E: complete a small test level, receive verified rank, reload, and see the same leaderboard.

## Open Review Questions

- Which existing deployment boundary should own the API and database?
- Should anonymous identity be enough for launch, or should durable cross-device identity be included?
- What attempt duration and rate limits fit real level lengths?
- Should the first release expose per-level boards only, or also a campaign aggregate?
