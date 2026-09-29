import type { Difficulty } from '../game/types'
import { HeartIcon, LightbulbIcon, SettingsIcon, SmileIcon } from './Icons'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'extra-hard']

type Props = {
  difficulty: Difficulty
  completed: number
  catsFound: number
  catTotal: number
  hearts: number
  maxHearts: number
  onDifficultyChange: (difficulty: Difficulty) => void
  onReset: () => void
  resetDisabled: boolean
  onOpenSettings: () => void
  temporaryMarkCount: number
  onClearTemporaryMarks: () => void
  onUndo: () => void
  undoDisabled: boolean
  undoHidden?: boolean
  onHint: () => void
  hintDisabled: boolean
}

export function Controls({
  difficulty, completed, catsFound, catTotal, hearts, maxHearts,
  onDifficultyChange, onReset, resetDisabled, onOpenSettings,
  temporaryMarkCount, onClearTemporaryMarks, onUndo, undoDisabled, undoHidden = false, onHint, hintDisabled,
}: Props) {
  return (
    <div className="controls">
      <div className="controls__group controls__group--difficulty">
        <label className="sr-only" htmlFor="difficulty">Difficulty</label>
        <div className={`difficulty-select difficulty-select--${difficulty}`}>
          <select
            id="difficulty"
            className="select select--difficulty"
            style={{ width: `calc(${difficulty.replace('-', ' ').length}ch + 96px)` }}
            value={difficulty}
            onChange={(event) => onDifficultyChange(event.target.value as Difficulty)}
            aria-label="Difficulty"
          >
            {DIFFICULTIES.map((tier) => <option key={tier} value={tier}>{tier.replace('-', ' ')}</option>)}
          </select>
          <svg className="difficulty-select__arrow" viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5" /></svg>
        </div>
        <span className="controls__completed">{completed} completed</span>
      </div>

      <div className="controls__group controls__group--status" aria-label="Current puzzle status">
        <span className="controls__stat"><SmileIcon className="controls__face-icon" /><strong>{catsFound}/{catTotal}</strong></span>
        <span className="controls__stat controls__stat--hearts" role="img" aria-label={`${hearts} of ${maxHearts} hearts`}>
          {Array.from({ length: maxHearts }, (_, index) => <HeartIcon className={index < hearts ? 'heart-icon' : 'heart-icon heart--lost'} filled={index < hearts} key={index} />)}
        </span>
      </div>

      <div className="controls__group controls__group--buttons">
        {!undoHidden && <button className="circle-btn circle-btn--small" onClick={onUndo} disabled={undoDisabled} aria-label="Undo" title="Undo">↶</button>}
        <button className="circle-btn circle-btn--small" onClick={onHint} disabled={hintDisabled} aria-label="Hint" title="Hint"><LightbulbIcon className="controls__action-icon" /></button>
        <button className="circle-btn circle-btn--small" onClick={onReset} disabled={resetDisabled} aria-label="Restart this puzzle" title="Restart this puzzle">⟲</button>
        <button className="circle-btn circle-btn--small" onClick={onOpenSettings} aria-label="Settings and progress" title="Settings and progress"><SettingsIcon className="controls__action-icon" /></button>
        {temporaryMarkCount > 0 && <button className="btn" onClick={onClearTemporaryMarks}>Clear temp ({temporaryMarkCount})</button>}
      </div>
    </div>
  )
}
