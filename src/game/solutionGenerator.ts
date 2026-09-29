import type { Position } from './types'
import { anyTouching } from './rules'

/**
 * Generate an N-Queens solution with the extra constraint that no two queens
 * touch (8-direction adjacency). One queen per row + one per column gives a
 * permutation; we additionally reject touching placements during search.
 *
 * Backtracking over rows, columns tried in a randomized order.
 */
export function generateNonTouchingQueens(
  size: number,
  rng: () => number,
): Position[] | null {
  const result: Position[] = []
  const usedCols = new Set<number>()

  function backtrack(row: number): boolean {
    if (row === size) return true
    const cols = shuffledRange(size, rng)
    for (const col of cols) {
      if (usedCols.has(col)) continue
      const candidate: Position = { row, col }
      // Check touching against previously placed queens (rows < current row,
      // so only rows within distance 1 matter, but the general check is safe).
      if (result.some((q) => Math.abs(q.row - row) <= 1 && Math.abs(q.col - col) <= 1)) {
        continue
      }
      result.push(candidate)
      usedCols.add(col)
      if (backtrack(row + 1)) return true
      result.pop()
      usedCols.delete(col)
    }
    return false
  }

  return backtrack(0) ? result : null
}

/** Fisher–Yates shuffle of [0..n-1] (pure — returns a new array). */
function shuffledRange(n: number, rng: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Convenience re-export so callers can validate a solution defensively. */
export { anyTouching }
