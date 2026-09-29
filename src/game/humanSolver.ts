import type { Board, Position } from './types'

// ============================================================================
// Human deduction solver
//
// Emulates how a person solves a Petdoku board using only the four rules:
//   1. one cat per row
//   2. one cat per column
//   3. one cat per region
//   4. cats cannot touch (8-adjacency)
//
// A board is "logic-solvable" if these techniques alone (no guessing) place a
// cat in every row.
//
// Difficulty proxy: track how often naked singles are stuck and confinement
// or block deductions must remove candidates before placements resume. This is
// a reproducible logic-work estimate, not a proven model of human solve time.
// The solver therefore
// reports:
//   - fired: every technique that ever made progress (placement OR
//     elimination)
//   - advancedRounds: number of elimination passes made while no immediate
//     row, column, or region single was available
// ============================================================================

export type Technique =
  | 'last-spot-in-row'
  | 'last-spot-in-column'
  | 'last-spot-in-region'
  | 'region-confined-to-row'
  | 'region-confined-to-column'
  | 'row-confined-to-region'
  | 'col-confined-to-region'
  | 'block-2x2'

export const TECHNIQUE_ORDER: Technique[] = [
  'last-spot-in-row',
  'last-spot-in-column',
  'last-spot-in-region',
  'region-confined-to-row',
  'region-confined-to-column',
  'row-confined-to-region',
  'col-confined-to-region',
  'block-2x2',
]

export type Placement = { pos: Position; technique: Technique }

export type Elimination = { pos: Position; technique: Technique; afterPlacements: number }

export type SolveResult = {
  solved: boolean
  placements: Placement[]
  /** Candidate cells removed by the deduction trace (including placement rules). */
  eliminations: Elimination[]
  /** Techniques that fired at least once (placement or elimination). */
  fired: Technique[]
  /** Advanced elimination passes made while all immediate singles were stuck. */
  advancedRounds: number
}

/**
 * Attempt to solve by deduction alone. Alternates:
 *  - naked singles: row / column / region with exactly one remaining candidate
 *  - region→line confinement: a region whose candidates all lie in one row or
 *    column kills that line's other-region cells
 *  - line→region confinement: a row/column whose candidates all lie in one
 *    region kills that region's cells on other lines
 *  - 2x2 block reservation: any one cat in a touching 2x2 reserves it
 * Repeats until no technique makes progress. Never guesses.
 */
export function solveByLogic(board: Board): SolveResult {
  const size = board.length
  const regionOf = (row: number, col: number) => board[row][col].region
  const placed: Position[] = []
  const placements: Placement[] = []
  const eliminations: Elimination[] = []

  const eliminate = (row: number, col: number, technique: Technique): boolean => {
    if (!candidates[row].delete(col)) return false
    eliminations.push({ pos: { row, col }, technique, afterPlacements: placed.length })
    return true
  }

  const firedAll = new Set<Technique>()
  let advancedRounds = 0
  let roundFired: Technique[] = []

  const accountRound = () => {
    for (const t of roundFired) firedAll.add(t)
    roundFired = []
  }

  // candidates[row] = set of columns still possible for that row's cat.
  const candidates: Set<number>[] = Array.from({ length: size }, () => {
    const s = new Set<number>()
    for (let col = 0; col < size; col++) s.add(col)
    return s
  })

  const rowUsed = new Array<boolean>(size).fill(false)
  const colUsed = new Array<boolean>(size).fill(false)
  const regionUsed = new Set<number>()

  const applyPlacement = (row: number, col: number, technique: Technique) => {
    placed.push({ row, col })
    placements.push({ pos: { row, col }, technique })
    roundFired.push(technique)
    rowUsed[row] = true
    colUsed[col] = true
    regionUsed.add(regionOf(row, col))

    // Incremental elimination of every rule-violating cell.
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let dead = false
        if (r === row && c === col) dead = true
        else if (r === row) dead = true // same row
        else if (c === col) dead = true // same column
        else if (regionOf(r, c) === regionOf(row, col)) dead = true // same region
        else if (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1) dead = true // touching
        if (dead && !(r === row && c === col)) eliminate(r, c, technique)
      }
    }
  }

  let progress = true
  while (progress && placed.length < size) {
    accountRound()
    progress = false

    // --- Naked single: a row with exactly one candidate column.
    for (let row = 0; row < size; row++) {
      if (!rowUsed[row] && candidates[row].size === 1) {
        const [col] = [...candidates[row]]
        applyPlacement(row, col, 'last-spot-in-row')
        progress = true
      }
    }
    if (progress) continue

    // --- Naked single: a column with exactly one candidate row.
    // Re-check rowUsed at placement time — earlier placements in this same
    // pass may have consumed the row (stale colRows lists).
    {
      const colRows: Map<number, number[]> = new Map()
      for (let row = 0; row < size; row++) {
        if (rowUsed[row]) continue
        for (const col of candidates[row]) {
          if (!colRows.has(col)) colRows.set(col, [])
          colRows.get(col)!.push(row)
        }
      }
      for (const [col, rows] of colRows) {
        if (
          !colUsed[col] &&
          rows.length === 1 &&
          !rowUsed[rows[0]] &&
          candidates[rows[0]].has(col)
        ) {
          applyPlacement(rows[0], col, 'last-spot-in-column')
          progress = true
        }
      }
    }
    if (progress) continue

    // --- Naked single: a region with exactly one candidate cell.
    {
      const regionCells: Map<number, { row: number; col: number }[]> = new Map()
      for (let row = 0; row < size; row++) {
        if (rowUsed[row]) continue
        for (const col of candidates[row]) {
          const reg = regionOf(row, col)
          if (!regionCells.has(reg)) regionCells.set(reg, [])
          regionCells.get(reg)!.push({ row, col })
        }
      }
      for (const [reg, cells] of regionCells) {
        if (!regionUsed.has(reg) && cells.length === 1) {
          const { row, col } = cells[0]
          if (!rowUsed[row] && !colUsed[col] && candidates[row].has(col)) {
            applyPlacement(row, col, 'last-spot-in-region')
            progress = true
          }
        }
      }
    }
    if (progress) continue

    // No row, column, or region single was available at this point. If any
    // of the following advanced eliminations fires, this counts as one
    // advanced round before we restart and look for new singles.
    const eliminationsBeforeAdvancedPass = eliminations.length

    // --- Region→line confinement: all of a region's remaining candidates
    // sit in one row (or column) ⇒ that line's cat must be in this region,
    // so cells in the line belonging to OTHER regions are dead.
    {
      const regionCells: Map<number, { row: number; col: number }[]> = new Map()
      for (let row = 0; row < size; row++) {
        if (rowUsed[row]) continue
        for (const col of candidates[row]) {
          const reg = regionOf(row, col)
          if (!regionCells.has(reg)) regionCells.set(reg, [])
          regionCells.get(reg)!.push({ row, col })
        }
      }
      for (const [reg, cells] of regionCells) {
        if (regionUsed.has(reg) || cells.length === 0) continue
        const eliminationStart = eliminations.length

        const rows = new Set(cells.map((c) => c.row))
        const cols = new Set(cells.map((c) => c.col))

        if (rows.size === 1) {
          const theRow = [...rows][0]
          for (let col = 0; col < size; col++) {
            if (regionOf(theRow, col) !== reg && candidates[theRow].has(col)) {
              if (eliminate(theRow, col, 'region-confined-to-row')) progress = true
            }
          }
          if (eliminations.length > eliminationStart) roundFired.push('region-confined-to-row')
        } else if (cols.size === 1) {
          const theCol = [...cols][0]
          for (let row = 0; row < size; row++) {
            if (rowUsed[row]) continue
            if (regionOf(row, theCol) !== reg && candidates[row].has(theCol)) {
              if (eliminate(row, theCol, 'region-confined-to-column')) progress = true
            }
          }
          if (eliminations.length > eliminationStart) roundFired.push('region-confined-to-column')
        }
      }
    }
    if (eliminations.length > eliminationsBeforeAdvancedPass) advancedRounds++
    if (progress) continue

    // --- Line→region confinement: ALL candidate cells of an unplaced row
    // sit in one region R ⇒ R's cat is in this row ⇒ R's cells in other
    // rows are dead.
    {
      for (let row = 0; row < size; row++) {
        if (rowUsed[row] || candidates[row].size === 0) continue
        const eliminationStart = eliminations.length
        const regions = new Set<number>()
        for (const col of candidates[row]) regions.add(regionOf(row, col))
        if (regions.size !== 1) continue
        const reg = [...regions][0]
        if (regionUsed.has(reg)) continue
        for (let r2 = 0; r2 < size; r2++) {
          if (r2 === row || rowUsed[r2]) continue
          for (let col = 0; col < size; col++) {
            if (regionOf(r2, col) === reg && candidates[r2].has(col)) {
              if (eliminate(r2, col, 'row-confined-to-region')) progress = true
            }
          }
        }
        if (eliminations.length > eliminationStart) roundFired.push('row-confined-to-region')
      }
      // Same for columns.
      for (let col = 0; col < size; col++) {
        if (colUsed[col]) continue
        const eliminationStart = eliminations.length
        const regions = new Set<number>()
        for (let row = 0; row < size; row++) {
          if (!rowUsed[row] && candidates[row].has(col)) {
            regions.add(regionOf(row, col))
          }
        }
        if (regions.size !== 1) continue
        const reg = [...regions][0]
        if (regionUsed.has(reg)) continue
        for (let c2 = 0; c2 < size; c2++) {
          if (c2 === col || colUsed[c2]) continue
          for (let row = 0; row < size; row++) {
            if (rowUsed[row]) continue
            if (regionOf(row, c2) === reg && candidates[row].has(c2)) {
              if (eliminate(row, c2, 'col-confined-to-region')) progress = true
            }
          }
        }
        if (eliminations.length > eliminationStart) roundFired.push('col-confined-to-region')
      }
    }
    if (eliminations.length > eliminationsBeforeAdvancedPass) advancedRounds++
    if (progress) continue

    // --- 2×2 block reservation: any two cells of a 2×2 block touch, so a
    // 2×2 holds AT MOST one cat. If an unplaced region's candidates all sit
    // inside one 2×2 block, that block is RESERVED for the region — every
    // other region's candidates in the block die. (Shape-only deduction;
    // needs no freebies.)
    {
      // Gather candidate cells per unplaced region.
      const regionCands: Map<number, { row: number; col: number }[]> = new Map()
      for (let row = 0; row < size; row++) {
        if (rowUsed[row]) continue
        for (const col of candidates[row]) {
          const reg = regionOf(row, col)
          if (!regionCands.has(reg)) regionCands.set(reg, [])
          regionCands.get(reg)!.push({ row, col })
        }
      }

      const blockKey = (r: number, c: number) => `${r}:${c}`
      for (const [reg, cs] of regionCands) {
        if (regionUsed.has(reg) || cs.length === 0 || cs.length > 4) continue
        // Which 2×2 blocks contain ALL of this region's candidates?
        // Anchor candidates: every candidate can be the min-corner's child.
        // For each candidate cell, the 2x2 blocks containing it are anchored
        // at (r, c), (r-1, c), (r, c-1), (r-1, c-1). Intersect over all
        // candidates.
        const blocksFor = (p: { row: number; col: number }) => {
          const out: string[] = []
          for (const ar of [p.row - 1, p.row]) {
            for (const ac of [p.col - 1, p.col]) {
              if (ar >= 0 && ar < size - 1 && ac >= 0 && ac < size - 1) {
                out.push(blockKey(ar, ac))
              }
            }
          }
          return out
        }
        let common: string[] | null = null
        for (const p of cs) {
          const b = blocksFor(p)
          if (common === null) common = b
          else common = common.filter((x) => b.includes(x))
        }
        if (!common || common.length === 0) continue

        for (const key of common) {
          const [ar, ac] = key.split(':').map(Number)
          // The block is reserved for `reg` (its only candidates live
          // inside it), so the block's other-region cells die: a 2×2 can
          // hold at most one cat and `reg` must claim it.
          let eliminated = false
          for (const r of [ar, ar + 1]) {
            for (const c of [ac, ac + 1]) {
              if (!rowUsed[r] && regionOf(r, c) !== reg && candidates[r].has(c)) {
                if (eliminate(r, c, 'block-2x2')) eliminated = true
              }
            }
          }
          if (eliminated) {
            roundFired.push('block-2x2')
            progress = true
          }
        }
      }
    }
    if (eliminations.length > eliminationsBeforeAdvancedPass) advancedRounds++
    if (progress) continue

  }
  accountRound()

  return {
    solved: placed.length === size,
    placements,
    eliminations,
    fired: [...firedAll],
    advancedRounds,
  }
}
