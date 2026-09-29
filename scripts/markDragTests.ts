import { applyMarkDrag, chooseMarkDragAxis, getMarkDragLine, getRegionPositions } from '../src/game/markDrag'
import type { Board } from '../src/game/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const start = { row: 2, col: 3 }
assert(chooseMarkDragAxis(start, { row: 2, col: 3 }) === null, 'A stationary drag should not choose an axis')
assert(chooseMarkDragAxis(start, { row: 3, col: 5 }) === 'row', 'Horizontal movement should lock to the starting row')
assert(chooseMarkDragAxis(start, { row: 5, col: 4 }) === 'column', 'Vertical movement should lock to the starting column')
assert(chooseMarkDragAxis(start, { row: 4, col: 4 }) === 'column', 'Tied diagonal movement should resolve consistently to a column')

const rowLine = getMarkDragLine(start, { row: 2, col: 6 }, 'row')
assert(JSON.stringify(rowLine) === JSON.stringify([
  { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 }, { row: 2, col: 6 },
]), 'Row drags should include every cell through the endpoint')
const reverseColumnLine = getMarkDragLine(start, { row: 0, col: 4 }, 'column')
assert(JSON.stringify(reverseColumnLine) === JSON.stringify([
  { row: 2, col: 3 }, { row: 1, col: 3 }, { row: 0, col: 3 },
]), 'Column drags should stay in the starting column and support reverse direction')

const board: Board = [
  [{ row: 0, col: 0, region: 0 }, { row: 0, col: 1, region: 0 }, { row: 0, col: 2, region: 1 }],
  [{ row: 1, col: 0, region: 2 }, { row: 1, col: 1, region: 0 }, { row: 1, col: 2, region: 1 }],
  [{ row: 2, col: 0, region: 2 }, { row: 2, col: 1, region: 3 }, { row: 2, col: 2, region: 1 }],
]
assert(JSON.stringify(getRegionPositions(board, { row: 0, col: 0 })) === JSON.stringify([
  { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 },
]), 'Region marking should enumerate every matching cell and exclude other regions')

const initial = new Set(['2,3', '2,4', '9,9'])
const erased = applyMarkDrag(initial, rowLine, true, ({ row, col }) => row === 2 && col === 5)
assert(initial.has('2,3') && initial.has('2,4'), 'Drag operations should not mutate the original marks set')
assert(!erased.has('2,3') && !erased.has('2,4') && !erased.has('2,6'), 'Erase drags should remove selected marks')
assert(erased.has('9,9') && !erased.has('2,5'), 'Erase should preserve unrelated marks and leave blocked cells unchanged')
assert(erased.size === 1, 'Erase result should contain only unrelated preserved marks')
const added = applyMarkDrag(new Set(['2,4']), rowLine, false, ({ row, col }) => row === 2 && col === 5)
assert(added.has('2,3') && added.has('2,4') && added.has('2,6'), 'Add drags should mark unblocked selected cells')
assert(!added.has('2,5'), 'Blocked cells should not be marked')

console.log('Mark gesture tests passed: axis locking, line selection, region selection, and add/erase behavior')
