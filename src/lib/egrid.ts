import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { featureContains } from './geo.ts'
import type { SelectedSite } from '../store/useSiteStore.ts'

/**
 * REAL DATA — EPA eGRID2023 Revision 2 (released June 12, 2025).
 * Subregion polygons + CO2/CO2e total output emission rates preprocessed
 * from official EPA files by scripts/prepare-egrid.mjs (see
 * public/data/egrid/meta.json for exact sources and fields).
 */
export const EGRID_DATASET = {
  name: 'eGRID2023 Revision 2',
  source: 'EPA eGRID2023',
  dataStatus: 'REAL DATA',
  resolution: 'EPA eGRID subregion',
  caveat:
    'eGRID subregion rates represent regional electricity-generation emissions and are not a measurement of the exact generator serving this site.',
  ambiguousNote: 'Actual subregion may depend on the serving utility.',
} as const

export const LB_TO_KG = 0.45359237

export interface EgridSubregionProperties {
  acronym: string
  name: string
  co2RateLb: number | null
  co2eRateLb: number | null
  gridGrossLoss: number | null
  interconnect: string | null
}

export type EgridGeo = FeatureCollection<Geometry, EgridSubregionProperties>
export type EgridMultipleGeo = FeatureCollection<Geometry, { multiple: boolean }>

export interface EgridData {
  subregions: EgridGeo
  multiple: EgridMultipleGeo
}

export interface EgridSubregionResult {
  ambiguous: false
  acronym: string
  name: string
  co2RateLb: number | null
  co2eRateLb: number | null
  co2eRateKg: number | null
  gridGrossLoss: number | null
}

export interface EgridAmbiguousResult {
  ambiguous: true
  /** Subregions whose polygons contain or are candidates at this point. */
  candidates: Array<{ acronym: string; name: string; co2eRateLb: number | null }>
}

export type EgridResult = EgridSubregionResult | EgridAmbiguousResult | null

let dataPromise: Promise<EgridData> | null = null

/** Loads and caches both eGRID files once. */
export function loadEgridData(): Promise<EgridData> {
  if (!dataPromise) {
    dataPromise = (async () => {
      const [subRes, multiRes] = await Promise.all([
        fetch('/data/egrid/subregions.geojson'),
        fetch('/data/egrid/multiple.geojson'),
      ])
      if (!subRes.ok || !multiRes.ok) {
        dataPromise = null
        throw new Error('Failed to load eGRID data')
      }
      return {
        subregions: (await subRes.json()) as EgridGeo,
        multiple: (await multiRes.json()) as EgridMultipleGeo,
      }
    })()
  }
  return dataPromise
}

const toResult = (
  f: Feature<Geometry, EgridSubregionProperties>,
): EgridSubregionResult => ({
  ambiguous: false,
  acronym: f.properties.acronym,
  name: f.properties.name,
  co2RateLb: f.properties.co2RateLb,
  co2eRateLb: f.properties.co2eRateLb,
  co2eRateKg:
    f.properties.co2eRateLb !== null
      ? Math.round(f.properties.co2eRateLb * LB_TO_KG * 1000) / 1000
      : null,
  gridGrossLoss: f.properties.gridGrossLoss,
})

/**
 * Point-in-polygon lookup. If the point falls inside EPA's official
 * multiple-subregions overlay (areas EPA marks as served by more than one
 * possible subregion) — or inside more than one subregion polygon — the
 * result is honestly ambiguous with candidates listed, never a guess.
 */
export function lookupEgridSubregion(
  site: SelectedSite,
  data: EgridData,
): EgridResult {
  const { longitude: lng, latitude: lat } = site

  const containing = data.subregions.features.filter((f) =>
    featureContains(f, lng, lat),
  )

  const inMultipleOverlay = data.multiple.features.some((f) =>
    featureContains(f, lng, lat),
  )

  if (inMultipleOverlay || containing.length > 1) {
    const candidates = (containing.length > 0
      ? containing
      : data.subregions.features
    )
      .filter((f) => containing.length > 0 || featureContains(f, lng, lat))
      .map((f) => ({
        acronym: f.properties.acronym,
        name: f.properties.name,
        co2eRateLb: f.properties.co2eRateLb,
      }))
    return { ambiguous: true, candidates }
  }

  if (containing.length === 1) return toResult(containing[0])
  return null // outside eGRID coverage (e.g., offshore)
}
