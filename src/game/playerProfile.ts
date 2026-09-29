import type { Difficulty } from './types'
import { mulberry32, randomSizeForTier } from './levelGenerator'

export const PROFILE_STORAGE_KEY = 'petdoku.player-profile.v1'
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'extra-hard']

export type PlayerProfile = {
  version: 1
  id: string
  difficulty: Difficulty
  completed: Record<Difficulty, number>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_COMPLETIONS = 100_000_000

export function createPlayerProfile(id = createPlayerId()): PlayerProfile {
  return {
    version: 1,
    id,
    difficulty: 'medium',
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

export function parsePlayerProfile(value: unknown): PlayerProfile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<PlayerProfile>
  if (candidate.version !== 1 || typeof candidate.id !== 'string' || !UUID_PATTERN.test(candidate.id)) return null
  if (!DIFFICULTIES.includes(candidate.difficulty as Difficulty)) return null
  if (!candidate.completed || typeof candidate.completed !== 'object') return null

  const completed = {} as Record<Difficulty, number>
  for (const difficulty of DIFFICULTIES) {
    const count = (candidate.completed as Record<string, unknown>)[difficulty]
    if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > MAX_COMPLETIONS) return null
    completed[difficulty] = count as number
  }
  return { version: 1, id: candidate.id.toLowerCase(), difficulty: candidate.difficulty as Difficulty, completed }
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

function checksum(payload: string): string {
  return hashText(`petdoku-profile-v1:${payload}`).toString(16).padStart(8, '0')
}

export function encodePlayerProfile(profile: PlayerProfile): string {
  const validated = parsePlayerProfile(profile)
  if (!validated) throw new Error('Cannot encode an invalid player profile')
  const compactDifficulty = { easy: 'e', medium: 'm', hard: 'h', 'extra-hard': 'x' }[validated.difficulty]
  const compactCounts = [validated.completed.easy, validated.completed.medium, validated.completed.hard, validated.completed['extra-hard']]
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, i: validated.id, d: compactDifficulty, c: compactCounts }))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `PD1-${payload}-${checksum(payload)}`
}

export function decodePlayerProfile(code: string): PlayerProfile | null {
  const match = /^PD1-([A-Za-z0-9_-]+)-([0-9a-f]{8})$/i.exec(code.trim())
  if (!match || checksum(match[1]) !== match[2].toLowerCase()) return null

  try {
    const base64 = match[1].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed || typeof parsed !== 'object') return null
    const compact = parsed as { v?: unknown; i?: unknown; d?: unknown; c?: unknown }
    const difficulty = ({ e: 'easy', m: 'medium', h: 'hard', x: 'extra-hard' } as const)[compact.d as 'e' | 'm' | 'h' | 'x']
    if (!difficulty) return null
    if (!Array.isArray(compact.c) || compact.c.length !== 4) return null
    const completed = { easy: compact.c[0], medium: compact.c[1], hard: compact.c[2], 'extra-hard': compact.c[3] }
    return parsePlayerProfile({ version: compact.v, id: compact.i, difficulty, completed })
  } catch {
    return null
  }
}
