import type { Board, Cell, Position } from './types'

const ORTHO: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/**
 * Grow N contiguous regions from the N cat seeds ("every cell of a color
 * touches its color" — each region is one orthogonal blob).
 *
 * Two bias parameters make boards logic-solvable far more often:
 *
 * - `tinyCount` regions are forced to stay SINGLETONS. A one-cell region is
 *   an instant deduction ("this region's cat must be here"), which fires the
 *   elimination cascade a human needs to solve without guessing. Empirically
 *   the hit rate of logic-solvable boards climbs steeply with tinyCount
 *   (e.g. 10x10: 1/800 with none, 545/800 with eight).
 *
 * - Rich-get-richer `alpha`: candidate cells choose among neighboring region
 *   ids weighted by size^alpha, so a few regions grow big while the rest
 *   stay small — the lumpy size distribution real Queens boards have.
 *
 * tinyCount must stay below size: at size itself there would be no region
 * left to absorb unassigned cells.
 */
export function growRegions(
  size: number,
  seeds: Position[],
  rng: () => number,
  opts?: { tinyCount?: number; alpha?: number },
): Board | null {
  const { tinyCount = Math.max(3, Math.floor(size * 0.75)), alpha = 5 } =
    opts ?? {}
  if (seeds.length !== size) return null

  const cells: Cell[][] = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({ row, col, region: -1 })),
  )
  seeds.forEach((s, i) => (cells[s.row][s.col].region = i))

  // Which seeds stay singletons (shuffled pick, capped at size - 1 so one
  // region always remains available to absorb the rest of the board).
  const capped = Math.min(tinyCount, size - 1)
  const order = seeds.map((_, i) => i).sort(() => rng() - 0.5)
  const tiny = new Set(order.slice(0, Math.max(0, capped)))

  const sizes = new Array(seeds.length).fill(1)
  let unassigned = size * size - seeds.length

  while (unassigned > 0) {
    // Unassigned cells with at least one assigned (non-tiny) neighbor.
    const candidates: { row: number; col: number; opts: number[] }[] = []
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (cells[row][col].region !== -1) continue
        const opts: number[] = []
        for (const [dr, dc] of ORTHO) {
          const nr = row + dr
          const nc = col + dc
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            const reg = cells[nr][nc].region
            if (reg >= 0 && !tiny.has(reg) && !opts.includes(reg)) opts.push(reg)
          }
        }
        if (opts.length > 0) candidates.push({ row, col, opts })
      }
    }
    if (candidates.length === 0) break

    const c = candidates[Math.floor(rng() * candidates.length)]
    // Rich-get-richer weight with a runaway cap: regions past the cap get
    // weight 1 (effectively frozen unless nothing else is legal), keeping
    // the biggest blob from swallowing the board.
    const cap = Math.max(4, Math.floor(size * size * 0.25))
    const weights = c.opts.map((r) =>
      sizes[r] >= cap ? 1 : Math.pow(sizes[r], alpha),
    )
    const total = weights.reduce((a, b) => a + b, 0)
    let rw = rng() * total
    let reg = c.opts[c.opts.length - 1]
    for (let i = 0; i < c.opts.length; i++) {
      rw -= weights[i]
      if (rw <= 0) {
        reg = c.opts[i]
        break
      }
    }
    cells[c.row][c.col].region = reg
    sizes[reg]++
    unassigned--
  }

  // Orphan absorption: cells only adjacent to tiny regions join a neighbor.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (cells[row][col].region !== -1) continue
      for (const [dr, dc] of ORTHO) {
        const nr = row + dr
        const nc = col + dc
        if (
          nr >= 0 &&
          nr < size &&
          nc >= 0 &&
          nc < size &&
          cells[nr][nc].region >= 0
        ) {
          cells[row][col].region = cells[nr][nc].region
          unassigned--
          break
        }
      }
    }
  }

  if (unassigned > 0) return null
  return cells
}

/**
 * Verify every region is orthogonally connected (single flood fill covers all
 * of the region's cells).
 */
export function regionsAreContiguous(board: Board): boolean {
  const size = board.length

  const totals = new Map<number, number>()
  for (const row of board) {
    for (const cell of row) {
      totals.set(cell.region, (totals.get(cell.region) ?? 0) + 1)
    }
  }

  const visited: boolean[][] = Array.from({ length: size }, () =>
    new Array(size).fill(false),
  )

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (visited[row][col]) continue
      const region = board[row][col].region
      let count = 0
      const queue: Position[] = [{ row, col }]
      visited[row][col] = true
      while (queue.length > 0) {
        const p = queue.shift()!
        count++
        for (const [dr, dc] of ORTHO) {
          const nr = p.row + dr
          const nc = p.col + dc
          if (
            nr >= 0 &&
            nr < size &&
            nc >= 0 &&
            nc < size &&
            !visited[nr][nc] &&
            board[nr][nc].region === region
          ) {
            visited[nr][nc] = true
            queue.push({ row: nr, col: nc })
          }
        }
      }
      if (count !== totals.get(region)) return false
    }
  }
  return true
}
