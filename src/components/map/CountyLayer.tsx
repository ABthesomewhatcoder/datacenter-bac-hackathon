import { Layer, Source } from 'react-map-gl/mapbox'
import type { ExpressionSpecification } from 'mapbox-gl'
import { stateFillColor } from '../../lib/colors'
import {
  COUNTY_FADE_OUT_RANGE,
  COUNTY_FADE_RANGE,
  COUNTY_MIN_RENDER_ZOOM,
} from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

export const COUNTY_SOURCE_ID = 'us-counties'
export const COUNTY_FILL_LAYER_ID = 'county-fill'

/**
 * County choropleth for the state currently in county view. Only that
 * state's counties are in the source (per-state files fetched on demand),
 * and layers carry minzoom so counties are neither drawn nor queryable at
 * national zoom. Fills fade in across COUNTY_FADE_RANGE as state fills fade
 * out.
 */
export default function CountyLayer() {
  const scoredCounties = useSiteStore((s) => s.scoredCounties)
  const activeMetric = useSiteStore((s) => s.activeMetric)
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)

  if (!scoredCounties) return null

  const [fadeFrom, fadeTo] = COUNTY_FADE_RANGE
  const [fadeOutFrom, fadeOutTo] = COUNTY_FADE_OUT_RANGE
  const hoverOpacity: ExpressionSpecification = [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    0.8,
    0.62,
  ]

  return (
    <Source
      id={COUNTY_SOURCE_ID}
      type="geojson"
      data={scoredCounties}
      promoteId="geoid"
    >
      <Layer
        id={COUNTY_FILL_LAYER_ID}
        type="fill"
        minzoom={COUNTY_MIN_RENDER_ZOOM}
        paint={{
          'fill-color': stateFillColor(activeMetric),
          // Fade in after state view, fade back out as H3 cells take over
          // so satellite imagery reads through at local zoom.
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            fadeFrom,
            0,
            fadeTo,
            hoverOpacity,
            fadeOutFrom,
            hoverOpacity,
            fadeOutTo,
            0,
          ],
        }}
      />
      <Layer
        id="county-border"
        type="line"
        minzoom={COUNTY_MIN_RENDER_ZOOM}
        paint={{
          'line-color': 'rgba(222, 230, 238, 0.38)',
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            1.8,
            0.6,
          ],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            fadeFrom,
            0,
            fadeTo,
            1,
          ],
        }}
      />
      <Layer
        id="county-selected-border"
        type="line"
        minzoom={COUNTY_MIN_RENDER_ZOOM}
        filter={['==', ['get', 'geoid'], selectedCountyId ?? '']}
        paint={{
          'line-color': '#e8edf2',
          'line-width': 2.5,
        }}
      />
    </Source>
  )
}
