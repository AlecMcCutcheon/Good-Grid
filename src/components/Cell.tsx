import type { CSSProperties } from 'react'
import type { Cell as CellModel } from '../game/types'
import { FrownIcon, SmileIcon, TemporarySmileIcon, XMarkIcon } from './Icons'

export type CellState = 'empty' | 'x' | 'miss' | 'cat'

type Props = {
  cell: CellModel
  state: CellState
  temporary: boolean
  temporaryCat: boolean
  temporaryCatMark: boolean
  temporaryCatMarkReveal: boolean
  temporaryCatReveal: boolean
  temporaryCatConflict: boolean
  previewX: boolean
  hintPreviewX: boolean
  walkthroughPreviewX: boolean
  dragPreview: 'mark' | 'temporary' | 'erase-mark' | 'erase-temporary' | null
  demoCat: boolean
  focused: boolean
  lineFocused: boolean
  hintPlacement: boolean
  hinted: boolean
  showRegionId: boolean
  revealIndex: number
  revealTotal: number
  transitionDelay: number | null
  activeReveal: boolean
  activeWaveMark: boolean
  revealStyle: CSSProperties | undefined
  colors: { fill: string; border: string; text: string }
  onSingleClick: () => void
  onDoubleClick: () => void
}

/** Batch reveals share one constant total duration so a huge drag animates
 * at the same overall pace as a two-cell one; each item just starts later. */
export const REVEAL_TOTAL_MS = 420
export const AUTO_FILL_REVEAL_TOTAL_MS = 280

export function revealStepDelayMs(total: number): number {
  return total > 1 ? REVEAL_TOTAL_MS / (total - 1) : 0
}

export function autoFillRevealStepDelayMs(total: number): number {
  return total > 1 ? AUTO_FILL_REVEAL_TOTAL_MS / (total - 1) : 0
}

export function revealPositionDelayMs(index: number, total: number): number {
  return total > 1 ? Math.round((index - 1) * revealStepDelayMs(total)) : 0
}

export function Cell({
  cell,
  state,
  temporary,
  temporaryCat,
  temporaryCatMark,
  temporaryCatMarkReveal,
  temporaryCatReveal,
  temporaryCatConflict,
  previewX,
  hintPreviewX,
  walkthroughPreviewX,
  dragPreview,
  demoCat,
  focused,
  lineFocused,
  hintPlacement,
  hinted,
  showRegionId,
  revealIndex,
  revealTotal,
  transitionDelay,
  activeReveal,
  activeWaveMark,
  revealStyle,
  colors,
  onSingleClick,
  onDoubleClick,
}: Props) {

  const classes = [
    'cell',
    `cell--${state}`,
    (temporary || temporaryCatMark) && state === 'empty' ? 'cell--temporary' : '',
    temporaryCat ? 'cell--temporary-cat' : '',
    temporaryCatReveal ? 'cell--temporary-cat-reveal' : '',
    temporaryCatConflict ? 'cell--temporary-cat-conflict' : '',
    previewX ? 'cell--preview-x' : '',
    hintPreviewX ? 'cell--hint-preview-x' : '',
    walkthroughPreviewX ? 'cell--walkthrough-preview-x' : '',
    dragPreview ? `cell--drag-preview cell--drag-preview--${dragPreview}` : '',
    demoCat && state !== 'cat' ? 'cell--demo-cat' : '',
    focused ? 'cell--logic-focus' : '',
    lineFocused ? 'cell--line-focus' : '',
    hintPlacement ? 'cell--hint-placement' : '',
    hinted ? 'cell--hinted' : '',
  ].filter(Boolean).join(' ')

  const cellDescription = state === 'cat'
    ? 'found smile'
    : state === 'miss'
      ? 'incorrect guess'
      : state === 'x'
        ? 'marked empty'
        : temporaryCatConflict
          ? 'temporary smile conflicts with a found smile'
          : temporaryCat
            ? 'temporary smile preview'
            : temporary || temporaryCatMark
              ? 'temporary note'
              : 'empty'

  // Sequential reveal timing: spread the short pop across the batch.
  const popDelay = revealPositionDelayMs(revealIndex, revealTotal)
  const revealAnimationStyle = {
    '--pop-delay': `${popDelay}ms`,
  } as CSSProperties
  const activeRevealStyle = activeReveal ? revealStyle : undefined
  const transitionStyle = transitionDelay === null
    ? undefined
    : { '--transition-delay': `${transitionDelay}ms` } as CSSProperties
  const revealX = revealIndex > 0
  const glyphClass = revealX || activeReveal || activeWaveMark ? 'cell__glyph--pop' : ''
  const glyphState = activeWaveMark ? 'x' : state
  const waveAnimationStyle = activeWaveMark ? activeRevealStyle : undefined
  const previewRevealClass = revealX || activeReveal ? ' cell__preview-glyph--reveal' : ''

  return (
    <button
      type="button"
      className={`${classes}${transitionDelay === null ? '' : ' cell--level-transition'}`}
      data-row={cell.row}
      data-col={cell.col}
      style={{ background: colors.fill, ...transitionStyle }}
      onClick={(event) => {
        if (!event.shiftKey && event.button === 0 && event.detail !== 2) onSingleClick()
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        if (event.shiftKey) return
        onDoubleClick()
      }}
      aria-label={`row ${cell.row + 1} col ${cell.col + 1} region ${cell.region + 1} ${cellDescription}`}
    >
      {temporaryCat && state !== 'cat' && (
        <TemporarySmileIcon
          className={`cell__temporary-cat-glyph${temporaryCatReveal ? ' cell__preview-glyph--reveal' : ''}`}
          style={temporaryCatReveal ? revealStyle : undefined}
        />
      )}
      {(state !== 'empty' || activeWaveMark) && (
        <span
          className={`cell__glyph cell__glyph--${glyphState} ${glyphClass}`}
          style={waveAnimationStyle ?? (revealX ? revealAnimationStyle : activeRevealStyle)}
        >
          {state === 'cat'
            ? <SmileIcon className="cell__cat-icon" />
            : state === 'miss'
              ? <FrownIcon className="cell__miss-icon" />
              : <XMarkIcon className="cell__x-icon" /> }
        </span>
      )}
      {(temporary || temporaryCatMark) && state === 'empty' && !temporaryCat && (
        <XMarkIcon
          className={`cell__temporary-glyph${temporaryCatMarkReveal ? ' cell__preview-glyph--reveal' : ''}`}
          style={temporaryCatMarkReveal ? { '--pop-delay': '0ms' } as CSSProperties : activeReveal ? activeRevealStyle : undefined}
        />
      )}
      {previewX && state !== 'x' && state !== 'cat' && state !== 'miss' && (
        <XMarkIcon className={`cell__preview-glyph${previewRevealClass}`} />
      )}
      {demoCat && state !== 'cat' && <SmileIcon className="cell__demo-glyph" />}
      {showRegionId && <span className="cell__region-id">{cell.region}</span>}
    </button>
  )
}
