import type { Board, Position } from './types'

export type MarkDragAxis = 'row' | 'column'

export function chooseMarkDragAxis(start: Position, current: Position): MarkDragAxis | null {
  const rowDistance = Math.abs(current.row - start.row)
  const columnDistance = Math.abs(current.col - start.col)
  if (rowDistance === 0 && columnDistance === 0) return null
  return columnDistance > rowDistance ? 'row' : 'column'
}

export function getMarkDragLine(start: Position, current: Position, axis: MarkDragAxis): Position[] {
  const line: Position[] = []
  if (axis === 'row') {
    const direction = current.col >= start.col ? 1 : -1
    for (let col = start.col; ; col += direction) {
      line.push({ row: start.row, col })
      if (col === current.col) break
    }
  } else {
    const direction = current.row >= start.row ? 1 : -1
    for (let row = start.row; ; row += direction) {
      line.push({ row, col: start.col })
      if (row === current.row) break
    }
  }
  return line
}

export function getRegionPositions(board: Board, position: Position): Position[] {
  const region = board[position.row]?.[position.col]?.region
  if (region === undefined) return []
  return board.flatMap((row, rowIndex) => row
    .filter((cell) => cell.region === region)
    .map((cell) => ({ row: rowIndex, col: cell.col })))
}

export function applyMarkDrag(
  marks: Set<string>,
  positions: Position[],
  erase: boolean,
  isBlocked: (position: Position) => boolean = () => false,
): Set<string> {
  const next = new Set(marks)
  for (const position of positions) {
    if (isBlocked(position)) continue
    const mark = `${position.row},${position.col}`
    if (erase) next.delete(mark)
    else next.add(mark)
  }
  return next
}
