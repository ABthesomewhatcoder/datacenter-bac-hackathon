import { cellToParent, getResolution, polygonToCells } from 'h3-js'
import type { Feature, Geometry, Position } from 'geojson'
import type { StateScore } from './scoring'

/**
 * MOCK / DEMO DATA ONLY — local H3 suitability is synthetic, generated
 * deterministically on the client for prototyping. Not real analysis.
 */
export const LOCAL_DATA_WARNING =
  'MOCK / DEMO DATA ONLY — synthetic local scores for prototyping.'

export type LocalMetric = 'overall' | 'land' | 'flood' | 'transmission'

export const LOCAL_METRICS: Array<{ id: LocalMetric; label: string }> = [
  { id: 'overall', label: 'Overall' },
  { id: 'land', label: 'Land' },
  { id: 'flood', label: 'Flood' },
  { id: 'transmission', label: 'Transmission' },
]

export interface LocalCellScore {
  h3Index: string
  overall: number
  regionalScore: number
  landScore: number
  floodScore: number
  transmissionScore: number
}

export function localMetricValue(
  cell: LocalCellScore,
  metric: LocalMetric,
): number {
  switch (metric) {
    case 'overall':
      return cell.overall
    case 'land':
      return cell.landScore
    case 'flood':
      return cell.floodScore
    case 'transmission':
      return cell.transmissionScore
  }
}

/**
 * Target cell counts per county: enough for a meaningful local surface,
 * few enough to stay readable and cheap (tens to a few hundred).
 */
const MIN_CELLS = 50
const MAX_CELLS = 600
const RESOLUTIONS = [5, 6, 7, 8]

function hash(s: string): number {
  let h = 7
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 9973
  }
  return h
}

const jitter = (seed: string, spread: number) =>
  (hash(seed) % (spread * 2 + 1)) - spread

const clampScore = (n: number) => Math.max(15, Math.min(98, Math.round(n)))

function polygonsOf(geometry: Geometry): Position[][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

/**
 * Fills a county with H3 cells, picking the smallest resolution that yields
 * at least MIN_CELLS (stepping back if it overshoots MAX_CELLS). Counties
 * vary ~40x in area, so a fixed resolution would give Maricopa thousands of
 * cells or Licking a handful.
 */
export function cellsForCounty(feature: Feature<Geometry>): {
  cells: string[]
  resolution: number
} {
  const polygons = polygonsOf(feature.geometry)
  let previous: { cells: string[]; resolution: number } | null = null

  for (const resolution of RESOLUTIONS) {
    const set = new Set<string>()
    for (const polygon of polygons) {
      for (const cell of polygonToCells(polygon, resolution, true)) {
        set.add(cell)
      }
    }
    const cells = [...set].sort()
    if (cells.length >= MIN_CELLS || resolution === RESOLUTIONS[RESOLUTIONS.length - 1]) {
      if (cells.length > MAX_CELLS && previous) return previous
      return { cells, resolution }
    }
    previous = { cells, resolution }
  }
  return previous ?? { cells: [], resolution: RESOLUTIONS[0] }
}

const cellCache = new Map<string, LocalCellScore[]>()

/**
 * Deterministic mock local scores for a county's H3 cells. The regional
 * baseline inherits the county's overall score; land/flood/transmission
 * start from county metrics and vary with a two-frequency hash (a coarse
 * parent-cell component for spatial coherence plus fine per-cell noise),
 * so refreshes and revisits always produce identical surfaces.
 *
 * overall = 0.45*regional + 0.20*land + 0.20*transmission + 0.15*flood
 */
export function generateLocalCells(
  geoid: string,
  feature: Feature<Geometry>,
  countyScore: StateScore,
): LocalCellScore[] {
  const cached = cellCache.get(geoid)
  if (cached) return cached

  const { cells } = cellsForCounty(feature)
  const regionalScore = countyScore.overall

  const scored = cells.map((h3Index) => {
    const coarse = cellToParent(h3Index, Math.max(0, getResolution(h3Index) - 2))
    const blend = (seed: string, base: number, spread: number) =>
      clampScore(
        base +
          0.7 * jitter(coarse + seed, spread) +
          0.3 * jitter(h3Index + seed, spread),
      )

    const landScore = blend('land', countyScore.buildability, 16)
    const floodScore = blend('flood', 78, 20)
    const transmissionScore = blend('tx', countyScore.power, 18)
    const overall = Math.round(
      0.45 * regionalScore +
        0.2 * landScore +
        0.2 * transmissionScore +
        0.15 * floodScore,
    )

    return {
      h3Index,
      overall,
      regionalScore,
      landScore,
      floodScore,
      transmissionScore,
    }
  })

  cellCache.set(geoid, scored)
  return scored
}
