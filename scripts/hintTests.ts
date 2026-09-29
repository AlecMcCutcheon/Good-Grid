import { nextHint } from '../src/game/hints'
import { buildWalkthrough } from '../src/game/walkthrough'
import { generateLevel } from '../src/game/levelGenerator'
import { getAutoFilledPositions, orderPositionsRadially } from '../src/game/rules'
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

const radialOrder = orderPositionsRadially([
  { row: 3, col: 3 },
  { row: 2, col: 0 },
  { row: 1, col: 2 },
  { row: 2, col: 2 },
  { row: 2, col: 3 },
  { row: 3, col: 2 },
  { row: 2, col: 1 },
  { row: 1, col: 1 },
], { row: 2, col: 2 })
assert(radialOrder[0].row === 2 && radialOrder[0].col === 2, 'Radial reveals should start at their origin')
assert(radialOrder.slice(1, 5).map((pos) => key(pos.row, pos.col)).join('|') === '2,3|3,2|2,1|1,2', 'Radial reveals should sweep clockwise around the first ring')
assert(
  radialOrder.slice(1).every((pos, index, positions) => {
    if (index === 0) return true
    const previous = positions[index - 1]
    return (pos.row - 2) ** 2 + (pos.col - 2) ** 2 >= (previous.row - 2) ** 2 + (previous.col - 2) ** 2
  }),
  'Radial reveals should progress outward by distance after the first ring',
)

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
assert(appSource.includes('winningSmile') && appSource.includes('restartCurrentLevel(lastHeartOrigin ?? undefined)'), 'Continue and Retry transitions should originate at the deciding placement')
assert(appSource.includes('transitionOriginSize = lvl.size') && appSource.includes('transitionOrigin.row / Math.max(1, transitionOriginSize - 1)'), 'Transition origins should retain their relative position when board sizes change')
assert(!appSource.includes('setHearts(snapshot.hearts)') && !appSource.includes('Undo last move'), 'Undo must not restore lost hearts and game-over should not offer an undo action')
assert(appSource.includes('undoHidden={gameOver}'), 'Game over should hide the regular Undo control')
assert(boardSource.includes('levelTransition?.nonce') && cssSource.includes('cell-level-reveal'), 'Generated levels should reveal the real board cells with a radial transition')
assert(!boardSource.includes('board--transition-cover'), 'Level changes must not add a second board overlay')
assert(!cellSource.includes('onContextMenu=') && !cellSource.includes('setTimeout'), 'Cells must not duplicate right-click behavior outside the board gesture handler')
assert(boardSource.includes('event.button === 2') && boardSource.includes('onMarkDrag(getMarkDragLine(finalDrag.start, finalDrag.current, finalDrag.axis), finalDrag.temporary'), 'Right-button drags must route through the temporary-mark path')
assert(boardSource.includes('onTemporaryClick(finalDrag.start.row, finalDrag.start.col)') && boardSource.includes('onTemporaryCatClick(finalDrag.start.row, finalDrag.start.col)'), 'Right-click gestures should only toggle temporary notes or a temporary smile')
assert(boardSource.includes('temporaryCatXSet.has(k) &&') && boardSource.includes('temporaryCatOrder <= currentTemporaryCatWaveIndex'), 'Temporary smile auto-fill Xs must be staged by their own reveal counter')
assert(boardSource.includes('temporaryCatWaveIndex: currentTemporaryCatWaveIndex = 0'), 'Temporary smile previews must use a separate reveal timeline')
assert(boardSource.includes('activeWaveMark={!isWalkthrough && !hint && waveIndex > 1'), 'Only the real cat-placement wave may render permanent auto-fill marks')
assert(appSource.includes('revealWaveIndex > 1') && appSource.includes('setPencilMarks((previous) => new Set(previous).add(key(reachedPosition.row, reachedPosition.col)))'), 'Permanent Xs must be committed one cell at a time as the real reveal wave reaches them')
assert(cellSource.includes('AUTO_FILL_REVEAL_TOTAL_MS = 280') && appSource.includes('autoFillRevealStepDelayMs(revealWave.positions.length)'), 'Real auto-fill animation should keep its quicker radial timing')
const temporaryCatHandler = appSource.slice(appSource.indexOf('const handleTemporaryCatClick'), appSource.indexOf('const clearTemporaryMarks'))
assert(temporaryCatHandler.includes('setTemporaryCatWave({ origin: { row, col }, positions: previewPositions') && !temporaryCatHandler.includes('setPencilMarks('), 'Temporary smile previews must animate without ever mutating permanent Xs')
assert(appSource.includes('if (!temporaryCatWave || temporaryCatWaveIndex >= temporaryCatWave.positions.length) return'), 'Temporary smile waves should finish without committing permanent marks')
assert(cellSource.includes('temporaryCatMark') && cellSource.includes('cell__temporary-glyph'), 'Temporary smile auto-fill should use the colored temporary X glyph')
assert(/\.cell__temporary-glyph\s*\{[^}]*color:\s*#7de8ff[^}]*filter:\s*drop-shadow\(0 1px 3px #102030\)/s.test(cssSource), 'Temporary Xs must retain the normal dark shadow while staying cyan')
assert(/\.cell__temporary-cat-glyph\s*\{[^}]*color:\s*#7de8ff[^}]*filter:\s*drop-shadow\(0 1px 3px #102030\)/s.test(cssSource), 'Temporary smiles must be cyan with a dark shadow')
const iconSource = readFileSync(new URL('../src/components/Icons.tsx', import.meta.url), 'utf8')
const controlsSource = readFileSync(new URL('../src/components/Controls.tsx', import.meta.url), 'utf8')
assert(iconSource.includes('export function SmileIcon') && iconSource.includes('export function FrownIcon') && iconSource.includes('export function TemporarySmileIcon'), 'Found, incorrect, and temporary faces must use custom SVG icon components')
assert(iconSource.includes('export function LightbulbIcon') && iconSource.includes('export function SettingsIcon') && controlsSource.includes('<LightbulbIcon') && controlsSource.includes('<SettingsIcon'), 'Hint and settings controls should use matching outline icons')
assert(iconSource.includes('export function HeartIcon') && appSource.includes('<HeartIcon className="level-dialog__heart-icon" filled={false} />'), 'The failure dialog should use the outline heart icon')
assert(cellSource.includes('<FrownIcon className="cell__miss-icon" />') && cellSource.includes('<SmileIcon className="cell__cat-icon" />') && cellSource.includes('TemporarySmileIcon'), 'Board state icons should render as frowny, happy, and temporary-color happy faces')
const rulesSource = readFileSync(new URL('../src/game/rules.ts', import.meta.url), 'utf8')
const autoFillBody = rulesSource.slice(rulesSource.indexOf('export function getAutoFilledPositions'), rulesSource.indexOf('/** Are any two'))
assert(!autoFillBody.includes('cell.region'), 'Auto-fill must not automatically mark the rest of a color region')
assert(boardSource.includes('temporaryCatConflict={temporaryCatConflict}'), 'Temporary cat previews should visibly distinguish an invalid placement')
assert(boardSource.includes('onTemporaryClick(finalDrag.start.row, finalDrag.start.col)'), 'Single right-click must continue toggling temporary notes')
const ruleCardSource = readFileSync(new URL('../src/components/RuleCards.tsx', import.meta.url), 'utf8')
assert(ruleCardSource.includes("import { SmileIcon, XMarkIcon } from './Icons'"), 'Rule diagrams must reuse the board icons')
assert(/cells=\{\[\s*\{ region: true, mark: 'x' \}, \{ region: true, mark: 'x' \}, null,\s*\{ region: true, mark: 'x' \}, \{ region: true, mark: 'cat' \}/s.test(ruleCardSource), 'Color-region rule diagram must show a 2×2 region with its cat in the bottom-right cell')
assert(/\.mini__cell\s*\{[^}]*background:\s*#353b43/s.test(cssSource) && /\.mini__cell--region\s*\{[^}]*background:\s*#4a515a/s.test(cssSource), 'All rule diagrams should use visible grayscale cells')
assert(/\.cell__preview-glyph,\s*\.cell__x-icon,\s*\.cell__miss-icon,\s*\.cell__temporary-glyph\s*\{[^}]*width:\s*80%[^}]*height:\s*80%/s.test(cssSource), 'Normal, preview, and temporary X-size marks should match')

console.log(`Hint tests passed: ${walkthrough.length} cumulative walkthrough steps, mark gestures, autofill preview rules, custom face icons, and legends`)
