// Requested-tier acceptance benchmark for the level generator.
//
// Measures, per tier and size:
//   - requested-tier acceptance rate per generateLevel call (not per inner attempt)
//   - inner attempt counts, latency percentiles, best-effort fallback rate
//   - carve/harden failure reasons surfaced in attempt reports
//
// Usage: npx tsx scripts/benchmark.ts [samplesPerCell] [tierFilter]
// Example: npx tsx scripts/benchmark.ts 25 hard
import { generateLevel, mulberry32 } from '../src/game/levelGenerator'
import { solveByLogic } from '../src/game/humanSolver'
import { countSolutions } from '../src/game/solver'
import type { Difficulty } from '../src/game/types'

const samples = Number(process.argv[2] ?? 20)
const tierFilter = process.argv[3] as Difficulty | undefined

const SIZES: Record<Difficulty, number[]> = {
  easy: [6, 7, 8],
  medium: [7, 8, 9],
  hard: [9, 10, 11],
  'extra-hard': [11],
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
}

type Row = {
  tier: Difficulty
  size: number
  accepted: number
  fallbacks: number
  attempts: number[]
  ms: number[]
  reasons: Map<string, number>
  failures: string[]
}

const rows: Row[] = []

const tiers = (Object.keys(SIZES) as Difficulty[]).filter(
  (tier) => !tierFilter || tier === tierFilter,
)

for (const tier of tiers) {
  for (const size of SIZES[tier]) {
    const row: Row = { tier, size, accepted: 0, fallbacks: 0, attempts: [], ms: [], reasons: new Map(), failures: [] }
    for (let sample = 0; sample < samples; sample++) {
      const seed = Math.floor(mulberry32(size * 100_003 + sample * 7919)() * 2 ** 31)
      const { level, report } = generateLevel({ size, difficulty: tier, seed })
      row.attempts.push(report.attempts.length)
      row.ms.push(report.totalMs)
      if (report.accepted && level.difficulty === tier) {
        row.accepted++
      } else {
        row.fallbacks++
        const lastReason = [...report.attempts].reverse().find((attempt) => !attempt.ok)?.reason ?? 'no failed attempt recorded'
        row.failures.push(`seed=${seed} (${level.difficulty}; ${lastReason})`)
        for (const attempt of report.attempts) {
          if (attempt.ok) continue
          const reason = (attempt.reason ?? 'unknown').replace(/graded \d+ adv rounds/, 'graded N adv rounds')
          row.reasons.set(reason, (row.reasons.get(reason) ?? 0) + 1)
        }
      }
      if (report.accepted && level.difficulty !== tier) {
        throw new Error(`Generator accepted the wrong badge at ${tier} ${size} seed=${seed}: ${level.difficulty}`)
      }
      // Sanity: every published board must be logic-solvable and uniquely solved.
      const logic = solveByLogic(level.cells)
      const exact = countSolutions(level.cells, 2)
      if (!logic.solved) throw new Error(`Unsolvable board published at ${tier} ${size} seed=${seed}`)
      if (exact.count !== 1) throw new Error(`Non-unique board published at ${tier} ${size} seed=${seed}: ${exact.count} solutions`)
    }
    rows.push(row)
  }
}

console.log(`Benchmark: ${samples} seeds per tier-size; acceptance means the call returned the requested tier (inner retries still count)`)
console.log('tier        size  accepted (rate)  fallback  attempts(avg/max)  ms(avg/p95/max)')
for (const row of rows) {
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const attempts = `${avg(row.attempts).toFixed(2)}/${Math.max(...row.attempts, 0)}`
  const ms = `${avg(row.ms).toFixed(0)}/${percentile(row.ms, 0.95).toFixed(0)}/${Math.max(...row.ms, 0).toFixed(0)}`
  console.log(
    `${row.tier.padEnd(11)} ${String(row.size).padStart(4)}  ${String(row.accepted).padStart(4)}/${samples} (${((row.accepted / samples) * 100).toFixed(1).padStart(5)}%) ${String(row.fallbacks).padStart(8)}  ${attempts.padStart(17)}  ${ms.padStart(20)}`,
  )
  for (const [reason, count] of row.reasons) {
    console.log(`    fallback reason (${count}x): ${reason}`)
  }
  for (const failure of row.failures) console.log(`    fallback seed: ${failure}`)
}

const totalFallbacks = rows.reduce((sum, row) => sum + row.fallbacks, 0)
const totalSamples = rows.reduce((sum, row) => sum + samples, 0)
console.log(`\nRequested-tier acceptance per generation call: ${totalSamples - totalFallbacks}/${totalSamples} (${(((totalSamples - totalFallbacks) / totalSamples) * 100).toFixed(1)}%)`)
