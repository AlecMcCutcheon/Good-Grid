import { nextHint, type HintStep } from './hints'
import type { Board, Position } from './types'

export type WalkthroughStep = HintStep & {
  /** Temporary example Xs visible after this step in the demonstration. */
  visibleXs: Position[]
  /** Xs introduced by this deduction (staggered in the visual example). */
  addedXs: Position[]
  /** Cats revealed by earlier logically forced steps, never the full answer at once. */
  visibleCats: Position[]
}

const key = (p: Position) => `${p.row},${p.col}`

function conflicts(board: Board, a: Position, b: Position): boolean {
  return (
    a.row === b.row ||
    a.col === b.col ||
    board[a.row][a.col].region === board[b.row][b.col].region ||
    (Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1)
  )
}

/** Build demo states one deduction at a time; no step is applied to the game. */
export function buildWalkthrough(board: Board): WalkthroughStep[] {
  const cats: Position[] = []
  const marks = new Set<string>()
  const steps: WalkthroughStep[] = []
  const maxSteps = board.length * 3

  for (let i = 0; i < maxSteps; i++) {
    const hint = nextHint(board, cats, marks)
    if (!hint || hint.kind === 'wrong-mark' || hint.kind === 'contradiction') break

    const beforeMarks = new Set(marks)
    if (hint.kind === 'placement' && hint.placement) {
      cats.push(hint.placement)
      for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board.length; col++) {
          const p = { row, col }
          if (conflicts(board, hint.placement, p) && key(p) !== key(hint.placement)) {
            marks.add(key(p))
          }
        }
      }
    } else {
      for (const p of hint.eliminate) marks.add(key(p))
    }

    steps.push({
      ...hint,
      addedXs: [...marks].filter((k) => !beforeMarks.has(k)).map((k) => {
        const [row, col] = k.split(',').map(Number)
        return { row, col }
      }),
      visibleXs: [...marks].filter((k) => !cats.some((cat) => key(cat) === k)).map((k) => {
        const [row, col] = k.split(',').map(Number)
        return { row, col }
      }),
      visibleCats: cats.map((p) => ({ ...p })),
    })
  }
  return steps
}
