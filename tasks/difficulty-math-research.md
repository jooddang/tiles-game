# Hex Tower Difficulty Math Research

Last Updated: 2026-06-05

## Research Goal

Make Hex Tower harder without violating the core rule that every shipped board is solvable and every legal move is safe.

The target is not arbitrary randomness. The target is a solvable dependency DAG that looks random, has low availability, and forces longer visual ray scans.

## Planning Inputs Reviewed

- `plan.md`: solvability iff the blocking dependency graph is acyclic; hard levels use low availability, long chains, dense blockers, long-distance blockers, and visual complexity.
- `tasks/prd-browser-tile-puzzle/context.md`: hard levels should hide legal moves among many tiles without relying on tiny targets or color confusion.
- `tasks/browser-tile-puzzle-product-plan.md`: hard levels must come from low availability, longer chains, and denser blockers; generated boards must be curated and validated.
- Current implementation: `src/engine/difficulty.ts`, `src/engine/graph.ts`, `src/engine/moves.ts`, `src/levels/reference.ts`.

## External Math Notes

- Topological sorting gives a valid linear order for DAG dependencies; in this game, a legal solve order is a topological ordering of the blocker graph.
- Longest path in a DAG is the right model for dependency-chain length. For a DAG it is computable efficiently with dynamic programming over a topological order, unlike longest path in arbitrary graphs.
- DAG width / antichain size matters for perceived freedom: many currently available, mutually independent tiles create easier scanning; few available tiles hidden among many remaining tiles create harder visual search.
- Puzzle difficulty research often treats difficulty as information and inference cost, not only solution existence. For this game that maps to how hard it is to infer which ray is clear.

Sources:

- Topological ordering and DAG dependency interpretation: https://en.wikipedia.org/wiki/Topological_sorting
- DAG longest path / critical path interpretation: https://en.wikipedia.org/wiki/Directed_acyclic_graph
- Puzzle dependency graph design framing: https://www.gamedeveloper.com/design/puzzle-dependency-graph-primer
- Puzzle entropy / solution information framing: https://ojs.aaai.org/index.php/AIIDE/article/view/31872

## Current Hex Tower Metrics

Measured from the current first level:

```text
N = 270
E = 1830
D = 72
F0 = 25
F0 / N = 9.3%
median availability = 4.6%
blocker density = 6.78
min legal count during greedy simulation = 1
max legal count during greedy simulation = 26
average unlock impact = 0.91
max unlock impact = 3
```

Interpretation:

- By `plan.md` tiering, this is already in the Hard band for availability and dependency depth.
- It can still feel easy if legal moves are visually obvious edge tiles.
- Lowering `F0` alone risks making the game tedious, because the base rule has no wrong legal moves.
- The next difficulty upgrade should increase search ambiguity and ray-scan cost, not just reduce legal count.

## Difficulty Model

Keep the existing metrics, but add metrics that better match this exact game:

```text
Availability pressure:
  P = median(Ft / Rt)

Critical-chain pressure:
  C = D / N

Blocking density:
  B = E / N

Legal-move scarcity:
  S = 1 - median(Ft / Rt)

Ray-scan burden:
  Q = average visible distance to first blocker or edge

Edge-obviousness penalty:
  O = share of legal tiles on the outer boundary

Unlock softness:
  U = average newly legal tiles after a legal move

Direction entropy:
  H = normalized entropy over six directions globally and in local neighborhoods
```

Hardness should increase when:

```text
P is low
C is high
B is high
Q is high
O is low
U is low-to-medium
H is high locally
```

But avoid:

```text
Ft = 1 for long stretches
U = 0 for long stretches
legal tiles mostly off-screen or only at board extremes
local direction patterns that look obviously generated
same-direction strips longer than 4 tiles on any row, column, or diagonal
```

## Target For The Next Harder Hex Tower

For a 270-tile mobile board:

```text
F0: 8-16
F0 / N: 3-6%
median availability: 2-4%
D: 85-120
B: 7.5-10
average unlock impact: 0.6-1.4
max unlock impact: 2-4
legal boundary share: below 55%
direction count: all 6 directions
local direction entropy: high in every 5x5 window
```

This should feel harder than the current level because the player has fewer obvious first exits and must inspect more long rays.

## Generator Strategy

Use hidden-order constrained generation, not naive random arrows.

1. Assign each occupied cell a hidden rank `r(cell)`.
2. A tile at cell `c` may choose direction `d` only if every tile in its ray has lower rank:

```text
for every u in R(c, d): r(u) < r(c)
```

This guarantees every edge points from lower rank to higher rank, so the dependency graph is acyclic.

3. Optimize direction choices with simulated annealing or local search against target metrics.
4. Reject candidates that fail:
   - manifest solvability validation
   - target `F0`
   - target median availability
   - target depth
   - target density
   - local entropy checks
   - mobile visual QA

## Why This Is Better Than Current Random-Hard Table

Current table was made by mutating a solvable board and rejecting cycles. It works, but it lacks a principled target objective.

The proposed rank-constrained generator makes solvability constructive first, then searches for difficulty:

```text
solvability invariant first
difficulty objective second
visual curation third
```

That should let us produce harder boards without accidentally making deadlocks or one-way boring chains.

## Implementation Plan

1. Extend `src/engine/difficulty.ts`.
   - Add availability series, legal count series, unlock impact, boundary legal share, ray-scan burden, and direction entropy.

2. Add a development-only candidate search script.
   - Generate rank-constrained direction maps.
   - Score them against the target band above.
   - Print candidate rows and metrics.
   - Do not run generation in the browser.

3. Replace `RANDOM_HARD_ROWS` only after a candidate passes:
   - `validateLevelManifest`
   - hard target metrics
   - E2E mobile/desktop checks
   - visual screenshot review

4. Add manifest tests for the harder tier:
   - `F0 <= 16`
   - `medianAvailability <= 0.04`
   - `dependencyDepth >= 85`
   - `blockerDensity >= 7.5`
   - all six directions present

## Decision

Do not make the board harder by making arrows point in a single global direction.

Make it harder by constructing a solvable partial order with:

- fewer legal candidates,
- longer blocker chains,
- higher ray-scan burden,
- high local direction entropy,
- no long same-direction strips,
- less edge-obviousness,
- bounded unlock impact.
