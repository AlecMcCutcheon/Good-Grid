# Algorithm Experiment Log

Every generation/solver approach tried in this project, with measurements and
conclusions. Keep this updated when tweaking — it is the "track of different
algorithms" record. Newest experiments at the bottom.

---

## A. Solution generation

| Variant | Approach | Result | Verdict |
|---|---|---|---|
| A1 | Randomized backtracking non-touching row/column placements | Instant at all supported sizes 4–12 | **KEEP** |

## B. Region generation (GROW)

Measured by deduction-solvability unless noted. "Freebie" = 1-cell region.

| Variant | Approach | Result | Verdict |
|---|---|---|---|
| B1 | Uniform frontier expansion, balanced region growth | ~0% logic-solvable in earlier 7×7 sample | REJECTED — balanced blobs have few entry deductions |
| B2 | Round-blob growth | 0/40 logic-solvable | REJECTED — attractive but often undeducible |
| B3 | Wild random flood | 414/4000 logic-solvable (5×5) | Baseline |
| B4 | Rich-get-richer α sweep | Small boards benefit; large boards need entry cells | KEEP with small-region entry bias |
| B5 | Forced singleton regions + capped rich-get-richer growth | Increases deduction solvability and gives immediate forced entries | **KEEP** |
| B6 | Cap runaway regions at ~25% during growth | Prevents one blob swallowing the board | **KEEP** |

## C. Solving / validation

| Variant | Approach | Result | Verdict |
|---|---|---|---|
| C1 | Exact counter with long-range chess diagonal masks | Rejected valid Petdoku arrangements | REJECTED — wrong rules; long-range diagonals are allowed |
| C2 | Exact count using row/column/region/no-touch constraints only | Matches game rules; used for uniqueness checks | **KEEP** |
| C3 | Human deductions: naked row/column/region singles | Solves simple singleton-entry boards | KEEP |
| C4 | + region↔line confinement | Sound locked-candidate deductions; permits chained eliminations | KEEP |
| C5 | + 2×2 reservation | Sound only as an at-most-one-cat block reservation when an entire region's candidate set is within that block | KEEP |
| C6 (removed) | Region-pair-lines shared-cell shortcut | Code's own reasoning did not justify its eliminations | REMOVED — never use as a solver rule without proof |
| C7 (audit) | Record every eliminated candidate; cross-check with exact solution | 114 generated boards in the tier matrix had no elimination of the true cat and solver placements matched the exact unique solution | **KEEP as a regression audit** |

## D. Difficulty and visible progress

| Variant | Approach | Result | Verdict |
|---|---|---|---|
| D1 | Size/fragmentation/solution-count heuristics | Did not track the intended logical work | REJECTED |
| D2 | Placement technique labels | Labels reflected the first trivial singles, not hard cases | REJECTED |
| D3 (revised) | Count each pass that performs advanced eliminations while no row/column/region single is available | Reproducible reasoning-effort proxy; not proven equivalent to player solve time | KEEP, but label as proxy |
| D4 | Tier controls singleton fraction, growth bias, and minimum size-adjusted advanced-pass rung | Across 114 seeded requests (6 per tier/size): all accepted at their rung; no invalid solution, non-unique board, or solver trace disagreement | KEEP |
| D5 | Player-visible trace after each correct cat | Audit records automatic-X cells and still-legal cells: roughly 16–84 automatic Xs and 5–31 remaining legal cells per placement, across sampled sizes/tiers | Useful progress signal, not alone a difficulty grade |

Difficulty acceptance is strict: easy requires 0 advanced elimination passes;
medium/hard/extra-hard require at least their base rung 1/2/3 plus one per
three rows above size 5. Accepted boards are never silently accepted below the
requested rung. If the budget expires, a fallback is returned only after exact
uniqueness and deduction validation and its badge is derived from its measured
logic grade.

## E. Generation search

| Variant | Approach | Result | Verdict |
|---|---|---|---|
| E1 | One grown candidate per attempt | High discard rate | Superseded |
| E2 | Pool of 3 candidates; solve directly or carve all in score order | Improved small/medium-board acceptance; avoids discarding promising siblings | **KEEP** |
| E3 | Exhaustive uphill moves + plateau walk + bounded randomized kicks | Avoids sampled local-improvement misses; still can fail to carve at 11×11 XH | KEEP as bounded search, not a proof of solvability |
| E4 | Count every generated accepted board with strict exact solver | 114/114 sampled tier-size cases accepted after raising only XH 11×11 budget to 4000ms; test time ~3.2s for previously failing seed | **KEEP; watch latency** |
| E5 | Random freeform best-effort fallback | Could return unverified non-unique/missing-solution boards in older path | REPLACED by checked structural fallback |
| E6 | Verified structural fallback: known non-touching solution, size−1 singleton regions, remaining cells one orthogonally connected region | 90/90 forced-fallback tests across sizes 4–12 passed; exact count=1, logic solver solved, published solution legal | **KEEP** |

## F. Hint UX and walkthrough

| Variant | Approach | Result | Verdict |
|---|---|---|---|
| F1 | Hint flashes next stored solution coordinate | Gives away answer without showing why | REJECTED |
| F2 | Hint analyzer uses found cats + permanent X marks to choose exactly one row/column/region singleton or confinement elimination | Explains a real current-state deduction; temporary circle marks are not an input | **KEEP** |
| F3 | Incorrect-X hint | Points to one inconsistent X, says to remove/reconsider it, never announces the cat | **KEEP** |
| F4 | Dev walkthrough | Replays one deduction at a time, highlights line/candidate cells, stages example Xs, and requires explicit Next; does not mutate player state | **KEEP** |
| F5 | Temporary notes | Right-click toggles cyan circle; left-click promotes to permanent X; clear-all; cat placement clears temporary notes that become actual Xs | **KEEP** |

## G. Remaining limitations

- `advancedRounds` measures actual advanced-elimination passes after immediate singles stall, not elapsed solve time, reading load, or player skill. Difficulty labels are a consistent ordering proxy, not a user-study result.
- The current deduction engine deliberately avoids speculative/guessing chains;
  hard boards may still depend on singleton entry regions.
- XH 11×11 needs a larger generation budget: one seed needed ~3.2s and nine
  attempts. If that latency is unacceptable, improve candidate generation or
  move generation off the synchronous UI thread rather than reducing tier
  requirements.
- ESLint 9 is installed but `npm run lint` cannot run because this repository
  has no `eslint.config.*`; TypeScript/build and dedicated logic scripts pass.
