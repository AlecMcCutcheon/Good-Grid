# Project Knowledge

## Overview
**Petdoku Playground** is a React + TypeScript (Vite) puzzle prototype and level-generation lab. Puzzle constraints: one cat per row, column, and colored region; cats cannot touch any of the eight neighboring cells; regions are orthogonally contiguous. Long-range chess diagonals are allowed.

## Quickstart
- Install: `npm install`
- Dev: `npm run dev` (Vite, http://localhost:5173)
- Build/typecheck: `npm run build` / `npx tsc -b`
- Generation smoke: `npx tsx scripts/smoke.ts`
- Difficulty, uniqueness, soundness, and visible-X audit: `npx tsx scripts/difficultyAudit.ts`
- Hint/walkthrough checks: `npx tsx scripts/hintTests.ts`
- Force and verify structural fallbacks: `npx tsx scripts/fallbackReliability.ts`

`ALGORITHMS.md` is the generation/solver experiment log. Update it alongside measurable algorithm changes.

## Architecture
- `src/game/types.ts` — core board, level, difficulty, report types.
- `src/game/rules.ts` — canonical row/column/region/8-adjacency validation.
- `src/game/solutionGenerator.ts` — randomized non-touching row/column placements.
- `src/game/regionGenerator.ts` — connected rich-get-richer regions; tiny regions provide entry deductions.
- `src/game/humanSolver.ts` — pure deduction solver. Naked row/column/region singles, sound line↔region confinement, and a 2×2 at-most-one reservation; records placements and candidate eliminations. `advancedRounds` counts actual advanced elimination passes after all immediate singles stall; this is a reproducible complexity proxy, not measured human time.
- `src/game/solver.ts` — exact solution counter matching game rules, used to require uniqueness and cross-check generated logic traces.
- `src/game/difficulty.ts` — labels by the solver's advanced-round proxy.
- `src/game/levelGenerator.ts` — seed/grow/carve/harden/strict-grade pipeline. Difficulty tier affects singleton ratio, growth bias, and the accepted minimum rung (size-adjusted). No silent near-miss tier relaxation. XH 11×11 gets a 4s generation budget; other boards default to 1.5s. On search exhaustion, a structurally constructed board is returned only after strict uniqueness and logic validation, and its displayed tier reflects its measured logic grade.
- `src/game/hints.ts` — one current deduction based on cats already found and permanent X marks; never uses temporary notes to infer. It explains one row/column/region deduction, suggests one batch of X eliminations, or highlights one forced placement. An incorrect permanent X is prioritized and called out without saying a cat is there.
- `src/game/walkthrough.ts` — separate ordered deductions for the dev teaching overlay; it does not change player state.
- `src/App.tsx` — game state, click handling, hints, undo, hearts, temporary notes, and level progression.
- `src/components/Board.tsx`, `Cell.tsx` — board and cell states, hint highlights, dashed row/column guides, staged X examples, and walkthrough cats.
- `src/components/Controls.tsx`, `DevPanel.tsx` — player controls and measured diagnostics.

## Player interactions
- Single click toggles a permanent white X; on a temporary cyan circle it promotes to a permanent X.
- Right-click toggles a temporary cyan circle note; it never influences hint deductions. A bulk clear button appears when temporary notes exist.
- Double-click attempts a cat. Correct cat placement auto-marks its row, column, region, and eight neighbors; any temporary note on a cell converted to a real X is cleared. Incorrect guesses cost a heart.
- Hint offers a single current logical step, animates example Xs one-by-one, describes why, and allows applying that one elimination step. A placement hint highlights but does not place the cat.
- The dev-only solution walkthrough explains one deduction at a time, using dashed row/column outlines, staged example Xs, and step navigation. It does not reveal all cats at once or mutate game progress.
- Undo snapshots include permanent Xs, temporary notes, cats, misses, and hearts.

## Visual conventions
Dark UI; vivid region colors; fixed equal square cells and uniform dark gutters. Region color alone defines blobs—no outlines. Cyan is reserved for temporary notes and deduction previews; permanent elimination Xs stay white; incorrect guesses are red.

## Difficulty and verification
Tiers use `tinyFrac`, growth `alpha`, and `minRounds` in `levelGenerator.ts`. Rung = base 0/1/2/3 for easy/medium/hard/extra-hard plus one for every three rows above size 5. Easy requires zero advanced rounds, other tiers require the full rung. Never treat `accepted=false` as a requested-tier success.

Seeded audits compare every deduction placement and eliminated cell to the strict unique solution, test contiguous regions, and log per-cat visible auto-X/candidate counts. Current metric is useful for regression comparisons but is not yet calibrated to human solve time. See `ALGORITHMS.md` for measured matrices and limitations.

## Gotchas
- Do not add long-range diagonal constraints.
- Every deduction must be sound for all legal completions, not merely match known generator answers. The previous experimental region-pair shared-cell shortcut was removed because its justification was invalid.
- Deduction solver candidate eliminations are recorded so audits can catch true-solution eliminations.
- `npm run lint` currently fails because ESLint 9 is installed but no `eslint.config.*` exists; `npx tsc -b`, `npm run build`, smoke and audit scripts are the current validations.
