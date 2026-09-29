import { growRegions, regionsAreContiguous } from '../src/game/regionGenerator'
import { generateNonTouchingQueens } from '../src/game/solutionGenerator'
import { solveByLogic } from '../src/game/humanSolver'
import { countSolutions } from '../src/game/solver'
import { mulberry32 } from '../src/game/levelGenerator'

for (const size of [5, 7, 9, 10, 11, 12]) {
  let bestRounds = -1
  let solved = 0
  let unique = 0
  const grades = new Map<number, number>()
  for (let i = 0; i < 1000; i++) {
    const rng = mulberry32(1643038893 + size * 10007 + i * 7919)
    const queens = generateNonTouchingQueens(size, rng)
    if (!queens) continue
    const tiny = [Math.max(0, size - 3), Math.max(0, size - 2), size - 1][i % 3]
    const alpha = [3, 5, 7][Math.floor(i / 3) % 3]
    const board = growRegions(size, queens, rng, { tinyCount: tiny, alpha })
    if (!board || !regionsAreContiguous(board)) continue
    const logic = solveByLogic(board)
    if (!logic.solved) continue
    solved++
    if (countSolutions(board, 2).count !== 1) continue
    unique++
    bestRounds = Math.max(bestRounds, logic.advancedRounds)
    grades.set(logic.advancedRounds, (grades.get(logic.advancedRounds) ?? 0) + 1)
  }
  console.log(`${size}: solvable=${solved}/1000 unique=${unique}/1000 maxRounds=${bestRounds} gradeCounts=${JSON.stringify([...grades])}`)
}
