import type { Difficulty, GenerationReport, Level, Position } from './types'

export const SAVED_GAME_STORAGE_PREFIX = 'petdoku.saved-games.v1:'
export const SAVED_GAME_VERSION = 1

export type SavedSnapshot = {
  cats: Position[]
  pencilMarks: string[]
  temporaryMarks: string[]
  temporaryCats: string[]
  misses: string[]
}

export type SavedGame = {
  version: 1
  profileId: string
  difficulty: Difficulty
  levelIndex: number
  level: Level
  report: GenerationReport | null
  cats: Position[]
  pencilMarks: string[]
  temporaryMarks: string[]
  temporaryCats: string[]
  misses: string[]
  hearts: number
  lastHeartOrigin: Position | null
  revealWave: { origin: Position; positions: Position[]; nonce: number } | null
  revealWaveIndex: number
  temporaryCatWave: { origin: Position; positions: Position[]; nonce: number } | null
  temporaryCatWaveIndex: number
  history: SavedSnapshot[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPosition(value: unknown, size: number): value is Position {
  if (!isRecord(value)) return false
  return Number.isInteger(value.row) && Number.isInteger(value.col) &&
    (value.row as number) >= 0 && (value.row as number) < size &&
    (value.col as number) >= 0 && (value.col as number) < size
}

function isPositions(value: unknown, size: number): value is Position[] {
  return Array.isArray(value) && value.every((position) => isPosition(position, size))
}

function isMarkList(value: unknown, size: number): value is string[] {
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  for (const mark of value) {
    if (typeof mark !== 'string') return false
    const match = /^(\d+),(\d+)$/.exec(mark)
    if (!match) return false
    const row = Number(match[1])
    const col = Number(match[2])
    if (row >= size || col >= size || seen.has(mark)) return false
    seen.add(mark)
  }
  return true
}

function isLevel(value: unknown, difficulty: Difficulty): value is Level {
  if (!isRecord(value) || value.difficulty !== difficulty) return false
  const size = value.size
  if (!Number.isInteger(size) || (size as number) < 4 || (size as number) > 12) return false
  const n = size as number
  if (!Array.isArray(value.cells) || value.cells.length !== n) return false
  for (let row = 0; row < n; row++) {
    const cells = value.cells[row]
    if (!Array.isArray(cells) || cells.length !== n) return false
    for (let col = 0; col < n; col++) {
      const cell = cells[col]
      if (!isRecord(cell) || cell.row !== row || cell.col !== col ||
        !Number.isInteger(cell.region) || (cell.region as number) < 0) return false
    }
  }
  return Array.isArray(value.solution) && value.solution.length === n &&
    isPositions(value.solution, n) &&
    new Set(value.solution.map((position) => `${position.row},${position.col}`)).size === n
}

function isRevealWave(value: unknown, size: number): value is SavedGame['revealWave'] {
  if (value === null) return true
  return isRecord(value) && isPosition(value.origin, size) && isPositions(value.positions, size) &&
    Number.isInteger(value.nonce) && (value.nonce as number) >= 0
}

function isReport(value: unknown): value is GenerationReport | null {
  if (value === null) return true
  if (!isRecord(value) || typeof value.accepted !== 'boolean' ||
    !Number.isFinite(value.totalMs) || (value.totalMs as number) < 0 || !Array.isArray(value.attempts)) return false
  return value.attempts.every((attempt) => isRecord(attempt) &&
    Number.isInteger(attempt.index) && typeof attempt.ok === 'boolean' &&
    Number.isFinite(attempt.ms) && (attempt.ms as number) >= 0 &&
    (attempt.reason === undefined || typeof attempt.reason === 'string'))
}

/** Parse one stored run and reject stale, malformed, or wrong-profile data. */
export function parseSavedGame(
  value: unknown,
  profileId: string,
  difficulty: Difficulty,
  completedCount: number,
): SavedGame | null {
  if (!isRecord(value) || value.version !== SAVED_GAME_VERSION || value.profileId !== profileId ||
    value.difficulty !== difficulty || !Number.isSafeInteger(value.levelIndex) ||
    (value.levelIndex as number) < 0 || !isLevel(value.level, difficulty)) return null

  const size = value.level.size as number
  const cats = value.cats
  const levelIndex = value.levelIndex as number
  if (!isPositions(cats, size) || new Set(cats.map((position) => `${position.row},${position.col}`)).size !== cats.length) return null
  const isCompletedRun = cats.length === size && levelIndex + 1 === completedCount
  if (levelIndex !== completedCount && !isCompletedRun) return null
  if (!isMarkList(value.pencilMarks, size) || !isMarkList(value.temporaryMarks, size) ||
    !isMarkList(value.temporaryCats, size) || !isMarkList(value.misses, size)) return null
  if (!Array.isArray(value.history) || value.history.length > 50 || !value.history.every((snapshot) =>
    isRecord(snapshot) && isPositions(snapshot.cats, size) &&
    isMarkList(snapshot.pencilMarks, size) && isMarkList(snapshot.temporaryMarks, size) &&
    isMarkList(snapshot.temporaryCats, size) && isMarkList(snapshot.misses, size))) return null
  if (!Number.isInteger(value.hearts) || (value.hearts as number) < 0 || (value.hearts as number) > 3) return null
  if (value.lastHeartOrigin !== null && !isPosition(value.lastHeartOrigin, size)) return null
  if (!isReport(value.report) || !isRevealWave(value.revealWave, size) ||
    !isRevealWave(value.temporaryCatWave, size) ||
    !Number.isInteger(value.revealWaveIndex) || (value.revealWaveIndex as number) < 0 ||
    !Number.isInteger(value.temporaryCatWaveIndex) || (value.temporaryCatWaveIndex as number) < 0) return null

  return value as unknown as SavedGame
}

export function serializeSavedGame(value: SavedGame): string {
  return JSON.stringify(value)
}

export function nextLevelIndexAfterContinue(currentLevelIndex: number, completedCount: number): number {
  return Math.max(currentLevelIndex + 1, completedCount)
}

export function savedGameStorageKey(profileId: string, difficulty: Difficulty): string {
  return `${SAVED_GAME_STORAGE_PREFIX}${profileId}:${difficulty}`
}

export function readSavedGame(
  raw: string | null,
  profileId: string,
  difficulty: Difficulty,
  completedCount: number,
): SavedGame | null {
  if (!raw) return null
  try {
    return parseSavedGame(JSON.parse(raw), profileId, difficulty, completedCount)
  } catch {
    return null
  }
}

export function buildSavedGame(input: Omit<SavedGame, 'version'>): SavedGame {
  return { version: SAVED_GAME_VERSION, ...input }
}
