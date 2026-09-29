import {
  buildSavedGame,
  nextLevelIndexAfterContinue,
  parseSavedGame,
  readSavedGame,
  savedGameStorageKey,
  serializeSavedGame,
} from '../src/game/savedGame'
import { createPlayerProfile } from '../src/game/playerProfile'
import { generateLevel } from '../src/game/levelGenerator'
import type { Difficulty } from '../src/game/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const profile = createPlayerProfile('123e4567-e89b-42d3-a456-426614174000')
const { level, report } = generateLevel({ difficulty: 'easy' as Difficulty, size: 5, seed: 1729 })
const completedCount = profile.completed.easy
const saved = buildSavedGame({
  profileId: profile.id,
  difficulty: 'easy',
  levelIndex: completedCount,
  level,
  report,
  cats: [level.solution[0]],
  pencilMarks: ['0,1', '2,3'],
  temporaryMarks: ['1,2'],
  temporaryCats: ['3,4'],
  misses: ['4,0'],
  hearts: 2,
  lastHeartOrigin: null,
  revealWave: { origin: level.solution[0], positions: [level.solution[0], { row: 0, col: 1 }], nonce: 7 },
  revealWaveIndex: 1,
  temporaryCatWave: null,
  temporaryCatWaveIndex: 0,
  history: [{
    cats: [],
    pencilMarks: [],
    temporaryMarks: [],
    temporaryCats: [],
    misses: [],
  }],
})
const serialized = serializeSavedGame(saved)
const restored = readSavedGame(serialized, profile.id, 'easy', completedCount)
assert(restored !== null, 'Current saved puzzle should restore for matching profile, tier, and progress')
assert(JSON.stringify(restored.cats) === JSON.stringify(saved.cats), 'Found smiles should persist')
assert(JSON.stringify(restored.pencilMarks) === JSON.stringify(saved.pencilMarks), 'Permanent Xs should persist')
assert(JSON.stringify(restored.temporaryMarks) === JSON.stringify(saved.temporaryMarks), 'Temporary Xs should persist')
assert(JSON.stringify(restored.temporaryCats) === JSON.stringify(saved.temporaryCats), 'Temporary smile preview should persist')
assert(restored.hearts === 2 && restored.revealWaveIndex === 1, 'Attempt hearts and reveal progress should persist')
assert(restored.history.length === 1, 'Undo snapshots should persist with the current puzzle')
assert(savedGameStorageKey(profile.id, 'easy') !== savedGameStorageKey(profile.id, 'medium'), 'Difficulty caches must have separate keys')
assert(readSavedGame(serialized, '223e4567-e89b-42d3-a456-426614174000', 'easy', 0) === null, 'Cached puzzles must not cross profile identity')
assert(readSavedGame(serialized, profile.id, 'medium', 0) === null, 'Cached puzzles must not cross difficulty')
assert(readSavedGame(serialized, profile.id, 'easy', 1) === null, 'An unfinished old cache should invalidate after the tier advances')
const completedSave = { ...saved, cats: [...level.solution] }
assert(readSavedGame(serializeSavedGame(completedSave), profile.id, 'easy', 1) !== null, 'A completed run should remain resumable if progress was saved before Continue')
assert(nextLevelIndexAfterContinue(0, 0) === 1, 'Continue should advance an unrecorded completion')
assert(nextLevelIndexAfterContinue(0, 1) === 1, 'Continue should not double-advance an already-recorded completion')
assert(readSavedGame('{bad json', profile.id, 'easy', 0) === null, 'Malformed local data should fall back to generation')
assert(parseSavedGame({ ...saved, pencilMarks: ['99,99'] }, profile.id, 'easy', 0) === null, 'Out-of-bounds saved marks must be rejected')

assert(parseSavedGame(saved, profile.id, 'easy', 1) === null, 'An old cached puzzle must not restore after progression')
const wrongLevelIndex = { ...saved, levelIndex: 1 }
assert(parseSavedGame(wrongLevelIndex, profile.id, 'easy', 0) === null, 'A puzzle from a later progression index must not restore')

console.log('Saved-game tests passed: per-tier caching, run restoration, validation, and progression invalidation')
