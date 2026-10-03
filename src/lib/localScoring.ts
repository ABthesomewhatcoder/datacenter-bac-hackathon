import {
  cellToBoundary,
  cellToParent,
  getResolution,
  gridDisk,
  latLngToCell,
  polygonToCells,
} from 'h3-js'
import { intersect } from '@turf/intersect'
import { featureCollection, polygon as turfPolygon } from '@turf/helpers'
import type {
  Feature,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson'
import { featureContains } from './geo'
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

/** A scored cell clipped to the county boundary. */
export type LocalCellFeature = Feature<Polygon | MultiPolygon, LocalCellScore>

export interface LocalSurface {
  features: LocalCellFeature[]
  scoreByIndex: Map<string, LocalCellScore>
  resolution: number
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
 * Core fill of a county with H3 cells (center-in-polygon), at the smallest
 * resolution yielding at least MIN_CELLS (stepping back past MAX_CELLS).
 * Counties vary ~40x in area, so a fixed resolution would give Maricopa
 * thousands of cells or Licking a handful.
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

function scoreCell(h3Index: string, countyScore: StateScore): LocalCellScore {
  const regionalScore = countyScore.overall
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
}

const surfaceCache = new Map<string, LocalSurface>()

/**
 * Deterministic mock local surface for a county, CLIPPED to the county
 * boundary so the hex coverage matches the county shape exactly:
 *
 * 1. Core cells come from center-in-polygon fill; their neighbor ring is
 *    added so the boundary is fully covered (no notches).
 * 2. Cells entirely inside the county keep their hexagon; cells touching
 *    the boundary are intersected with the county polygon (partial hexes).
 * 3. Scores use a two-frequency hash (coarse parent component for spatial
 *    coherence + fine per-cell noise) seeded by the cell index, so
 *    refreshes and revisits always produce identical surfaces.
 *
 * overall = 0.45*regional + 0.20*land + 0.20*transmission + 0.15*flood
 */
export function generateLocalSurface(
  geoid: string,
  feature: Feature<Geometry>,
  countyScore: StateScore,
): LocalSurface {
  const cached = surfaceCache.get(geoid)
  if (cached) return cached

  const { cells: coreCells, resolution } = cellsForCounty(feature)

  // Complete boundary coverage with the neighbor ring of the core fill.
  const candidates = new Set<string>(coreCells)
  for (const cell of coreCells) {
    for (const neighbor of gridDisk(cell, 1)) candidates.add(neighbor)
  }

  const countyPoly = feature as Feature<Polygon | MultiPolygon>
  const features: LocalCellFeature[] = []
  const scoreByIndex = new Map<string, LocalCellScore>()

  for (const h3Index of [...candidates].sort()) {
    const boundary = cellToBoundary(h3Index, true)
    const ring: Position[] = [...boundary, boundary[0]]

    const fullyInside = ring.every(([lng, lat]) =>
      featureContains(countyPoly, lng, lat),
    )

    let geometry: Polygon | MultiPolygon | null = null
    if (fullyInside) {
      geometry = { type: 'Polygon', coordinates: [ring] }
    } else {
      const clipped = intersect(
        featureCollection<Polygon | MultiPolygon>([
          turfPolygon([ring]),
          countyPoly,
        ]),
      )
      geometry = clipped?.geometry ?? null
    }
    if (!geometry) continue

    const score = scoreCell(h3Index, countyScore)
    scoreByIndex.set(h3Index, score)
    features.push({ type: 'Feature', properties: score, geometry })
  }

  const surface = { features, scoreByIndex, resolution }
  surfaceCache.set(geoid, surface)
  return surface
}

/** Score of one cell in a county's surface, by H3 index. */
export function getCellScore(
  geoid: string,
  feature: Feature<Geometry>,
  countyScore: StateScore,
  h3Index: string,
): LocalCellScore | null {
  return (
    generateLocalSurface(geoid, feature, countyScore).scoreByIndex.get(
      h3Index,
    ) ?? null
  )
}

/**
 * The scored cell containing an exact coordinate, resolved at the county's
 * generated resolution. Returns null if the point falls outside the
 * county's cell coverage.
 */
export function cellForLocation(
  geoid: string,
  feature: Feature<Geometry>,
  countyScore: StateScore,
  latitude: number,
  longitude: number,
): LocalCellScore | null {
  const surface = generateLocalSurface(geoid, feature, countyScore)
  const index = latLngToCell(latitude, longitude, surface.resolution)
  return surface.scoreByIndex.get(index) ?? null
}
