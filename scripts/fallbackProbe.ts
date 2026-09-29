import { growRegions, regionsAreContiguous } from '../src/game/regionGenerator'
import { solveByLogic } from '../src/game/humanSolver'
import { countSolutions } from '../src/game/solver'
import { generateNonTouchingQueens } from '../src/game/solutionGenerator'
import { mulberry32 } from '../src/game/levelGenerator'

for (const size of [5, 6, 7, 8, 9, 10, 11, 12]) {
  let logicHits = 0
  let uniqueHits = 0
  let maxRegion = 0
  let worstMs = 0
  for (let i = 0; i < 30; i++) {
    const rng = mulberry32(size * 10007 + i * 7919)
    const solution = generateNonTouchingQueens(size, rng)
    if (!solution) continue
    const board = growRegions(size, solution, rng, { tinyCount: size - 1, alpha: 5 })
    if (!board || !regionsAreContiguous(board)) continue
    const regionCounts = new Map<number, number>()
    for (const row of board) for (const cell of row) regionCounts.set(cell.region, (regionCounts.get(cell.region) ?? 0) + 1)
    maxRegion = Math.max(maxRegion, ...regionCounts.values())
    const start = performance.now()
    const solve = solveByLogic(board)
    worstMs = Math.max(worstMs, performance.now() - start)
    if (!solve.solved) continue
    logicHits++
    if (countSolutions(board, 2).count === 1) uniqueHits++
  }
  console.log(`${size}: logic=${logicHits}/30 unique=${uniqueHits}/30 largest-region=${maxRegion} solver-worst=${worstMs.toFixed(1)}ms`)
}
