/**
 * Centralized zoom → mode mapping. All zoom thresholds and cross-fade ranges
 * live here so components never hard-code raw zoom checks.
 */
export type MapMode = 'state' | 'county' | 'local' | 'site'

/** Mode boundaries (zoom levels). */
export const MODE_THRESHOLDS = {
  county: 5.5,
  local: 7.5, // H3 local suitability
  site: 10, // exact site placement
} as const

/** State fills fade out across this zoom range as counties fade in. */
export const STATE_FADE_RANGE: [number, number] = [5, 6.2]
/** County fills fade in across this zoom range. */
export const COUNTY_FADE_RANGE: [number, number] = [5, 6]
/** County fills fade back out across this range as H3 cells fade in. */
export const COUNTY_FADE_OUT_RANGE: [number, number] = [7.3, 8.3]
/** H3 local cells fade in across this zoom range. */
export const H3_FADE_RANGE: [number, number] = [7.3, 8.3]
/** Below this zoom, county layers are not rendered (or queryable) at all. */
export const COUNTY_MIN_RENDER_ZOOM = 4.8
/**
 * H3 cells dim across this range entering site mode, so satellite imagery
 * dominates while the selected cell outline stays readable.
 */
export const SITE_H3_DIM_RANGE: [number, number] = [9.6, 10.4]

export function getMapMode(zoom: number): MapMode {
  if (zoom >= MODE_THRESHOLDS.site) return 'site'
  if (zoom >= MODE_THRESHOLDS.local) return 'local'
  return zoom >= MODE_THRESHOLDS.county ? 'county' : 'state'
}
