import { generateLevel } from '../src/game/levelGenerator'

const seed = 1643038893
for (const timeBudgetMs of [1500, 2500, 4000]) {
  const started = performance.now()
  const { level, report } = generateLevel({ size: 11, difficulty: 'extra-hard', seed, timeBudgetMs, maxAttempts: 400 })
  const reasonCounts = new Map<string, number>()
  for (const attempt of report.attempts) {
    const reason = attempt.reason ?? 'accepted'
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
  }
  console.log(JSON.stringify({
    budget: timeBudgetMs,
    accepted: report.accepted,
    reportedMs: report.totalMs.toFixed(0),
    wallMs: (performance.now() - started).toFixed(0),
    attempts: report.attempts.length,
    actualRounds: (await import('../src/game/humanSolver')).solveByLogic(level.cells).advancedRounds,
    reasons: [...reasonCounts.entries()],
  }))
}
