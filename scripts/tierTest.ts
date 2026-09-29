// Tier test (recreated): acceptance, freebies, labels per tier per size.
import { generateLevel, mulberry32 } from '../src/game/levelGenerator'
import { solveByLogic } from '../src/game/humanSolver'

const TIERS = ['easy', 'medium', 'hard', 'extra-hard'] as const
for (const size of [5, 7, 9, 11]) {
  for (const tier of TIERS) {
    let accepted = 0
    let solvable = 0
    let freebies = 0
    let worst = 0
    const labels = new Set<string>()
    for (let i = 0; i < 6; i++) {
      const { level, report } = generateLevel({
        size,
        difficulty: tier,
        seed: Math.floor(mulberry32(size * 3000 + i * 11)() * 2 ** 31),
      })
      const logic = solveByLogic(level.cells)
      if (logic.solved) solvable++
      if (report.accepted) accepted++
      worst = Math.max(worst, report.totalMs)
      const counts = new Map<number, number>()
      for (const row of level.cells)
        for (const c of row) counts.set(c.region, (counts.get(c.region) ?? 0) + 1)
      freebies += [...counts.values()].filter((n) => n === 1).length
      labels.add(level.difficulty)
    }
    console.log(
      `${size}x${size} ${tier.padEnd(10)} accepted ${accepted}/6, solvable ${solvable}/6, ` +
        `avg freebies ${(freebies / 6).toFixed(1)}, avg label ${[...labels].join(',')}, max ${worst.toFixed(0)}ms`,
    )
  }
}
