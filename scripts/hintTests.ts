import { nextHint } from '../src/game/hints'
import { buildWalkthrough } from '../src/game/walkthrough'
import { generateLevel } from '../src/game/levelGenerator'
import { getAutoFilledPositions } from '../src/game/rules'
import { readFileSync } from 'node:fs'
import type { Difficulty } from '../src/game/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function key(row: number, col: number) { return `${row},${col}` }

const { level } = generateLevel({ size: 5, difficulty: 'easy' as Difficulty, seed: 15 })
const solution = level.solution
const firstWrongX = nextHint(level.cells, [], new Set([key(solution[0].row, solution[0].col)]), solution)
assert(firstWrongX?.kind === 'wrong-mark', 'A permanent X on a required cell should be called out first')
assert(!firstWrongX.message.toLowerCase().includes('cat'), 'Wrong-X hint must not reveal the answer')

const foundCats = [solution[0]]
const legalCell = level.cells.flat().find((cell) =>
  !solution.some((p) => p.row === cell.row && p.col === cell.col) &&
  !foundCats.some((p) => p.row === cell.row || p.col === cell.col ||
    level.cells[p.row][p.col].region === cell.region ||
    (Math.abs(p.row - cell.row) <= 1 && Math.abs(p.col - cell.col) <= 1)),
)
assert(legalCell, 'Expected a legal non-cat cell for a player note')
const nextWithoutNote = nextHint(level.cells, foundCats, new Set())
const nextWithPermanentNote = nextHint(level.cells, foundCats, new Set([key(legalCell.row, legalCell.col)]))
assert(
  nextWithoutNote?.kind === nextWithPermanentNote?.kind &&
    nextWithoutNote?.placement?.row === nextWithPermanentNote?.placement?.row &&
    nextWithoutNote?.placement?.col === nextWithPermanentNote?.placement?.col &&
    nextWithoutNote?.technique === nextWithPermanentNote?.technique,
  'A non-blocking permanent note must not alter the next logic deduction',
)
const laterWrongX = nextHint(level.cells, foundCats, new Set([key(solution[1].row, solution[1].col)]), solution)
assert(laterWrongX?.kind === 'wrong-mark', 'A real X on a later required cell should be prioritized')

const autoFillProbe = Array.from({ length: 5 }, (_, row) =>
  Array.from({ length: 5 }, (_, col) => ({ row, col, region: row * 5 + col })),
)
autoFillProbe[0][0].region = autoFillProbe[2][2].region
const autoFilled = new Set(getAutoFilledPositions(autoFillProbe, { row: 2, col: 2 }).map((pos) => key(pos.row, pos.col)))
assert(!autoFilled.has(key(2, 2)), 'Auto-fill previews must not mark the cat cell itself')
assert(autoFilled.has(key(2, 0)) && autoFilled.has(key(0, 2)), 'Auto-fill must include the cat’s row and column')
assert(autoFilled.has(key(1, 1)) && autoFilled.has(key(3, 3)), 'Auto-fill must include immediately adjacent diagonal cells')
assert(!autoFilled.has(key(0, 0)), 'Auto-fill must not mark a distant cell in the same color region')
assert(!autoFilled.has(key(4, 4)), 'Auto-fill must not treat long-range diagonals as conflicts')

const boardBeforeWalkthrough = JSON.stringify(level.cells)
const walkthrough = buildWalkthrough(level.cells)
assert(walkthrough.length > 0, 'Expected the walkthrough to progress by deduction')
assert(walkthrough.every((step) => step.kind === 'placement' || step.kind === 'elimination'), 'Walkthrough may only present valid deductions')
assert(JSON.stringify(level.cells) === boardBeforeWalkthrough, 'Building a walkthrough must not mutate the puzzle board')
for (let i = 1; i < walkthrough.length; i++) {
  const previous = walkthrough[i - 1]
  const current = walkthrough[i]
  assert(previous.visibleXs.every((pos) => current.visibleXs.some((next) => key(next.row, next.col) === key(pos.row, pos.col))), 'Each walkthrough step must retain earlier temporary X examples')
  assert(previous.visibleCats.every((pos) => current.visibleCats.some((next) => key(next.row, next.col) === key(pos.row, pos.col))), 'Each walkthrough step must retain cats revealed by earlier deductions')
}

// Search deterministic generated states for a column confinement hint; every
// example X must be in that same column (diagonal neighbors are not included).
let sawColumnElimination = false
for (const difficulty of ['easy', 'medium', 'hard'] as const) {
  for (let seed = 1; seed <= 12; seed++) {
    const candidate = generateLevel({ size: 7, difficulty, seed: 7000 + seed * 19 }).level
    const n = candidate.size
    const trueCats = new Set(candidate.solution.map((p) => key(p.row, p.col)))
    for (let mask = 0; mask < 2 ** n; mask++) {
      const knownCats = candidate.solution.filter((_, i) => (mask & (1 << i)) !== 0)
      const candidateHint = nextHint(candidate.cells, knownCats, new Set(), candidate.solution)
      if (candidateHint?.kind !== 'elimination') continue
      assert(candidateHint.eliminate.length > 0, 'An elimination hint must contain concrete X examples')
      assert(candidateHint.eliminate.every((pos) => !trueCats.has(key(pos.row, pos.col))), 'Hint attempted to X out a true solution cat')
      if (candidateHint.technique === 'region-column') {
        assert(candidateHint.eliminate.every((pos) => pos.col === candidateHint.focusColumn), 'Region-confined column hint must only target other colors in that column')
        sawColumnElimination = true
      }
      if (candidateHint.technique === 'region-row') {
        assert(candidateHint.eliminate.every((pos) => pos.row === candidateHint.focusRow), 'Region-confined row hint must only target other colors in that row')
      }
      if (candidateHint.technique === 'row-region') {
        assert(candidateHint.eliminate.every((pos) => pos.row !== candidateHint.focusRow), 'Row-confined color hint must eliminate that color outside the highlighted row')
      }
      if (candidateHint.technique === 'column-region') {
        assert(candidateHint.eliminate.every((pos) => pos.col !== candidateHint.focusColumn), 'Column-confined color hint must eliminate that color outside the highlighted column')
      }
    }
  }
}
assert(sawColumnElimination, 'Expected at least one deterministic column elimination hint test case')

const boardSource = readFileSync(new URL('../src/components/Board.tsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
assert(boardSource.includes('board__logic-overlay') && boardSource.includes('board__logic-line--column'), 'Dotted line guides must be rendered inside the dedicated overlay layer')
assert(boardSource.includes("gridColumn: '1 / -1'") && /gridColumn:\s*`\$\{focusColumn \+ 1\} \/ \$\{focusColumn \+ 2\}`/.test(boardSource), 'Row/column guide spans must use the zero-based hint coordinate as the matching CSS grid track')
assert(/\.board__logic-overlay\s*\{[^}]*position:\s*absolute/s.test(cssSource), 'Guide overlay must be absolutely positioned out of CSS grid flow')
assert(/\.board__logic-overlay\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--n, 7\)/s.test(cssSource) && /\.board__logic-overlay\s*\{[^}]*grid-template-rows:\s*repeat\(var\(--n, 7\)/s.test(cssSource), 'Guide overlay must define its own board-sized tracks')
assert(/\.board\s*\{[^}]*gap:\s*7px[^}]*padding:\s*7px/s.test(cssSource) && /\.board__logic-overlay\s*\{[^}]*inset:\s*7px[^}]*gap:\s*7px/s.test(cssSource), 'Board cells and the hint overlay must share evenly spaced 7px gutters')
assert(/\.board__logic-overlay\s*\{[^}]*pointer-events:\s*none/s.test(cssSource), 'Guide overlay must not intercept board clicks')
assert(boardSource.includes('eliminateKeys.has(k)') && appSource.includes('activeHint.eliminate.map((p) => key(p.row, p.col))'), 'The preview and applied Xs must both use the hint’s concrete row/column positions')
assert(boardSource.includes('const visibleEliminateSet = walkthroughStep ? [] : visibleHintEliminate'), 'Walkthrough X examples must use the staged cumulative view, not the full next deduction at once')
assert(boardSource.includes('walkthroughPreviewX={isWalkthrough && previewX}'), 'Walkthrough examples must render as temporary preview marks')
const cellSource = readFileSync(new URL('../src/components/Cell.tsx', import.meta.url), 'utf8')
assert(cellSource.includes('onDoubleClick={(event) =>') && cellSource.includes('onDoubleClick()') && cellSource.includes('event.detail !== 2') && !cellSource.includes('setTimeout'), 'Cat placement should use the native double-click event without delaying single clicks')
assert(cellSource.includes('now - lastContextClick.current < 450') && cellSource.includes('onTemporaryCatClick()'), 'Double-right-click must toggle a temporary cat preview')
assert(cellSource.includes('temporaryCatMark') && cellSource.includes('<XMarkIcon className="cell__temporary-glyph" />'), 'Ghost-cat auto-fill must reuse the same cyan X marker as temporary notes')
assert(boardSource.includes('const temporaryCatMark = temporaryCatXSet.has(k) && state === \'empty\''), 'Ghost-cat previews should use the exact same auto-filled cells as cat placements')
const iconSource = readFileSync(new URL('../src/components/Icons.tsx', import.meta.url), 'utf8')
assert(iconSource.includes('export function SmileIcon') && iconSource.includes('export function FrownIcon') && iconSource.includes('export function TemporarySmileIcon'), 'Found, incorrect, and temporary faces must use custom SVG icon components')
assert(cellSource.includes('<FrownIcon className="cell__miss-icon" />') && cellSource.includes('<SmileIcon className="cell__cat-icon" />') && cellSource.includes('<TemporarySmileIcon className="cell__temporary-cat-glyph" />'), 'Board state icons should render as frowny, happy, and temporary-color happy faces')
const rulesSource = readFileSync(new URL('../src/game/rules.ts', import.meta.url), 'utf8')
const autoFillBody = rulesSource.slice(rulesSource.indexOf('export function getAutoFilledPositions'), rulesSource.indexOf('/** Are any two'))
assert(!autoFillBody.includes('cell.region'), 'Auto-fill must not automatically mark the rest of a color region')
assert(boardSource.includes('temporaryCatConflict={temporaryCatConflict}'), 'Temporary cat previews should visibly distinguish an invalid placement')
assert(cellSource.includes('onTemporaryClick()'), 'Single right-click must continue toggling temporary notes')
const ruleCardSource = readFileSync(new URL('../src/components/RuleCards.tsx', import.meta.url), 'utf8')
assert(ruleCardSource.includes("import { SmileIcon, XMarkIcon } from './Icons'"), 'Rule diagrams must reuse the board icons')
assert(/cells=\{\[\s*\{ region: true, mark: 'x' \}, \{ region: true, mark: 'x' \}, null,\s*\{ region: true, mark: 'x' \}, \{ region: true, mark: 'cat' \}/s.test(ruleCardSource), 'Color-region rule diagram must show a 2×2 region with its cat in the bottom-right cell')
assert(/\.mini__cell\s*\{[^}]*background:\s*#353b43/s.test(cssSource) && /\.mini__cell--region\s*\{[^}]*background:\s*#4a515a/s.test(cssSource), 'All rule diagrams should use visible grayscale cells')
assert(/\.cell__preview-glyph,\s*\.cell__x-icon,\s*\.cell__miss-icon\s*\{[^}]*width:\s*80%[^}]*height:\s*80%/s.test(cssSource) && /\.cell__temporary-glyph\s*\{[^}]*width:\s*80%[^}]*height:\s*80%/s.test(cssSource), 'Normal, preview, and temporary X-size marks should match')

console.log(`Hint tests passed: ${walkthrough.length} cumulative walkthrough steps, mark gestures, autofill preview rules, custom face icons, and legends`)
