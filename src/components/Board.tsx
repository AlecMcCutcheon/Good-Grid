import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Board as BoardModel, Position, RegionPalette } from '../game/types'
import { buildRegionColors } from '../game/palettes'
import { getAutoFilledPositions } from '../game/rules'
import { Cell, REVEAL_TOTAL_MS, type CellState } from './Cell'
import type { CSSProperties } from 'react'
import type { HintStep } from '../game/hints'
import type { WalkthroughStep } from '../game/walkthrough'
import { chooseMarkDragAxis, getMarkDragLine, getRegionPositions, type MarkDragAxis } from '../game/markDrag'

type RevealWave = { origin: Position; positions: Position[]; nonce: number }

type Props = {
  board: BoardModel
  cats: Position[]
  marks: Set<string>
  revealWave?: RevealWave | null
  temporaryMarks: Set<string>
  temporaryCats: Set<string>
  misses: Set<string>
  hint: HintStep | null
  visibleHintEliminate: Position[]
  hintRevealComplete: boolean
  walkthroughReady: boolean
  walkthroughStep: WalkthroughStep | null
  walkthroughIndex: number | null
  walkthroughCount: number
  palette: RegionPalette
  showRegionIds: boolean
  win: boolean
  onSingleClick: (row: number, col: number) => void
  onDoubleClick: (row: number, col: number) => void
  onTemporaryClick: (row: number, col: number) => void
  onTemporaryCatClick: (row: number, col: number) => void
  onMarkDrag: (positions: Position[], temporary: boolean, erase: boolean) => void
  onApplyHint: () => void
  onDismissHint: () => void
  onNextWalkthrough: () => void
  onPreviousWalkthrough: () => void
  onCloseWalkthrough: () => void
}

const key = (row: number, col: number) => `${row},${col}`
const includesPosition = (items: Position[], row: number, col: number) =>
  items.some((p) => p.row === row && p.col === col)

/** One-based sequential reveal indices for a batch of positions (order they
 * should appear, e.g. along a drag). Cells absent from the batch get 0. */
function buildRevealOrder(positions: Position[]): Map<string, number> {
  const order = new Map<string, number>()
  positions.forEach((pos, index) => order.set(key(pos.row, pos.col), index + 1))
  return order
}

/** Stroke origin for a two-stroke X based on drag direction. The first
 * stroke always runs from the corner closest to where selection began. */
function strokeOriginFor(start: Position, pos: Position): string {
  const verticalFirst = Math.abs(pos.row - start.row) >= Math.abs(pos.col - start.col)
  if (verticalFirst) {
    return pos.row < start.row ? 'top' : 'bottom'
  }
  return pos.col < start.col ? 'left' : 'right'
}

/** Style driving the stroke draw direction of an X in a given cell. */
function xDrawStyle(origin: string, delayMs: number): CSSProperties {
  const map: Record<string, [string, string]> = {
    top: ['var(--from-top, 1)', 'var(--from-top, 1)'],
    bottom: ['var(--from-bottom, 1)', 'var(--from-bottom, 1)'],
    left: ['var(--from-left, 1)', 'var(--from-left, 1)'],
    right: ['var(--from-right, 1)', 'var(--from-right, 1)'],
  }
  const [first, second] = map[origin] ?? map.right
  return {
    '--draw-1': first,
    '--draw-2': second,
    '--stroke-delay': `${delayMs}ms`,
  } as CSSProperties
}

export function Board({
  board, cats, marks, revealWave, temporaryMarks, temporaryCats, misses, hint, visibleHintEliminate,
  hintRevealComplete, walkthroughReady, walkthroughStep, walkthroughIndex, walkthroughCount, palette, showRegionIds, win,
  onSingleClick, onDoubleClick, onTemporaryClick, onTemporaryCatClick, onMarkDrag, onApplyHint, onDismissHint,
  onNextWalkthrough, onPreviousWalkthrough, onCloseWalkthrough,
}: Props) {
  const size = board.length
  const catSet = new Set(cats.map((c) => key(c.row, c.col)))
  const placedCats = cats
  const colors = buildRegionColors(palette, size)
  const overlayCats = walkthroughStep?.visibleCats ?? []
  const exampleXSet = new Set((walkthroughStep?.visibleXs ?? []).map((p) => key(p.row, p.col)))
  const temporaryCatXSet = new Set<string>()
  for (const catKey of temporaryCats) {
    const [row, col] = catKey.split(',').map(Number)
    for (const pos of getAutoFilledPositions(board, { row, col })) {
      temporaryCatXSet.add(key(pos.row, pos.col))
    }
  }
  const focusSet = walkthroughStep?.focus ?? hint?.focus ?? []
  // Walkthrough eliminations are already staged in visibleXs. Never render
  // the full step.eliminate list directly or it bypasses the reveal sequence.
  const visibleEliminateSet = walkthroughStep ? [] : visibleHintEliminate
  const placement = walkthroughStep?.placement ?? hint?.placement
  const focusRow = walkthroughStep?.focusRow ?? hint?.focusRow
  const focusColumn = walkthroughStep?.focusColumn ?? hint?.focusColumn
  const isWalkthrough = walkthroughStep !== null
  const [dragPreview, setDragPreview] = useState<Position[]>([])
  const [lastCommittedDrag, setLastCommittedDrag] = useState<Position[] | null>(null)
  const dragStartRef = useRef<Position | null>(null)
  const message = walkthroughStep?.message ?? hint?.message
  const title = walkthroughStep?.title ?? hint?.title
  const hintRevealOrder = buildRevealOrder(visibleHintEliminate)
  const hintRevealTotal = visibleEliminateSet.length || 1
  const walkthroughRevealOrder = buildRevealOrder(walkthroughStep?.visibleXs ?? [])
  const walkthroughRevealTotal = (walkthroughStep?.visibleXs.length ?? 0) || 1
  const dragRevealOrder = buildRevealOrder(lastCommittedDrag ?? [])
  const dragRevealTotal = (lastCommittedDrag?.length ?? 0) || 1
  const waveRevealOrder = buildRevealOrder(revealWave?.positions ?? [])
  const waveRevealTotal = (revealWave?.positions.length ?? 0) || 1
  const waveOrigin = revealWave?.origin ?? null

  /** Reveal index for a cell: drag batches, hint/walkthrough staging, then
   * auto-fill waves take priority in that order. */
  const revealIndexFor = (k: string) => {
    if (dragRevealOrder.has(k)) return dragRevealOrder.get(k) ?? 0
    if (isWalkthrough) return walkthroughRevealOrder.get(k) ?? 0
    if (hint) return hintRevealOrder.get(k) ?? 0
    if (waveRevealOrder.has(k)) return waveRevealOrder.get(k) ?? 0
    return 0
  }
  const revealTotalFor = (k: string) => {
    if (dragRevealOrder.has(k)) return dragRevealTotal
    if (isWalkthrough) return walkthroughRevealTotal
    if (hint) return hintRevealTotal
    if (waveRevealOrder.has(k)) return waveRevealTotal
    return 1
  }
  const boardRef = useRef<HTMLDivElement>(null)
  const suppressNextClick = useRef(false)
  const suppressNextContextMenu = useRef(false)
  const dragRef = useRef<{
    start: Position
    current: Position
    axis: MarkDragAxis | null
    temporary: boolean
    regionMode: boolean
    erase: boolean
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  const positionFromTarget = (target: EventTarget | null): Position | null => {
    if (!(target instanceof Element)) return null
    const cellElement = target.closest<HTMLElement>('.cell')
    if (!cellElement || !boardRef.current?.contains(cellElement)) return null
    const row = Number(cellElement.dataset.row)
    const col = Number(cellElement.dataset.col)
    return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
  }

  useEffect(() => {
    const moveDrag = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.regionMode || event.pointerId !== drag.pointerId) return
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 18) return
      const current = positionFromTarget(document.elementFromPoint(event.clientX, event.clientY))
      if (!current) return
      const axis = drag.axis ?? chooseMarkDragAxis(drag.start, current)
      if (!axis) return
      if (!drag.moved) {
        drag.moved = true
        if (!drag.temporary) suppressNextClick.current = true
        if (drag.temporary) suppressNextContextMenu.current = true
      }
      if (current.row === drag.current.row && current.col === drag.current.col && axis === drag.axis) return
      drag.axis = axis
      drag.current = current
      setDragPreview(axis ? getMarkDragLine(drag.start, current, axis) : [drag.start])
    }
    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      const pointerUpCell = positionFromTarget(document.elementFromPoint(event.clientX, event.clientY))
      if (!drag.regionMode && drag.moved && pointerUpCell) {
        const axis = drag.axis ?? chooseMarkDragAxis(drag.start, pointerUpCell)
        if (axis) {
          drag.axis = axis
          drag.current = pointerUpCell
        }
      }
      dragRef.current = null
      setDragPreview([])
      if (drag.regionMode) suppressNextClick.current = false
      if (!drag.regionMode && !drag.moved) return
      if (!drag.regionMode && !drag.axis) return
      if (drag.regionMode) {
        dragStartRef.current = drag.start
        setLastCommittedDrag(getRegionPositions(board, drag.start))
        onMarkDrag(getRegionPositions(board, drag.start), drag.temporary, drag.erase)
      } else if (drag.axis) {
        const line = getMarkDragLine(drag.start, drag.current, drag.axis)
        dragStartRef.current = drag.start
        setLastCommittedDrag(line)
        onMarkDrag(line, drag.temporary, drag.erase)
      }
    }
    const cancelDrag = (event: PointerEvent) => {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return
      dragRef.current = null
      suppressNextClick.current = false
      suppressNextContextMenu.current = false
      setDragPreview([])
    }
    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', cancelDrag)
    return () => {
      window.removeEventListener('pointermove', moveDrag)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', cancelDrag)
    }
  }, [board, onMarkDrag])

  const handleBoardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) return
    const start = positionFromTarget(event.target)
    if (!start) return
    const temporary = event.button === 2
    const erase = temporary ? temporaryMarks.has(key(start.row, start.col)) : marks.has(key(start.row, start.col))
    dragRef.current = {
      start,
      current: start,
      axis: null,
      temporary,
      erase,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      regionMode: event.shiftKey,
      moved: false,
    }
    if (event.shiftKey) {
      if (!temporary) suppressNextClick.current = true
      const regionPositions = getRegionPositions(board, start)
      setDragPreview(regionPositions)
    } else {
      setDragPreview([])
    }
  }

  return (
    <div className="board-stage">
      <div
        className={`board${win ? ' board--win' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
          ['--n' as string]: size,
        }}
        ref={boardRef}
        role="grid"
        aria-label={`${size} by ${size} Petdoku board`}
        onPointerDown={handleBoardPointerDown}
        onClickCapture={(event) => {
          if (!suppressNextClick.current) return
          suppressNextClick.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
        onContextMenuCapture={(event) => {
          if (suppressNextContextMenu.current) {
            suppressNextContextMenu.current = false
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onContextMenu={(event) => {
          if (event.shiftKey) event.preventDefault()
        }}
      >
        {board.map((rowCells, row) => rowCells.map((cell, col) => {
          const k = key(row, col)
          const isCat = catSet.has(k)
          const state: CellState = isCat ? 'cat' : misses.has(k) ? 'miss' : marks.has(k) ? 'x' : 'empty'
          const temp = !isCat && state === 'empty' && temporaryMarks.has(k)
          const previewX = exampleXSet.has(k) && !marks.has(k) && !isCat
          const demoCat = includesPosition(overlayCats, row, col) && !isCat
          const temporaryCat = temporaryCats.has(k) && !isCat
          const temporaryCatPosition = temporaryCat ? { row, col } : null
          const temporaryCatConflict = temporaryCatPosition !== null && placedCats.some((cat) =>
            cat.row === row || cat.col === col ||
            board[cat.row][cat.col].region === cell.region ||
            (Math.abs(cat.row - row) <= 1 && Math.abs(cat.col - col) <= 1),
          )
          const temporaryCatMark = temporaryCatXSet.has(k) && state === 'empty'
          const focused = includesPosition(focusSet, row, col)
          const hintPlacement = placement?.row === row && placement.col === col
          const isDragPreview = dragPreview.some((pos) => pos.row === row && pos.col === col)
          const dragMode = dragRef.current
          const dragPreviewType = isDragPreview && dragMode
            ? dragMode.erase
              ? dragMode.temporary ? 'erase-temporary' : 'erase-mark'
              : dragMode.temporary ? 'temporary' : 'mark'
            : null

          // Sequential reveal state: hint previews, walkthrough staging, and
          // just-committed drags each animate along their selection order.
          const inDragBatch = dragRevealOrder.has(k)
          const revealIndex = revealIndexFor(k)
          const revealTotal = revealTotalFor(k)
          const strokeOrigin = inDragBatch && lastCommittedDrag && dragStartRef.current
            ? strokeOriginFor(dragStartRef.current, { row, col })
            : waveOrigin && waveRevealOrder.has(k)
              ? strokeOriginFor(waveOrigin, { row, col })
              : 'right'
          const stepMs = Math.max(60, Math.round(REVEAL_TOTAL_MS / Math.max(1, revealTotal)))
          const xDrawVars = inDragBatch || (waveOrigin && waveRevealOrder.has(k))
            ? xDrawStyle(strokeOrigin, (revealIndex - 1) * stepMs)
            : undefined

          return (
            <Cell
              key={k}
              cell={cell}
              state={state}
              temporary={temp}
              temporaryCat={temporaryCat}
              temporaryCatMark={temporaryCatMark}
              temporaryCatConflict={temporaryCatConflict}
              previewX={previewX || includesPosition(visibleEliminateSet, row, col)}
              hintPreviewX={!isWalkthrough && includesPosition(visibleEliminateSet, row, col)}
              walkthroughPreviewX={isWalkthrough && previewX}
              dragPreview={dragPreviewType}
              demoCat={demoCat}
              focused={focused}
              lineFocused={false}
              hintPlacement={!!hintPlacement}
              hinted={hint?.wrongMark?.row === row && hint.wrongMark.col === col}
              showRegionId={showRegionIds}
              revealIndex={revealIndex}
              revealTotal={revealTotal}
              xDrawVars={xDrawVars}
              colors={{
                fill: colors.fills[cell.region % colors.fills.length],
                border: colors.borders[cell.region % colors.borders.length],
                text: colors.textOn[cell.region % colors.textOn.length],
              }}
              onSingleClick={() => onSingleClick(row, col)}
              onDoubleClick={() => onDoubleClick(row, col)}
              onTemporaryClick={() => onTemporaryClick(row, col)}
              onTemporaryCatClick={() => onTemporaryCatClick(row, col)}
            />
          )
        }))}
        {(focusRow != null || focusColumn != null) && (
          <div
            className="board__logic-overlay"
            aria-hidden="true"
          >
            {focusRow != null && (
              <div
                className="board__logic-line board__logic-line--row"
                data-focus-row={focusRow}
                style={{ gridRow: focusRow + 1, gridColumn: '1 / -1' }}
              />
            )}
            {focusColumn != null && (
              <div
                className="board__logic-line board__logic-line--column"
                data-focus-column={focusColumn}
                style={{ gridColumn: `${focusColumn + 1} / ${focusColumn + 2}`, gridRow: '1 / -1' }}
              />
            )}
          </div>
        )}
      </div>

      {(hint || walkthroughStep) && (
        <section className={`logic-callout${isWalkthrough ? ' logic-callout--walkthrough' : ''}`} role="status" aria-live="polite">
          <div className="logic-callout__copy">
            <strong>{isWalkthrough ? `Solution walkthrough · step ${(walkthroughIndex ?? 0) + 1} of ${walkthroughCount}` : title}</strong>
            <p>{message}</p>
            {hint?.kind === 'contradiction' && (
              <ul className="logic-callout__marks">
                {hint.focus.map((pos) => <li key={key(pos.row, pos.col)}>({pos.row + 1}, {pos.col + 1})</li>)}
              </ul>
            )}
          </div>
          <div className="logic-callout__actions">
            {hint && hint.kind !== 'placement' && hint.kind !== 'contradiction' && (
              <button className="btn btn--primary" onClick={onApplyHint} disabled={!hintRevealComplete}>
                {hint.kind === 'wrong-mark' ? 'Remove this X' : `Apply ${hint.eliminate.length} X${hint.eliminate.length === 1 ? '' : 's'}`}
              </button>
            )}
            {hint && hint.kind !== 'placement' && <button className="btn" onClick={onDismissHint}>Close</button>}
            {hint?.kind === 'placement' && <button className="btn" onClick={onDismissHint}>Got it</button>}
            {hint?.kind === 'contradiction' && <button className="btn" onClick={onDismissHint}>Got it</button>}
            {isWalkthrough && <>
              <button className="btn" onClick={onPreviousWalkthrough} disabled={walkthroughIndex === 0}>← Previous</button>
              <button className="btn btn--primary" onClick={onNextWalkthrough} disabled={!walkthroughReady || walkthroughIndex === walkthroughCount - 1}>Next deduction →</button>
              <button className="btn" onClick={onCloseWalkthrough}>Close</button>
            </>}
          </div>
        </section>
      )}
    </div>
  )
}
