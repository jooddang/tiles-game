<!-- /autoplan restore point: /Users/jooddang/.gstack/projects/jooddang-tiles-game/main-autoplan-restore-20260724-135948.md -->
# All-Time Top 10 Leaderboard Plan

Status: `/autoplan` review in progress
Date: 2026-07-24

## Goal

Add a public, all-time Top 10 leaderboard to the tile game so a player can compare a completed level against the best verified completion times.

## Initial Product Decisions

- Rank entries per immutable level version. Times from different boards are not comparable.
- Primary ordering: lowest server-measured completion time in centiseconds.
- Tie-breakers: earlier `achieved_at`, then stable entry ID.
- Keep only one best entry per player identity and level version in leaderboard reads.
- Show the Top 10 for the current level plus the player's resulting rank after a valid submission.
- Do not require a permanent account for the first release. Use a server-issued, HttpOnly browser identity cookie.
- Treat the existing client timer and move count as display data, not authoritative score evidence.
- Describe accepted records as “server-validated,” never “verified human” or “cheat-proof.”
- Use generated, family-safe player names in the first release. Do not accept public free-text names.

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

## Confirmed Premises

The user confirmed these premises at the Phase 1 gate:

1. Keep per-level all-time Top 10 as the primary requested product.
2. Treat the board as casual competition. Legal server replay does not prove human play.
3. Browser-scoped anonymous identity is sufficient for launch.
4. Reuse the existing roadcrosser Next.js API and Supabase deployment boundary.
5. Show a personal best and resulting rank even when the player is outside Top 10.

## Phase 1 — CEO Review

### 0A. Premise Challenge

| Premise | Evidence | Verdict | Plan response |
|---|---|---|---|
| Completion time is a useful competitive signal | `useGameController.ts` already records elapsed time; move count equals the number of tiles removed and is not differentiating | Conditionally valid | Rank by time only and label it as a speed record, not puzzle mastery |
| A legal replay makes a record trustworthy | Levels and solver logic are public and deterministic, so automation can produce legal runs | False for human verification | Promise only server validation; add anomaly review and score removal |
| All-time Top 10 creates repeat play | Permanent boards can freeze and exclude most players | Weak | Preserve the explicit request, but always show personal best and nearby rank |
| Anonymous identity enforces one player per slot | Clearing cookies creates another identity | False at person level | Define uniqueness as one best per browser identity, not one human |
| Different levels can share one ranking | The two levels have different boards and immutable content can change | False | Partition every ranking by immutable `level_version_id` |
| A new standalone service is required | roadcrosser already hosts the game, Next route handlers, Vercel, and Supabase | False | Reuse the same-origin host and database |

### 0B. What Already Exists

| Sub-problem | Existing code or service | Reuse decision |
|---|---|---|
| Canonical puzzle rules | `src/engine/moves.ts`, `src/engine/board.ts`, and engine types | Extract or share a server-safe replay package; do not rewrite rules |
| Canonical level definitions | `src/levels/manifest.ts` and `src/levels/reference.ts` | Produce a versioned server manifest from the same source |
| Completion detection | `src/game/useGameController.ts` | Emit ranked-attempt commands at the controller boundary |
| Local personal stats | `src/storage/progressStorage.ts` | Keep as offline display fallback; server rank is separate |
| Completion UI | `src/game/GameScreen.tsx` feedback panel | Extend the existing completion state instead of adding a new route |
| Responsive controls | `GameHud.tsx`, `global.css`, existing E2E viewport checks | Reuse spacing, typography, and 44px touch-target rules |
| Public hosting | roadcrosser `/tiles-game` embeds `/games/tiles-game/index.html` | Preserve iframe and nested asset paths |
| API runtime | roadcrosser Next.js route handlers on Vercel | Add same-origin `/api/tiles-game/leaderboard/*` routes |
| Database and migrations | roadcrosser Supabase project and `supabase/migrations/` | Add isolated `tiles_*` tables and least-privilege server access |

### 0C. Dream State

```text
CURRENT
  static browser game
  local-only stats
  two deterministic levels
       │
       ▼
THIS PLAN
  browser-scoped identity
  same-origin validated attempts
  per-level all-time Top 10
  personal best + personal rank
  moderation and kill switch
       │
       ▼
12-MONTH IDEAL
  rotating challenges + all-time archive
  durable optional identity
  shareable challenge links
  anomaly scoring and moderation console
  retention evidence decides further investment
```

Dream-state delta: this plan establishes reusable attempt validation, ranking, and moderation boundaries. It intentionally does not create recurring challenges, cross-device identity, social graphs, or strong anti-bot guarantees.

### 0C-bis. Implementation Alternatives

| Approach | Human / CC effort | Risk | Pros | Cons | Decision |
|---|---:|---:|---|---|---|
| Local-only mock leaderboard | ~1 day / ~20 min | Low | Fast experiment; no operations | Not global, trivially editable, does not meet request | Rejected |
| roadcrosser Next API + Supabase | ~5-7 days / ~4-6 h | Medium | Reuses same origin, deployment, DB, logs, and rollback controls | Cross-repo coordination; inherits roadcrosser operations | Accepted |
| Direct browser-to-Supabase + RPC | ~4-6 days / ~4 h | High | Fewer HTTP handlers | Exposes a larger RLS/RPC surface and makes replay logic harder to secure | Rejected |
| New standalone leaderboard service | ~2 weeks / ~1 day | High | Independent scaling and ownership | New infra for ten rows per level; needless operational surface | Rejected |

### 0D. Selective Expansion Decisions

The complete in-scope version includes personal best, personal rank, generated names, moderation deletion, anomaly flags, rate limits, observability, idempotency, and a runtime kill switch. These are direct blast-radius requirements of a public leaderboard, not optional polish.

Rotating challenges, share cards, durable accounts, friends, and campaign aggregates are valuable but outside the requested all-time Top 10. They are deferred because each changes the product loop rather than completing the current one.

### 0E. Temporal Interrogation

```text
HOUR 1      schema, immutable level-version contract, shared replay tests
HOUR 2      start/read/complete API contracts and identity cookie
HOUR 3      transactional personal-best upsert and deterministic ranking
HOUR 4      client attempt state + completion integration
HOUR 5      responsive leaderboard UI and all interaction states
HOUR 6+     abuse controls, metrics, runbook, cross-repo E2E, rollout
```

The highest-risk decision occurs before Hour 1: the canonical level hash and replay implementation must be identical across client and server. UI work must not begin until that contract has golden fixtures.

### 0F. Mode Selection

Mode: **SELECTIVE EXPANSION**. The requested all-time Top 10 remains fixed. Work inside its direct trust, safety, failure, and operation radius is included; adjacent retention features are deferred.

### CEO Dual Voices

#### CLAUDE SUBAGENT (CEO — strategic independence)

The independent review found seven issues: legal replay cannot prove human play, competition lacks validation as the next retention lever, permanent Top 10 can freeze, anonymous identity is disposable, millisecond precision overstates fairness, Undo/Retry semantics are missing, and the server owner was undefined.

#### CODEX SAYS (CEO — strategy challenge)

Codex found ten concerns. The three critical concerns were sequencing before fun is proven, automation defeating “verification,” and a speed metric that measures execution more than puzzle mastery. High concerns covered permanent Top 10 stagnation, audience size, anonymous identity, acquisition loops, and generalized infrastructure for only two levels.

```text
CEO DUAL VOICES — CONSENSUS TABLE
═══════════════════════════════════════════════════════════════
Dimension                            Claude  Codex  Consensus
──────────────────────────────────── ─────── ────── ─────────
1. Premises valid?                  CONDIT. CONDIT. CONFIRMED
2. Right problem to solve?          NO      NO      CONFIRMED
3. Scope calibration correct?       NO      NO      CONFIRMED
4. Alternatives explored enough?    NO      NO      CONFIRMED
5. Competitive risks covered?       NO      NO      CONFIRMED
6. Six-month trajectory sound?      NO      NO      CONFIRMED
═══════════════════════════════════════════════════════════════
```

Both voices recommended a rotating challenge as the primary loop. This was a User Challenge because it changed the user's explicit all-time requirement. The user reviewed the concern and confirmed all-time Top 10 with a casual server-validated trust model.

### Section 1 — Architecture Review

The static game cannot own trusted score writes. Same-origin roadcrosser route handlers must authenticate the browser identity, load canonical level data, replay commands, and call a transactional database function. Direct client writes to attempts or scores are forbidden.

Cross-repo coupling is the main architectural risk. A versioned replay-contract package or generated canonical fixtures must be consumed by both repositories, and CI must fail if a level hash differs. The deployment sequence must publish the server's accepted level version before a client can request ranked attempts for it.

### Section 2 — Error & Rescue Map

Every expected failure has a stable public error code. Route handlers translate internal database, validation, and configuration errors into retryable or terminal responses; they never return raw Supabase details.

| Codepath | Named failure | Trigger | Rescue | User sees | Test |
|---|---|---|---|---|---|
| Read leaderboard | `LEADERBOARD_UNAVAILABLE` | DB/API timeout | Return stale cached rows if present | “Records are unavailable. You can still play.” | Integration + UI |
| Start attempt | `LEVEL_VERSION_UNKNOWN` | Client level hash not deployed | Refuse ranked attempt | “This level is not ranked yet.” | Integration |
| Start attempt | `ATTEMPT_RATE_LIMITED` | Browser/IP exceeds limit | Return `Retry-After` | “Try another ranked run in N seconds.” | Integration |
| Start attempt | `IDENTITY_COOKIE_INVALID` | Missing or bad signature | Rotate cookie before creating attempt | No interruption | Integration |
| Complete attempt | `ATTEMPT_NOT_FOUND` | Bad or foreign ID | Reject without existence detail | “This ranked run could not be found.” | Integration |
| Complete attempt | `ATTEMPT_EXPIRED` | Completion after deadline | Mark expired | “Run expired. Start a new ranked run.” | Clock test |
| Complete attempt | `ATTEMPT_ALREADY_COMPLETED` | Duplicate request | Return stored result idempotently | Existing accepted result | Integration |
| Replay | `RUN_COMMAND_INVALID` | Unknown tile or invalid command | Reject and anomaly-log | “Run could not be validated.” | Golden replay |
| Replay | `RUN_NOT_COMPLETE` | Tiles remain | Reject | “Run did not finish the board.” | Golden replay |
| Upsert score | `SCORE_WRITE_CONFLICT` | Concurrent same-player finishes | Transaction keeps best; return winner | Best result and rank | Concurrency test |
| Display name | `DISPLAY_NAME_UNAVAILABLE` | Generated-name collision | Generate another safe suffix | New generated name | Unit |
| Configuration | `LEADERBOARD_DISABLED` | Kill switch off | Skip ranked start/read/write | No leaderboard; local game unchanged | E2E |

### Section 3 — Security & Threat Model

The browser, attempt ID, command log, timer display, and display name are untrusted. The API owns identity-cookie verification, level lookup, server time, replay, expiry, command-count limits, payload-size limits, idempotency, and the final transaction. The Supabase service credential stays only in roadcrosser server routes.

Automation remains possible because the puzzle and solver are public. Mitigations are intentionally limited to rate limiting, impossible-time/anomaly flags, one visible best per browser identity, generated names, audit logs, and operator deletion. Product copy must not imply human attestation.

### Section 4 — Data and Interaction Edge Cases

Nil level IDs, empty leaderboards, stale client versions, duplicate completions, two tabs, lost responses, offline finishes, backgrounded tabs, Undo, Restart, navigation, and kill-switch changes all have explicit outcomes. Undo is represented as a replayable command; Restart terminates the current attempt and starts a new attempt only after the next deliberate board interaction.

The attempt starts from a visible three-second countdown after the user selects “Ranked run.” Ordinary play remains unranked and instant. Page visibility loss invalidates ranked timing so a backgrounded timer cannot create confusing records.

### Section 5 — Code Quality Review

Do not place fetch orchestration, ranking state, or replay serialization directly in `useGameController.ts`. Add a small framework-independent attempt state machine and a typed API adapter; the controller only emits domain commands and consumes state.

Do not duplicate puzzle rules in roadcrosser. Reuse a versioned server-safe engine package or generated replay fixture artifact from tiles-game. Names use the existing vocabulary: `levelVersionId`, `attemptId`, `browserPlayerId`, `elapsedCentiseconds`, and `commandLog`.

### Section 6 — Test Review

The critical behavior is not Top 10 rendering; it is the trust boundary. Golden fixtures must prove that the browser engine and server replay accept and reject the same command streams. Integration tests must use a real test database transaction or isolated Supabase test project, not internal service mocks.

The complete test diagram and QA artifact are produced in Phase 3. CEO review requires regression coverage for unranked play: disabled or unavailable leaderboard services must not break current board interaction, Undo, Restart, local progress, or static build paths.

### Section 7 — Performance Review

Leaderboard reads return at most ten public rows plus one personal context row. The query uses an index on `(level_version_id, elapsed_centiseconds, achieved_at, id)` and never scans raw attempts. A short public cache is acceptable for Top 10 reads, while the just-submitted response returns transaction results directly.

Replay is bounded by the canonical level tile count plus Undo commands and a strict payload limit. No queue, worker, realtime subscription, or precomputed leaderboard table is needed at this scale.

### Section 8 — Observability and Debuggability

Structured route logs include request ID, endpoint, level version, outcome code, latency, and hashed browser-player identifier. They exclude raw cookies, command logs by default, IP addresses, and Supabase credentials.

Metrics cover start success, completion acceptance, rejection by code, API p95 latency, score-write conflicts, anomaly flags, and leaderboard read errors. Alerts fire on sustained 5xx/error-rate thresholds, not isolated invalid runs.

### Section 9 — Deployment and Rollout

Schema and server routes deploy first with the feature disabled. Canonical level versions are seeded and verified next. The static client deploys third, then the flag enables reads before writes and finally enables ranked attempts.

Rollback disables attempt creation and completion while preserving existing scores. Rolling back the static snapshot must not remove server support for a level version still present in cached clients.

### Section 10 — Long-Term Trajectory

The attempt and immutable level-version model supports future rotating boards without changing accepted all-time semantics. Durable identity can later link browser players to accounts without rewriting score ownership.

The main debt is product, not technical: permanent records may become unreachable or automated. Success and kill criteria are required so operating cost does not outlive user value.

### Section 11 — Design and UX Review

The leaderboard is secondary to the board and must never displace the primary play area. Desktop places it in secondary HUD context; mobile keeps it collapsed below completion context or in a bottom sheet opened by a clear “Records” button.

Ranked play is a deliberate mode because countdown, background invalidation, and network validation change the experience. Unranked play remains the default first-play flow.

### NOT in Scope

- Daily, weekly, or seasonal boards: changes the requested product loop; record in `TODOS.md`.
- Share cards and challenge links: acquisition expansion; record in `TODOS.md`.
- Durable account login and cross-device identity: unnecessary for browser-scoped casual records.
- User-entered public names: moderation and child-safety cost exceeds launch value.
- Strong bot prevention or human attestation: not achievable reliably in this browser game.
- Campaign aggregate ranking: levels are not comparable and weighting would be arbitrary.
- Realtime subscriptions: ten-row polling/read-on-open is sufficient.
- Separate microservice, queue, Redis, or cache database: unjustified at expected scale.

### Failure Modes Registry

| Codepath | Failure mode | Rescued? | Test? | User sees? | Logged? |
|---|---|---:|---:|---|---:|
| Public read | API timeout | Yes | Yes | Non-blocking unavailable state | Yes |
| Attempt start | Stale level version | Yes | Yes | Ranked mode unavailable | Yes |
| Attempt start | Rate limit | Yes | Yes | Retry-after message | Yes |
| Command capture | Undo omitted | Yes | Yes | No error; command is recorded | No sensitive log |
| Ranked lifecycle | Tab hidden | Yes | Yes | Attempt invalidated | Yes |
| Completion | Response lost after commit | Yes | Yes | Retry returns same result | Yes |
| Completion | Two-tab concurrent bests | Yes | Yes | Better result wins | Yes |
| Replay | Automated legal run | Partial | Yes | May be accepted then flagged | Yes |
| Score display | Generated-name collision | Yes | Yes | Alternate safe name | No |
| Flag rollout | Server enabled, client old | Yes | Yes | Old client stays unranked | Yes |
| Flag rollback | Client enabled, server disabled | Yes | Yes | Local play continues | Yes |
| DB migration | Partial deploy | Yes | Yes | Feature remains disabled | Yes |

No row is unrescued, untested, silent, and unlogged. Automated legal play is an accepted residual risk, not a hidden gap.

### Deployment and Rollback Diagrams

```text
DEPLOY
DB migration ─▶ API routes, flag OFF ─▶ seed level versions
     └──────────── smoke tests ───────────────┘
                           │
                           ▼
                  static client snapshot
                           │
                           ▼
                 reads ON ─▶ writes ON

ROLLBACK
error threshold crossed?
   ├─ no ─▶ continue
   └─ yes
       ├─ disable writes
       ├─ disable reads if necessary
       ├─ preserve scores and schema
       └─ roll back client/API independently
```

### CEO Implementation Tasks

- [ ] **CEO-T1 (P1, human: ~1 day / CC: ~1 h)** — Contract — Define casual trust model, level-version hash, ranked lifecycle, and operator promises.
- [ ] **CEO-T2 (P1, human: ~1 day / CC: ~1 h)** — Operations — Include rate limits, anomaly flags, score deletion, kill switch, metrics, and rollback before public writes.
- [ ] **CEO-T3 (P2, human: ~2 h / CC: ~20 min)** — Product — Add success and kill criteria for the leaderboard experiment.

### CEO Completion Summary

```text
+====================================================================+
| MEGA PLAN REVIEW — COMPLETION SUMMARY                              |
+====================================================================+
| Mode                     | SELECTIVE EXPANSION                      |
| System audit             | Static child app; roadcrosser owns host |
| Step 0                   | All-time retained, casual trust model    |
| Architecture             | 2 core risks: trust + cross-repo drift  |
| Error paths              | 12 mapped, 0 critical gaps              |
| Security                 | 1 accepted residual risk: automation     |
| Data/UX edge cases       | 11 categories specified                 |
| Code quality             | shared replay contract required         |
| Tests                    | trust-boundary golden fixtures required |
| Performance              | bounded replay + indexed Top 10         |
| Observability            | metrics, logs, alerts, runbook required |
| Deployment               | schema/API/client/flag staged rollout   |
| Future                   | rotating boards and auth remain viable  |
| Design                   | secondary HUD + deliberate ranked mode  |
+--------------------------------------------------------------------+
| NOT in scope             | 8 items                                 |
| What already exists      | 9 reusable surfaces                     |
| Error/rescue registry    | 12 failures, 0 critical gaps            |
| Failure modes            | 12 total, 0 critical gaps               |
| Dual voices              | 6/6 dimensions confirmed concern        |
| User challenge           | resolved: keep all-time                 |
+====================================================================+
```

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| 1 | CEO | Keep all-time Top 10 after explicit premise gate | User-confirmed challenge | User direction | Both voices preferred rotating boards; user retained original requirement | Rotating-primary |
| 2 | CEO | Call records server-validated, not verified | Mechanical | Explicit over clever | Replay proves legality, not human play | Cheat-proof claim |
| 3 | CEO | Reuse roadcrosser Next API and Supabase | Mechanical | DRY | Existing same-origin runtime and DB avoid new infrastructure | Standalone service |
| 4 | CEO | Rank per immutable level version | Mechanical | Completeness | Different boards and revisions are incomparable | Global mixed-level board |
| 5 | CEO | Include personal best and rank outside Top 10 | Auto-decided | Completeness | Permanent Top 10 otherwise gives most users no feedback | Top-10-only feedback |
| 6 | CEO | Use generated names for launch | Auto-decided | Pragmatic | Removes free-text moderation from a preteen-facing game | Public free-text names |
| 7 | CEO | Include operator deletion, anomaly flags, and kill switch | Auto-decided | Boil lakes | Public scores require direct operational controls | Manual DB-only cleanup |
| 8 | CEO | Keep rotating challenges and durable accounts out of scope | Taste | Bias toward action | They change the product loop and identity promise | Bundle adjacent expansions |
