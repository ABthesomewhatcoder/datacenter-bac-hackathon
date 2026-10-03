import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { featureContains, type LngLatBounds } from './geo'
import type { SelectedSite } from '../store/useSiteStore'

/**
 * REAL DATA — FEMA National Flood Hazard Layer (NFHL), queried live from
 * the public ArcGIS REST service (no API key). Layer 28 = Flood Hazard
 * Zones (S_FLD_HAZ_AR), verified against the service metadata.
 */
export const FLOOD_DATASET = {
  name: 'National Flood Hazard Layer — Flood Hazard Zones (S_FLD_HAZ_AR)',
  source: 'FEMA NFHL',
  dataStatus: 'REAL DATA',
  service:
    'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28',
  caveat:
    'FEMA flood maps represent mapped regulatory flood hazards and do not capture every source of present or future flood risk.',
} as const

const QUERY_URL = `${FLOOD_DATASET.service}/query`
const OUT_FIELDS = 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID,GFID'
const PAGE_SIZE = 2000
const MAX_PAGES = 4

export interface FloodZoneProperties {
  FLD_ZONE: string | null
  ZONE_SUBTY: string | null
  SFHA_TF: string | null
  STATIC_BFE: number | null
  DFIRM_ID: string | null
  GFID: string | null
}

export type FloodGeo = FeatureCollection<Geometry, FloodZoneProperties>

export type FloodRiskLevel = 'low' | 'moderate' | 'high' | 'very-high' | 'unknown'
export type FloodConstraint = 'pass' | 'warning' | 'fail' | 'unknown'

export interface FloodAssessment {
  mapped: boolean
  riskLevel: FloodRiskLevel
  floodZone: string | null
  zoneSubtype: string | null
  sfha: boolean | null
  constraint: FloodConstraint
  source: 'FEMA NFHL'
  resolution: string
}

export const FLOOD_RISK_LABELS: Record<FloodRiskLevel, string> = {
  low: 'LOW',
  moderate: 'MODERATE',
  high: 'HIGH',
  'very-high': 'VERY HIGH',
  unknown: 'UNKNOWN',
}

export const FLOOD_RISK_COLORS: Record<FloodRiskLevel, string> = {
  low: '#7fbf4d',
  moderate: '#f4a261',
  high: '#e63946',
  'very-high': '#c1121f',
  unknown: '#9aa5b1',
}

const isFloodway = (p: FloodZoneProperties) =>
  (p.ZONE_SUBTY ?? '').toUpperCase().includes('FLOODWAY')

const isPoint2Pct = (p: FloodZoneProperties) =>
  (p.ZONE_SUBTY ?? '').toUpperCase().includes('0.2 PCT')

/**
 * Classifies one FEMA zone polygon. Zones are NOT collapsed: regulatory
 * floodway > SFHA (A/AE/AH/AO/AR/A99/V/VE) > shaded X (0.2% annual chance)
 * > minimal-hazard X. Zone D (undetermined) classifies as unknown.
 */
export function classifyFloodZone(p: FloodZoneProperties): {
  riskLevel: FloodRiskLevel
  constraint: FloodConstraint
} {
  const zone = (p.FLD_ZONE ?? '').toUpperCase()
  if (isFloodway(p)) return { riskLevel: 'very-high', constraint: 'fail' }
  if (zone.startsWith('V')) return { riskLevel: 'high', constraint: 'fail' }
  if (p.SFHA_TF === 'T' || /^A/.test(zone)) {
    return { riskLevel: 'high', constraint: 'warning' }
  }
  if (isPoint2Pct(p)) return { riskLevel: 'moderate', constraint: 'warning' }
  if (zone === 'D') return { riskLevel: 'unknown', constraint: 'unknown' }
  if (zone === 'X') return { riskLevel: 'low', constraint: 'pass' }
  return { riskLevel: 'unknown', constraint: 'unknown' }
}

const RISK_RANK: Record<FloodRiskLevel, number> = {
  unknown: 0,
  low: 1,
  moderate: 2,
  high: 3,
  'very-high': 4,
}

function assessmentFromFeatures(
  hits: FloodZoneProperties[],
  resolution: string,
): FloodAssessment {
  if (hits.length === 0) {
    // Absence of a polygon is NOT "safe" — it means no NFHL coverage here.
    return {
      mapped: false,
      riskLevel: 'unknown',
      floodZone: null,
      zoneSubtype: null,
      sfha: null,
      constraint: 'unknown',
      source: 'FEMA NFHL',
      resolution: 'No FEMA mapping at this location',
    }
  }
  let worst = hits[0]
  let worstClass = classifyFloodZone(worst)
  for (const p of hits.slice(1)) {
    const c = classifyFloodZone(p)
    if (RISK_RANK[c.riskLevel] > RISK_RANK[worstClass.riskLevel]) {
      worst = p
      worstClass = c
    }
  }
  return {
    mapped: true,
    riskLevel: worstClass.riskLevel,
    floodZone: worst.FLD_ZONE,
    zoneSubtype: worst.ZONE_SUBTY,
    sfha: worst.SFHA_TF === 'T',
    constraint: worstClass.constraint,
    source: 'FEMA NFHL',
    resolution,
  }
}

/**
 * Fetches flood hazard polygons intersecting the given bounds, paginated.
 * Pages are capped at MAX_PAGES (8k features) — enough for a local
 * viewport; zooming in re-queries a smaller area.
 */
export async function loadFloodZones(bounds: LngLatBounds): Promise<FloodGeo> {
  const [[xmin, ymin], [xmax, ymax]] = bounds
  const features: Feature<Geometry, FloodZoneProperties>[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      geometry: JSON.stringify({ xmin, ymin, xmax, ymax }),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: OUT_FIELDS,
      geometryPrecision: '5',
      resultOffset: String(page * PAGE_SIZE),
      resultRecordCount: String(PAGE_SIZE),
      f: 'geojson',
    })
    const res = await fetch(`${QUERY_URL}?${params}`)
    if (!res.ok) throw new Error(`FEMA NFHL HTTP ${res.status}`)
    const fc = (await res.json()) as FloodGeo & { error?: unknown }
    if (fc.error) throw new Error('FEMA NFHL query error')
    features.push(...fc.features)
    if (fc.features.length < PAGE_SIZE) break
  }
  return { type: 'FeatureCollection', features }
}

const pointCache = new Map<string, FloodAssessment>()

/** Synchronous point-in-polygon assessment against already-loaded zones. */
export function assessFloodRiskLocal(
  site: SelectedSite,
  fc: FloodGeo,
): FloodAssessment {
  const hits = fc.features
    .filter((f) => featureContains(f, site.longitude, site.latitude))
    .map((f) => f.properties)
  return assessmentFromFeatures(hits, 'Mapped flood hazard polygon')
}

/**
 * Point-intersect query against FEMA for the exact site coordinate.
 * Cached by ~11 m rounded coordinate so small marker nudges don't
 * re-query. Throws on network failure — callers surface 'unknown'.
 */
export async function assessFloodRisk(
  site: SelectedSite,
): Promise<FloodAssessment> {
  const key = `${site.latitude.toFixed(4)},${site.longitude.toFixed(4)}`
  const cached = pointCache.get(key)
  if (cached) return cached

  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: site.longitude, y: site.latitude }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: OUT_FIELDS,
    returnGeometry: 'false',
    f: 'json',
  })
  const res = await fetch(`${QUERY_URL}?${params}`)
  if (!res.ok) throw new Error(`FEMA NFHL HTTP ${res.status}`)
  const data = (await res.json()) as {
    error?: unknown
    features?: Array<{ attributes: FloodZoneProperties }>
  }
  if (data.error || !data.features) throw new Error('FEMA NFHL query error')

  const assessment = assessmentFromFeatures(
    data.features.map((f) => f.attributes),
    'Mapped flood hazard polygon',
  )
  pointCache.set(key, assessment)
  return assessment
}
