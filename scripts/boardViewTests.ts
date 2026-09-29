import {
  chooseBoardViewDragAxis,
  getBoardViewDragLine,
  normalizeBoardRotation,
  rotateBoardPosition,
} from '../src/game/boardView'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const size = 7
const cells = Array.from({ length: size * size }, (_, index) => ({
  row: Math.floor(index / size),
  col: index % size,
}))
for (const rotation of [0, 1, 2, 3] as const) {
  const mapped = cells.map((position) => rotateBoardPosition(position, size, rotation))
  assert(new Set(mapped.map(({ row, col }) => `${row},${col}`)).size === cells.length, `${rotation} quarter-turn mapping must not overlap cells`)
  assert(mapped.every(({ row, col }) => row >= 0 && row < size && col >= 0 && col < size), `${rotation} quarter-turn mapping must stay on the board`)
}

for (const position of cells) {
  let mapped = position
  for (let turn = 0; turn < 4; turn++) mapped = rotateBoardPosition(mapped, size, 1)
  assert(mapped.row === position.row && mapped.col === position.col, 'Four clockwise turns must return every cell to its original position')
  const clockwise = rotateBoardPosition(position, size, 1)
  const counterclockwise = rotateBoardPosition(clockwise, size, 3)
  assert(counterclockwise.row === position.row && counterclockwise.col === position.col, 'Clockwise then counterclockwise must preserve cell position')
}

assert(normalizeBoardRotation(5) === 1 && normalizeBoardRotation(-1) === 3, 'Rotation must wrap in either direction')

const dragStart = { row: 2, col: 2 }
const dragEnd = { row: 2, col: 4 }
assert(chooseBoardViewDragAxis(dragStart, dragEnd, size, 0) === 'row', 'Unrotated view should select the displayed row')
assert(chooseBoardViewDragAxis(dragStart, dragEnd, size, 1) === 'column', 'A clockwise turn should select the displayed column')
const originalLine = getBoardViewDragLine(dragStart, dragEnd, 'row', size, 0)
const rotatedLine = getBoardViewDragLine(dragStart, dragEnd, 'column', size, 1)
assert(JSON.stringify(rotatedLine) === JSON.stringify(originalLine), 'Dragging along a turned visual row must update the same logical cells')
console.log('Board-view tests passed: quarter-turn mapping and visual drag gestures preserve puzzle coordinates')
