import type { RegionPalette } from './types'

// Master palettes tuned for DARK backgrounds: saturated, equal-lightness
// fills (like the reference game) so every color reads at the same visual
// weight. Boards use `n` entries (n = region count) chosen by
// `buildRegionColors` for maximum pairwise contrast, so colors never look
// similar regardless of board size.

export const PALETTES: RegionPalette[] = [
  {
    name: 'Vivid',
    fills: [
      '#4FB3E8', // sky
      '#E06060', // salmon red
      '#E0B23C', // gold
      '#4CAF6D', // green
      '#6B7FD7', // periwinkle
      '#9B6DD6', // purple
      '#E87BB0', // pink
      '#3AAFA9', // teal
      '#A8C545', // lime
      '#E8934A', // orange
      '#C4574E', // brick
      '#8A9BA8', // slate
    ],
    borders: [
      '#2E7FB0', '#A93E3E', '#A87D22', '#33804C',
      '#4856A8', '#7048A8', '#B05181', '#277F7A',
      '#7A9230', '#B06A2E', '#8E3C35', '#5F6E79',
    ],
    textOn: [
      '#0B2536', '#330D0D', '#33240A', '#0B2415',
      '#141B36', '#221136', '#3A1224', '#0A2725',
      '#222B0A', '#331D09', '#2A0F0D', '#101820',
    ],
  },
  {
    name: 'Neon Night',
    fills: [
      '#FF6B6B', // coral
      '#4D96FF', // electric blue
      '#6BCB77', // kelly
      '#FFD93D', // neon yellow
      '#9B5DE5', // violet
      '#FF80AB', // hot pink
      '#00B8A9', // aqua
      '#FF9F1C', // amber
      '#5D87FF', // royal
      '#B8E986', // pale green
      '#F15BB5', // magenta
      '#7F8FA6', // steel
    ],
    borders: [
      '#B23A3A', '#2E62AD', '#3F8A4B', '#B29B25',
      '#6B3BA8', '#B25578', '#007D72', '#B26D13',
      '#3B57AD', '#7C9B54', '#A33B7F', '#54606F',
    ],
    textOn: [
      '#2A0808', '#0A1B33', '#0D2412', '#2E2506',
      '#1F0F33', '#33101F', '#003B35', '#33200A',
      '#121E33', '#1F2A0D', '#300B24', '#0C121A',
    ],
  },
  {
    name: 'Pastel Night',
    fills: [
      '#C9899B', // dusty rose
      '#89B8CE', // dusty blue
      '#A3C9A8', // sage
      '#D6C08B', // sand
      '#AF9FCE', // lavender
      '#CE9AA2', // blush
      '#7FBFB0', // seafoam
      '#D0A36E', // caramel
      '#93A8C9', // periwinkle
      '#B5C989', // pistachio
      '#C99BC9', // orchid
      '#9AA5B1', // gray
    ],
    borders: [
      '#8A5566', '#5A82A0', '#6E9474', '#A18A54',
      '#7A6BA0', '#98686F', '#54887B', '#9A7142',
      '#62759B', '#7E945C', '#8F6B8F', '#626B75',
    ],
    textOn: [
      '#2A1218', '#132230', '#16251A', '#2A2210',
      '#1D162E', '#2A1418', '#0F2A24', '#2A1B0D',
      '#141E30', '#1C2A12', '#261226', '#12161A',
    ],
  },
]

export const DEFAULT_PALETTE_INDEX = 0

// ============================================================================
// Contrast-aware subset selection
// ============================================================================

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Perceptual-ish distance: RGB weighted for how humans see differences. */
function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const dr = r1 - r2
  const dg = (g1 - g2) * 1.2 // eyes are most sensitive to green
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Pick `n` entries from a master palette maximizing pairwise contrast
 * (greedy farthest-point selection). Deterministic for a given
 * (palette, n), so region ids map stably to colors across re-renders.
 */
export function selectPaletteColors<T>(
  entries: T[],
  n: number,
  keyOf: (entry: T) => string,
): T[] {
  if (n >= entries.length) return entries.slice(0, n)

  const selected: T[] = []
  const used = new Set<number>()

  // Anchor: the entry whose color is farthest from the palette's average
  // (usually the most distinct/vivid one).
  let anchor = 0
  let bestAvg = -1
  for (let i = 0; i < entries.length; i++) {
    let total = 0
    for (let j = 0; j < entries.length; j++) {
      if (i !== j) total += colorDistance(keyOf(entries[i]), keyOf(entries[j]))
    }
    if (total / entries.length > bestAvg) {
      bestAvg = total / entries.length
      anchor = i
    }
  }
  selected.push(entries[anchor])
  used.add(anchor)

  while (selected.length < n) {
    let bestIdx = -1
    let bestMin = -1
    for (let i = 0; i < entries.length; i++) {
      if (used.has(i)) continue
      let minDist = Infinity
      for (const s of selected) {
        const d = colorDistance(keyOf(entries[i]), keyOf(s))
        if (d < minDist) minDist = d
      }
      if (minDist > bestMin) {
        bestMin = minDist
        bestIdx = i
      }
    }
    selected.push(entries[bestIdx])
    used.add(bestIdx)
  }

  return selected
}

/**
 * Full color assignment for a board with `n` regions: returns arrays where
 * index = region id. Only `n` master entries are used, chosen for maximum
 * mutual contrast.
 */
export function buildRegionColors(
  palette: RegionPalette,
  n: number,
): { fills: string[]; borders: string[]; textOn: string[] } {
  const order = selectPaletteColors(palette.fills, n, (c) => c)
  const idxOf = new Map<string, number>()
  palette.fills.forEach((fill, i) => idxOf.set(fill, i))

  const fills: string[] = []
  const borders: string[] = []
  const textOn: string[] = []
  for (const fill of order) {
    const i = idxOf.get(fill)!
    fills.push(fill)
    borders.push(palette.borders[i])
    textOn.push(palette.textOn[i])
  }
  return { fills, borders, textOn }
}
