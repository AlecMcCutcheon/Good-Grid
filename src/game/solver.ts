import type { Board, Position } from './types'

/**
 * Bitmask backtracking solver that FINDS up to `cap` solutions.
 *
 * Rows are processed in order; per row we try columns not used yet, whose
 * region is unused, and which don't touch the previous row's cat (with one
 * cat per row, only an adjacent row can touch). Long-range diagonals are not
 * a constraint. Returns the solutions found; `count` is capped at `cap`.
 */
export function countSolutions(
  board: Board,
  cap: number = 2,
): { count: number; solutions: Position[][] } {
  const size = board.length
  const regionOf: number[] = []
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      regionOf[row * size + col] = board[row][col].region
    }
  }

  const solutions: Position[][] = []
  const current: Position[] = []

  const usedCols = new Array<boolean>(size).fill(false)
  const usedRegions = new Set<number>()
  // NOTE: Petdoku does NOT forbid long-range chess diagonals — only 8-cell
  // adjacency (handled by the prev-row check below). No diagonal masks here.

  function backtrack(row: number): boolean {
    if (solutions.length >= cap) return true // stop signal
    if (row === size) {
      solutions.push(current.map((p) => ({ ...p })))
      return solutions.length >= cap
    }

    for (let col = 0; col < size; col++) {
      if (usedCols[col]) continue
      const region = regionOf[row * size + col]
      if (usedRegions.has(region)) continue

      // Adjacency (non-touching): only the previous row's cat can touch.
      if (row > 0 && Math.abs(current[row - 1].col - col) <= 1) continue

      usedCols[col] = true
      usedRegions.add(region)
      current.push({ row, col })

      const stop = backtrack(row + 1)

      current.pop()
      usedCols[col] = false
      usedRegions.delete(region)

      if (stop) return true
    }
    return false
  }

  backtrack(0)
  return { count: solutions.length, solutions }
}

/** Convenience: does this board have at least one solution? */
export function isSolvable(board: Board): boolean {
  return countSolutions(board, 1).count > 0
}
