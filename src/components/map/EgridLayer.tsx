import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl/mapbox'
import type { ExpressionSpecification } from 'mapbox-gl'
import { loadEgridData, type EgridGeo } from '../../lib/egrid'
import { useSiteStore } from '../../store/useSiteStore'

/** CO2e lb/MWh → green (clean) to red (carbon-intense). */
const CARBON_COLOR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['coalesce', ['get', 'co2eRateLb'], 0],
  0, '#1f9d55',
  400, '#7fbf4d',
  700, '#e9c23f',
  1000, '#ee6c4d',
  1400, '#c1121f',
]

/**
 * Optional REAL EPA eGRID2023 subregion overlay colored by CO2e total
 * output emission rate. Low opacity keeps satellite readable; works at
 * every zoom since subregions are regional-scale geometry.
 */
export default function EgridLayer() {
  const visible = useSiteStore((s) => s.egridVisible)
  const [geo, setGeo] = useState<EgridGeo | null>(null)

  useEffect(() => {
    if (!visible || geo) return
    loadEgridData()
      .then((d) => setGeo(d.subregions))
      .catch(() => {
        // Layer stays empty; the site lookup path handles its own errors.
      })
  }, [visible, geo])

  if (!visible || !geo) return null

  return (
    <Source id="egrid-subregions" type="geojson" data={geo}>
      <Layer
        id="egrid-fill"
        type="fill"
        paint={{
          'fill-color': CARBON_COLOR,
          'fill-opacity': 0.28,
        }}
      />
      <Layer
        id="egrid-border"
        type="line"
        paint={{
          'line-color': 'rgba(222, 230, 238, 0.4)',
          'line-width': 1,
        }}
      />
    </Source>
  )
}
