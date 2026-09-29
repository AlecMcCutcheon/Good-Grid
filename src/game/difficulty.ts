import type { Board, Difficulty } from './types'
import type { SolveResult } from './humanSolver'

/**
 * Difficulty grading from CHAIN metrics (not placement labels — a placement
 * is always labelled with the simplest technique that fires, but the true
 * difficulty is whether advanced passes (confinement / pair locks) had to
 * run, and how often):
 *
 *   easy       : one advanced round required
 *   medium     : confinement/pair-locks carry real weight
 *   hard       : advanced rounds dominate the solve
 *   extra-hard : the highest advanced-round rung
 */
export function computeDifficulty(
  board: Board,
  result: SolveResult,
): { difficulty: Difficulty; advancedRounds: number; fired: string[] } {
  void board
  const fired = result.fired
  const advancedRounds = result.advancedRounds

  // Monotonic ladder matching the generator's acceptance rungs:
  // The selectable easy tier requires one advanced round; zero-round fallbacks
  // are still grouped into Easy, the lowest remaining label.
  let difficulty: Difficulty
  if (advancedRounds <= 1) difficulty = 'easy'
  else if (advancedRounds === 2) difficulty = 'medium'
  else if (advancedRounds === 3) difficulty = 'hard'
  else difficulty = 'extra-hard'
  return { difficulty, advancedRounds, fired }
}
