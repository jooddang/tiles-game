<!-- /autoplan restore point: /Users/jooddang/.gstack/projects/jooddang-tiles-game/main-autoplan-restore-20260724-135948.md -->
# All-Time Top 10 Leaderboard Plan

Status: `/autoplan` review in progress
Date: 2026-07-24

## Goal

Add a public, all-time Top 10 leaderboard to the tile game so a player can compare a completed level against the best server-validated completion times.

## Initial Product Decisions

- Rank entries per immutable level version. Times from different boards are not comparable.
- Primary ordering: lowest server-measured completion time in whole seconds.
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
5. On completion, the client submits the attempt token and replayable command sequence.
6. The server replays the sequence against the canonical level, validates completion, computes elapsed time from server timestamps, and upserts the player's personal best.
7. The completion panel shows accepted rank, not-in-Top-10 status, or a named failure with retry guidance.

## Proposed Components

- `src/leaderboard/`: typed client API, leaderboard state, and UI panel.
- `src/game/useGameController.ts`: emit ranked commands and consume ranked-attempt state without owning network orchestration.
- Server API:
  - `GET /api/tiles-game/leaderboard/:levelVersionId`
  - `GET /api/tiles-game/leaderboard/:levelVersionId/me`
  - `POST /api/tiles-game/leaderboard/attempts`
  - `GET /api/tiles-game/leaderboard/attempts/:attemptId`
  - `POST /api/tiles-game/leaderboard/attempts/:attemptId/complete`
- Persistent tables:
  - anonymous players
  - immutable level versions
  - attempts
  - personal-best leaderboard entries

## Trust Boundary

- The browser is untrusted.
- The server validates the level version, attempt ownership, expiration, legal move order, full completion, rate limits, and idempotency key.
- The server assigns one stable, length-bounded, family-safe generated name per browser identity.
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
- E2E: complete a small test level, receive a server-validated rank, reload, and see the same leaderboard.

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
| 9 | Design | Preserve immediate level-clear celebration before rank validation | Mechanical | Completeness | Network state must not revoke local gameplay success | Replace completion with spinner |
| 10 | Design | Desktop disclosure panel; mobile modal bottom sheet | Taste | Explicit over clever | One responsive pattern avoids crowded HUD and ambiguous implementations | Ten permanent inline rows |
| 11 | Design | Ordinary play stays default; ranked run requires CTA and countdown | Auto-decided | Explicit over clever | Players must know exactly when a run counts | Silent automatic ranking |
| 12 | Design | Use a dedicated live region for concise rank status | Mechanical | Completeness | Updating ten rows inside the play-area live region would be noisy | Whole-table announcements |
| 13 | Design | Show personal result separately when outside Top 10 | Auto-decided | Completeness | A fake row 11 misrepresents the Top 10 and confuses hierarchy | Append player as row 11 |
| 14 | Design | Make generated identity visible before ranked play | Mechanical | Design for trust | The player must know which public identity will appear | Reveal only after submission |
| 15 | Design | Raise new and shared leaderboard controls to 44px minimum | Mechanical | Completeness | Existing 42px game buttons miss the stated touch requirement | Apply 44px only to new controls |
| 16 | Eng | Vendor a versioned Node replay kernel and manifest into roadcrosser | Auto-decided | DRY | One generated artifact preserves exact rules without a registry or duplicate implementation | Fixtures-only or copied rewrite |
| 17 | Eng | Define level version as ruleset version plus canonical gameplay hash | Mechanical | Completeness | Legal moves depend on code and constants as well as level JSON | Content hash alone |
| 18 | Eng | Rank at whole-second precision from a future server start | Auto-decided | Pragmatic | Network jitter makes centiseconds misleading for casual records | Client time or centiseconds |
| 19 | Eng | Split public Top 10 from private player and attempt endpoints | Mechanical | Security | Personalized responses must never enter public caches | Mixed cached response |
| 20 | Eng | Store immutable scores plus a recomputable best pointer | Auto-decided | Completeness | Moderation must restore the next legitimate personal best | Destructive single PB row |
| 21 | Eng | Use one transactional completion SQL function | Mechanical | Explicit over clever | Attempt finalization, score insert, PB update, and rank must be atomic | Multi-call transaction |
| 22 | Eng | Remove background-tab invalidation as trust evidence | Auto-decided reversal | Pragmatic | It penalizes honest users and modified clients can suppress it | Terminal visibility failure |
| 23 | Eng | Fix local best selection to compare elapsed time | Mechanical | Correctness | Existing move-count comparison keeps the first 270-move result | Preserve existing comparator |
| 24 | Eng | Use DB-backed runtime flags and rate buckets | Auto-decided | Completeness | Serverless memory and build-time flags cannot provide runtime control | In-memory limits |

## Phase 2 — Design Review

### Step 0 — Design Scope Assessment

Initial design completeness: **4.5/10**. The rough plan named major data states but left the ranked-entry interaction, exact responsive layout, completion hierarchy, focus behavior, partial successes, and copy unresolved. A 10/10 plan specifies what the player sees and can do at every transition without making network activity compete with the puzzle.

No active `DESIGN.md` exists. The implementation must align with the current light-background Hex Tower UI, CSS variables in `global.css`, compact 8px controls, high-contrast focus ring, and existing responsive breakpoints. The older preteen visual exploration is not the current product target.

The gstack design binary was unavailable, so no generated PNG mockup was used. The reviewed source of truth is the explicit responsive wireframe and state table below.

### Design Dual Voices

#### CLAUDE SUBAGENT (design — independent review)

The independent reviewer rated the plan 4.5/10 and found twelve gaps. Its highest-priority findings were an undefined ranked-mode entry, async validation weakening the completion moment, unresolved responsive placement, and missing accessibility behavior for the mobile sheet and live updates.

#### CODEX SAYS (design — UX challenge)

Codex found three critical and seven high/medium gaps. It agreed that the leaderboard must be tertiary, ranked mode needs a complete interaction contract, the state machine is incomplete, and the current broad `aria-live` region cannot own dynamic leaderboard rows.

```text
DESIGN LITMUS SCORECARD
═══════════════════════════════════════════════════════════════
Dimension                           Claude  Codex  Consensus
─────────────────────────────────── ─────── ────── ─────────
1. Information hierarchy explicit? NO      NO      CONFIRMED
2. Interaction states complete?    NO      NO      CONFIRMED
3. Completion emotion preserved?   NO      NO      CONFIRMED
4. Responsive behavior intentional?NO      NO      CONFIRMED
5. Accessibility specified?        NO      NO      CONFIRMED
6. Trust copy consistent?           NO      NO      CONFIRMED
7. Identity/personal row clear?     NO      NO      CONFIRMED
═══════════════════════════════════════════════════════════════
```

### Responsive Wireframe and Information Hierarchy

```text
DESKTOP >= 761px
┌──────────────────────┬──────────────────────────────────────┐
│ Level / title        │                                      │
│ progress             │              BOARD                   │
│ Moves | Time         │                                      │
│ [Start ranked run]   │                                      │
│ Undo Retry Prev Next │                                      │
│ Pick level           │                                      │
│ [Records ▾]          ├──────────────────────────────────────┤
│  disclosure panel    │ Level clear                          │
│  max-height: 320px   │ #4 · New personal best · 00:18.42   │
└──────────────────────┴──────────────────────────────────────┘

MOBILE <= 760px
┌─────────────────────────────────────────────────────────────┐
│ Level / title                      [Records]                 │
│ Moves | Time        [Start ranked run]                      │
│ Undo Retry Prev Next                                        │
├─────────────────────────────────────────────────────────────┤
│                          BOARD                              │
├─────────────────────────────────────────────────────────────┤
│ Level clear · #4 · New personal best  [View records]        │
└─────────────────────────────────────────────────────────────┘

[Records] opens modal bottom sheet:
┌─────────────────────────────────────────────────────────────┐
│ All-time · Hex Tower                              [Close]   │
│ Your best  #24 · Swift Fox 42 · 00:31.08                    │
│ Rank      Player                               Time          │
│ 1         Solar Otter 17                       00:18.42      │
│ ... internally scrollable through row 10 ...                │
└─────────────────────────────────────────────────────────────┘
```

Hierarchy: level identity first, current run and mode second, gameplay controls third, level selection fourth, personal record fifth, and public Top 10 last. The board remains the visual anchor.

### Ranked Interaction State Machine

```text
UNRANKED
  │ Start ranked run
  ▼
STARTING ── failure ─▶ UNAVAILABLE ── dismiss ─▶ UNRANKED
  │ token accepted
  ▼
COUNTDOWN 3 → 2 → 1
  ├─ cancel / level change ─▶ UNRANKED
  ▼
RANKED_ACTIVE
  ├─ tab hidden ─▶ ACTIVE (server time continues)
  ├─ restart ─▶ ENDED ─▶ optional new STARTING
  ├─ level change ─▶ ENDED
  └─ complete ─▶ LEVEL_CLEAR + SUBMITTING
                             ├─ accepted ─▶ RANK_RESULT
                             ├─ retryable ─▶ RETRY_AVAILABLE
                             └─ terminal ─▶ RANK_REJECTED
```

Board input is disabled during `STARTING` and `COUNTDOWN`. Undo is allowed and serialized as a command; it costs elapsed time naturally. Restart ends the ranked attempt and returns to unranked play, with a separate “Start another ranked run” action.

### Interaction State Coverage

| Feature | State | Player sees | Primary action |
|---|---|---|---|
| Records read | Loading | Caption plus three non-announced skeleton rows | None |
| Records read | Empty | “No records yet. Start a ranked run.” plus generated identity | Start ranked run |
| Records read | Ready | Semantic Top 10 table and separate personal-best summary | Close/collapse |
| Records read | Stale | Retained rows, “Couldn’t refresh · Last updated …” | Retry |
| Records read | Error without cache | “Records are unavailable. You can still play.” | Retry |
| Attempt start | Pending | “Preparing ranked run…”; board disabled | Cancel |
| Countdown | Active | Centered 3/2/1, reduced-motion fade only | Cancel |
| Ranked run | Active | Persistent “Ranked” badge and server-clock display | Play |
| Ranked run | Backgrounded | Timer continues; returning player sees current elapsed time | Continue or restart |
| Submission | Pending | Existing “Level clear” plus “Checking ranked run…” | None |
| Submission | Top 10 + PB | “#N · New personal best · 00:18.42” | View records |
| Submission | PB outside Top 10 | “New personal best · Rank #N” | View records |
| Submission | Accepted slower | “Record accepted · Your best remains 00:18.42” | View records |
| Submission | Accepted, refresh failed | Authoritative result plus stale table label | Retry records |
| Submission | Response lost | “Result pending. Check again.” | Check result |
| Submission | Expired | “This ranked run expired. Start another.” | Start ranked run |
| Submission | Rejected | “Run could not be validated. Local level clear is saved.” | Play again |
| Feature disabled | Disabled | No Records or ranked controls; current UI unchanged | None |

The completion POST response is authoritative for the just-finished result. A cached or later GET response never overwrites it with older rank information.

### User Journey and Emotional Arc

| Step | Player does | Intended feeling | Design support |
|---|---|---|---|
| 1 | Opens game | Immediate play, no ceremony | Unranked board remains default |
| 2 | Notices personal record | Curiosity | Small “Records” disclosure, not a dashboard |
| 3 | Starts ranked run | Deliberate commitment | CTA explains browser identity and casual server validation |
| 4 | Watches countdown | Focused tension | Board locked; concise 3/2/1 |
| 5 | Plays | Flow | Only persistent Ranked badge and timer |
| 6 | Clears level | Accomplishment | “Level clear” appears immediately, independent of API |
| 7 | Waits for validation | Short suspense | Secondary “Checking ranked run…” status |
| 8 | Gets result | Personal meaning | PB and rank before public table |
| 9 | Opens records | Comparison | Top 10 on demand; “You” marked with text and color |

Time horizon: within five seconds the game remains recognizable and playable; within five minutes ranked mode is self-explanatory; over repeated visits the personal best provides progress even when Top 10 is unreachable.

### Pass 1 — Information Architecture: 4/10 → 9/10

The original plan did not decide whether records were permanent HUD content or a mobile sheet. The responsive wireframe now fixes one hierarchy: personal ranked outcome is prominent at completion, while the full Top 10 is on-demand. The remaining point below 10 is visual validation against a rendered implementation.

### Pass 2 — Interaction States: 5/10 → 10/10

Loading, empty, stale, unavailable, pending, countdown, active, invalidated, accepted variations, response loss, expiry, rejection, and disabled states now have exact player-visible outcomes. Partial success preserves the authoritative completion response and whichever read fragment succeeded.

### Pass 3 — Journey and Emotional Arc: 4/10 → 9/10

The sequence now preserves immediate accomplishment before network suspense and prevents a failed ranking request from revoking a level clear. The final point requires playtesting countdown duration and copy with real players.

### Pass 4 — AI Slop Risk: 6/10 → 9/10

Classifier: APP UI. The design reuses the current single-board composition and compact utility controls instead of adding dashboard cards, decorative trophies, gradients, or a card mosaic. One table, one personal summary, and one disclosure control are sufficient.

### Pass 5 — Design System Alignment: 5/10 → 8/10

There is no `DESIGN.md`, so alignment relies on existing CSS variables, 8px radii, typography weights, neutral panel background, and focus rings. New components must use these tokens and avoid reviving superseded Cosmic Arcade/preteen assets. A future design-system document is useful but does not block this feature.

### Pass 6 — Responsive and Accessibility: 3/10 → 10/10

The Top 10 uses a semantic table with caption and column headers. Loading uses `aria-busy`; decorative skeletons are hidden. Only concise attempt/rank status enters a dedicated `aria-live="polite"` region; the table remains outside the existing play-area live region.

All new and shared controls are at least 44px. The mobile sheet traps focus, closes on Escape and the explicit Close button, restores focus to Records, makes the background inert, and suppresses R/U/Z game shortcuts while open. Rank/time columns are fixed, names truncate visually but retain an accessible full label, times use tabular numerals, and “You” is communicated by text plus color. Motion respects `prefers-reduced-motion`.

Viewport acceptance checks cover 320×568, 390×844, 760×800, 1280×800, and short landscape/iframe heights. Level changes cancel stale requests, update the caption immediately, and never show old rows under the new level title.

### Pass 7 — Resolved Design Decisions

| Decision | Resolution |
|---|---|
| Ranked entry | Explicit CTA, server start, cancellable countdown |
| Completion priority | Local level clear first; rank status second |
| Desktop records | Collapsible bounded HUD disclosure |
| Mobile records | Modal bottom sheet with internal scrolling |
| Player outside Top 10 | Separate personal-best summary, never row 11 |
| Identity | Stable generated name shown before ranked play |
| Free-text name | Not included |
| Time format | `mm:ss.cc`, tabular numerals |
| Rank refresh authority | Completion POST beats cached GET |
| Keyboard shortcuts in sheet | Suppressed while modal is open |

### Design NOT in Scope

- New visual brand or design system: reuse the current shipped light Hex Tower direction.
- Decorative podium, avatars, trophies, confetti, or realtime row movement: they compete with the board and add motion.
- Swipe-only sheet dismissal: inaccessible and unnecessary; button and Escape are required.
- User-selected themes or leaderboard filters beyond current level: unrelated to Top 10.

### Design Implementation Tasks

- [ ] **DES-T1 (P1, human: ~1 day / CC: ~1 h)** — Ranked flow — Implement and test the explicit attempt state machine and completion hierarchy.
- [ ] **DES-T2 (P1, human: ~1 day / CC: ~1 h)** — Responsive UI — Build desktop disclosure and accessible mobile sheet from one records component.
- [ ] **DES-T3 (P1, human: ~4 h / CC: ~30 min)** — Accessibility — Separate live regions, modal focus management, 44px controls, reduced motion, and semantic table.
- [ ] **DES-T4 (P2, human: ~2 h / CC: ~20 min)** — Visual QA — Verify hierarchy and overflow at all specified viewports.

### Design Completion Summary

```text
+====================================================================+
| DESIGN PLAN REVIEW — COMPLETION SUMMARY                            |
+====================================================================+
| System audit          | No DESIGN.md; existing CSS patterns reused |
| Initial score         | 4.5/10                                     |
| Information arch      | 4/10 → 9/10                                |
| Interaction states    | 5/10 → 10/10                               |
| Journey               | 4/10 → 9/10                                |
| AI slop               | 6/10 → 9/10                                |
| Design alignment      | 5/10 → 8/10                                |
| Responsive/a11y       | 3/10 → 10/10                               |
| Decisions             | 10 resolved, 0 deferred                    |
+--------------------------------------------------------------------+
| NOT in scope          | 4 items                                    |
| Mockups               | skipped: design binary unavailable         |
| Overall design score  | 4.5/10 → 9/10                              |
| Dual voices           | 7/7 confirmed concerns                     |
+====================================================================+
```

## Phase 3 — Engineering Review

### Step 0 — Scope Challenge

The plan crosses two repositories because tiles-game owns gameplay rules while roadcrosser owns the production runtime and database. This exceeds eight files and two components, but reducing it to client-only writes, duplicate replay logic, or a public database API would fail the trust boundary. The complete scope stays, constrained to one generated replay artifact, five small routes, isolated database objects, and one client feature module.

No standalone service, queue, realtime system, package registry, or admin UI is introduced. Existing engine, static sync, Next route-handler, Supabase migration, and Vercel deployment patterns are reused.

### Engineering Dual Voices

#### CLAUDE SUBAGENT (eng — independent review)

The independent engineer found thirteen issues, including two feasibility blockers: server timing precision was undefined and the replay kernel had no deployable ownership. It also identified cache-personalization leakage, incomplete transaction semantics, non-executable cross-repo tests, service-role hardening, missing ruleset versioning, anomaly publication, local PB comparison by moves, false visibility invalidation, and retention.

#### CODEX SAYS (eng — architecture challenge)

Codex found eight high-confidence issues. It independently confirmed the missing vendored replay artifact, ruleset-aware hashes, future server start, result recovery, transactional completion, durable rate limiting, visibility-event limitation, and host-level cross-repo testing.

```text
ENG DUAL VOICES — CONSENSUS TABLE
═══════════════════════════════════════════════════════════════
Dimension                           Claude  Codex  Consensus
─────────────────────────────────── ─────── ────── ─────────
1. Architecture sound?             NO      NO      CONFIRMED
2. Test coverage sufficient?       NO      NO      CONFIRMED
3. Performance risks addressed?    NO      NO      CONFIRMED
4. Security threats covered?       NO      NO      CONFIRMED
5. Error paths handled?            NO      NO      CONFIRMED
6. Deployment risk manageable?     NO      NO      CONFIRMED
═══════════════════════════════════════════════════════════════
```

All six confirmed gaps are resolved by the contracts below.

### Section 1 — Architecture

#### Deployment Ownership

`tiles-game` builds two products from one rules source:

1. the browser bundle under `dist/`;
2. a Node-safe replay contract under `dist-server-contract/`.

The roadcrosser sync copies the browser build to `public/games/tiles-game/` and the server contract to `vendor/tiles-game-leaderboard/<replayContractVersion>/`. Its guarded publisher allowlist and staging expand to exactly those directories. No other roadcrosser files are auto-committed.

```text
tiles-game
┌─────────────────────────────┐
│ src/engine + src/levels     │
└──────────────┬──────────────┘
               │ npm run build
       ┌───────┴────────┐
       ▼                ▼
 browser dist/    server contract/
       │           ├─ replay-kernel.mjs
       │           ├─ levels.json
       │           └─ contract.json
       └───────┬────────┘
               │ roadcrosser sync
               ▼
roadcrosser
├─ public/games/tiles-game/
├─ vendor/tiles-game-leaderboard/vN/
├─ app/api/tiles-game/leaderboard/
└─ Supabase tiles_* objects
```

`contract.json` contains `replayContractVersion`, the kernel SHA-256, and every `levelVersionId`. A level version is:

```text
sha256(
  replayContractVersion
  + canonical JSON of width, height, and tiles sorted by tile id
)
```

Presentation-only title and color do not affect the hash. Geometry constants, direction rays, remove/undo semantics, or canonical serialization changes require a new replay contract version.

The server starts ranked attempts only for active level versions. The current and immediately previous kernel remain vendored for a 30-day rollback window. Retired clients receive `LEVEL_VERSION_RETIRED` before countdown; accepted historical scores stay readable.

#### Runtime Data Flow

```text
PUBLIC READ, CACHEABLE
GET /leaderboard/:levelVersionId
  ├─ validate active or historical version
  ├─ query visible personal-best rows, limit exactly 10
  └─ Cache-Control: public, s-maxage=30, stale-while-revalidate=300

PRIVATE IDENTITY, NEVER CACHE
GET /leaderboard/:levelVersionId/me
  ├─ resolve or create opaque browser cookie
  ├─ query generated name, personal best, and rank
  └─ Cache-Control: private, no-store

RANKED RUN
POST /attempts
  ├─ validate Origin, Fetch Metadata, and bounded JSON
  ├─ resolve identity and durable rate bucket
  ├─ validate level contract
  ├─ create attempt with starts_at = DB now() + 5 seconds
  └─ return attemptId, startsAt, expiresAt, and generated name

client countdown; input unlocks at startsAt
  │
  ▼
POST /attempts/:id/complete
  ├─ validate bounded command log
  ├─ replay with vendored kernel
  ├─ call one completion SQL function
  │    terminalize attempt
  │    insert immutable score
  │    quarantine or publish
  │    recompute PB pointer
  │    compute personal rank
  │    store terminal response
  └─ return the stored response idempotently
```

If the start response arrives less than one second before `startsAt`, the client cancels it and requests a new attempt. Score duration is `ceil(DB completion receipt - startsAt)` in whole seconds. Completion upload latency remains part of the casual score and is disclosed in the product contract.

#### Browser Attempt State

`src/leaderboard/attemptMachine.ts` is a pure reducer. `leaderboardClient.ts` owns fetch calls, cookie-bearing same-origin requests, AbortControllers, and public/private result merging. `useRankedAttempt.ts` binds them to React. `useGameController.ts` only emits accepted `remove` and state-changing `undo` commands, then freezes an immutable log at first completion.

Session storage keeps only the active attempt ID, contract version, starts/expiry timestamps, and bounded command log so a lost response or reload can recover. The HttpOnly identity token never enters JavaScript.

### Data Model

```text
tiles_players
  id uuid PK
  identity_token_hash bytea UNIQUE
  generated_name text UNIQUE
  created_at, last_seen_at

tiles_level_versions
  id text PK                    -- levelVersionId
  level_key text
  replay_contract_version int
  canonical_level jsonb
  active boolean
  quarantine_below_seconds int
  created_at, retired_at

tiles_attempts
  id uuid PK
  player_id uuid FK
  level_version_id text FK
  client_request_id uuid
  status enum(started, completed, expired, rejected)
  starts_at, expires_at, completed_at
  command_count int
  command_hash bytea
  terminal_response jsonb
  rejection_code text
  UNIQUE(player_id, client_request_id)

tiles_scores
  id uuid PK
  attempt_id uuid UNIQUE FK
  player_id uuid FK
  level_version_id text FK
  elapsed_seconds int
  achieved_at timestamptz
  visibility enum(published, quarantined, hidden)
  anomaly_code text

tiles_player_bests
  level_version_id text
  player_id uuid
  score_id uuid FK
  PRIMARY KEY(level_version_id, player_id)

tiles_leaderboard_settings
  singleton boolean PK
  reads_enabled boolean
  writes_enabled boolean
  updated_at, updated_by

tiles_rate_buckets
  bucket_key bytea
  window_start timestamptz
  count int
  expires_at timestamptz
  PRIMARY KEY(bucket_key, window_start)
```

All tables have RLS enabled with no `anon` or `authenticated` policies. Direct table and function privileges are revoked. Only the roadcrosser server-only admin client accesses them. Security-definer functions live in a non-exposed schema, set an empty `search_path`, fully qualify relations, and grant execution only to the server role.

#### Completion Transaction

One SQL function receives validated replay output, not raw commands. It:

1. locks the attempt;
2. checks owner, level, status, and expiry with DB time;
3. returns the stored terminal response if already completed;
4. marks the attempt completed and stores command hash/count;
5. inserts an immutable score;
6. chooses `quarantined` below the configured level floor, otherwise `published`;
7. recomputes the player's best visible score using `(elapsed_seconds, achieved_at, id)`;
8. computes rank against visible PB pointers using the same tuple;
9. stores and returns the terminal response.

Equal or slower scores never replace an earlier best. Hiding a score runs a second transaction that marks it hidden and recomputes the affected player's pointer, restoring the next legitimate score.

### Section 2 — Code Quality

The server contract build reuses engine exports instead of adding a second implementation. Canonical hashing, DTO parsing, public error mapping, and time formatting each live in one pure module. Route handlers remain thin request boundaries.

The existing `chooseBestStats` compares moves and therefore preserves the first 270-move completion. Implementation migrates local storage to `tiles-game-progress-v2`, compares `seconds` first, preserves valid v1 completion data, and adds corruption/migration tests.

No route accepts a caller-controlled Top 10 limit. Public DTOs use explicit domain names and never serialize database rows directly.

### Section 3 — Test Review

```text
CODE PATHS                                           USER FLOWS
[+] replay contract build                           [+] Ordinary unranked play
  ├─ [GAP][UNIT] canonical level hash                  ├─ [★★ TESTED] current play controls
  ├─ [GAP][UNIT] ruleset changes hash                  └─ [GAP][E2E] disabled/outage regression
  └─ [GAP][INTEGRATION] browser/server parity

[+] attempt state machine                           [+] Start ranked run
  ├─ [GAP][UNIT] start/pending/countdown              ├─ [GAP][E2E] success + countdown
  ├─ [GAP][UNIT] cancel/restart/level change          ├─ [GAP][E2E] slow/lost start response
  ├─ [GAP][UNIT] remove/undo log                      └─ [GAP][E2E] level switch cancellation
  └─ [GAP][UNIT] freeze at completion

[+] public/private reads                            [+] View records
  ├─ [GAP][INTEGRATION] public cache isolation        ├─ [GAP][E2E] desktop disclosure
  ├─ [GAP][INTEGRATION] private me no-store           ├─ [GAP][E2E] mobile modal/focus
  └─ [GAP][UNIT] stale merge authority                └─ [GAP][E2E] empty/stale/error/partial

[+] completion RPC                                 [+] Complete ranked run
  ├─ [GAP][INTEGRATION] legal replay                  ├─ [GAP][E2E] Top 10 + personal rank
  ├─ [GAP][INTEGRATION] illegal/unknown/undo          ├─ [GAP][E2E] slower/PB outside
  ├─ [GAP][INTEGRATION] duplicate/lost response       ├─ [GAP][E2E] retry/result recovery
  ├─ [GAP][INTEGRATION] concurrent PB race            └─ [GAP][E2E] local clear survives rejection
  └─ [GAP][INTEGRATION] moderation fallback

[+] security boundary                              [+] Rollout/rollback
  ├─ [GAP][INTEGRATION] direct anon/RLS denied        ├─ [GAP][HOST E2E] read-only phase
  ├─ [GAP][INTEGRATION] origin/fetch metadata         ├─ [GAP][HOST E2E] writes enabled
  ├─ [GAP][INTEGRATION] payload/command caps          └─ [GAP][HOST E2E] kill switch
  └─ [GAP][INTEGRATION] raw errors suppressed

CURRENT COVERAGE: 2 existing smoke/regression flows
NEW GAPS: 31 paths; 9 unit, 13 integration, 9 E2E/host E2E
```

Golden streams cover legal completion, blocked removal, unknown tile, Undo, redundant Undo, incomplete run, and ruleset mismatch. They execute against both browser engine and vendored Node kernel.

#### Executable Test Environments

- tiles-game Vitest: engine contract, attempt reducer, client merge, local-storage v2 migration.
- roadcrosser route tests: Next handlers against local Supabase with migrations applied.
- Supabase SQL tests: RLS denial, completion transaction, concurrency, ranking, moderation fallback, settings, rate buckets, and query plans.
- tiles-game component tests: attempt and leaderboard UI states through an HTTP boundary fake.
- host Playwright: run roadcrosser, sync real static/vendor artifacts, use local Supabase, and exercise iframe plus same-origin routes.

Host E2E is the release gate because the Vite-only server cannot validate production cookies, routing, migrations, or the cross-repo artifact.

### Section 4 — Performance

Public ranking reads only visible best pointers joined to scores and players, orders by `(elapsed_seconds, achieved_at, score_id)`, and limits to ten. Add a partial visible-score ordering index and assert its query plan.

Replay is bounded before execution: body at most 64 KiB, commands at most `min(4 × tile_count, 1,200)`, tile IDs limited to the manifest, and attempt duration 30 minutes. Starts default to five per player per five minutes. A Vercel WAF path rule limits broad bursts; an atomic DB bucket enforces browser and daily-HMAC IP-digest limits.

`pg_cron` removes expired rate buckets daily, deletes rejected or abandoned attempt detail after 30 days, and removes command metadata after 90 days. Immutable scores and minimal completed-attempt audit fields remain while the all-time board exists.

### Security Contract

- Identity cookie: 256-bit opaque token; hash stored in DB; `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- POST routes: same-origin `Origin` and Fetch Metadata enforcement; JSON only.
- Validation: strict Zod schemas, pre-parse length check plus body cap, exact allowed keys.
- Secrets: dedicated server-only Supabase admin client; no service key in the bundle, logs, or public errors.
- Privacy: logs hash player IDs; IP-derived rate keys use a daily HMAC and expire within 48 hours.
- Publication: scores below a playtest-configured per-level floor are quarantined before public visibility.
- Moderation: authenticated operator script lists quarantine, hides/restores score or player, recomputes PB, and toggles reads/writes with an audit reason.

### Failure Modes Registry — Engineering Delta

| Failure | Handling | Test | Visible outcome | Critical gap |
|---|---|---|---|---:|
| Server contract missing | roadcrosser build fails | Host build | Old deploy stays live | No |
| Client/server mismatch | Start rejects before countdown | Contract + E2E | Level not ranked yet | No |
| Start response late | Client cancels and retries | E2E | Clean retry message | No |
| Completion response lost | GET result/repeat POST returns terminal response | Integration + E2E | Check result recovers | No |
| Concurrent PB update | Row lock and single function | DB concurrency | Better tuple wins | No |
| Public cache private leak | Endpoint split and header test | Integration | Impossible by DTO | No |
| Settings unavailable | Fail closed for writes | Integration | Unranked play continues | No |
| Rate bucket unavailable | Fail closed for starts | Integration | Retry later | No |
| Obvious bot time | Quarantine before query | Integration | Result under review | No |
| Operator hides PB | Recompute pointer | DB test | Next visible best appears | No |
| Old cached client | Active-version check | Host E2E | Ranked mode unavailable | No |
| Cleanup job fails | Metric/log and runbook | Ops check | No player impact | No |

### Worktree Parallelization

| Lane | Modules | Depends on |
|---|---|---|
| A — contract | tiles-game engine, levels, build scripts; roadcrosser vendor sync | — |
| B — database/API | roadcrosser migrations, server modules, routes, operator script | A contract schema |
| C — client/UI | tiles-game leaderboard, game integration, styles | API DTO contract |
| D — release | both repos' integration/E2E and rollout docs | A + B + C |

Freeze DTOs and contract artifacts in A. Then run B and C in parallel. Merge both before D. Publish/sync scripts are shared by A and D and must not be edited concurrently.

### Engineering NOT in Scope

- Public SDK or npm package: vendored server artifact is sufficient.
- Multi-region writes or read replicas: ten rows per level do not justify them.
- Realtime pushes: explicit refresh and post-completion reload are sufficient.
- Device attestation, per-run CAPTCHA, or behavioral bot detection: inconsistent with casual trust.
- Full admin web UI: an authenticated operator script and audit log satisfy launch.

### Engineering Implementation Tasks

- [ ] **ENG-T1 (P1, human: ~1 day / CC: ~1 h)** — Contract — Build and sync the versioned replay kernel, manifest, hashes, and golden parity suite.
- [ ] **ENG-T2 (P1, human: ~2 days / CC: ~2 h)** — Database — Add schema, transactions, RLS denial, indexes, settings, buckets, and retention.
- [ ] **ENG-T3 (P1, human: ~1 day / CC: ~1 h)** — API — Implement split routes, opaque identity, strict validation, and stable errors.
- [ ] **ENG-T4 (P1, human: ~1 day / CC: ~1 h)** — Client — Implement attempt reducer, recovery, fetch adapter, controller integration, and PB v2 migration.
- [ ] **ENG-T5 (P1, human: ~1 day / CC: ~1 h)** — UI — Implement reviewed responsive and accessible records states.
- [ ] **ENG-T6 (P1, human: ~1 day / CC: ~1.5 h)** — Verification — Add local Supabase tests and host-level cross-repo Playwright.
- [ ] **ENG-T7 (P2, human: ~4 h / CC: ~30 min)** — Operations — Document WAF, add operator script, metrics queries, alert/runbook, and staged rollout.

### Engineering Completion Summary

```text
+====================================================================+
| ENGINEERING PLAN REVIEW — COMPLETION SUMMARY                       |
+====================================================================+
| Scope challenge        | Cross-repo scope accepted; no new service |
| Architecture           | 3 blockers resolved                       |
| Code quality           | shared kernel; local PB fix included      |
| Test review            | 31 planned gaps mapped                    |
| Performance            | bounded replay, indexed Top 10, retention |
| Security               | private server boundary + quarantine      |
| Failure modes          | 12 deltas, 0 critical gaps                |
| NOT in scope           | 5 items                                   |
| What already exists    | 9 reused surfaces                         |
| Parallelization        | 4 lanes; B + C parallel after A           |
| Dual voices            | 6/6 confirmed concerns                    |
| Lake score             | 9/9 complete decisions                    |
+====================================================================+
```
