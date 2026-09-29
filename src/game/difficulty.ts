import type { Board, Difficulty } from './types'
import type { SolveResult } from './humanSolver'

/**
 * Difficulty grading from CHAIN metrics (not placement labels — a placement
 * is always labelled with the simplest technique that fires, but the true
 * difficulty is whether advanced passes (confinement / pair locks) had to
 * run, and how often):
 *
 *   easy       : naked singles only, zero advanced rounds
 *   medium     : some advanced firings, few rounds
 *   hard       : confinement/pair-locks carry real weight
 *   extra-hard : advanced rounds dominate the solve
 */
export function computeDifficulty(
  board: Board,
  result: SolveResult,
): { difficulty: Difficulty; advancedRounds: number; fired: string[] } {
  void board
  const fired = result.fired
  const advancedRounds = result.advancedRounds

  // Monotonic ladder matching the generator's acceptance rungs:
  // 0 advanced rounds = easy, 1 = medium, 2 = hard, 3+ = extra-hard.
  let difficulty: Difficulty
  if (advancedRounds === 0) difficulty = 'easy'
  else if (advancedRounds === 1) difficulty = 'medium'
  else if (advancedRounds === 2) difficulty = 'hard'
  else difficulty = 'extra-hard'
  return { difficulty, advancedRounds, fired }
}
