// Probe 9 (recreated): min-region-size guarantees vs solvability w/ deep solver.
import { mulberry32 } from '../src/game/levelGenerator'
import { generateNonTouchingQueens } from '../src/game/solutionGenerator'
import { solveByLogic } from '../src/game/humanSolver'
import type { Board, Cell, Position } from '../src/game/types'

const ORTHO: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

function neighborsOf(size: number, p: Position): Position[] {
  return ORTHO.map(([dr, dc]) => ({ row: p.row + dr, col: p.col + dc })).filter(
    (n) => n.row >= 0 && n.row < size && n.col >= 0 && n.col < size,
  )
}

function frontierOf(cells: Board, regionId: number): Position[] {
  const size = cells.length
  const out: Position[] = []
  const seen = new Set<string>()
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (cells[row][col].region !== regionId) continue
      for (const n of neighborsOf(size, { row, col })) {
        if (cells[n.row][n.col].region === -1 && !seen.has(`${n.row},${n.col}`)) {
          seen.add(`${n.row},${n.col}`)
          out.push(n)
        }
      }
    }
  }
  return out
}

function tieredRegions(
  size: number,
  seeds: Position[],
  rng: () => number,
  opts: { headStart: number; alpha: number },
): Board {
  const { headStart, alpha } = opts
  const cells: Cell[][] = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({ row, col, region: -1 })),
  )
  seeds.forEach((s, i) => (cells[s.row][s.col].region = i))
  const sizes = new Array(seeds.length).fill(1)
  let unassigned = size * size - seeds.length

  for (let k = 0; k < headStart; k++) {
    for (let rid = 0; rid < seeds.length; rid++) {
      const f = frontierOf(cells, rid)
      if (f.length === 0) continue
      const p = f[Math.floor(rng() * f.length)]
      cells[p.row][p.col].region = rid
      sizes[rid]++
      unassigned--
    }
  }

  while (unassigned > 0) {
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
            if (reg >= 0 && !opts.includes(reg)) opts.push(reg)
          }
        }
        if (opts.length > 0) candidates.push({ row, col, opts })
      }
    }
    if (candidates.length === 0) break
    const c = candidates[Math.floor(rng() * candidates.length)]
    const cap = Math.max(4, Math.floor(size * size * 0.25))
    const weights = c.opts.map((r) => (sizes[r] >= cap ? 1 : Math.pow(sizes[r], alpha)))
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
  return cells
}

function regionSizes(board: Board): number[] {
  const m = new Map<number, number>()
  for (const row of board)
    for (const c of row) m.set(c.region, (m.get(c.region) ?? 0) + 1)
  return [...m.values()]
}

const TRIES = 400
for (const headStart of [0, 1, 2]) {
  const row: string[] = [`headStart=${headStart} (minRegion ${headStart + 1}):`]
  for (const size of [5, 7, 9]) {
    let solvable = 0
    let minOk = 0
    for (let i = 0; i < TRIES; i++) {
      const rng = mulberry32(i * 613 + size * 97 + headStart * 31)
      const sol = generateNonTouchingQueens(size, rng)
      if (!sol) continue
      const board = tieredRegions(size, sol, rng, { headStart, alpha: 5 })
      if (Math.min(...regionSizes(board)) >= headStart + 1) minOk++
      if (solveByLogic(board).solved) solvable++
    }
    row.push(`  ${size}: solvable ${solvable}/${TRIES}, minRespected ${minOk}/${TRIES}`)
  }
  console.log(row.join(' '))
}
