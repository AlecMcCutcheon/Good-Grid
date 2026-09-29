import type { Difficulty } from '../game/types'
import type { Violations } from '../game/rules'

type Props = {
  size: number
  placed: number
  difficulty: Difficulty
  win: boolean
  violations: Violations
}

function RuleRow({
  ok,
  children,
}: {
  ok: boolean
  children: React.ReactNode
}) {
  return (
    <li className={`rule${ok ? ' rule--ok' : ' rule--bad'}`}>
      <span className="rule__icon">{ok ? '✓' : '✗'}</span>
      <span>{children}</span>
    </li>
  )
}

export function RulesPanel({
  size,
  placed,
  difficulty,
  win,
  violations,
}: Props) {
  const rowsClear = violations.row.length === 0
  const colsClear = violations.col.length === 0
  const regionsClear = violations.region.length === 0
  const adjacencyClear = violations.touching.length === 0

  return (
    <div className="rules-panel">
      <div className="rules-panel__header">
        <span className="rules-panel__counter">
          Smiles: {placed} / {size}
        </span>
        <span className={`badge badge--${difficulty}`}>{difficulty}</span>
      </div>

      {win && <div className="win-banner">🎉 Solved! All rules satisfied.</div>}

      <ul className="rules-panel__list">
        <RuleRow ok={rowsClear}>
          1 per row{!rowsClear && ` (conflict in row ${violations.row.map((r) => r + 1).join(', ')})`}
        </RuleRow>
        <RuleRow ok={colsClear}>
          1 per column
          {!colsClear && ` (conflict in col ${violations.col.map((c) => c + 1).join(', ')})`}
        </RuleRow>
        <RuleRow ok={regionsClear}>
          1 per region
          {!regionsClear && ` (conflict in region ${violations.region.map((r) => r + 1).join(', ')})`}
        </RuleRow>
        <RuleRow ok={adjacencyClear}>Smiles cannot touch</RuleRow>
      </ul>
    </div>
  )
}
