import { pointToLineDistance } from '@turf/point-to-line-distance'
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
} from 'geojson'
import type { SelectedSite } from '../store/useSiteStore.ts'

/**
 * REAL DATA — HIFLD Electric Power Transmission Lines, extracted per state
 * by scripts/fetch-transmission.mjs. See public/data/transmission/meta.json.
 */
export const TRANSMISSION_DATASET = {
  name: 'Electric Power Transmission Lines',
  source: 'HIFLD',
  dataStatus: 'REAL DATA',
  caveat:
    'Transmission proximity does not imply available interconnection capacity.',
} as const

export interface TransmissionProperties {
  /** Stable per-file index, injected at load time (HIFLD id can be null). */
  __i: number
  id: string | null
  type: string | null
  status: string | null
  owner: string | null
  voltage: number | null
  voltClass: string | null
}

export type TransmissionGeo = FeatureCollection<
  LineString | MultiLineString,
  TransmissionProperties
>

export interface NearestLine {
  distanceMiles: number
  properties: TransmissionProperties
}

export async function fetchTransmissionForState(
  usps: string,
): Promise<TransmissionGeo | null> {
  const res = await fetch(`/data/transmission/${usps}.geojson`)
  if (!res.ok) return null
  const fc = (await res.json()) as TransmissionGeo
  fc.features.forEach((f, i) => {
    f.properties.__i = i
  })
  return fc
}

function featureDistanceMiles(
  site: SelectedSite,
  feature: Feature<LineString | MultiLineString>,
): number {
  const point: [number, number] = [site.longitude, site.latitude]
  if (feature.geometry.type === 'LineString') {
    return pointToLineDistance(point, feature as Feature<LineString>, {
      units: 'miles',
    })
  }
  let min = Infinity
  for (const coordinates of feature.geometry.coordinates) {
    const d = pointToLineDistance(
      point,
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
      { units: 'miles' },
    )
    if (d < min) min = d
  }
  return min
}

let lastKey = ''
let lastResult: NearestLine | null = null

/**
 * Nearest transmission line to the site: brute-force point-to-line distance
 * over the loaded state extract (a few thousand lines, ~tens of ms),
 * memoized on (site, dataset) so panel and map share one computation.
 */
export function nearestTransmissionLine(
  site: SelectedSite,
  fc: TransmissionGeo,
): NearestLine | null {
  const key = `${site.latitude},${site.longitude},${fc.features.length}`
  if (key === lastKey) return lastResult

  let best: NearestLine | null = null
  for (const feature of fc.features) {
    const distanceMiles = featureDistanceMiles(site, feature)
    if (!best || distanceMiles < best.distanceMiles) {
      best = { distanceMiles, properties: feature.properties }
    }
  }
  lastKey = key
  lastResult = best
  return best
}
