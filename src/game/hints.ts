import type { Board, Position } from './types'

export type HintKind = 'wrong-mark' | 'contradiction' | 'placement' | 'elimination'
export type HintTechnique =
  | 'correct-an-x'
  | 'row-single'
  | 'column-single'
  | 'region-single'
  | 'region-row'
  | 'region-column'
  | 'row-region'
  | 'column-region'

export type HintStep = {
  kind: HintKind
  technique: HintTechnique
  title: string
  message: string
  focus: Position[]
  eliminate: Position[]
  placement?: Position
  focusRow?: number
  focusColumn?: number
  wrongMark?: Position
}

const key = (p: Position) => `${p.row},${p.col}`

function conflictsWithKnownCat(board: Board, a: Position, b: Position): boolean {
  return (
    a.col === b.col ||
    board[a.row][a.col].region === board[b.row][b.col].region ||
    (Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1)
  )
}

function hasCompletion(board: Board, foundCats: Position[], blocked: ReadonlySet<string>): boolean {
  const size = board.length
  const rows = new Set<number>()
  const cols = new Set<number>()
  const regions = new Set<number>()
  const placed: Position[] = []

  for (const cat of foundCats) {
    const region = board[cat.row]?.[cat.col]?.region
    if (region === undefined || blocked.has(key(cat)) || rows.has(cat.row) || cols.has(cat.col) || regions.has(region)) return false
    if (placed.some((other) => Math.abs(other.row - cat.row) <= 1 && Math.abs(other.col - cat.col) <= 1)) return false
    rows.add(cat.row)
    cols.add(cat.col)
    regions.add(region)
    placed.push(cat)
  }

  const search = (row: number): boolean => {
    if (row === size) return true
    if (rows.has(row)) return search(row + 1)
    for (let col = 0; col < size; col++) {
      const pos = { row, col }
      const region = board[row][col].region
      if (blocked.has(key(pos)) || cols.has(col) || regions.has(region)) continue
      if (placed.some((other) => Math.abs(other.row - row) <= 1 && Math.abs(other.col - col) <= 1)) continue
      rows.add(row)
      cols.add(col)
      regions.add(region)
      placed.push(pos)
      if (search(row + 1)) return true
      placed.pop()
      rows.delete(row)
      cols.delete(col)
      regions.delete(region)
    }
    return false
  }
  return search(0)
}

function deductionHint(board: Board, foundCats: Position[], pencilMarks: ReadonlySet<string>): HintStep | null {
  const size = board.length
  const rowUsed = new Set(foundCats.map((p) => p.row))
  const candidates: Position[][] = Array.from({ length: size }, () => [])
  for (let row = 0; row < size; row++) {
    if (rowUsed.has(row)) continue
    for (let col = 0; col < size; col++) {
      const pos = { row, col }
      if (pencilMarks.has(key(pos))) continue
      if (foundCats.some((cat) => conflictsWithKnownCat(board, cat, pos))) continue
      candidates[row].push(pos)
    }
  }

  const emptyRow = candidates.findIndex((row, index) => !rowUsed.has(index) && row.length === 0)
  if (emptyRow >= 0) {
    return {
      kind: 'contradiction',
      technique: 'correct-an-x',
      title: 'Review your X marks',
      message: `The current X marks leave row ${emptyRow + 1} with no available cell. At least one mark in this row or an intersecting color region needs another look.`,
      focus: board[emptyRow].map((cell) => ({ row: cell.row, col: cell.col })),
      eliminate: [],
      focusRow: emptyRow,
    }
  }

  for (let row = 0; row < size; row++) {
    if (!rowUsed.has(row) && candidates[row].length === 1) {
      const placement = candidates[row][0]
      return {
        kind: 'placement',
        technique: 'row-single',
        title: 'One option remains in this row',
        message: `After the faces already found and your X marks, row ${row + 1} has one legal square left. The one-smile-per-row rule forces the next placement there.`,
        focus: candidates[row],
        focusRow: row,
        eliminate: [],
        placement,
      }
    }
  }

  const columnCandidates: Position[][] = Array.from({ length: size }, () => [])
  for (const row of candidates) for (const pos of row) columnCandidates[pos.col].push(pos)
  const usedCols = new Set(foundCats.map((p) => p.col))
  for (let col = 0; col < size; col++) {
    if (!usedCols.has(col) && columnCandidates[col].length === 1) {
      const placement = columnCandidates[col][0]
      return {
        kind: 'placement',
        technique: 'column-single',
        title: 'One option remains in this column',
        message: `Column ${col + 1} has one legal square left under the current X marks and found faces. The one-smile-per-column rule forces that square.`,
        focus: [placement],
        focusColumn: col,
        eliminate: [],
        placement,
      }
    }
  }

  const regionCandidates = new Map<number, Position[]>()
  for (const row of candidates) for (const pos of row) {
    const region = board[pos.row][pos.col].region
    const cells = regionCandidates.get(region) ?? []
    cells.push(pos)
    regionCandidates.set(region, cells)
  }
  const usedRegions = new Set(foundCats.map((p) => board[p.row][p.col].region))
  for (const [region, cells] of regionCandidates) {
    if (usedRegions.has(region) || cells.length !== 1) continue
    const placement = cells[0]
    return {
      kind: 'placement',
      technique: 'region-single',
      title: 'One option remains in this color region',
      message: 'This color region has one legal square left. Since each region contains exactly one smile, that square is forced.',
      focus: [placement],
      eliminate: [],
      placement,
    }
  }

  // A region restricted to one row/column claims that line; other colors'
  // candidates in the same line can be eliminated as one coherent step.
  for (const [region, cells] of regionCandidates) {
    if (usedRegions.has(region) || cells.length === 0) continue
    const rows = new Set(cells.map((p) => p.row))
    const cols = new Set(cells.map((p) => p.col))
    if (rows.size === 1) {
      const row = cells[0].row
      const eliminate = candidates[row].filter((p) => board[p.row][p.col].region !== region)
      if (eliminate.length > 0) {
        return {
          kind: 'elimination', technique: 'region-row',
          title: 'A color region is confined to one row',
          message: `Every remaining option for one color region is in row ${row + 1}. Its smile must use this row, so the other colors’ candidate squares in it can be crossed off.`,
          focus: [...cells, ...eliminate], focusRow: row, eliminate,
        }
      }
    }
    if (cols.size === 1) {
      const col = cells[0].col
      const eliminate = candidates.flat().filter((p) => p.col === col && board[p.row][p.col].region !== region)
      if (eliminate.length > 0) {
        return {
          kind: 'elimination', technique: 'region-column',
          title: 'A color region is confined to one column',
          message: `Every remaining option for one color region is in column ${col + 1}. Its smile must use this column, so the other colors’ candidate squares in it can be crossed off.`,
          focus: [...cells, ...eliminate], focusColumn: col, eliminate,
        }
      }
    }
  }

  // All remaining choices of a row/column in one region reserve that region.
  for (let row = 0; row < size; row++) {
    if (rowUsed.has(row) || candidates[row].length === 0) continue
    const regions = new Set(candidates[row].map((p) => board[p.row][p.col].region))
    if (regions.size !== 1) continue
    const region = [...regions][0]
    if (usedRegions.has(region)) continue
    const eliminate = candidates.flat().filter((p) => p.row !== row && board[p.row][p.col].region === region)
    if (eliminate.length > 0) {
      return {
        kind: 'elimination', technique: 'row-region',
        title: 'This row is confined to one color region',
        message: `All remaining choices in row ${row + 1} belong to the same color region. Its smile must be in this row, so the region’s other candidate squares can be crossed off.`,
        focus: [...candidates[row], ...eliminate], focusRow: row, eliminate,
      }
    }
  }
  for (let col = 0; col < size; col++) {
    if (usedCols.has(col) || columnCandidates[col].length === 0) continue
    const regions = new Set(columnCandidates[col].map((p) => board[p.row][p.col].region))
    if (regions.size !== 1) continue
    const region = [...regions][0]
    if (usedRegions.has(region)) continue
    const eliminate = candidates.flat().filter((p) => p.col !== col && board[p.row][p.col].region === region)
    if (eliminate.length > 0) {
      return {
        kind: 'elimination', technique: 'column-region',
        title: 'This column is confined to one color region',
        message: `All remaining choices in column ${col + 1} belong to the same color region. Its smile must be in this column, so the region’s other candidate squares can be crossed off.`,
        focus: [...columnCandidates[col], ...eliminate], focusColumn: col, eliminate,
      }
    }
  }
  return null
}

/** Return one deduction only; temporary marker state is intentionally absent. */
export function nextHint(
  board: Board,
  foundCats: Position[],
  pencilMarks: ReadonlySet<string>,
  solution?: Position[],
): HintStep | null {
  const catKeys = new Set(foundCats.map(key))

  // A real X placed on the hidden unique solution is the first kind of mistake
  // to correct. The response identifies only the bad mark, never what belongs
  // there. This is especially useful before the player has found any cats.
  const solutionKeys = solution ? new Set(solution.map(key)) : null
  for (const mark of pencilMarks) {
    if (catKeys.has(mark) || !solutionKeys?.has(mark)) continue
    const [row, col] = mark.split(',').map(Number)
    if (!Number.isInteger(row) || !board[row]?.[col]) continue
    const wrongMark = { row, col }
    return {
      kind: 'wrong-mark', technique: 'correct-an-x',
      title: 'Recheck this X',
      message: `The X at row ${row + 1}, column ${col + 1} is not consistent with the puzzle. Remove or reconsider this mark, then ask for the next hint.`,
      focus: [wrongMark], eliminate: [], wrongMark,
    }
  }

  // A player's X that covers a logically forced placement is the most useful
  // correction when no solution is supplied. Establish the forced placement using all their OTHER real Xs.
  for (const mark of pencilMarks) {
    if (catKeys.has(mark)) continue
    const [row, col] = mark.split(',').map(Number)
    if (!Number.isInteger(row) || !board[row]?.[col]) continue
    const otherMarks = new Set(pencilMarks)
    otherMarks.delete(mark)
    const next = deductionHint(board, foundCats, otherMarks)
    if (next?.kind === 'placement' && next.placement && key(next.placement) === mark) {
      return {
        kind: 'wrong-mark', technique: 'correct-an-x',
        title: 'Recheck this X',
        message: `The X at row ${row + 1}, column ${col + 1} conflicts with the current logical deductions. Remove or reconsider this mark, then ask for the next hint.`,
        focus: [{ row, col }], eliminate: [], wrongMark: { row, col },
      }
    }
  }

  if (!hasCompletion(board, foundCats, pencilMarks)) {
    if (solutionKeys) {
      const invalidMarks = [...pencilMarks].filter((mark) =>
        !catKeys.has(mark) && solutionKeys.has(mark),
      )
      if (invalidMarks.length > 0) {
        const mark = invalidMarks[0]
        const [row, col] = mark.split(',').map(Number)
        const wrongMark = { row, col }
        return {
          kind: 'wrong-mark', technique: 'correct-an-x',
          title: 'Recheck this X',
          message: `The X at row ${row + 1}, column ${col + 1} is not consistent with the puzzle. Remove or reconsider this mark, then ask for the next hint.`,
          focus: [wrongMark], eliminate: [], wrongMark,
        }
      }
    }
    for (const mark of pencilMarks) {
      if (catKeys.has(mark)) continue
      const withoutMark = new Set(pencilMarks)
      withoutMark.delete(mark)
      if (hasCompletion(board, foundCats, withoutMark)) {
        const [row, col] = mark.split(',').map(Number)
        const wrongMark = { row, col }
        return {
          kind: 'wrong-mark', technique: 'correct-an-x',
          title: 'Recheck this X',
          message: `The X at row ${row + 1}, column ${col + 1} prevents the remaining puzzle from being completed under its rules. Remove or reconsider this mark.`,
          focus: [wrongMark], eliminate: [], wrongMark,
        }
      }
    }
    return {
      kind: 'contradiction', technique: 'correct-an-x',
      title: 'Review the current board marks',
      message: 'The current X marks leave no complete arrangement under the puzzle rules. Recheck a mark or ask for a hint again after correcting one.',
      focus: [...pencilMarks].map((mark) => {
        const [row, col] = mark.split(',').map(Number)
        return { row, col }
      }),
      eliminate: [],
    }
  }

  return deductionHint(board, foundCats, pencilMarks)
}
