export type Placement = import('./humanSolver').Placement

export type Position = { row: number; col: number }

export type Cell = {
  row: number
  col: number
  /** Region id, 0-based */
  region: number
}

export type Board = Cell[][]

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extra-hard'

export type Level = {
  size: number
  cells: Board
  solution: Position[]
  difficulty: Difficulty
}

// ============================================================================
// Region palette
// ============================================================================

export type RegionPalette = {
  /** Human-readable name, e.g. "Pastel" */
  name: string
  /** Background tints, one per region id */
  fills: string[]
  /** Darker shade of the same hue, used for region borders */
  borders: string[]
  /** High-contrast text color for a fill (e.g. queen glyph) */
  textOn: string[]
}

// ============================================================================
// Generation / validation diagnostics
// ============================================================================

export type GenerationAttempt = {
  index: number
  ok: boolean
  reason?: string
  ms: number
}

export type GenerationReport = {
  attempts: GenerationAttempt[]
  totalMs: number
  accepted: boolean
}
