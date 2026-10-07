import { useEffect, useMemo, useRef } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/mapbox'
import circle from '@turf/circle'
import { useSiteStore } from '../../store/useSiteStore'

/**
 * Reference radius around the candidate site: a Turf.js circle polygon
 * with a subtle fill and a dashed technical outline. Visual context only
 * — no score consumes it. When the user CHANGES the radius, the map fits
 * to the ring so the change is actually visible (a 25 mi ring is far
 * outside the viewport at site zoom).
 */
export default function AnalysisRadius() {
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const radiusMiles = useSiteStore((s) => s.analysisRadiusMiles)
  const { current: map } = useMap()

  const polygon = useMemo(() => {
    if (!selectedSite) return null
    return circle(
      [selectedSite.longitude, selectedSite.latitude],
      radiusMiles,
      { steps: 128, units: 'miles' },
    )
  }, [selectedSite, radiusMiles])

  // Fit to the ring only on an actual radius change (not on placement),
  // so dropping a pin keeps the close-in inspection zoom.
  const prevRadius = useRef(radiusMiles)
  useEffect(() => {
    if (prevRadius.current === radiusMiles) return
    prevRadius.current = radiusMiles
    if (!map || !polygon) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of polygon.geometry.coordinates[0]) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    const cam = map.getMap().cameraForBounds(
      [[minX, minY], [maxX, maxY]],
      { padding: { top: 96, bottom: 64, left: 330, right: 420 } },
    )
    if (cam) map.getMap().jumpTo(cam)
  }, [radiusMiles, map, polygon])

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
