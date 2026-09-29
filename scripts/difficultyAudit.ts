import { generateLevel, mulberry32 } from '../src/game/levelGenerator'
import { solveByLogic } from '../src/game/humanSolver'
import { countSolutions } from '../src/game/solver'
import { regionsAreContiguous } from '../src/game/regionGenerator'
import { anyTouching, isValidQueen } from '../src/game/rules'
import type { Board, Difficulty, Level, Position } from '../src/game/types'

const TIERS: Difficulty[] = ['easy', 'medium', 'hard', 'extra-hard']
const SIZES: Record<Difficulty, number[]> = {
  easy: [6, 7],
  medium: [7, 8],
  hard: [9, 10],
  'extra-hard': [10],
}
const SAMPLES_PER_SIZE = 6
const ALLOW_BEST_EFFORT = process.env.AUDIT_BEST_EFFORT === '1'

function samePositions(a: Position[], b: Position[]): boolean {
  const key = (p: Position) => `${p.row},${p.col}`
  return a.map(key).sort().join('|') === b.map(key).sort().join('|')
}

function checkSolution(level: Level): string[] {
  const errors: string[] = []
  const size = level.size
  if (!regionsAreContiguous(level.cells)) errors.push('regions are not contiguous')
  const exact = countSolutions(level.cells, 2)
  if (exact.count !== 1) errors.push(`strict solver found ${exact.count} solutions, expected 1`)
  if (exact.count === 1 && !samePositions(level.solution, exact.solutions[0])) {
    errors.push('published solution differs from the strict solver solution')
  }
  const ordered: Position[] = []
  for (const q of level.solution) {
    if (!isValidQueen(level.cells, ordered, q.row, q.col)) {
      errors.push(`solution placement (${q.row},${q.col}) violates a rule`)
    }
    ordered.push(q)
  }
  if (level.solution.length !== size) errors.push(`solution has ${level.solution.length}/${size} cats`)
  if (anyTouching(level.solution)) errors.push('solution cats touch')
  const logic = solveByLogic(level.cells)
  if (!logic.solved) errors.push('deduction solver did not solve the board')
  if (logic.solved && exact.count === 1 && !samePositions(logic.placements.map((p) => p.pos), exact.solutions[0])) {
    errors.push('deduction solver placement trace disagrees with the unique solution')
  }
  if (exact.count === 1) {
    const solutionCells = new Set(exact.solutions[0].map((p) => `${p.row},${p.col}`))
    for (const elimination of logic.eliminations) {
      const k = `${elimination.pos.row},${elimination.pos.col}`
      if (solutionCells.has(k)) {
        errors.push(`${elimination.technique} eliminated true cat ${k}`)
        break
      }
    }
  }
  return errors
}

/** Measure what correct cat discoveries show: visible Xs and still-legal cells. */
function visibleTrace(board: Board, solution: Position[]) {
  const size = board.length
  const found: Position[] = []
  const steps: { xMarks: number; legalCandidates: number }[] = []
  let priorX = 0

  for (const cat of solution) {
    found.push(cat)
    let xMarks = 0
    let legalCandidates = 0
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const pos = { row, col }
        const isFoundCat = found.some((q) => q.row === row && q.col === col)
        const excluded = found.some((q) =>
          q.row === row ||
          q.col === col ||
          board[q.row][q.col].region === board[row][col].region ||
          (Math.abs(q.row - row) <= 1 && Math.abs(q.col - col) <= 1),
        )
        if (isFoundCat) continue
        if (excluded) xMarks++
        else legalCandidates++
      }
    }
    steps.push({ xMarks, legalCandidates })
    if (xMarks < priorX) throw new Error('automatic X count unexpectedly decreased')
    priorX = xMarks
  }
  return steps
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
}

let failures = 0
console.log('Petdoku tier / logic / player-visible-information audit')
console.log(`Samples per tier-size: ${SAMPLES_PER_SIZE}`)
console.log('tier size accepted/n underRung advancedRounds(mean) singletonRegions(mean) autoX/step(mean) legalCandidates/step(mean,p95) advancedElims(mean)')

for (const tier of TIERS) {
  for (const size of SIZES[tier]) {
    const rounds: number[] = []
    const singletonCounts: number[] = []
    const xPerStep: number[] = []
    const candidatesPerStep: number[] = []
    const advancedEliminations: number[] = []
    let accepted = 0
    let underRung = 0
    let tierErrors = 0

    for (let sample = 0; sample < SAMPLES_PER_SIZE; sample++) {
      const seed = Math.floor(mulberry32(size * 100_003 + TIERS.indexOf(tier) * 17_171 + sample * 991)() * 2 ** 31)
      const { level, report } = generateLevel({ size, difficulty: tier, seed })
      const logic = solveByLogic(level.cells)
      const expectedRung = ({ easy: 1, medium: 2, hard: 3, 'extra-hard': 5 }[tier] + Math.floor((size - 5) / 3))
      const errors = checkSolution(level)
      if (errors.length > 0) {
        tierErrors += errors.length
        for (const error of errors) console.log(`  FAIL ${tier} ${size} seed=${seed}: ${error}`)
      }
      if (!report.accepted) {
        if (!ALLOW_BEST_EFFORT) {
          tierErrors++
          console.log(`  FAIL ${tier} ${size} seed=${seed}: best-effort returned (${report.attempts.slice(-3).map((a) => a.reason ?? 'accepted').join(' ; ') || 'no attempts'})`)
        }
      } else {
        accepted++
        if (logic.advancedRounds < expectedRung) underRung++
      }
      rounds.push(logic.advancedRounds)
      if (report.accepted && level.difficulty !== tier) {
        tierErrors++
        console.log(`  FAIL ${tier} ${size} seed=${seed}: accepted board badge drifted to ${level.difficulty}`)
      }
      if (!report.accepted && logic.advancedRounds >= expectedRung && level.difficulty !== tier) {
        tierErrors++
        console.log(`  FAIL ${tier} ${size} seed=${seed}: fallback met rung but was labelled ${level.difficulty}`)
      }

      const regionCounts = new Map<number, number>()
      for (const row of level.cells) for (const cell of row) {
        regionCounts.set(cell.region, (regionCounts.get(cell.region) ?? 0) + 1)
      }
      singletonCounts.push([...regionCounts.values()].filter((n) => n === 1).length)
      for (const step of visibleTrace(level.cells, level.solution)) {
        xPerStep.push(step.xMarks)
        candidatesPerStep.push(step.legalCandidates)
      }
      advancedEliminations.push(logic.eliminations.filter((e) =>
        !e.technique.startsWith('last-spot-'),
      ).length)
    }

    if (underRung > 0) {
      tierErrors += underRung
      console.log(`  FAIL ${tier} ${size}: ${underRung} accepted boards below the requested difficulty rung`)
    }
    failures += tierErrors
    const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
    console.log(
      `${tier.padEnd(10)} ${String(size).padStart(2)} ${accepted}/${SAMPLES_PER_SIZE} ` +
      `${String(underRung).padStart(2)} ${Math.min(...rounds)}-${Math.max(...rounds)} (${avg(rounds).toFixed(2)}) ` +
      `${avg(singletonCounts).toFixed(2)} ${avg(xPerStep).toFixed(1)} ` +
      `${avg(candidatesPerStep).toFixed(1)},${percentile(candidatesPerStep, 0.95)} ` +
      `${avg(advancedEliminations).toFixed(1)}`,
    )
  }
}

console.log(failures === 0 ? `\nAUDIT PASSED (${ALLOW_BEST_EFFORT ? 'verified lower-tier fallback allowed' : 'all requested tiers accepted'}; no invalid solutions or solver disagreements)` : `\nAUDIT FAILED: ${failures} issue(s)`)
process.exit(failures === 0 ? 0 : 1)
