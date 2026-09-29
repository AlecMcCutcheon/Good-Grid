import {
  createPlayerProfile,
  decodePlayerProfile,
  encodePlayerProfile,
  levelSeedFor,
  levelSizeFor,
  parsePlayerProfile,
} from '../src/game/playerProfile'
import { generateLevel } from '../src/game/levelGenerator'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const profile = {
  ...createPlayerProfile('123e4567-e89b-42d3-a456-426614174000'),
  difficulty: 'hard' as const,
  completed: { easy: 2, medium: 19, hard: 7, 'extra-hard': 1 },
}
const code = encodePlayerProfile(profile)
const imported = decodePlayerProfile(code)
assert(JSON.stringify(imported) === JSON.stringify(profile), 'Progress code should round-trip all profile fields')
assert(decodePlayerProfile(`${code.slice(0, -1)}0`) === null, 'A modified progress code must fail checksum validation')
assert(decodePlayerProfile('PD1-invalid-00000000') === null, 'Malformed progress codes must be rejected')
assert(parsePlayerProfile({ ...profile, completed: { ...profile.completed, easy: -1 } }) === null, 'Negative completion count must be rejected')
assert(parsePlayerProfile({ ...profile, id: 'not-a-uuid' }) === null, 'Invalid profile IDs must be rejected')

for (const difficulty of ['easy', 'medium', 'hard', 'extra-hard'] as const) {
  const seed = levelSeedFor(profile, difficulty)
  assert(seed === levelSeedFor(imported!, difficulty), `${difficulty} seed should be stable after code import`)
  const size = levelSizeFor(profile, difficulty)
  assert(size === levelSizeFor(imported!, difficulty), `${difficulty} size should be deterministic`)
  const first = generateLevel({ difficulty, size, seed })
  const second = generateLevel({ difficulty, size, seed })
  assert(first.level.size === second.level.size, `${difficulty} board sizes should be reproducible`)
  assert(JSON.stringify(first.level.cells) === JSON.stringify(second.level.cells), `${difficulty} boards should be reproducible from profile seed`)
  assert(JSON.stringify(first.level.solution) === JSON.stringify(second.level.solution), `${difficulty} solutions should be reproducible from profile seed`)
}

const advanced = { ...profile, completed: { ...profile.completed, hard: profile.completed.hard + 1 } }
assert(levelSeedFor(advanced, 'hard') !== levelSeedFor(profile, 'hard'), 'Completing a puzzle should advance that difficulty seed')
assert(levelSeedFor(advanced, 'easy') === levelSeedFor(profile, 'easy'), 'Other difficulty tracks should retain their own seed progression')

console.log('Profile tests passed: portable code validation and per-tier deterministic progression')
