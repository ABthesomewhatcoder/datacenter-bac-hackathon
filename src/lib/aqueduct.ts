import type { FeatureCollection, Geometry } from 'geojson'
import { featureContains } from './geo'
import type { SelectedSite } from '../store/useSiteStore'

/**
 * REAL DATA — WRI Aqueduct 4.0 water stress (Y2023M07D05 release),
 * preprocessed to U.S. basins by scripts/prepare-aqueduct.mjs.
 * License: CC BY 4.0 — attribution preserved here and in meta.json.
 */
export const AQUEDUCT_DATASET = {
  name: 'Aqueduct 4.0 (Y2023M07D05)',
  source: 'WRI Aqueduct 4.0',
  attribution: 'Aqueduct 4.0 © World Resources Institute · CC BY 4.0',
  dataStatus: 'REAL DATA',
  resolution: 'Basin/sub-basin screening estimate',
  caveat:
    'Aqueduct is a basin-level screening and prioritization tool. It does not measure the exact water availability, utility capacity, permitting, or reclaimed-water access at this parcel.',
} as const

export interface AqueductBasinProperties {
  pfafId: string
  bwsRaw: number | null
  bwsScore: number | null
  bwsCat: number | null
  bwsLabel: string | null
  bau30Raw: number | null
  bau30Score: number | null
  bau30Label: string | null
  bau50Raw: number | null
  bau50Score: number | null
  bau50Label: string | null
  bau80Score: number | null
  bau80Label: string | null
}

export type AqueductGeo = FeatureCollection<Geometry, AqueductBasinProperties>

export type WaterConstraint = 'pass' | 'warning' | 'fail' | 'unknown'

export interface WaterStressValue {
  raw: number | null
  score: number | null
  label: string | null
}

export interface WaterStressResult {
  basinId: string
  baseline: WaterStressValue
  bau2030: WaterStressValue
  bau2050: WaterStressValue
  bau2080: WaterStressValue
  constraint: WaterConstraint
  source: string
  resolution: string
}

let dataPromise: Promise<AqueductGeo> | null = null

/** Loads and caches the U.S. basin GeoJSON once. */
export function loadAqueductData(): Promise<AqueductGeo> {
  if (!dataPromise) {
    dataPromise = fetch('/data/aqueduct/us_basins.geojson').then((res) => {
      if (!res.ok) {
        dataPromise = null
        throw new Error('Failed to load Aqueduct data')
      }
      return res.json() as Promise<AqueductGeo>
    })
  }
  return dataPromise
}

/**
 * Baseline-category → siting constraint. Centralized screening rule,
 * easy to change; NOT yet folded into the overall suitability score.
 * Aqueduct categories: 0 Low, 1 Low-Medium, 2 Medium-High, 3 High,
 * 4 Extremely High; -1 = Arid & Low Water Use.
 */
export function classifyWaterStress(cat: number | null): WaterConstraint {
  if (cat === null) return 'unknown'
  if (cat >= 4) return 'fail'
  if (cat >= 2) return 'warning'
  if (cat === -1) return 'warning' // arid & low water use
  if (cat >= 0) return 'pass'
  return 'unknown'
}

/** Point-in-polygon basin lookup; null when no basin matches. */
export function lookupWaterStress(
  site: SelectedSite,
  geo: AqueductGeo,
): WaterStressResult | null {
  const hit = geo.features.find((f) =>
    featureContains(f, site.longitude, site.latitude),
  )
  if (!hit) return null
  const p = hit.properties
  return {
    basinId: p.pfafId,
    baseline: { raw: p.bwsRaw, score: p.bwsScore, label: p.bwsLabel },
    bau2030: { raw: p.bau30Raw, score: p.bau30Score, label: p.bau30Label },
    bau2050: { raw: p.bau50Raw, score: p.bau50Score, label: p.bau50Label },
    bau2080: { raw: null, score: p.bau80Score, label: p.bau80Label },
    constraint: classifyWaterStress(p.bwsCat),
    source: AQUEDUCT_DATASET.source,
    resolution: AQUEDUCT_DATASET.resolution,
  }
}
