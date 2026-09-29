import type { GenerationReport, Level } from '../game/types'
import { solveByLogic } from '../game/humanSolver'
import { buildWalkthrough } from '../game/walkthrough'

type Props = {
  level: Level | null
  report: GenerationReport | null
  showSolution: boolean
  onToggleSolution: () => void
  solverNote: string
}

export function DevPanel({ level, report, showSolution, onToggleSolution, solverNote }: Props) {
  if (!level) return null
  const regionCounts = new Map<number, number>()
  for (const row of level.cells) for (const cell of row) {
    regionCounts.set(cell.region, (regionCounts.get(cell.region) ?? 0) + 1)
  }
  const logic = solveByLogic(level.cells)
  const walkthrough = buildWalkthrough(level.cells)

  return (
    <aside className="dev-panel">
      <h2>Dev panel</h2>
      <section>
        <h3>Generation</h3>
        <p>Attempts: {report?.attempts.length ?? 0} · Total: {report ? report.totalMs.toFixed(1) : '–'} ms · {report?.accepted ? 'accepted' : 'best effort'}</p>
        <ul className="dev-panel__attempts">
          {report?.attempts.slice(-8).map((attempt) => <li key={attempt.index} className={attempt.ok ? 'attempt attempt--ok' : 'attempt attempt--fail'}>#{attempt.index} {attempt.ok ? '✓' : `✗ ${attempt.reason}`} ({attempt.ms.toFixed(1)}ms)</li>)}
        </ul>
      </section>
      <section>
        <h3>Regions</h3>
        <p>{regionCounts.size} regions · sizes {[...regionCounts.entries()].sort((a, b) => a[0] - b[0]).map(([id, count]) => `R${id}:${count}`).join('  ')}</p>
      </section>
      <section>
        <h3>Difficulty metric</h3>
        <p>{logic.advancedRounds} advanced deduction passes · {logic.eliminations.filter((e) => !e.technique.startsWith('last-spot-')).length} candidate eliminations · {logic.placements.length}/{level.size} logical placements</p>
      </section>
      <section>
        <h3>Solution demonstration</h3>
        <label className="toggle"><input type="checkbox" checked={showSolution} onChange={onToggleSolution} /><span>Show logical walkthrough</span></label>
        <p>Replays {walkthrough.length} explainable deductions one at a time. Does not place faces in the real game.</p>
      </section>
      <section><h3>Solver</h3><p>{solverNote}</p></section>
    </aside>
  )
}
