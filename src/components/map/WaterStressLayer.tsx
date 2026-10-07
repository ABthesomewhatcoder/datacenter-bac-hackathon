import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl/mapbox'
import type { ExpressionSpecification } from 'mapbox-gl'
import { loadAqueductData, type AqueductGeo } from '../../lib/aqueduct'
import { useSiteStore } from '../../store/useSiteStore'

/** Baseline water-stress category → Aqueduct-style color. */
const STRESS_COLOR: ExpressionSpecification = [
  'match',
  ['coalesce', ['get', 'bwsCat'], -9],
  0, '#1f9d55', // Low
  1, '#7fbf4d', // Low-Medium
  2, '#e9c23f', // Medium-High
  3, '#ee6c4d', // High
  4, '#c1121f', // Extremely High
  -1, '#8d99ae', // Arid & Low Water Use
  'rgba(0,0,0,0)',
]

/**
 * Optional REAL WRI Aqueduct 4.0 baseline water-stress overlay
 * (U.S. basins, CC BY 4.0). Low opacity keeps satellite readable.
 */
export default function WaterStressLayer() {
  const visible = useSiteStore((s) => s.waterStressVisible)
  const [geo, setGeo] = useState<AqueductGeo | null>(null)

  useEffect(() => {
    if (!visible || geo) return
    loadAqueductData()
      .then(setGeo)
      .catch(() => {
        // Layer stays empty; the site lookup path handles its own errors.
      })
  }, [visible, geo])

  if (!visible || !geo) return null

  return (
    <Source id="aqueduct-basins" type="geojson" data={geo}>
      <Layer
        id="aqueduct-fill"
        type="fill"
        paint={{
          'fill-color': STRESS_COLOR,
          'fill-opacity': 0.3,
        }}
      />
      <Layer
        id="aqueduct-border"
        type="line"
        paint={{
          'line-color': 'rgba(222, 230, 238, 0.3)',
          'line-width': 0.7,
        }}
      />
    </Source>
  )
}
