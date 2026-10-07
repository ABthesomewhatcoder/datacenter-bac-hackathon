import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/mapbox'
import circle from '@turf/circle'
import { useSiteStore } from '../../store/useSiteStore'

/**
 * Analysis radius around the candidate site: a Turf.js circle polygon with
 * a subtle fill and a dashed technical outline. Rebuilt via useMemo, so
 * radius changes re-render instantly.
 */
export default function AnalysisRadius() {
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const radiusMiles = useSiteStore((s) => s.analysisRadiusMiles)

  const polygon = useMemo(() => {
    if (!selectedSite) return null
    return circle(
      [selectedSite.longitude, selectedSite.latitude],
      radiusMiles,
      { steps: 128, units: 'miles' },
    )
  }, [selectedSite, radiusMiles])

  if (!polygon) return null

  return (
    <Source id="analysis-radius" type="geojson" data={polygon}>
      <Layer
        id="analysis-radius-fill"
        type="fill"
        paint={{
          'fill-color': '#d38a3a',
          'fill-opacity': 0.06,
        }}
      />
      <Layer
        id="analysis-radius-line"
        type="line"
        paint={{
          'line-color': '#e8edf2',
          'line-width': 1.6,
          'line-dasharray': [3, 2],
          'line-opacity': 0.9,
        }}
      />
    </Source>
  )
}
