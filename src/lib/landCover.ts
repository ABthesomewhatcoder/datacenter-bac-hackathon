import type { SelectedSite } from '../store/useSiteStore'

/**
 * REAL DATA — USGS Annual NLCD (Collection 1.2) land cover, queried live
 * from the official USGS/MRLC GeoServer WMS (no API key).
 *
 * Verified against GetCapabilities (not guessed):
 * - layer: Land-Cover-Native_conus_year_data (queryable)
 * - time dimension: ISO8601 instants, one per year (1985..2025)
 * - GetFeatureInfo: application/json supported; returns PALETTE_INDEX
 * - CORS: Access-Control-Allow-Origin: *
 */
export const NLCD_DATASET = {
  name: 'Annual NLCD Land Cover (Collection 1.2)',
  source: 'USGS Annual NLCD',
  dataStatus: 'REAL DATA',
  year: 2025,
  resolution: '30 m raster',
  wms: 'https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wms',
  layer: 'Land-Cover-Native_conus_year_data',
  time: '2025-01-01T00:00:00.000Z',
  caveat:
    'NLCD reports predominant land cover within a 30 m pixel. It does not establish parcel ownership, zoning, contamination, or construction feasibility.',
} as const

/** Official MRLC NLCD legend (https://www.mrlc.gov/data/type/land-cover). */
export const NLCD_CLASSES: Record<number, string> = {
  11: 'Open Water',
  12: 'Perennial Ice/Snow',
  21: 'Developed, Open Space',
  22: 'Developed, Low Intensity',
  23: 'Developed, Medium Intensity',
  24: 'Developed, High Intensity',
  31: 'Barren Land',
  41: 'Deciduous Forest',
  42: 'Evergreen Forest',
  43: 'Mixed Forest',
  52: 'Shrub/Scrub',
  71: 'Herbaceous',
  81: 'Pasture/Hay',
  82: 'Cultivated Crops',
  90: 'Woody Wetlands',
  95: 'Emergent Herbaceous Wetlands',
}

export type LandConstraint = 'pass' | 'warning' | 'fail' | 'unknown'

export interface LandCoverResult {
  classCode: number
  className: string
  year: number
  source: string
  resolution: string
  status: 'real'
  constraint: LandConstraint
}

/**
 * Transparent screening of NLCD class → siting constraint. One obvious
 * place to tune. Not yet folded into the overall suitability score.
 */
export function classifyLandCover(classCode: number): LandConstraint {
  switch (classCode) {
    case 11: // Open Water
    case 12: // Perennial Ice/Snow
    case 90: // Woody Wetlands
    case 95: // Emergent Herbaceous Wetlands
      return 'fail'
    case 41:
    case 42:
    case 43: // Forest
    case 81: // Pasture/Hay
    case 82: // Cultivated Crops
    case 23: // Developed, Medium Intensity (already built up)
    case 24: // Developed, High Intensity
      return 'warning'
    case 21: // Developed, Open Space
    case 22: // Developed, Low Intensity
    case 31: // Barren Land
    case 52: // Shrub/Scrub
    case 71: // Herbaceous
      return 'pass'
    default:
      return 'unknown'
  }
}

const cache = new Map<string, LandCoverResult>()
const TIMEOUT_MS = 15000

/**
 * Resolves a coordinate to its 2025 NLCD class via WMS GetFeatureInfo:
 * a ~110 m bbox around the point, 101x101 px, center pixel queried.
 * Cached by ~11 m rounded coordinate (sub-pixel moves hit the cache).
 * Throws on failure — callers surface UNKNOWN, never a fabricated class.
 */
export async function fetchLandCover(
  site: SelectedSite,
): Promise<LandCoverResult> {
  const key = `${site.latitude.toFixed(4)},${site.longitude.toFixed(4)}`
  const cached = cache.get(key)
  if (cached) return cached

  const d = 0.0005
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetFeatureInfo',
    layers: NLCD_DATASET.layer,
    query_layers: NLCD_DATASET.layer,
    srs: 'EPSG:4326',
    bbox: `${site.longitude - d},${site.latitude - d},${site.longitude + d},${site.latitude + d}`,
    width: '101',
    height: '101',
    x: '50',
    y: '50',
    info_format: 'application/json',
    time: NLCD_DATASET.time,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${NLCD_DATASET.wms}?${params}`, {
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`NLCD WMS HTTP ${res.status}`)
    const data = (await res.json()) as {
      features?: Array<{ properties?: { PALETTE_INDEX?: number } }>
    }
    const classCode = data.features?.[0]?.properties?.PALETTE_INDEX
    if (typeof classCode !== 'number' || !NLCD_CLASSES[classCode]) {
      throw new Error(`NLCD returned no class (${classCode})`)
    }
    const result: LandCoverResult = {
      classCode,
      className: NLCD_CLASSES[classCode],
      year: NLCD_DATASET.year,
      source: NLCD_DATASET.source,
      resolution: NLCD_DATASET.resolution,
      status: 'real',
      constraint: classifyLandCover(classCode),
    }
    cache.set(key, result)
    return result
  } finally {
    clearTimeout(timer)
  }
}

/** WMS GetMap tile template for the optional Mapbox raster overlay. */
export function nlcdTileUrl(): string {
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: NLCD_DATASET.layer,
    styles: '',
    format: 'image/png',
    transparent: 'true',
    srs: 'EPSG:3857',
    width: '256',
    height: '256',
    time: NLCD_DATASET.time,
  })
  return `${NLCD_DATASET.wms}?${params}&bbox={bbox-epsg-3857}`
}
