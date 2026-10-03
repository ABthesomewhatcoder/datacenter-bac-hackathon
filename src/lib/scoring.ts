import type { FeatureCollection, Geometry } from 'geojson'

export type Metric = 'overall' | 'power' | 'water' | 'buildability'

export const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'overall', label: 'Overall' },
  { id: 'power', label: 'Power' },
  { id: 'water', label: 'Water' },
  { id: 'buildability', label: 'Buildability' },
]

export interface StateScore {
  overall: number
  power: number
  water: number
  buildability: number
  confidence: number
}

export type StateScoreMap = Record<string, StateScore>

export interface StateScoresFile {
  meta: { warning: string; [key: string]: unknown }
  scores: StateScoreMap
}

export interface StateProperties {
  id: string
  name: string
}

export type StatesGeo = FeatureCollection<Geometry, StateProperties>
export type ScoredStatesGeo = FeatureCollection<
  Geometry,
  StateProperties & Partial<StateScore>
>

/**
 * Joins score data onto state geometry by USPS code (`properties.id`).
 * Geometry and scores live in separate files; this runtime join is the only
 * place they meet. States without a score entry keep undefined metrics and
 * are styled as "no data" on the map.
 */
export function joinScores(
  geo: StatesGeo,
  scores: StateScoreMap,
): ScoredStatesGeo {
  return {
    type: 'FeatureCollection',
    features: geo.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, ...scores[feature.properties.id] },
    })),
  }
}

export async function fetchStateData(): Promise<{
  geo: StatesGeo
  scores: StateScoreMap
}> {
  const [geoRes, scoresRes] = await Promise.all([
    fetch('/data/us_states.geojson'),
    fetch('/data/state_scores.json'),
  ])
  if (!geoRes.ok || !scoresRes.ok) {
    throw new Error('Failed to load state data')
  }
  const geo = (await geoRes.json()) as StatesGeo
  const scoresFile = (await scoresRes.json()) as StateScoresFile
  return { geo, scores: scoresFile.scores }
}
