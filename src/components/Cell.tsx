import { useRef } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import type { Cell as CellModel } from '../game/types'
import { FrownIcon, SmileIcon, TemporarySmileIcon, XMarkIcon } from './Icons'

export type CellState = 'empty' | 'x' | 'miss' | 'cat'

type Props = {
  cell: CellModel
  state: CellState
  temporary: boolean
  temporaryCat: boolean
  temporaryCatMark: boolean
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
  xDrawVars?: CSSProperties
  colors: { fill: string; border: string; text: string }
  onSingleClick: () => void
  onDoubleClick: () => void
  onTemporaryClick: () => void
  onTemporaryCatClick: () => void
}

/** Batch reveals share one constant total duration so a huge drag animates
 * at the same overall pace as a two-cell one; each item just starts later. */
export const REVEAL_TOTAL_MS = 420

export function Cell({
  cell,
  state,
  temporary,
  temporaryCat,
  temporaryCatMark,
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
  xDrawVars,
  colors,
  onSingleClick,
  onDoubleClick,
  onTemporaryClick,
  onTemporaryCatClick,
}: Props) {
  const lastContextClick = useRef(0)

  const handleContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (event.shiftKey) return
    const now = Date.now()
    if (now - lastContextClick.current < 450) {
      lastContextClick.current = 0
      onTemporaryCatClick()
      return
    }
    lastContextClick.current = now
    onTemporaryClick()
  }

  const classes = [
    'cell',
    `cell--${state}`,
    (temporary || temporaryCatMark) && state === 'empty' ? 'cell--temporary' : '',
    temporaryCat ? 'cell--temporary-cat' : '',
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

  // Sequential reveal timing: scaled so N items draw over REVEAL_TOTAL_MS total.
  const delay = revealTotal > 1
    ? Math.round((revealIndex * REVEAL_TOTAL_MS) / revealTotal)
    : 0
  const popStep = Math.max(80, Math.round(REVEAL_TOTAL_MS / Math.max(1, revealTotal)))
  const revealStyle = {
    '--reveal-delay': `${delay}ms`,
    '--pop-delay': `${revealIndex * popStep}ms`,
    ...xDrawVars,
  } as CSSProperties

  return (
    <button
      type="button"
      className={classes}
      data-row={cell.row}
      data-col={cell.col}
      style={{ background: colors.fill }}
      onClick={(event) => {
        if (!event.shiftKey && event.button === 0 && event.detail !== 2) onSingleClick()
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        if (event.shiftKey) return
        onDoubleClick()
      }}
      onContextMenu={handleContextMenu}
      aria-label={`row ${cell.row + 1} col ${cell.col + 1} region ${cell.region + 1} ${cellDescription}`}
    >
      {temporaryCat && state !== 'cat' && <TemporarySmileIcon className="cell__temporary-cat-glyph" />}
      {state !== 'empty' && (
        <span
          className={`cell__glyph cell__glyph--${state} cell__glyph--pop`}
          style={revealStyle}
        >
          {state === 'cat'
            ? <SmileIcon className="cell__cat-icon" />
            : state === 'miss'
              ? <FrownIcon className="cell__miss-icon" />
              : <XMarkIcon className="cell__x-icon cell__x-icon--draw" />}
        </span>
      )}
      {(temporary || temporaryCatMark) && state === 'empty' && !temporaryCat && (
        <XMarkIcon className="cell__temporary-glyph cell__x-icon--draw" style={revealStyle} />
      )}
      {previewX && state !== 'x' && state !== 'cat' && state !== 'miss' && (
        <XMarkIcon
          className={`cell__preview-glyph${hintPreviewX || walkthroughPreviewX ? ' cell__x-icon--draw' : ''}`}
          style={revealStyle}
        />
      )}
      {demoCat && state !== 'cat' && <SmileIcon className="cell__demo-glyph" />}
      {showRegionId && <span className="cell__region-id">{cell.region}</span>}
    </button>
  )
}
