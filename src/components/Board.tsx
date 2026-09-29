import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Board as BoardModel, Position, RegionPalette } from '../game/types'
import { buildRegionColors } from '../game/palettes'
import { getAutoFilledPositions, orderPositionsRadially } from '../game/rules'
import { Cell, revealPositionDelayMs, type CellState } from './Cell'
import type { HintStep } from '../game/hints'
import type { WalkthroughStep } from '../game/walkthrough'
import { chooseMarkDragAxis, getMarkDragLine, getRegionPositions, type MarkDragAxis } from '../game/markDrag'

type RevealWave = { origin: Position; positions: Position[]; nonce: number }
type LevelTransition = { origin: Position; nonce: number }

type Props = {
  board: BoardModel
  cats: Position[]
  marks: Set<string>
  revealWave?: RevealWave | null
  temporaryCatWave?: RevealWave | null
  temporaryCatWaveIndex?: number
  levelTransition?: LevelTransition | null
  transitionNonce?: number | null
  transitionOrigin?: Position | null
  revealWaveIndex?: number
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

/** One-based sequential reveal indices for a batch of positions.
 * Cells absent from the batch get 0. */
function buildRevealOrder(positions: Position[]): Map<string, number> {
  const order = new Map<string, number>()
  positions.forEach((pos, index) => order.set(key(pos.row, pos.col), index + 1))
  return order
}

export function Board({
  board, cats, marks, revealWave, temporaryCatWave, temporaryCatWaveIndex: currentTemporaryCatWaveIndex = 0, levelTransition, transitionNonce: externalTransitionNonce, transitionOrigin: externalTransitionOrigin, revealWaveIndex = 0, temporaryMarks, temporaryCats, misses, hint, visibleHintEliminate,
  hintRevealComplete, walkthroughReady, walkthroughStep, walkthroughIndex, walkthroughCount, palette, showRegionIds, win,
  onSingleClick, onDoubleClick, onTemporaryClick, onTemporaryCatClick, onMarkDrag, onApplyHint, onDismissHint,
  onNextWalkthrough, onPreviousWalkthrough, onCloseWalkthrough,
}: Props) {
  const size = board.length
  const catSet = new Set(cats.map((c) => key(c.row, c.col)))
  const placedCats = cats
  const colors = buildRegionColors(palette, size)
  const overlayCats = walkthroughStep?.visibleCats ?? []
  const temporaryCatXSet = new Set<string>()
  for (const catKey of temporaryCats) {
    const [row, col] = catKey.split(',').map(Number)
    for (const position of getAutoFilledPositions(board, { row, col })) {
      temporaryCatXSet.add(key(position.row, position.col))
    }
  }
  const exampleXSet = new Set((walkthroughStep?.visibleXs ?? []).map((p) => key(p.row, p.col)))
  const focusSet = walkthroughStep?.focus ?? hint?.focus ?? []
  // Walkthrough eliminations are already staged in visibleXs. Never render
  // the full step.eliminate list directly or it bypasses the reveal sequence.
  const visibleEliminateSet = walkthroughStep ? [] : visibleHintEliminate
  const focusKeys = new Set(focusSet.map((pos) => key(pos.row, pos.col)))
  const eliminateKeys = new Set(visibleEliminateSet.map((pos) => key(pos.row, pos.col)))
  const placement = walkthroughStep?.placement ?? hint?.placement
  const focusRow = walkthroughStep?.focusRow ?? hint?.focusRow
  const focusColumn = walkthroughStep?.focusColumn ?? hint?.focusColumn
  const isWalkthrough = walkthroughStep !== null
  const [dragPreview, setDragPreview] = useState<Position[]>([])
  const previewKeys = new Set(dragPreview.map((pos) => key(pos.row, pos.col)))
  const message = walkthroughStep?.message ?? hint?.message
  const title = walkthroughStep?.title ?? hint?.title
  const hintRevealOrder = buildRevealOrder(hint?.eliminate ?? [])
  const walkthroughRevealOrder = buildRevealOrder(walkthroughStep?.addedXs ?? [])
  const wavePositions = revealWave ? orderPositionsRadially(revealWave.positions, revealWave.origin) : []
  const waveRevealOrder = buildRevealOrder(wavePositions)
  const waveRevealTotal = wavePositions.length || 1
  const temporaryCatWavePositions = temporaryCatWave
    ? orderPositionsRadially(temporaryCatWave.positions, temporaryCatWave.origin)
    : []
  const temporaryCatRevealOrder = buildRevealOrder(temporaryCatWavePositions)
  const activeTransitionOrigin = levelTransition?.origin ?? externalTransitionOrigin ?? null
  const transitionPositions = activeTransitionOrigin
    ? orderPositionsRadially(board.flat().map(({ row, col }) => ({ row, col })), activeTransitionOrigin)
    : []
  const transitionOrder = buildRevealOrder(transitionPositions)
  const transitionTotal = transitionPositions.length || 1
  const transitionKey = levelTransition?.nonce ?? externalTransitionNonce ?? null

  /** Reveal index for staged hints, walkthroughs, and auto-fill waves. */
  const revealIndexFor = (k: string) => {
    if (isWalkthrough) return walkthroughRevealOrder.get(k) ?? 0
    if (hint) return hintRevealOrder.get(k) ?? 0
    return waveRevealOrder.get(k) ?? 0
  }
  const revealTotalFor = () => {
    // Hints and walkthroughs reveal one item per shared step interval; their
    // staged timer supplies the delay, while each mark uses the same pop style.
    if (isWalkthrough || hint) return 1
    return waveRevealTotal
  }
  const boardRef = useRef<HTMLDivElement>(null)
  const suppressNextClick = useRef(false)
  const suppressClickTimer = useRef<number | null>(null)
  const lastTemporaryRightClick = useRef<{ key: string; time: number } | null>(null)
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
      }        if (current.row === drag.current.row && current.col === drag.current.col && axis === drag.axis) return
        drag.axis = axis
        drag.current = current
        setDragPreview(axis
          ? getMarkDragLine(drag.start, current, axis)
          : [drag.start])
    }
    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      const movedPastThreshold = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 18
      if (movedPastThreshold) drag.moved = true
      const pointerUpCell = positionFromTarget(document.elementFromPoint(event.clientX, event.clientY))
      if (!drag.regionMode && pointerUpCell) {
        const axis = drag.axis ?? chooseMarkDragAxis(drag.start, pointerUpCell)
        if (axis) {
          drag.axis = axis
          drag.current = pointerUpCell
        }
      }
      const finalDrag = { ...drag }
      if (!finalDrag.temporary && finalDrag.moved) suppressNextClick.current = true
      dragRef.current = null
      setDragPreview([])
      if (suppressNextClick.current) {
        if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current)
        suppressClickTimer.current = window.setTimeout(() => {
          suppressNextClick.current = false
          suppressClickTimer.current = null
        }, 500)
      }
      if (!finalDrag.regionMode && !finalDrag.moved) {
        if (finalDrag.temporary) {
          const currentKey = key(finalDrag.start.row, finalDrag.start.col)
          const now = Date.now()
          const previous = lastTemporaryRightClick.current
          if (previous?.key === currentKey && now - previous.time <= 450) {
            lastTemporaryRightClick.current = null
            onTemporaryCatClick(finalDrag.start.row, finalDrag.start.col)
          } else {
            lastTemporaryRightClick.current = { key: currentKey, time: now }
            onTemporaryClick(finalDrag.start.row, finalDrag.start.col)
          }
        }
        return
      }
      if (!finalDrag.regionMode && !finalDrag.axis) {
        lastTemporaryRightClick.current = null
        return
      }
      if (finalDrag.temporary) lastTemporaryRightClick.current = null
      if (finalDrag.regionMode) {
        onMarkDrag(getRegionPositions(board, finalDrag.start), finalDrag.temporary, finalDrag.erase)
      } else if (finalDrag.axis) {
        onMarkDrag(getMarkDragLine(finalDrag.start, finalDrag.current, finalDrag.axis), finalDrag.temporary, finalDrag.erase)
      }
    }
    const cancelDrag = (event: PointerEvent) => {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return
      dragRef.current = null
      suppressNextClick.current = false
      if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current)
      suppressClickTimer.current = null
      lastTemporaryRightClick.current = null
      setDragPreview([])
    }
    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', cancelDrag)
    return () => {
      window.removeEventListener('pointermove', moveDrag)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', cancelDrag)
      if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current)
    }
  }, [board, onMarkDrag, onTemporaryClick, onTemporaryCatClick])

  const handleBoardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) return
    const start = positionFromTarget(event.target)
    if (!start) return
    if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current)
    suppressClickTimer.current = null
    suppressNextClick.current = false
    if (event.button === 0) lastTemporaryRightClick.current = null
    const cellElement = event.target instanceof Element
      ? event.target.closest<HTMLElement>('.cell')
      : null
    try {
      cellElement?.setPointerCapture(event.pointerId)
    } catch {
      // The window listeners remain as a fallback if capture is unavailable.
    }
    const temporary = event.button === 2
    const hasStartMark = (temporary ? temporaryMarks : marks).has(key(start.row, start.col))
    dragRef.current = {
      start,
      current: start,
      axis: null,
      temporary,
      erase: hasStartMark,
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
          if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current)
          suppressClickTimer.current = null
          event.preventDefault()
          event.stopPropagation()
        }}
        onContextMenuCapture={(event) => {
          // Pointerup exclusively handles right clicks and drags. The native
          // contextmenu must never apply a second mark or temporary smile.
          event.preventDefault()
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
          const focused = focusKeys.has(k)
          const hintPlacement = placement?.row === row && placement.col === col
          const isDragPreview = previewKeys.has(k)
          const dragMode = dragRef.current
          const dragPreviewType = isDragPreview && dragMode
            ? dragMode.erase
              ? dragMode.temporary ? 'erase-temporary' : 'erase-mark'
              : dragMode.temporary ? 'temporary' : 'mark'
            : null

          // Hints, walkthroughs, and auto-fill keep their staged reveal timing.
          const revealIndex = revealIndexFor(k)
          const revealTotal = revealTotalFor()
          const waveIndex = waveRevealOrder.get(k) ?? Infinity
          const activeReveal = !isWalkthrough && !hint && waveIndex <= revealWaveIndex
          const temporaryCatOrder = temporaryCatRevealOrder.get(k) ?? Infinity
          const activeTemporaryCatReveal = temporaryCatOrder <= currentTemporaryCatWaveIndex
          const temporaryCatMark = state === 'empty' && !temporaryCat && temporaryCatXSet.has(k) &&
            temporaryCatWave !== null && activeTemporaryCatReveal
          const visibleTemporaryCat = temporaryCat && temporaryCatWave !== null && currentTemporaryCatWaveIndex >= 1
          return (
            <Cell
              key={`${k}-${transitionKey ?? 'steady'}`}
              cell={cell}
              state={state}
              temporary={temp}
              temporaryCat={visibleTemporaryCat}
              temporaryCatMark={temporaryCatMark}
              temporaryCatMarkReveal={temporaryCatMark && temporaryCatRevealOrder.get(k) === currentTemporaryCatWaveIndex}
              temporaryCatReveal={visibleTemporaryCat && temporaryCatOrder === 1 && currentTemporaryCatWaveIndex === 1}
              temporaryCatConflict={temporaryCatConflict}
              previewX={previewX || eliminateKeys.has(k)}
              hintPreviewX={!isWalkthrough && eliminateKeys.has(k)}
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
              transitionDelay={transitionKey !== null && transitionOrder.has(k)
                ? revealPositionDelayMs(transitionOrder.get(k)!, transitionTotal)
                : null}
              activeReveal={activeReveal}
              activeWaveMark={!isWalkthrough && !hint && waveIndex > 1 && waveIndex <= revealWaveIndex && state === 'empty'}
              revealStyle={activeReveal ? { '--pop-delay': '0ms' } as React.CSSProperties : undefined}
              colors={{
                fill: colors.fills[cell.region % colors.fills.length],
                border: colors.borders[cell.region % colors.borders.length],
                text: colors.textOn[cell.region % colors.textOn.length],
              }}
              onSingleClick={() => onSingleClick(row, col)}
              onDoubleClick={() => onDoubleClick(row, col)}
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
