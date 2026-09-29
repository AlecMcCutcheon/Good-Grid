import type { Board, Position } from './types'

// ============================================================================
// The four Petdoku constraints
// ============================================================================

export const DIRECTIONS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
]

/** Is (row, col) inside the board? */
export function inBounds(board: Board, row: number, col: number): boolean {
  return (
    row >= 0 &&
    row < board.length &&
    col >= 0 &&
    col < (board[0]?.length ?? 0)
  )
}

/** Do two positions touch (8-direction adjacency, including diagonal)? */
export function touching(a: Position, b: Position): boolean {
  return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1
}

/** Basic cells auto-marked around a cat: its row, column, and immediate neighbors. */
export function getAutoFilledPositions(board: Board, position: Position): Position[] {
  const size = board.length
  if (!board[position.row]?.[position.col]) return []

  const excluded = new Map<string, Position>()
  const add = (row: number, col: number) => {
    if (row === position.row && col === position.col) return
    excluded.set(`${row},${col}`, { row, col })
  }

  for (let col = 0; col < size; col++) add(position.row, col)
  for (let row = 0; row < size; row++) add(row, position.col)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const row = position.row + dr
      const col = position.col + dc
      if (row >= 0 && row < size && col >= 0 && col < size) add(row, col)
    }
  }
  return [...excluded.values()]
}

/** Are any two of the given queens touching each other? */
export function anyTouching(queens: Position[]): boolean {
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      if (touching(queens[i], queens[j])) return true
    }
  }
  return false
}

/**
 * Check whether placing a queen at (row, col) violates any of the four
 * Petdoku constraints, given the currently placed queens.
 *
 * 1. No other queen in the same row
 * 2. No other queen in the same column
 * 3. No other queen in the same region
 * 4. No queen in any of the 8 adjacent cells (diagonals included)
 * Long-range chess diagonals are allowed; only immediately adjacent cells count.
 */
export function isValidQueen(
  board: Board,
  placed: Position[],
  row: number,
  col: number,
): boolean {
  const region = board[row]?.[col]?.region
  if (region === undefined) return false

  for (const q of placed) {
    if (q.row === row) return false // same row
    if (q.col === col) return false // same column
    if (board[q.row][q.col].region === region) return false // same region
    if (touching(q, { row, col })) return false // adjacent (incl. diagonal)
  }
  return true
}

/** Have all rows been filled exactly once? */
export function isWin(board: Board, placed: Position[]): boolean {
  return placed.length === board.length && !anyTouching(placed)
}

/** Return constraint-violations for the current board state, for UI feedback. */
export type Violations = {
  row: number[]
  col: number[]
  region: number[]
  touching: [Position, Position][]
}

export function getViolations(board: Board, placed: Position[]): Violations {
  const row = new Set<number>()
  const col = new Set<number>()
  const region = new Set<number>()
  const touchingPairs: [Position, Position][] = []

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]
      const b = placed[j]
      if (a.row === b.row) row.add(a.row)
      if (a.col === b.col) col.add(a.col)
      if (board[a.row][a.col].region === board[b.row][b.col].region) {
        region.add(board[a.row][a.col].region)
      }
      if (touching(a, b)) touchingPairs.push([a, b])
    }
  }

  return { row: [...row], col: [...col], region: [...region], touching: touchingPairs }
}
