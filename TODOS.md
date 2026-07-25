# Deferred Work

## Rotating Challenge Leaderboard

- **What:** Add daily or seasonal challenge boards with resets while retaining all-time records as an archive.
- **Why:** Permanent Top 10 records can become unreachable and provide no recurring reason to return.
- **Pros:** Reachable competition, repeat visits, and a natural content cadence.
- **Cons:** Requires challenge publishing, time-zone/window rules, archives, and additional moderation.
- **Context:** Both independent CEO reviewers recommended rotating challenges as the stronger primary loop. The user explicitly retained all-time Top 10 for this plan, so this remains a separate product decision.
- **Effort:** L human → M with CC+gstack.
- **Priority:** P2.
- **Depends on / blocked by:** Validated all-time attempt/ranking infrastructure and evidence that players replay for speed.

## Shareable Challenge Results

- **What:** Add share cards and challenge links for completed ranked runs.
- **Why:** The leaderboard currently compares existing players but does not create an acquisition loop.
- **Pros:** Organic distribution and a reason to invite another player.
- **Cons:** Requires public result URLs, preview images, abuse controls, and copy/design work.
- **Context:** This was rejected from the all-time Top 10 blast radius because it changes acquisition rather than completing ranking correctness.
- **Effort:** M human → S with CC+gstack.
- **Priority:** P2.
- **Depends on / blocked by:** Stable public score IDs and moderation semantics.

## Durable Cross-Device Identity

- **What:** Allow a browser-scoped player to link records to a durable account.
- **Why:** Clearing cookies creates a new identity, and current records do not follow a player across devices.
- **Pros:** Stronger ownership, recovery, and one-best-per-account semantics.
- **Cons:** Adds authentication, account deletion/export, child/privacy policy, and migration complexity.
- **Context:** Anonymous identity is intentionally acceptable for the casual launch. This must not be implied to exist before it does.
- **Effort:** L human → M with CC+gstack.
- **Priority:** P3.
- **Depends on / blocked by:** Product evidence that cross-device record ownership matters.

## Leaderboard Experiment Analytics

- **What:** Measure ranked-start rate, completion rate, retry rate, personal-best replay, and leaderboard return visits.
- **Why:** The original PRD says core fun should be proven before leaderboard investment, and the feature needs explicit success/kill criteria.
- **Pros:** Makes further investment and shutdown decisions evidence-based.
- **Cons:** Adds consent/privacy review and an analytics surface beyond operational metrics.
- **Context:** Operational API metrics are in scope now; behavioral product analytics are deferred pending an approved analytics posture.
- **Effort:** M human → S with CC+gstack.
- **Priority:** P2.
- **Depends on / blocked by:** Approved privacy-safe analytics provider and event policy.

## Formal UI Design System

- **What:** Capture the shipped Hex Tower typography, spacing, colors, focus, panels, and responsive rules in `DESIGN.md`.
- **Why:** Current design alignment relies on reading `global.css` and avoiding superseded visual explorations.
- **Pros:** Reduces future visual drift and makes design reviews faster.
- **Cons:** Documentation maintenance for a small app.
- **Context:** The leaderboard can reuse existing tokens without this document, so it does not block implementation.
- **Effort:** S human → S with CC+gstack.
- **Priority:** P3.
- **Depends on / blocked by:** Rendered leaderboard design QA.
