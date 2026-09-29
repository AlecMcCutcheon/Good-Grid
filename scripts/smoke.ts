import { generateLevel, mulberry32 } from '../src/game/levelGenerator'
import { regionsAreContiguous } from '../src/game/regionGenerator'
import { isValidQueen, anyTouching } from '../src/game/rules'
import { countSolutions } from '../src/game/solver'
import { solveByLogic } from '../src/game/humanSolver'
import type { Level, Position, Board } from '../src/game/types'

const ruleProbe: Board = Array.from({ length: 5 }, (_, row) =>
  Array.from({ length: 5 }, (_, col) => ({ row, col, region: row * 5 + col })),
)
if (!isValidQueen(ruleProbe, [{ row: 0, col: 0 }], 2, 2)) {
  throw new Error('Long-range diagonal placement should be allowed by Petdoku rules')
}
if (isValidQueen(ruleProbe, [{ row: 0, col: 0 }], 1, 1)) {
  throw new Error('Immediate diagonal neighbors must still be rejected as touching')
}
console.log('Rule probe: long diagonals allowed; adjacent diagonal cells rejected')

function checkLevel(level: Level, label: string): string[] {
  const errors: string[] = []
  const { size, cells, solution } = level

  if (!regionsAreContiguous(cells)) errors.push('region not contiguous')

  const regionIds = new Set(cells.flat().map((c) => c.region))
  if (regionIds.size !== size) {
    errors.push(`expected ${size} regions, got ${regionIds.size}`)
  }

  const counts = new Map<number, number>()
  for (const c of cells.flat()) counts.set(c.region, (counts.get(c.region) ?? 0) + 1)
  const min = Math.min(...counts.values())
  const max = Math.max(...counts.values())
  // Real logic-solvable boards are lumpy (tiny entry regions + big blobs);
  // just guard against one region swallowing the board.
  if (max > 0.55 * size * size) {
    errors.push(`max region too big (${max}/${size * size})`)
  }

  if (solution.length !== size) errors.push(`solution length ${solution.length}`)
  if (anyTouching(solution)) errors.push('solution queens touch')
  const solCheck: Position[] = []
  for (const q of solution) {
    if (!isValidQueen(cells, solCheck, q.row, q.col)) {
      errors.push(`solution queen (${q.row},${q.col}) violates rules`)
    }
    solCheck.push(q)
  }
  const { count } = countSolutions(cells, 64)
  if (count === 0) errors.push('board unsolvable')
  if (count > 1) errors.push(`not unique: ${count} solutions`)

  const logic = solveByLogic(cells)
  if (!logic.solved) errors.push('NOT logic-solvable (needs guessing)')

  console.log(
    `${label}: ${errors.length === 0 ? 'OK' : 'FAIL'} | size=${size} ` +
      `regions=${regionIds.size} unique:${count === 1} logic:${logic.solved} ` +
      `diff=${level.difficulty} region sizes ${min}-${max}`,
  )
  for (const e of errors) console.log(`  ERROR: ${e}`)
  return errors
}

let failures = 0
for (const size of [5, 6, 7, 8, 9, 10, 11]) {
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    const { level, report } = generateLevel({
      size,
      seed: Math.floor(mulberry32(size * 100 + i)() * 2 ** 31),
    })
    const errors = checkLevel(level, `size ${size} #${i}`)
    failures += errors.length
    console.log(
      `  attempts=${report.attempts.length} totalMs=${report.totalMs.toFixed(1)} ` +
        `(gen ${(performance.now() - t0).toFixed(1)}ms)` +
        `${report.accepted ? '' : '  << FALLBACK USED'}`,
    )
    if (!report.accepted) {
      failures++
      console.log('  ERROR: generation not accepted')
    }
  }
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
