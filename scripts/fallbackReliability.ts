import { generateLevel } from '../src/game/levelGenerator'
import { solveByLogic } from '../src/game/humanSolver'
import { countSolutions } from '../src/game/solver'
import { regionsAreContiguous } from '../src/game/regionGenerator'
import { anyTouching, isValidQueen } from '../src/game/rules'
import type { Position } from '../src/game/types'

let failures = 0
for (const size of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  for (let seed = 1; seed <= 100; seed++) {
    const { level, report } = generateLevel({ size, difficulty: 'extra-hard', seed: size * 1000 + seed, maxAttempts: 0 })
    const issues: string[] = []
    const exact = countSolutions(level.cells, 2)
    const logic = solveByLogic(level.cells)
    if (report.accepted) issues.push('expected forced fallback')
    if (!regionsAreContiguous(level.cells)) issues.push('disconnected region')
    if (exact.count !== 1) issues.push(`strict solution count=${exact.count}`)
    if (!logic.solved) issues.push('not logic-solvable')
    if (level.solution.length !== size) issues.push(`solution length=${level.solution.length}`)
    const placed: Position[] = []
    for (const q of level.solution) {
      if (!isValidQueen(level.cells, placed, q.row, q.col)) issues.push('published solution violates rules')
      placed.push(q)
    }
    if (anyTouching(level.solution)) issues.push('touching cats')
    if (issues.length) {
      failures += issues.length
      console.log(`FAIL size=${size} seed=${seed}: ${issues.join(', ')}`)
    }
  }
  console.log(`fallback size=${size} checked=100`)
}
console.log(failures === 0 ? '\nFALLBACK AUDIT PASSED (900/900)' : `\nFALLBACK AUDIT FAILED (${failures} issue(s))`)
process.exit(failures === 0 ? 0 : 1)
