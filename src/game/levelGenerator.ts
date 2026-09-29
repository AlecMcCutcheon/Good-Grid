import type {
  Board,
  Difficulty,
  GenerationAttempt,
  GenerationReport,
  Level,
  Position,
} from './types'
import type { Placement, SolveResult } from './humanSolver'
import { generateNonTouchingQueens } from './solutionGenerator'
import { growRegions, regionsAreContiguous } from './regionGenerator'
import { anyTouching } from './rules'
import { solveByLogic } from './humanSolver'
import { computeDifficulty } from './difficulty'
import { countSolutions } from './solver'

// ============================================================================
// Generation pipeline — SEED → GROW → CARVE → HARDEN → GRADE → ACCEPT
// ============================================================================

export type GenerateOptions = {
  size?: number
  seed?: number
  /** Target difficulty tier — controls structure AND the acceptance filter. */
  difficulty?: Difficulty
  maxAttempts?: number
  /** Wall-clock budget in ms. Generation is bounded: when exceeded, the
   * verified lower-tier best-effort board is returned. */
  timeBudgetMs?: number

}

/**
 * Tier parameters:
 *  - tinyFrac: fraction of regions forced to remain 1-cell (freebie density)
 *  - alpha: rich-get-richer exponent during growth
 *  - minRounds: base difficulty rung (advanced elimination passes required);
 *    scaled with size by rungFor().
 */
const TIER_PARAMS: Record<
  Difficulty,
  { tinyFrac: number; alpha: number; minRounds: number }
> = {
  easy: { tinyFrac: 0.6, alpha: 5, minRounds: 1 },
  medium: { tinyFrac: 0.35, alpha: 6, minRounds: 2 },
  hard: { tinyFrac: 0.3, alpha: 7, minRounds: 3 },
  'extra-hard': { tinyFrac: 0.2, alpha: 8, minRounds: 5 },
}

/** If the search budget expires, retain a known-unique, logic-solvable board. */
function sameSolution(a: Position[], b: Position[]): boolean {
  const key = (p: Position) => `${p.row},${p.col}`
  return a.map(key).sort().join('|') === b.map(key).sort().join('|')
}

function guaranteedFallback(size: number, seed: number): {
  board: Board
  solve: SolveResult
} {
  // Keep the known non-touching solution, make all but one of its cells
  // singleton regions, and put every other square in one final region. The
  // singleton regions force size-1 placements; the last row and column then
  // force the remaining cat. Since the removed cells are isolated (queens do
  // not touch), the remaining color region stays orthogonally connected.
  const rng = mulberry32(seed + 1_000_003)
  const solution = generateNonTouchingQueens(size, rng)
  if (!solution) throw new Error(`No non-touching solution exists at size ${size}`)

  const heldBack = size - 1
  const board: Board = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({ row, col, region: size - 1 })),
  )
  let singletonRegion = 0
  solution.forEach((pos, index) => {
    if (index !== heldBack) board[pos.row][pos.col].region = singletonRegion++
  })

  const exact = countSolutions(board, 2)
  const solve = solveByLogic(board)
  if (
    !regionsAreContiguous(board) ||
    exact.count !== 1 ||
    !solve.solved ||
    anyTouching(solve.placements.map((p) => p.pos)) ||
    !sameSolution(solve.placements.map((p) => p.pos), exact.solutions[0])
  ) {
    throw new Error(`Constructed fallback board failed validation at size ${size} (seed ${seed})`)
  }
  return { board, solve }
}

/**
 * Difficulty rung for a tier AT A GIVEN SIZE. Bigger boards need more
 * advanced elimination passes for the same label (+1 per 3 rows beyond 5).
 */
function rungFor(tier: Difficulty, size: number): number {
  return TIER_PARAMS[tier].minRounds + Math.floor((size - 5) / 3)
}

// ============================================================================
// Level progression — like the reference game: the player picks ONLY
// difficulty; grid size is owned by the level curve and varies level to
// level, climbing within the tier's range and wrapping.
// ============================================================================

/**
 * Grid size per tier. Size is not a hard limit: generation draws from the
 * tier's range (center ± spread), and GenerateOptions.size overrides entirely.
 */
const TIER_SIZE: Record<Difficulty, number> = {
  easy: 7,
  medium: 7,
  hard: 10,
  'extra-hard': 10,
}

/** How far size may drift from the tier default. */
const TIER_SIZE_SPREAD: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 1,
  'extra-hard': 0,
}

/** Random grid size for a tier, using the supplied seedable RNG when available. */
export function randomSizeForTier(tier: Difficulty, rng: () => number = Math.random): number {
  const base = TIER_SIZE[tier]
  const spread = TIER_SIZE_SPREAD[tier]
  const size = base + Math.floor(rng() * (2 * spread + 1)) - spread
  return Math.min(12, Math.max(4, size))
}

/** Does a solved-by-logic trace meet the tier's size-adjusted requirement? */
function gradeMatches(
  result: SolveResult,
  tier: Difficulty,
  size: number,
): { ok: boolean; advancedRounds: number; rung: number } {
  const rounds = result.advancedRounds
  const rung = rungFor(tier, size)
  const ok = rounds >= rung
  return { ok, advancedRounds: rounds, rung }
}

/** Mulberry32 — small, fast, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap board hash for search memoization. */
function boardHash(cells: Board): string {
  let h = ''
  for (const row of cells) {
    for (const c of row) h += String.fromCharCode(48 + c.region)
  }
  return h
}

/**
 * Blob coherence: every region must fill at least ~35% of its bounding box.
 * Without this, search discovers that SNAKY regions (connected but
 * stretched across the board) manufacture confinement deductions —
 * producing boards where every color appears on every row.
 */
function boardCoherent(board: Board): boolean {
  const size = board.length
  const boxes = new Map<
    number,
    { minR: number; maxR: number; minC: number; maxC: number; n: number }
  >()
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const reg = board[r][c].region
      const b = boxes.get(reg) ?? { minR: r, maxR: r, minC: c, maxC: c, n: 0 }
      b.minR = Math.min(b.minR, r)
      b.maxR = Math.max(b.maxR, r)
      b.minC = Math.min(b.minC, c)
      b.maxC = Math.max(b.maxC, c)
      b.n++
      boxes.set(reg, b)
    }
  }
  for (const b of boxes.values()) {
    const area = (b.maxR - b.minR + 1) * (b.maxC - b.minC + 1)
    if (b.n / area < 0.35) return false
  }
  return true
}

/**
 * CARVE — iterated local search over boundary moves.
 *
 * History (ALGORITHMS.md E7):
 *  - greedy uphill-only: died in true local optima
 *  - + plateau walk (sideways moves + visited set): fixed ≤9×9, but 11×11
 *    hard/XH still exhausted plateaus and failed 20-33% of attempts
 *  - budgeted DFS: complete but ~30 solver runs per node made it far too
 *    slow (20s calls)
 *
 * This version: exhaustive uphill + plateau walk, and on a dead end, a
 * random KICK (a few shape-legal moves ignoring progress) to escape the
 * local optimum — iterated local search. Bounded by move count, visited
 * set, and wall-clock. Every accepted board keeps contiguity, coherence,
 * and region count.
 */
function carveTowardSolvable(
  board: Board,
  maxMoves: number,
  rng: () => number = Math.random,
  timeBudgetMs: number = 400,
): Board | null {
  const cells: Board = board.map((row) => row.map((c) => ({ ...c })))
  const size = cells.length
  const deadline = performance.now() + timeBudgetMs

  const ORTHO: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]

  const regionOf = (r: number, c: number) => cells[r][c].region

  const connected = (regionId: number): boolean => {
    let start: Position | null = null
    let total = 0
    for (let r = 0; r < size && !start; r++) {
      for (let c = 0; c < size && !start; c++) {
        if (cells[r][c].region === regionId) start = { row: r, col: c }
      }
    }
    if (!start) return false
    for (const row of cells) {
      for (const cell of row) if (cell.region === regionId) total++
    }
    const vis = Array.from({ length: size }, () => new Array(size).fill(false))
    const q = [start]
    vis[start.row][start.col] = true
    let n = 0
    while (q.length) {
      const p = q.shift()!
      n++
      for (const [dr, dc] of ORTHO) {
        const nr = p.row + dr
        const nc = p.col + dc
        if (
          nr >= 0 && nr < size && nc >= 0 && nc < size &&
          !vis[nr][nc] && cells[nr][nc].region === regionId
        ) {
          vis[nr][nc] = true
          q.push({ row: nr, col: nc })
        }
      }
    }
    return n === total
  }

  const progressOf = (): [number, number] => {
    const res = solveByLogic(cells)
    const placed = res.placements.map((p) => p.pos)
    let remaining = 0
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let dead = false
        for (const q of placed) {
          if (
            q.row === r ||
            q.col === c ||
            regionOf(q.row, q.col) === regionOf(r, c) ||
            (Math.abs(q.row - r) <= 1 && Math.abs(q.col - c) <= 1)
          ) {
            dead = true
            break
          }
        }
        if (!dead) remaining++
      }
    }
    return [res.placements.length, -remaining]
  }

  /** All candidate boundary moves (shape rules except contiguity check). */
  const candidateMoves = (): { p: Position; recv: number }[] => {
    const sizes = new Map<number, number>()
    for (const row of cells) {
      for (const cell of row) sizes.set(cell.region, (sizes.get(cell.region) ?? 0) + 1)
    }
    const moves: { p: Position; recv: number }[] = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const reg = regionOf(r, c)
        if ((sizes.get(reg) ?? 0) < 2) continue
        for (const [dr, dc] of ORTHO) {
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            const recv = regionOf(nr, nc)
            if (recv !== reg && (sizes.get(recv) ?? 0) <= (sizes.get(reg) ?? 0)) {
              moves.push({ p: { row: r, col: c }, recv })
            }
          }
        }
      }
    }
    return moves
  }

  const moveIsSafe = (m: { p: Position; recv: number }): boolean => {
    const from = regionOf(m.p.row, m.p.col)
    cells[m.p.row][m.p.col].region = m.recv
    const ok = connected(from) && connected(m.recv) && boardCoherent(cells)
    cells[m.p.row][m.p.col].region = from
    return ok
  }

  let [bestPlaced, bestScore] = progressOf()
  if (bestPlaced === size) return cells

  const visited = new Set<string>([boardHash(cells)])
  let kicks = 0
  const maxKicks = 6

  for (let move = 0; move < maxMoves; move++) {
    if ((move & 7) === 0 && performance.now() > deadline) return null

    const moves = candidateMoves()
    if (moves.length === 0) return null

    // Exhaustive: evaluate EVERY legal move once.
    let bestUphill: {
      m: { p: Position; recv: number }
      s: [number, number]
    } | null = null
    const sideways: { m: { p: Position; recv: number } }[] = []
    for (const m of moves) {
      const from = regionOf(m.p.row, m.p.col)
      cells[m.p.row][m.p.col].region = m.recv
      if (connected(from) && connected(m.recv) && boardCoherent(cells)) {
        const s = progressOf()
        if (s[0] > bestPlaced || (s[0] === bestPlaced && s[1] > bestScore)) {
          if (
            !bestUphill ||
            s[0] > bestUphill.s[0] ||
            (s[0] === bestUphill.s[0] && s[1] > bestUphill.s[1])
          ) {
            bestUphill = { m, s }
          }
        } else if (s[0] === bestPlaced && s[1] === bestScore) {
          sideways.push({ m })
        }
      }
      cells[m.p.row][m.p.col].region = from // revert
    }

    if (bestUphill) {
      cells[bestUphill.m.p.row][bestUphill.m.p.col].region = bestUphill.m.recv
      ;[bestPlaced, bestScore] = bestUphill.s
      visited.clear() // new height: plateau history is void
      kicks = 0
      if (bestPlaced === size) return cells
      continue
    }

    if (sideways.length > 0) {
      // Plateau: take an equal move to an unvisited board.
      let took = false
      while (sideways.length > 0 && !took) {
        const idx = Math.floor(rng() * sideways.length)
        const cand = sideways.splice(idx, 1)[0]
        const from = regionOf(cand.m.p.row, cand.m.p.col)
        cells[cand.m.p.row][cand.m.p.col].region = cand.m.recv
        const h = boardHash(cells)
        if (!visited.has(h)) {
          visited.add(h)
          took = true
        } else {
          cells[cand.m.p.row][cand.m.p.col].region = from // revert
        }
      }
      if (took) continue
    }

    // Dead end (no uphill, plateau exhausted): random KICK — apply 3 shape-
    // legal moves regardless of progress, then resume the walk.
    if (kicks >= maxKicks) return null
    kicks++
    let kicked = 0
    for (let t = 0; t < 12 && kicked < 3; t++) {
      const m = moves[Math.floor(rng() * moves.length)]
      if (!moveIsSafe(m)) continue
      cells[m.p.row][m.p.col].region = m.recv
      visited.add(boardHash(cells))
      kicked++
    }
    if (kicked === 0) return null
    ;[bestPlaced, bestScore] = progressOf()
    if (bestPlaced === size) return cells
  }
  return null
}

/**
 * Harden: push a logic-solvable board UP the difficulty ladder. Repeatedly
 * try boundary moves that keep the board logic-solvable while INCREASING the
 * advancedRounds metric. A transfer budget caps how many cells may move so
 * the board keeps its blob shapes.
 */
function hardenToTier(
  board: Board,
  target: number,
  maxMoves: number,
  rng: () => number,
  timeBudgetMs: number = 500,
): { board: Board; solve: SolveResult } | null {
  const cells: Board = board.map((row) => row.map((c) => ({ ...c })))
  const size = cells.length
  const deadline = performance.now() + timeBudgetMs
  const transferBudget = size
  let transfers = 0

  let solve = solveByLogic(cells)
  if (!solve.solved || solve.advancedRounds >= target) {
    return solve.solved ? { board: cells, solve } : null
  }

  let stalls = 0

  for (let move = 0; move < maxMoves; move++) {
    if (performance.now() > deadline) return null
    const sizes = new Map<number, number>()
    for (const row of cells) {
      for (const cell of row) {
        sizes.set(cell.region, (sizes.get(cell.region) ?? 0) + 1)
      }
    }
    interface Move {
      p: Position
      recv: number
    }
    const moves: Move[] = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const reg = cells[r][c].region
        if ((sizes.get(reg) ?? 0) < 2) continue
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as [number, number][]) {
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            const recv = cells[nr][nc].region
            if (recv !== reg && (sizes.get(recv) ?? 0) <= (sizes.get(reg) ?? 0)) {
              moves.push({ p: { row: r, col: c }, recv })
            }
          }
        }
      }
    }

    // Sample moves; keep the one that most increases advancedRounds while
    // staying solvable, coherent, and shape-legal.
    let best: { m: Move; rounds: number } | null = null
    const sample = Math.min(moves.length, 12)
    for (let t = 0; t < sample; t++) {
      const m = moves[Math.floor(rng() * moves.length)]
      const from = cells[m.p.row][m.p.col].region
      cells[m.p.row][m.p.col].region = m.recv
      if (regionsAreContiguous(cells) && boardCoherent(cells)) {
        const s2 = solveByLogic(cells)
        // Respect the aesthetic cap: no region over 50% of the board.
        const counts = new Map<number, number>()
        for (const row of cells) {
          for (const cell of row) {
            counts.set(cell.region, (counts.get(cell.region) ?? 0) + 1)
          }
        }
        const biggest = Math.max(...counts.values())
        if (
          s2.solved &&
          biggest <= 0.5 * size * size &&
          s2.advancedRounds > solve.advancedRounds &&
          (!best || s2.advancedRounds > best.rounds)
        ) {
          best = { m, rounds: s2.advancedRounds }
        }
      }
      cells[m.p.row][m.p.col].region = from
    }

    if (best) {
      cells[best.m.p.row][best.m.p.col].region = best.m.recv
      transfers++
      solve = solveByLogic(cells)
      stalls = 0
      if (solve.advancedRounds >= target) return { board: cells, solve }
      if (transfers >= transferBudget) {
        return solve.solved ? { board: cells, solve } : null
      }
    } else if (moves.length > 0) {
      // No strictly-improving move this pass; take any solvable move to keep
      // exploring (plateau walk).
      for (let t = 0; t < 8; t++) {
        const m = moves[Math.floor(rng() * moves.length)]
        const from = cells[m.p.row][m.p.col].region
        cells[m.p.row][m.p.col].region = m.recv
        const s2 = solveByLogic(cells)
        if (s2.solved && regionsAreContiguous(cells) && boardCoherent(cells)) {
          solve = s2
          break
        }
        cells[m.p.row][m.p.col].region = from
      }
    } else {
      stalls++
      if (stalls >= 4) return null
    }
  }
  return solve.solved ? { board: cells, solve } : null
}

export function generateLevel(options: GenerateOptions): {
  level: Level
  report: GenerationReport
} {

  const tier: Difficulty = options.difficulty ?? 'easy'
  // Size defaults to a random draw around the tier's reference value;
  // explicit options.size overrides (used by tests/benchmarks).
  const size = options.size ?? randomSizeForTier(tier)
  const params = TIER_PARAMS[tier]
  const maxAttempts = options.maxAttempts ?? 200
  // Larger Hard and Extra Hard boards have lower carve hit-rates; give them
  // longer before choosing a truthful lower-tier fallback.
  const timeBudgetMs = options.timeBudgetMs ?? (
    tier === 'extra-hard' && size >= 11 ? 6000 :
      (tier === 'hard' || tier === 'extra-hard') && size >= 10 ? 4000 : 2000
  )
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31)

  const attempts: GenerationAttempt[] = []
  const started = performance.now()

  // Best-effort board while filtering for the requested tier; it is never
  // published as the requested tier unless it reaches the required rung.
  let bestEffort: {
    board: Board
    placements: Placement[]
    solve: SolveResult
  } | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (performance.now() - started > timeBudgetMs) break
    const attemptStart = performance.now()
    const rng = mulberry32(seed + attempt * 7919)

    // ---- SEED + GROW: a POOL of candidates this attempt (candidate-pool
    // strategy — replaces one-candidate-per-attempt, which wasted most
    // grown boards on carve/grade failures).
    const POOL = 3
    interface Candidate {
      board: Board
      logic: SolveResult
    }
    const pool: Candidate[] = []
    for (let p = 0; p < POOL; p++) {
      const solution = generateNonTouchingQueens(size, rng)
      if (!solution) continue
      const tinyCount = Math.max(0, Math.round(size * params.tinyFrac))
      const grown = growRegions(size, solution, rng, {
        tinyCount,
        alpha: params.alpha,
      })
      if (!grown || !regionsAreContiguous(grown)) continue
      pool.push({ board: grown, logic: solveByLogic(grown) })
    }
    if (pool.length === 0) continue

    // Work the most promising candidate (most deduced placements; then most
    // advanced rounds). A fully-solved candidate wins outright.
    pool.sort(
      (a, b) =>
        b.logic.placements.length - a.logic.placements.length ||
        b.logic.advancedRounds - a.logic.advancedRounds,
    )

    let board: Board | null = null
    let logic: SolveResult | null = null
    const solvedIdx = pool.findIndex((c) => c.logic.solved)
    if (solvedIdx >= 0) {
      board = pool[solvedIdx].board
      logic = pool[solvedIdx].logic
    } else {
      // No direct winner: CARVE candidates in promise order until one
      // reaches solvable. Failing all of them is required to lose attempt.
      for (let ci = 0; ci < pool.length; ci++) {
        const carved = carveTowardSolvable(pool[ci].board, 4 * size, rng, 130)
        if (!carved) continue
        const cl = solveByLogic(carved)
        if (cl.solved && boardCoherent(carved)) {
          board = carved
          logic = cl
          break
        }
      }
      if (!board || !logic || !logic.solved) {
        attempts.push({
          index: attempt,
          ok: false,
          reason: `all ${pool.length} pool carves failed`,
          ms: performance.now() - attemptStart,
        })
        continue
      }
    }

    const preSolution: Position[] = logic.placements.map((p) => p.pos)
    if (anyTouching(preSolution)) continue
    const exact = countSolutions(board, 2)
    if (exact.count !== 1 || !sameSolution(logic.placements.map((p) => p.pos), exact.solutions[0] ?? [])) {
      attempts.push({
        index: attempt,
        ok: false,
        reason: `logic trace disagrees with strict solver (${exact.count} solutions)`,
        ms: performance.now() - attemptStart,
      })
      continue
    }

    // Track the pre-harden board as best-effort too.
    if (!bestEffort || logic.advancedRounds > bestEffort.solve.advancedRounds) {
      bestEffort = { board, placements: logic.placements, solve: logic }
    }

    // ---- HARDEN: push the board up the difficulty ladder to its rung.
    let finalBoard = board
    let finalLogic = logic
    const rung = rungFor(tier, size)
    if (!gradeMatches(logic, tier, size).ok) {
      const hardenBudget = Math.min(
        500,
        timeBudgetMs - (performance.now() - started),
      )
      if (hardenBudget < 80) {
        attempts.push({
          index: attempt,
          ok: false,
          reason: 'time budget exhausted before harden',
          ms: performance.now() - attemptStart,
        })
        continue
      }
      const hardened = hardenToTier(board, rung, 4 * size, rng, hardenBudget)
      if (!hardened) {
        attempts.push({
          index: attempt,
          ok: false,
          reason: 'harden failed to reach rung',
          ms: performance.now() - attemptStart,
        })
        continue
      }
      finalBoard = hardened.board
      finalLogic = hardened.solve
      const hardenedExact = countSolutions(finalBoard, 2)
      if (
        hardenedExact.count !== 1 ||
        !sameSolution(finalLogic.placements.map((p) => p.pos), hardenedExact.solutions[0] ?? [])
      ) {
        attempts.push({
          index: attempt,
          ok: false,
          reason: `hardened logic trace disagrees with strict solver (${hardenedExact.count} solutions)`,
          ms: performance.now() - attemptStart,
        })
        continue
      }
      if (anyTouching(finalLogic.placements.map((p) => p.pos))) {
        attempts.push({
          index: attempt,
          ok: false,
          reason: 'harden produced touching solution',
          ms: performance.now() - attemptStart,
        })
        continue
      }
    }

    // Track best-effort (hardest board) for the never-fail guarantee.
    const grade = gradeMatches(finalLogic, tier, size)
    if (!bestEffort || grade.advancedRounds > bestEffort.solve.advancedRounds) {
      bestEffort = {
        board: finalBoard,
        placements: finalLogic.placements,
        solve: finalLogic,
      }
    }

    // Do not silently relabel a near-miss as the requested tier. A board is
    // accepted only when its measured chain reaches the full size-adjusted rung.
    const meetsTier = grade.advancedRounds >= rung
    if (!meetsTier) {
      attempts.push({
        index: attempt,
        ok: false,
        reason: `graded ${grade.advancedRounds} adv rounds (needs ≥${rung})`,
        ms: performance.now() - attemptStart,
      })
      continue
    }

    // ---- ACCEPT. Label = requested tier (full rung guaranteed).
    attempts.push({
      index: attempt,
      ok: true,
      ms: performance.now() - attemptStart,
    })

    return {
      level: {
        size,
        cells: finalBoard,
        solution: finalLogic.placements.map((p) => p.pos),
        difficulty: tier,
      },
      report: { attempts, totalMs: performance.now() - started, accepted: true },
    }
  }

  // ---- No attempt matched the tier: best-effort (still logic-solvable).
  if (bestEffort) {
    const bestExact = countSolutions(bestEffort.board, 2)
    const bestTrace = bestEffort.solve.placements.map((p) => p.pos)
    if (bestExact.count !== 1 || !sameSolution(bestTrace, bestExact.solutions[0] ?? [])) {
      throw new Error('Best-effort board failed exact uniqueness verification')
    }
    const difficulty = computeDifficulty(bestEffort.board, bestEffort.solve)
    return {
      level: {
        size,
        cells: bestEffort.board,
        solution: bestEffort.placements.map((p) => p.pos),
        difficulty: difficulty.difficulty,
      },
      report: { attempts, totalMs: performance.now() - started, accepted: false },
    }
  }

  // Guaranteed last-resort board is itself strict-verified and logic-solvable.
  const fallback = guaranteedFallback(size, seed)
  return {
    level: {
      size,
      cells: fallback.board,
      solution: fallback.solve.placements.map((p) => p.pos),
      difficulty: computeDifficulty(fallback.board, fallback.solve).difficulty,
    },
    report: { attempts, totalMs: performance.now() - started, accepted: false },
  }
}

export type { Placement }
