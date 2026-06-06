# Tile Puzzle Solvability and Level Design

This note explains how to prove whether a board is solvable, why a fully random board is not guaranteed to be solvable, and how to design levels from easy to hard.

## Puzzle Rule

Each tile has an arrow direction. A tile can be removed only if every cell from that tile in its arrow direction, up to the edge of the board, contains no remaining tile.

In other words, a tile is removable when nothing blocks its exit ray.

## 1. Solvability Model

Let:

- `V` be the set of all tiles.
- `d(v)` be the arrow direction of tile `v`.
- `R(v)` be the set of tiles strictly in front of `v` along direction `d(v)`, up to the board edge.
- `S` be the set of tiles still remaining on the board.

Tile `v` can be removed exactly when:

```text
R(v) intersect S = empty
```

That means every tile in front of `v` along its arrow direction must already be gone.

## 2. Dependency Graph

Build a directed graph `G`.

For every tile `v`, and every tile `u` in `R(v)`, add this edge:

```text
u -> v
```

Interpretation:

```text
u must be removed before v
```

So each tile depends on all tiles blocking its exit path.

## 3. Solvability Theorem

A board is solvable if and only if the dependency graph `G` is a DAG: a directed acyclic graph.

### Necessity

Assume the board has a valid removal sequence.

For every edge `u -> v`, tile `u` blocks tile `v`, so `u` must appear earlier than `v` in the removal order.

Therefore the removal order is a topological ordering of `G`.

A graph has a topological ordering only if it has no directed cycle. So if the board is solvable, `G` must be acyclic.

### Sufficiency

Assume `G` is acyclic.

Every finite DAG has at least one node with indegree `0`.

A tile with indegree `0` has no remaining blockers in its arrow direction, so it is legally removable.

Remove that tile. The remaining graph is still acyclic. Repeat until every tile is removed.

Therefore, if `G` is acyclic, the board is solvable.

## 4. Random Boards Are Not Always Solvable

Take two adjacent tiles `A` and `B` on the same grid line.

- `A` points toward `B`.
- `B` points toward `A`.

Then the dependency graph contains:

```text
A -> B
B -> A
```

This is a directed cycle.

Neither tile can move first, because each blocks the other. So the board is unsolvable.

Therefore a random board cannot be guaranteed solvable.

## 5. Probability Intuition

If arrows are chosen uniformly at random among 6 directions, then for any adjacent pair of tiles, the probability that they point directly at each other is:

```text
1/6 * 1/6 = 1/36
```

One local 2-cycle is enough to make the whole board unsolvable.

For `k` disjoint adjacent pairs, the probability that none of those pairs forms this immediate deadlock is:

```text
(35/36)^k
```

So the probability of at least one such deadlock is at least:

```text
1 - (35/36)^k
```

For large boards, arbitrary random arrows will often create cycles.

## 6. How Puzzle Games Guarantee Solvability

Puzzle generators usually should not assign arrows uniformly at random.

Use one of these approaches instead.

### Method A: Generate Backward

Start from an empty board.

Repeatedly insert tiles in positions where, if removed in reverse order, they would have a clear exit path.

Then the reverse insertion order is a valid solution.

This gives a constructive proof of solvability.

### Method B: Randomize, Then Test

Generate a random board, construct the dependency graph, and run topological sort.

- If the graph is acyclic, accept the board.
- If the graph has a cycle, reject and regenerate.

### Method C: Assign a Hidden Removal Order First

Choose a random removal order:

```text
v1, v2, ..., vn
```

Then assign arrows so that each tile `vi` only points through cells that are removed earlier than itself.

This guarantees that `v1, v2, ..., vn` is a legal solution.

## 7. Practical Solvability Algorithm

```text
1. For each tile v:
   - Look along its arrow direction until the board edge.
   - For every tile u found in that ray, add edge u -> v.

2. Run topological sort.

3. If all tiles are sorted:
   - The board is solvable.
   - The sorted order is a valid removal order.

4. If some tiles remain unsorted:
   - Those remaining tiles contain a directed cycle.
   - The board is unsolvable.
```

Core conclusion:

```text
Solvable iff the blocking dependency graph is acyclic.
```

## 8. Level Design Principle

Design levels by controlling the dependency DAG, not by randomly placing colors and arrows.

For this puzzle, each tile is a node. If tile `A` blocks tile `B` from exiting, add:

```text
A -> B
```

A level is solvable if this graph is acyclic. Difficulty comes from how constrained and visually searchable that DAG is.

## 9. Important Property: Every Legal Move Is Safe

Under the current rule set, if a tile can be removed, removing it can never make the puzzle worse.

Reason:

- Removing a tile only deletes blockers.
- It never creates new blockers.
- Therefore any legal removal preserves solvability.

So this puzzle is not hard because of wrong choices. It is hard because the player must find currently removable tiles inside visual clutter.

Difficulty should be designed around these factors:

| Factor | Easy | Hard |
| --- | --- | --- |
| Tile count | Low | High |
| Initially removable tiles | Many | Few |
| Removable tile ratio | High | Low |
| Dependency chain length | Short | Long |
| Average blockers per tile | Low | High |
| Long-distance blockers | Rare | Common |
| Direction/color count | 2-3 | 5-6 |
| Board shape | Open/simple | Narrow/irregular |
| Visual search noise | Low | High |

## 10. Core Difficulty Metrics

Let:

- `N` be the number of tiles.
- `E` be the number of dependency edges.
- `D` be the longest dependency chain.
- `F_t` be the number of removable tiles at step `t`.
- `R_t` be the number of remaining tiles at step `t`.

### A. Initial Freedom

```text
F_0
```

Easy levels should have many obvious first moves.

Hard levels may have only 1-5 removable tiles among hundreds.

### B. Availability Ratio

```text
A_t = F_t / R_t
```

This matters more than raw removable count.

| Situation | Difficulty |
| --- | --- |
| 5 removable out of 20 | Easy |
| 5 removable out of 300 | Hard |

### C. Dependency Depth

```text
D = length of the longest path in the DAG
```

Higher `D` means longer unlock chains.

### D. Blocking Density

```text
B = E / N
```

Higher `B` means each tile depends on more blockers.

### E. Unlock Impact

For each removed tile `v`, measure how many new tiles become removable after removing `v`.

Easy levels should often produce visible cascades:

```text
remove 1 tile -> 3-5 new tiles become available
```

Hard levels can have smaller, delayed unlocks.

## 11. Difficulty Scoring Heuristic

A practical scoring model:

```text
Difficulty =
  25 * log10(N)
  + 25 * D / N
  + 20 * min((E / N) / 4, 1)
  + 20 * (1 - median(A_t))
  + 10 * V
```

Where `V` is a visual complexity score from `0` to `1`.

`V` increases with color entropy, direction variety, board irregularity, and long-distance blockers.

This is not a mathematical truth about human difficulty. It is a useful generator heuristic. Calibrate it with player data later.

## 12. Level Tiers

Approximate tiers:

| Tier | Tiles | Initial removable ratio | Dependency depth | Design goal |
| --- | --- | --- | --- | --- |
| Tutorial | 5-20 | 30-60% | 1-4 | Teach direction/removal |
| Easy | 20-60 | 20-40% | 3-10 | Many obvious removals |
| Medium | 60-150 | 10-25% | 10-25 | Some search required |
| Hard | 150-300 | 3-12% | 25-70 | Sparse available moves |
| Expert | 300+ | 1-6% | 70+ | Dense visual search |

For mobile, avoid making hard levels purely tedious. A level with only one legal tile at every step is mathematically constrained but may feel boring.

Better hard design often has:

```text
3 to 8 legal tiles hidden among many tiles
```

## 13. Solvable Level Generator

Use reverse construction.

### Algorithm

Start with an empty board. Insert tiles in reverse solution order.

At each insertion:

1. Pick an empty cell.
2. Choose a direction such that the ray from that cell to the edge has no already placed tile.
3. Place the tile with that arrow.
4. Repeat until the board is full.

Then the reverse of insertion order is a valid solution.

### Pseudocode

```text
placed = empty set
reverse_solution = []

while board has empty cells:
    candidates = []

    for each empty cell c:
        for each direction d:
            if ray_from(c, d) contains no placed tile:
                candidates.append((c, d))

    choose (c, d) based on target difficulty
    place tile at c with direction d
    placed.add(c)
    reverse_solution.append(c)

solution = reverse(reverse_solution)
```

This guarantees solvability.

## 14. Validate and Bucket by Difficulty

After generating a board:

```text
1. Build dependency graph G.
2. Run topological sort.
3. Reject if G has a cycle.
4. Simulate removals.
5. Compute:
   - N
   - E
   - D
   - F_0
   - median(F_t / R_t)
   - average blockers per tile
   - visual complexity
6. Assign difficulty tier.
7. If score is outside target range, regenerate.
```

## 15. How to Make Levels Harder Without Making Them Unfair

Good hard levels:

- Have few removable tiles, but keep them visible after careful inspection.
- Use long dependency chains.
- Put some blockers far away, not just adjacent.
- Use clusters and narrow regions in the board shape.
- Mix direction colors enough to create search cost.
- Sometimes unlock a small local chain after one removal.

Bad hard levels:

- Make legal tiles visually indistinguishable.
- Rely on color-only logic without arrow backup.
- Use too many forced single moves.
- Make the board large while keeping dependency structure shallow.
- Create difficulty only through eye strain.

## 16. Recommended Design Progression

### Phase 1: Teach the Mechanic

- Use 2 directions/colors.
- Keep the board small.
- Use mostly edge-facing arrows.
- Make legal tiles obvious.

### Phase 2: Add Dependency Chains

- Add interior tiles blocked by 1-2 tiles.
- Make removing one tile unlock another.
- Keep many legal moves available.

### Phase 3: Add Long-Distance Blockers

- Let a tile be blocked by another tile several cells away.
- Make the player scan along a full ray.

### Phase 4: Reduce Availability

- Lower `F_t / R_t`.
- Keep more tiles blocked at each moment.

### Phase 5: Add Visual Complexity

- Add more colors/directions.
- Use irregular board shapes.
- Use symmetric clusters.
- Add holes or special zones.

### Phase 6: Add New Mechanics If Needed

Because the base puzzle has no wrong legal moves, strategic depth is limited. For deeper gameplay, add mechanics such as:

| Mechanic | Effect |
| --- | --- |
| Limited moves | Creates planning pressure |
| Locked tiles | Requires key/unlock order |
| Bomb tiles | Time-sensitive priority |
| Color goals | Forces selective removal |
| Rotating arrows | Changes dependency graph |
| Frozen tiles | Temporary blockers |
| Multi-layer tiles | Adds depth and occlusion |

## Core Design Rule

Do not generate random boards directly.

Generate solvable dependency DAGs with target properties:

```text
Easy = high availability + short chains + low visual noise
Hard = low availability + long chains + dense blockers + high visual noise
```

Then validate with topological sort and bucket levels using graph metrics plus human play data.
