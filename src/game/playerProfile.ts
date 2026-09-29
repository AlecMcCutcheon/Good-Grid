import type { Difficulty } from './types'
import { mulberry32, randomSizeForTier } from './levelGenerator'

export const PROFILE_STORAGE_KEY = 'petdoku.player-profile.v2'
export const LEGACY_PROFILE_STORAGE_KEY = 'petdoku.player-profile.v1'
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'extra-hard']

export type PlayerProfile = {
  version: 2
  id: string
  difficulty: Difficulty
  completed: Record<Difficulty, number>
}

type LegacyDifficulty = 'easy' | 'medium' | 'hard' | 'extra-hard'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_COMPLETIONS = 100_000_000

function validCompletionCounts(value: unknown, difficulties: string[]): value is Record<string, number> {
  if (!value || typeof value !== 'object') return false
  const counts = value as Record<string, unknown>
  return difficulties.every((difficulty) => {
    const count = counts[difficulty]
    return Number.isSafeInteger(count) && (count as number) >= 0 && (count as number) <= MAX_COMPLETIONS
  })
}

export function createPlayerProfile(id = createPlayerId()): PlayerProfile {
  return {
    version: 2,
    id,
    difficulty: 'easy',
    completed: { easy: 0, medium: 0, hard: 0, 'extra-hard': 0 },
  }
}

export function createPlayerId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 3) | 8).toString(16)
  })
}

/** Validate current profiles and migrate v1 profiles to the revised tier names. */
export function parsePlayerProfile(value: unknown): PlayerProfile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.id !== 'string' || !UUID_PATTERN.test(candidate.id)) return null

  if (candidate.version === 1) {
    const oldDifficulty = candidate.difficulty as LegacyDifficulty
    const oldTiers: LegacyDifficulty[] = ['easy', 'medium', 'hard', 'extra-hard']
    if (!oldTiers.includes(oldDifficulty) || !validCompletionCounts(candidate.completed, oldTiers)) return null
    const oldCounts = candidate.completed
    const difficultyMap: Record<LegacyDifficulty, Difficulty> = {
      easy: 'easy',
      medium: 'easy',
      hard: 'medium',
      'extra-hard': 'hard',
    }
    const difficulty = difficultyMap[oldDifficulty]
    return {
      version: 2,
      id: candidate.id.toLowerCase(),
      difficulty,
      completed: {
        easy: oldCounts.medium,
        medium: oldCounts.hard,
        hard: oldCounts['extra-hard'],
        'extra-hard': 0,
      },
    }
  }

  if (candidate.version !== 2 || !DIFFICULTIES.includes(candidate.difficulty as Difficulty)) return null
  if (!validCompletionCounts(candidate.completed, DIFFICULTIES)) return null
  const counts = candidate.completed
  return {
    version: 2,
    id: candidate.id.toLowerCase(),
    difficulty: candidate.difficulty as Difficulty,
    completed: {
      easy: counts.easy,
      medium: counts.medium,
      hard: counts.hard,
      'extra-hard': counts['extra-hard'],
    },
  }
}

export function hashText(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function levelSeedFor(profile: PlayerProfile, difficulty: Difficulty): number {
  return hashText(`${profile.id}:${difficulty}:${profile.completed[difficulty]}`)
}

export function levelSizeFor(profile: PlayerProfile, difficulty: Difficulty): number {
  return randomSizeForTier(difficulty, mulberry32(levelSeedFor(profile, difficulty)))
}

function checksum(payload: string, version: 1 | 2): string {
  return hashText(`petdoku-profile-v${version}:${payload}`).toString(16).padStart(8, '0')
}

export function encodePlayerProfile(profile: PlayerProfile): string {
  const validated = parsePlayerProfile(profile)
  if (!validated) throw new Error('Cannot encode an invalid player profile')
  const compactDifficulty = { easy: 'e', medium: 'm', hard: 'h', 'extra-hard': 'x' }[validated.difficulty]
  const compactCounts = [validated.completed.easy, validated.completed.medium, validated.completed.hard, validated.completed['extra-hard']]
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 2, i: validated.id, d: compactDifficulty, c: compactCounts }))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `PD2-${payload}-${checksum(payload, 2)}`
}

export function decodePlayerProfile(code: string): PlayerProfile | null {
  const match = /^PD([12])-([A-Za-z0-9_-]+)-([0-9a-f]{8})$/i.exec(code.trim())
  if (!match) return null
  const codeVersion = Number(match[1]) as 1 | 2
  if (checksum(match[2], codeVersion) !== match[3].toLowerCase()) return null

  try {
    const base64 = match[2].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed || typeof parsed !== 'object') return null
    const compact = parsed as { v?: unknown; i?: unknown; d?: unknown; c?: unknown }
    if (!Array.isArray(compact.c) || compact.c.length !== 4) return null
    const codeDifficulty = ({ e: 'easy', m: 'medium', h: 'hard', x: 'extra-hard' } as const)[compact.d as 'e' | 'm' | 'h' | 'x']
    if (!codeDifficulty) return null

    if (codeVersion === 1) {
      const completed = { easy: compact.c[0], medium: compact.c[1], hard: compact.c[2], 'extra-hard': compact.c[3] }
      return parsePlayerProfile({ version: 1, id: compact.i, difficulty: codeDifficulty, completed })
    }
    const completed = { easy: compact.c[0], medium: compact.c[1], hard: compact.c[2], 'extra-hard': compact.c[3] }
    return parsePlayerProfile({ version: compact.v, id: compact.i, difficulty: codeDifficulty, completed })
  } catch {
    return null
  }
}
