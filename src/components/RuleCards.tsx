// Three grayscale rule-explainer diagrams using the same marks as the board.
import { SmileIcon, XMarkIcon } from './Icons'

function Mini({
  cells,
}: {
  /** 9 entries: null = unmarked cell, region = part of a highlighted region. */
  cells: (null | { region?: boolean; mark?: 'x' | 'cat' })[]
}) {
  return (
    <div className="mini" aria-hidden="true">
      {cells.map((cell, i) => (
        <div
          key={i}
          className={`mini__cell${cell?.region ? ' mini__cell--region' : ''}`}
        >
          {cell?.mark === 'x' && <XMarkIcon className="mini__x" />}
          {cell?.mark === 'cat' && <SmileIcon className="mini__cat" />}
        </div>
      ))}
    </div>
  )
}

export function RuleCards() {
  return (
    <div className="rule-cards">
      <div className="rule-card">
        <Mini
          cells={[
            { region: true, mark: 'x' }, { region: true, mark: 'x' }, null,
            { region: true, mark: 'x' }, { region: true, mark: 'cat' }, null,
            null, null, null,
          ]}
        />
        <span>1 smile per color region</span>
      </div>
      <div className="rule-card">
        <Mini
          cells={[
            null, { mark: 'x' }, null,
            { mark: 'x' }, { mark: 'cat' }, { mark: 'x' },
            null, { mark: 'x' }, null,
          ]}
        />
        <span>1 smile per row and column</span>
      </div>
      <div className="rule-card">
        <Mini
          cells={[
            { mark: 'x' }, { mark: 'x' }, { mark: 'x' },
            { mark: 'x' }, { mark: 'cat' }, { mark: 'x' },
            { mark: 'x' }, { mark: 'x' }, { mark: 'x' },
          ]}
        />
        <span>Smiles cannot touch</span>
      </div>
    </div>
  )
}
