import type { Position } from './types'
import { chooseMarkDragAxis, getMarkDragLine, type MarkDragAxis } from './markDrag'

export type BoardRotation = 0 | 1 | 2 | 3

/** Map a puzzle cell to its displayed grid position after clockwise quarter turns. */
export function rotateBoardPosition(position: Position, size: number, rotation: BoardRotation): Position {
  switch (rotation) {
    case 1:
      return { row: position.col, col: size - 1 - position.row }
    case 2:
      return { row: size - 1 - position.row, col: size - 1 - position.col }
    case 3:
      return { row: size - 1 - position.col, col: position.row }
    default:
      return position
  }
}

export function normalizeBoardRotation(rotation: number): BoardRotation {
  return (((rotation % 4) + 4) % 4) as BoardRotation
}

export function chooseBoardViewDragAxis(
  start: Position,
  current: Position,
  size: number,
  rotation: BoardRotation,
): MarkDragAxis | null {
  return chooseMarkDragAxis(
    rotateBoardPosition(start, size, rotation),
    rotateBoardPosition(current, size, rotation),
  )
}

export function getBoardViewDragLine(
  start: Position,
  current: Position,
  axis: MarkDragAxis,
  size: number,
  rotation: BoardRotation,
): Position[] {
  const viewLine = getMarkDragLine(
    rotateBoardPosition(start, size, rotation),
    rotateBoardPosition(current, size, rotation),
    axis,
  )
  const inverseRotation = normalizeBoardRotation(-rotation)
  return viewLine.map((position) => rotateBoardPosition(position, size, inverseRotation))
}
