import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, GenerationReport, Level, Position } from './game/types'
import { generateLevel } from './game/levelGenerator'
import { createPlayerProfile, levelSeedFor, levelSizeFor, parsePlayerProfile, PROFILE_STORAGE_KEY, LEGACY_PROFILE_STORAGE_KEY, type PlayerProfile } from './game/playerProfile'
import { PALETTES, DEFAULT_PALETTE_INDEX, buildRegionColors } from './game/palettes'
import { nextHint, type HintStep } from './game/hints'
import { buildWalkthrough } from './game/walkthrough'
import type { WalkthroughStep } from './game/walkthrough'
import { Board } from './components/Board'
import { REVEAL_TOTAL_MS, autoFillRevealStepDelayMs, revealStepDelayMs } from './components/Cell'
import { Controls } from './components/Controls'
import { RuleCards } from './components/RuleCards'
import { DevPanel } from './components/DevPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { HeartIcon } from './components/Icons'
import { getAutoFilledPositions, orderPositionsRadially } from './game/rules'
import { applyMarkDrag } from './game/markDrag'

const key = (row: number, col: number) => `${row},${col}`
const MAX_HEARTS = 3

type RevealWave = { origin: Position; positions: Position[]; nonce: number }

function readSavedProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    const legacyRaw = raw ? null : localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY)
    const savedProfile = raw ?? legacyRaw
    const parsed = savedProfile ? parsePlayerProfile(JSON.parse(savedProfile)) : null
    return parsed ?? createPlayerProfile()
  } catch {
    return createPlayerProfile()
  }
}

type Snapshot = {
  cats: Position[]
  pencilMarks: Set<string>
  temporaryMarks: Set<string>
  temporaryCats: Set<string>
  misses: Set<string>
}

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(readSavedProfile)
  const profileRef = useRef(profile)
  profileRef.current = profile
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [levelEpoch, setLevelEpoch] = useState(0)
  const completedEpoch = useRef(-1)
  const levelLoadTimer = useRef<number | null>(null)
  const levelTransitionTimer = useRef<number | null>(null)
  const transitionNonce = useRef(0)
  const hasLoadedLevel = useRef(false)
  const [level, setLevel] = useState<Level | null>(null)
  const [levelTransition, setLevelTransition] = useState<{ origin: Position; nonce: number } | null>(null)
  const [report, setReport] = useState<GenerationReport | null>(null)
  const [hearts, setHearts] = useState(MAX_HEARTS)
  const [lastHeartOrigin, setLastHeartOrigin] = useState<Position | null>(null)
  const [cats, setCats] = useState<Position[]>([])
  const [pencilMarks, setPencilMarks] = useState<Set<string>>(new Set())
  const [temporaryMarks, setTemporaryMarks] = useState<Set<string>>(new Set())
  const [temporaryCats, setTemporaryCats] = useState<Set<string>>(new Set())
  const [misses, setMisses] = useState<Set<string>>(new Set())
  const [revealWave, setRevealWave] = useState<RevealWave | null>(null)
  const [revealWaveIndex, setRevealWaveIndex] = useState(0)
  const [temporaryCatWave, setTemporaryCatWave] = useState<RevealWave | null>(null)
  const [temporaryCatWaveIndex, setTemporaryCatWaveIndex] = useState(0)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [devMode, setDevMode] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeHint, setActiveHint] = useState<HintStep | null>(null)
  const [activeHintRevealCount, setActiveHintRevealCount] = useState(0)
  const [walkthroughIndex, setWalkthroughIndex] = useState<number | null>(null)
  const [walkthroughRevealCount, setWalkthroughRevealCount] = useState(0)

  const difficulty = profile.difficulty
  const won = level != null && cats.length === level.size
  const palette = PALETTES[DEFAULT_PALETTE_INDEX]
  const generateProfileLevel = useCallback((targetProfile: PlayerProfile, tier: Difficulty) => {
    const seed = levelSeedFor(targetProfile, tier)
    return generateLevel({ difficulty: tier, seed, size: levelSizeFor(targetProfile, tier) })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
    } catch {
      // The in-memory profile still works when browser storage is unavailable.
    }
  }, [profile])
  const walkthrough = useMemo(
    () => level ? buildWalkthrough(level.cells) : [],
    [level],
  )
  const walkthroughStep: WalkthroughStep | null = walkthroughIndex == null
    ? null
    : walkthrough[walkthroughIndex] ?? null
  const visibleWalkthroughStep: WalkthroughStep | null = walkthroughStep
    ? {
        ...walkthroughStep,
        addedXs: walkthroughStep.addedXs.slice(0, walkthroughRevealCount),
        visibleXs: walkthroughStep.visibleXs.filter((p) =>
          !walkthroughStep.addedXs.some((added) => added.row === p.row && added.col === p.col) ||
          walkthroughStep.addedXs.findIndex((added) => added.row === p.row && added.col === p.col) < walkthroughRevealCount,
        ),
      }
    : null

  useEffect(() => {
    if (!showSolution || !walkthroughStep || walkthroughRevealCount >= walkthroughStep.addedXs.length) return
    const delay = walkthroughRevealCount === 0
      ? 0
      : revealStepDelayMs(walkthroughStep.addedXs.length)
    const timer = window.setTimeout(() => setWalkthroughRevealCount((count) => count + 1), delay)
    return () => window.clearTimeout(timer)
  }, [showSolution, walkthroughStep, walkthroughRevealCount])

  useEffect(() => {
    if (!activeHint || activeHint.kind !== 'elimination' || activeHintRevealCount >= activeHint.eliminate.length) return
    const delay = revealStepDelayMs(activeHint.eliminate.length)
    const timer = window.setTimeout(() => setActiveHintRevealCount((count) => count + 1), delay)
    return () => window.clearTimeout(timer)
  }, [activeHint, activeHintRevealCount])

  const startLevel = useCallback((
    lvl: Level,
    rep: GenerationReport | null,
    transitionOrigin?: Position,
    transitionOriginSize = lvl.size,
  ) => {
    if (levelTransitionTimer.current !== null) window.clearTimeout(levelTransitionTimer.current)
    setRevealWave(null)
    setRevealWaveIndex(0)
    setTemporaryCatWave(null)
    setTemporaryCatWaveIndex(0)
    if (hasLoadedLevel.current) {
      const origin = transitionOrigin
        ? {
            row: Math.round((transitionOrigin.row / Math.max(1, transitionOriginSize - 1)) * (lvl.size - 1)),
            col: Math.round((transitionOrigin.col / Math.max(1, transitionOriginSize - 1)) * (lvl.size - 1)),
          }
        : { row: Math.floor(Math.random() * lvl.size), col: Math.floor(Math.random() * lvl.size) }
      const nonce = ++transitionNonce.current
      setLevelTransition({ origin, nonce })
      levelTransitionTimer.current = window.setTimeout(() => {
        setLevelTransition(null)
        levelTransitionTimer.current = null
      }, REVEAL_TOTAL_MS + 450)
    } else {
      hasLoadedLevel.current = true
      setLevelTransition(null)
    }
    setLevelEpoch((epoch) => epoch + 1)
    setLevel(lvl)
    if (rep !== null) setReport(rep)
    setHearts(MAX_HEARTS)
    setLastHeartOrigin(null)
    setCats([])
    setPencilMarks(new Set())
    setTemporaryMarks(new Set())
    setTemporaryCats(new Set())
    setMisses(new Set())
    setHistory([])
    setActiveHint(null)
    setActiveHintRevealCount(0)
    setWalkthroughIndex(null)
    setWalkthroughRevealCount(0)
    setShowSolution(false)
  }, [])

  useEffect(() => () => {
    if (levelTransitionTimer.current !== null) window.clearTimeout(levelTransitionTimer.current)
  }, [])

  useEffect(() => {
    if (!revealWave) {
      if (revealWaveIndex !== 0) setRevealWaveIndex(0)
      return
    }
    if (revealWaveIndex > 1 && revealWaveIndex <= revealWave.positions.length) {
      const reachedPosition = revealWave.positions[revealWaveIndex - 1]
      if (reachedPosition) {
        setPencilMarks((previous) => new Set(previous).add(key(reachedPosition.row, reachedPosition.col)))
      }
    }
    if (revealWaveIndex >= revealWave.positions.length) {
      setRevealWave(null)
      setRevealWaveIndex(0)
      return
    }

    const delay = revealWaveIndex === 0 ? 0 : autoFillRevealStepDelayMs(revealWave.positions.length)
    const timer = window.setTimeout(() => {
      setRevealWaveIndex((index) => index + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [revealWave, revealWaveIndex])

  useEffect(() => {
    if (!temporaryCatWave || temporaryCatWaveIndex >= temporaryCatWave.positions.length) return
    const delay = temporaryCatWaveIndex === 0 ? 0 : autoFillRevealStepDelayMs(temporaryCatWave.positions.length)
    const timer = window.setTimeout(() => {
      setTemporaryCatWaveIndex((index) => index + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [temporaryCatWave, temporaryCatWaveIndex])

  useEffect(() => {
    setGenerating(true)
    levelLoadTimer.current = window.setTimeout(() => {
      const generated = generateProfileLevel(profileRef.current, profileRef.current.difficulty)
      startLevel(generated.level, generated.report)
      setGenerating(false)
      levelLoadTimer.current = null
    }, 20)
    return () => {
      if (levelLoadTimer.current !== null) window.clearTimeout(levelLoadTimer.current)
      levelLoadTimer.current = null
    }
    // The initial mount starts the default tier; later changes go through newLevel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateProfileLevel, startLevel])

  const changeDifficulty = useCallback((nextDifficulty: Difficulty) => {
    if (nextDifficulty === profileRef.current.difficulty) return
    if (levelLoadTimer.current !== null) window.clearTimeout(levelLoadTimer.current)
    levelLoadTimer.current = null
    const nextProfile = { ...profileRef.current, difficulty: nextDifficulty }
    profileRef.current = nextProfile
    setProfile(nextProfile)
    setGenerating(true)
    levelLoadTimer.current = window.setTimeout(() => {
      const generated = generateProfileLevel(nextProfile, nextDifficulty)
      startLevel(generated.level, generated.report)
      setGenerating(false)
      levelLoadTimer.current = null
    }, 20)
  }, [generateProfileLevel, startLevel])

  const importProfile = useCallback((nextProfile: PlayerProfile) => {
    if (levelLoadTimer.current !== null) window.clearTimeout(levelLoadTimer.current)
    levelLoadTimer.current = null
    profileRef.current = nextProfile
    setProfile(nextProfile)
    setGenerating(true)
    levelLoadTimer.current = window.setTimeout(() => {
      const generated = generateProfileLevel(nextProfile, nextProfile.difficulty)
      startLevel(generated.level, generated.report)
      setGenerating(false)
      setSettingsOpen(false)
      levelLoadTimer.current = null
    }, 20)
  }, [generateProfileLevel, startLevel])

  const restartCurrentLevel = useCallback((transitionOrigin?: Position) => {
    if (!level) return
    if (levelLoadTimer.current !== null) window.clearTimeout(levelLoadTimer.current)
    levelLoadTimer.current = null
    setGenerating(false)
    startLevel(level, report, transitionOrigin, level.size)
  }, [level, report, startLevel])

  const continueToNextLevel = useCallback(() => {
    if (!won || !level) return
    const winningSmile = cats[cats.length - 1]
    if (levelLoadTimer.current !== null) window.clearTimeout(levelLoadTimer.current)
    setGenerating(true)
    levelLoadTimer.current = window.setTimeout(() => {
      const generated = generateProfileLevel(profileRef.current, profileRef.current.difficulty)
      startLevel(generated.level, generated.report, winningSmile, level.size)
      setGenerating(false)
      levelLoadTimer.current = null
    }, 20)
  }, [won, level, cats, generateProfileLevel, startLevel])

  useEffect(() => {
    if (!won || !level || completedEpoch.current === levelEpoch) return
    completedEpoch.current = levelEpoch
    const currentProfile = profileRef.current
    const nextProfile: PlayerProfile = {
      ...currentProfile,
      completed: {
        ...currentProfile.completed,
        [level.difficulty]: currentProfile.completed[level.difficulty] + 1,
      },
    }
    profileRef.current = nextProfile
    setProfile(nextProfile)
  }, [won, level, levelEpoch])

  const pushHistory = useCallback(() => {
    setHistory((previous) => [
      ...previous.slice(-40),
      {
        cats: [...cats],
        pencilMarks: new Set(pencilMarks),
        temporaryMarks: new Set(temporaryMarks),
        temporaryCats: new Set(temporaryCats),
        misses: new Set(misses),
      },
    ])
  }, [cats, pencilMarks, temporaryMarks, temporaryCats, misses])

  const undo = useCallback(() => {
    // Hearts belong to the level attempt, not the undoable board snapshot.
    if (won || hearts <= 0) return
    setHistory((previous) => {
      if (previous.length === 0) return previous
      const snapshot = previous[previous.length - 1]
      setCats(snapshot.cats)
      setPencilMarks(new Set(snapshot.pencilMarks))
      setTemporaryMarks(new Set(snapshot.temporaryMarks))
      setTemporaryCats(new Set(snapshot.temporaryCats))
      setMisses(new Set(snapshot.misses))
      setActiveHint(null)
      setActiveHintRevealCount(0)
      setWalkthroughIndex(null)
      setShowSolution(false)
      setWalkthroughRevealCount(0)
      return previous.slice(0, -1)
    })
  }, [won, hearts])

  const hint = useCallback(() => {
    if (!level || activeHint || won || hearts <= 0) return
    setWalkthroughIndex(null)
    setWalkthroughRevealCount(0)
    const next = nextHint(level.cells, cats, pencilMarks, level.solution)
    setActiveHint(next)
    setActiveHintRevealCount(next?.kind === 'elimination' ? 1 : 0)
  }, [level, cats, pencilMarks, activeHint, won, hearts])

  const applyHint = useCallback(() => {
    if (!activeHint) return
    pushHistory()
    if (activeHint.kind === 'wrong-mark' && activeHint.wrongMark) {
      const wrongKey = key(activeHint.wrongMark.row, activeHint.wrongMark.col)
      setPencilMarks((previous) => {
        const next = new Set(previous)
        next.delete(wrongKey)
        return next
      })
    } else if (activeHint.kind === 'elimination') {
      const eliminated = new Set(activeHint.eliminate.map((p) => key(p.row, p.col)))
      setPencilMarks((previous) => new Set([...previous, ...eliminated]))
      setTemporaryMarks((previous) => {
        const next = new Set(previous)
        for (const mark of eliminated) next.delete(mark)
        return next
      })
    }
    setActiveHint(null)
    setActiveHintRevealCount(0)
    setWalkthroughIndex(null)
    setShowSolution(false)
    setWalkthroughRevealCount(0)
  }, [activeHint, pushHistory])

  const clearHint = useCallback(() => {
    setActiveHint(null)
    setActiveHintRevealCount(0)
  }, [])

  const handleSingleClick = useCallback((row: number, col: number) => {
    const mark = key(row, col)
    if (temporaryCats.size > 0) {
      setTemporaryCats(new Set())
      setTemporaryCatWave(null)
      setTemporaryCatWaveIndex(0)
    }
    if (misses.has(mark)) {
      pushHistory()
      setMisses((previous) => {
        const next = new Set(previous)
        next.delete(mark)
        return next
      })
      return
    }
    if (cats.some((cat) => cat.row === row && cat.col === col)) return

    pushHistory()
    if (temporaryMarks.has(mark)) {
      setTemporaryMarks((previous) => {
        const next = new Set(previous)
        next.delete(mark)
        return next
      })
      setPencilMarks((previous) => new Set(previous).add(mark))
    } else {
      setPencilMarks((previous) => {
        const next = new Set(previous)
        if (next.has(mark)) next.delete(mark)
        else next.add(mark)
        return next
      })
    }
    setActiveHint(null)
    setActiveHintRevealCount(0)
  }, [misses, cats, temporaryMarks, temporaryCats, pushHistory])

  const handleMarkDrag = useCallback((positions: Position[], temporary: boolean, erase: boolean) => {
    if (won) return
    const currentTarget = temporary ? temporaryMarks : pencilMarks
    const startPosition = positions[0]
    const eraseExisting = startPosition
      ? currentTarget.has(key(startPosition.row, startPosition.col))
      : erase
    const eligible = positions.filter(({ row, col }) => {
      const mark = key(row, col)
      return !cats.some((cat) => cat.row === row && cat.col === col) && !misses.has(mark)
    })
    if (eligible.length === 0) return

    const keys = new Set(eligible.map(({ row, col }) => key(row, col)))
    const nextPermanent = temporary
      ? pencilMarks
      : applyMarkDrag(pencilMarks, eligible, eraseExisting)
    const temporaryTargets = temporary
      ? eligible.filter((position) => eraseExisting || !pencilMarks.has(key(position.row, position.col)))
      : eligible
    const nextTemporary = temporary
      ? applyMarkDrag(temporaryMarks, temporaryTargets, eraseExisting)
      : eraseExisting
        ? temporaryMarks
        : new Set([...temporaryMarks].filter((mark) => !keys.has(mark)))
    const nextTemporaryCats = eraseExisting
      ? temporaryCats
      : new Set([...temporaryCats].filter((mark) => !keys.has(mark)))
    const setsEqual = (left: Set<string>, right: Set<string>) =>
      left.size === right.size && [...left].every((value) => right.has(value))

    if (
      setsEqual(pencilMarks, nextPermanent) &&
      setsEqual(temporaryMarks, nextTemporary) &&
      setsEqual(temporaryCats, nextTemporaryCats)
    ) return

    pushHistory()
    setPencilMarks(nextPermanent)
    setTemporaryMarks(nextTemporary)
    setTemporaryCats(nextTemporaryCats)
    setActiveHint(null)
    setActiveHintRevealCount(0)
  }, [won, hearts, cats, misses, pencilMarks, temporaryMarks, temporaryCats, pushHistory])

  const handleTemporaryClick = useCallback((row: number, col: number) => {
    const mark = key(row, col)
    if (cats.some((cat) => cat.row === row && cat.col === col) || misses.has(mark) || pencilMarks.has(mark)) return
    const clearingTemporaryCat = temporaryCats.has(mark)
    if (clearingTemporaryCat) {
      setTemporaryCatWave(null)
      setTemporaryCatWaveIndex(0)
    }
    pushHistory()
    setTemporaryMarks((previous) => {
      const next = new Set(previous)
      if (next.has(mark)) next.delete(mark)
      else next.add(mark)
      return next
    })
    setTemporaryCats((previous) => {
      const next = new Set(previous)
      next.delete(mark)
      return next
    })
  }, [cats, misses, pencilMarks, pushHistory, temporaryCats])

  const handleTemporaryCatClick = useCallback((row: number, col: number) => {
    const mark = key(row, col)
    if (
      !level ||
      cats.some((cat) => cat.row === row && cat.col === col) ||
      misses.has(mark) || pencilMarks.has(mark)
    ) return

    pushHistory()
    setTemporaryMarks((previous) => {
      const next = new Set(previous)
      next.delete(mark)
      return next
    })
    const togglingOff = temporaryCats.has(mark)
    const catKeys = new Set(cats.map((cat) => key(cat.row, cat.col)))
    const previewPositions = orderPositionsRadially(
      [
        { row, col },
        ...getAutoFilledPositions(level.cells, { row, col }).filter((position) =>
          !catKeys.has(key(position.row, position.col)) &&
          !pencilMarks.has(key(position.row, position.col)),
        ),
      ],
      { row, col },
    )
    const previewNonce = (temporaryCatWave?.nonce ?? 0) + 1
    setTemporaryCats((previous) =>
      previous.has(mark) ? new Set() : new Set([mark]),
    )
    if (togglingOff) {
      setTemporaryCatWave(null)
      setTemporaryCatWaveIndex(0)
    } else {
      setTemporaryCatWaveIndex(0)
      setTemporaryCatWave({ origin: { row, col }, positions: previewPositions, nonce: previewNonce })
    }
    setActiveHint(null)
    setActiveHintRevealCount(0)
  }, [level, cats, misses, pencilMarks, pushHistory, temporaryCats, temporaryCatWave])

  const clearTemporaryMarks = useCallback(() => {
    if (temporaryMarks.size === 0 && temporaryCats.size === 0) return
    pushHistory()
    setTemporaryMarks(new Set())
    setTemporaryCats(new Set())
    setTemporaryCatWave(null)
    setTemporaryCatWaveIndex(0)
  }, [temporaryMarks, temporaryCats, pushHistory])

  const handleDoubleClick = useCallback((row: number, col: number) => {
    if (!level) return
    setTemporaryCats(new Set())
    setTemporaryCatWave(null)
    setTemporaryCatWaveIndex(0)
    const mark = key(row, col)
    if (
      cats.some((cat) => cat.row === row && cat.col === col) ||
      misses.has(mark) || hearts <= 0
    ) return

    pushHistory()
    const isCat = level.solution.some((pos) => pos.row === row && pos.col === col)
    if (!isCat) {
      setMisses((previous) => new Set(previous).add(mark))
      setPencilMarks((previous) => {
        const next = new Set(previous)
        next.delete(mark)
        return next
      })
      setTemporaryMarks((previous) => {
        const next = new Set(previous)
        next.delete(mark)
        return next
      })
      setTemporaryCats((previous) => {
        const next = new Set(previous)
        next.delete(mark)
        return next
      })
      if (hearts === 1) setLastHeartOrigin({ row, col })
      setHearts((previous) => Math.max(0, previous - 1))
      setActiveHint(null)
      setActiveHintRevealCount(0)
      return
    }

    const autoFilledList = getAutoFilledPositions(level.cells, { row, col })
    const catKeys = new Set(cats.map((cat) => key(cat.row, cat.col)))
    const autoFilled = new Set(
      autoFilledList
        .filter((pos) => !catKeys.has(key(pos.row, pos.col)))
        .map((pos) => key(pos.row, pos.col)),
    )
    // Keep the full destination set pending: Xs become permanent only as the
    // radial wave reaches their cells.
    const revealPositions = orderPositionsRadially(
      [{ row, col }, ...autoFilledList.filter((pos) => !catKeys.has(key(pos.row, pos.col)))],
      { row, col },
    )
    const nextNonce = (revealWave?.nonce ?? 0) + 1
    setRevealWaveIndex(0)
    setRevealWave({ origin: { row, col }, positions: revealPositions, nonce: nextNonce })

    setCats((previous) => [...previous, { row, col }])
    setTemporaryCats((previous) => {
      const next = new Set(previous)
      next.delete(mark)
      for (const excluded of autoFilled) next.delete(excluded)
      return next
    })
    setTemporaryMarks((previous) => {
      const next = new Set(previous)
      next.delete(mark)
      for (const excluded of autoFilled) next.delete(excluded)
      return next
    })
    setMisses((previous) => {
      const next = new Set(previous)
      next.delete(mark)
      return next
    })
    setActiveHint(null)
    setActiveHintRevealCount(0)
    setWalkthroughIndex(null)
    setWalkthroughRevealCount(0)
    setShowSolution(false)
  }, [level, cats, misses, hearts, pushHistory, revealWave])

  const toggleWalkthrough = useCallback(() => {
    const next = !showSolution
    setShowSolution(next)
    setActiveHint(null)
    setActiveHintRevealCount(0)
    setWalkthroughRevealCount(0)
    setWalkthroughIndex(next && walkthrough.length > 0 ? 0 : null)
  }, [showSolution, walkthrough.length])

  useEffect(() => {
    setShowSolution(walkthroughIndex !== null)
  }, [walkthroughIndex])

  if (!level) return <div className="loading">Generating a logic-solvable board…</div>
  const gameOver = hearts <= 0
  const showEndDialog = !generating && (won || gameOver)

  return (
    <div className="app">
      <Controls
        difficulty={difficulty}
        completed={profile.completed[difficulty]}
        catsFound={cats.length}
        catTotal={level.size}
        hearts={hearts}
        maxHearts={MAX_HEARTS}
        onDifficultyChange={changeDifficulty}
        onReset={restartCurrentLevel}
        resetDisabled={won}
        onOpenSettings={() => setSettingsOpen(true)}
        temporaryMarkCount={temporaryMarks.size + temporaryCats.size}
        onClearTemporaryMarks={clearTemporaryMarks}
        onUndo={undo}
        undoDisabled={history.length === 0 || won || hearts <= 0}
        undoHidden={gameOver}
        onHint={hint}
        hintDisabled={activeHint !== null || won || hearts <= 0}
      />

      <RuleCards />

      <main className="app__main">
        <div className="app__board-wrap">
          <Board
            board={level.cells}
            cats={cats}
            marks={pencilMarks}
            revealWave={revealWave}
            revealWaveIndex={revealWaveIndex}
            temporaryCatWave={temporaryCatWave}
            temporaryCatWaveIndex={temporaryCatWaveIndex}
            levelTransition={levelTransition}
            temporaryMarks={temporaryMarks}
            temporaryCats={temporaryCats}
            misses={misses}
            hint={activeHint}
            visibleHintEliminate={activeHint?.eliminate.slice(0, activeHintRevealCount) ?? []}
            hintRevealComplete={!activeHint || activeHintRevealCount >= activeHint.eliminate.length}
            walkthroughReady={!walkthroughStep || walkthroughRevealCount >= walkthroughStep.addedXs.length}
            walkthroughStep={visibleWalkthroughStep}
            transitionNonce={levelTransition?.nonce ?? null}
            transitionOrigin={levelTransition?.origin ?? null}
            onApplyHint={applyHint}
            onDismissHint={clearHint}
            onNextWalkthrough={() => {
              if (walkthroughIndex != null && walkthroughIndex < walkthrough.length - 1) {
                setWalkthroughIndex(walkthroughIndex + 1)
                setWalkthroughRevealCount(0)
              }
            }}
            onPreviousWalkthrough={() => {
              if (walkthroughIndex != null && walkthroughIndex > 0) {
                setWalkthroughIndex(walkthroughIndex - 1)
                setWalkthroughRevealCount(0)
              }
            }}
            onCloseWalkthrough={() => {
              setWalkthroughIndex(null)
              setShowSolution(false)
              setWalkthroughRevealCount(0)
            }}
            walkthroughIndex={walkthroughIndex}
            walkthroughCount={walkthrough.length}
            onTemporaryClick={handleTemporaryClick}
            onTemporaryCatClick={handleTemporaryCatClick}
            onMarkDrag={handleMarkDrag}
            palette={{ ...palette, ...buildRegionColors(palette, level.size) }}
            showRegionIds={devMode}
            win={won}
            onSingleClick={handleSingleClick}
            onDoubleClick={handleDoubleClick}
          />
          {showEndDialog && (
            <div className="level-dialog-backdrop">
              <section
                className={`level-dialog${won ? ' level-dialog--win' : ' level-dialog--gameover'}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="level-dialog-title"
                aria-describedby="level-dialog-description"
              >
                <div className="level-dialog__icon" aria-hidden="true">
                  {won ? '🎉' : <HeartIcon className="level-dialog__heart-icon" filled={false} />}
                </div>
                <h2 id="level-dialog-title">{won ? 'Puzzle complete!' : 'Out of hearts'}</h2>
                <p id="level-dialog-description">
                  {won
                    ? `You found all ${level.size} smiles with ${hearts} ${hearts === 1 ? 'heart' : 'hearts'} left.`
                    : `You found ${cats.length} of ${level.size} smiles and lost all ${MAX_HEARTS} hearts.`}
                </p>
                <div className="level-dialog__actions">
                  {won ? (
                    <button className="btn btn--primary" onClick={continueToNextLevel} autoFocus>Continue</button>
                  ) : (
                    <>
                      <button className="btn btn--primary" onClick={() => restartCurrentLevel(lastHeartOrigin ?? undefined)} autoFocus>Retry</button>
                    </>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        {devMode && <DevPanel
          level={level}
          report={report}
          showSolution={showSolution}
          onToggleSolution={toggleWalkthrough}
          solverNote={`Deduction walkthrough · ${walkthrough.length} explainable steps · ${cats.length}/${level.size} smiles found.`}
        />}
      </main>

      <SettingsPanel
        open={settingsOpen}
        profile={profile}
        devMode={devMode}
        onToggleDevMode={() => setDevMode((value) => !value)}
        onClose={() => setSettingsOpen(false)}
        onImport={importProfile}
      />

    </div>
  )
}
