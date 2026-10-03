/**
 * Centralized zoom → mode mapping. All zoom thresholds and cross-fade ranges
 * live here so components never hard-code raw zoom checks.
 */
export type MapMode = 'state' | 'county' | 'local' | 'site'

/** Mode boundaries (zoom levels). 'local' and 'site' are reserved for later phases. */
export const MODE_THRESHOLDS = {
  county: 5.5,
  local: 8.5, // future: H3 / local suitability
  site: 12, // future: exact site selection
} as const

/** State fills fade out across this zoom range as counties fade in. */
export const STATE_FADE_RANGE: [number, number] = [5, 6.2]
/** County fills fade in across this zoom range. */
export const COUNTY_FADE_RANGE: [number, number] = [5, 6]
/** Below this zoom, county layers are not rendered (or queryable) at all. */
export const COUNTY_MIN_RENDER_ZOOM = 4.8

export function getMapMode(zoom: number): MapMode {
  // Only 'state' and 'county' are active in this phase; 'local'/'site'
  // thresholds exist so later phases extend this function, not callers.
  return zoom >= MODE_THRESHOLDS.county ? 'county' : 'state'
}
