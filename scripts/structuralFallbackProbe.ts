import { regionsAreContiguous } from '../src/game/regionGenerator'
import { generateNonTouchingQueens } from '../src/game/solutionGenerator'
import { solveByLogic } from '../src/game/humanSolver'
import { countSolutions } from '../src/game/solver'
import { anyTouching } from '../src/game/rules'
import { mulberry32 } from '../src/game/levelGenerator'
import type { Board } from '../src/game/types'

for (const size of [5, 6, 7, 8, 9, 10, 11, 12]) {
  let connected = 0
  let logic = 0
  let unique = 0
  for (let i = 0; i < 100; i++) {
    const rng = mulberry32(size * 10007 + i * 7919)
    const queens = generateNonTouchingQueens(size, rng)
    if (!queens) continue
    const hold = i % size
    const board: Board = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => ({ row: r, col: c, region: size - 1 })))
    let id = 0
    queens.forEach((q, j) => { if (j !== hold) board[q.row][q.col].region = id++ })
    if (!regionsAreContiguous(board)) continue
    connected++
    const result = solveByLogic(board)
    if (result.solved && !anyTouching(result.placements.map((p) => p.pos))) logic++
    if (countSolutions(board, 2).count === 1) unique++
  }
  console.log(`${size}: connected=${connected}/100 logic=${logic}/100 unique=${unique}/100`)
}
