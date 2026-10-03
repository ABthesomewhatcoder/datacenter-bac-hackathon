import { useEffect } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/mapbox'
import type { ExpressionSpecification } from 'mapbox-gl'
import { getMapMode, MODE_THRESHOLDS } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

const SUBTYPE: ExpressionSpecification = [
  'upcase',
  ['coalesce', ['get', 'ZONE_SUBTY'], ''],
]

const IS_FLOODWAY: ExpressionSpecification = ['in', 'FLOODWAY', SUBTYPE]
const IS_SFHA: ExpressionSpecification = ['==', ['get', 'SFHA_TF'], 'T']
const IS_02PCT: ExpressionSpecification = ['in', '0.2 PCT', SUBTYPE]

/** Minimal-hazard X and undetermined D areas are not rendered at all. */
const RENDER_FILTER: ExpressionSpecification = [
  'any',
  IS_FLOODWAY,
  IS_SFHA,
  IS_02PCT,
]

const FILL_COLOR: ExpressionSpecification = [
  'case',
  IS_FLOODWAY, '#c1121f',
  IS_SFHA, '#e63946',
  IS_02PCT, '#f4a261',
  'rgba(0,0,0,0)',
]

const FILL_OPACITY: ExpressionSpecification = [
  'case',
  IS_FLOODWAY, 0.42,
  IS_SFHA, 0.26,
  IS_02PCT, 0.16,
  0,
]

/**
 * REAL FEMA NFHL flood hazard polygons (layer 28, S_FLD_HAZ_AR), queried
 * live for the current viewport area and cached in the store. Rendered
 * only at local/site zoom. Restrained FEMA-style treatment: floodway
 * strong red, SFHA red, 0.2% annual-chance orange, minimal hazard hidden —
 * satellite imagery stays readable.
 */
export default function FloodLayer() {
  const { current: map } = useMap()
  const visible = useSiteStore((s) => s.floodVisible)
  const floodZones = useSiteStore((s) => s.floodZones)
  const ensureFloodZones = useSiteStore((s) => s.ensureFloodZones)
  const zoom = useSiteStore((s) => s.viewState.zoom)

  // Fetch when the toggle turns on while already at local/site zoom.
  useEffect(() => {
    if (!visible || !map) return
    if (getMapMode(zoom) === 'state' || getMapMode(zoom) === 'county') return
    const b = map.getBounds()
    if (b) {
      ensureFloodZones([
        [b.getWest(), b.getSouth()],
        [b.getEast(), b.getNorth()],
      ])
    }
    // Intentionally not re-running per zoom frame; moveEnd in SiteMap
    // handles pans/zooms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, map, ensureFloodZones])

  if (!visible || !floodZones) return null

  const minzoom = MODE_THRESHOLDS.local - 0.5

  return (
    <Source id="flood-zones" type="geojson" data={floodZones.fc}>
      <Layer
        id="flood-fill"
        type="fill"
        minzoom={minzoom}
        filter={RENDER_FILTER}
        paint={{
          'fill-color': FILL_COLOR,
          'fill-opacity': FILL_OPACITY,
        }}
      />
      <Layer
        id="flood-outline"
        type="line"
        minzoom={minzoom}
        filter={RENDER_FILTER}
        paint={{
          'line-color': FILL_COLOR,
          'line-width': ['case', IS_FLOODWAY, 1.4, 0.6],
          'line-opacity': 0.55,
        }}
      />
    </Source>
  )
}
