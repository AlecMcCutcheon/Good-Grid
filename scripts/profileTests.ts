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
  difficulty: 'extra-hard' as const,
  completed: { easy: 19, medium: 7, hard: 1, 'extra-hard': 0 },
}
const code = encodePlayerProfile(profile)
const imported = decodePlayerProfile(code)
assert(JSON.stringify(imported) === JSON.stringify(profile), 'Progress code should round-trip all profile fields')
assert(decodePlayerProfile(`${code.slice(0, -1)}0`) === null, 'A modified progress code must fail checksum validation')
assert(decodePlayerProfile('PD2-invalid-00000000') === null, 'Malformed progress codes must be rejected')
const legacyProfile = {
  v: 1,
  i: profile.id,
  d: 'x',
  c: [2, 19, 7, 1],
}
const legacyPayload = btoa(JSON.stringify(legacyProfile)).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/g, '')
let legacyHash = 0x811c9dc5
for (const char of `petdoku-profile-v1:${legacyPayload}`) {
  legacyHash ^= char.charCodeAt(0)
  legacyHash = Math.imul(legacyHash, 0x01000193)
}
const legacyCode = `PD1-${legacyPayload}-${(legacyHash >>> 0).toString(16).padStart(8, '0')}`
assert(decodePlayerProfile(legacyCode)?.difficulty === 'hard', 'Legacy progress codes should migrate their selected tier')
assert(parsePlayerProfile({ ...profile, completed: { ...profile.completed, easy: -1 } }) === null, 'Negative completion count must be rejected')
const migrated = parsePlayerProfile({
  version: 1,
  id: profile.id,
  difficulty: 'extra-hard',
  completed: { easy: 2, medium: 19, hard: 7, 'extra-hard': 1 },
})
assert(migrated?.difficulty === 'hard', 'Legacy extra-hard selection should migrate to hard')
assert(JSON.stringify(migrated?.completed) === JSON.stringify({ easy: 19, medium: 7, hard: 1, 'extra-hard': 0 }), 'Legacy tier completions should shift down and reset the new tier')
assert(parsePlayerProfile({ ...profile, version: 1, difficulty: 'medium', completed: { easy: 2, medium: 19, hard: 7, 'extra-hard': 1 } })?.difficulty === 'easy', 'Legacy medium selection should migrate to easy')
assert(parsePlayerProfile({ ...profile, version: 1, difficulty: 'easy', completed: { easy: 2, medium: 19, hard: 7, 'extra-hard': 1 } })?.difficulty === 'easy', 'Removed legacy easy selection should fall back to the lowest available tier')
assert(parsePlayerProfile({ ...profile, version: 1, difficulty: 'hard', completed: { easy: 2, medium: 19, hard: 7, 'extra-hard': 1 } })?.difficulty === 'medium', 'Legacy hard selection should migrate to medium')
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
