import { Layer, Source } from 'react-map-gl/mapbox'
import { stateFillColor } from '../../lib/colors'
import { COUNTY_FADE_RANGE, COUNTY_MIN_RENDER_ZOOM } from '../../lib/mapMode'
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
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            fadeFrom,
            0,
            fadeTo,
            [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.8,
              0.62,
            ],
          ],
        }}
      />
      <Layer
        id="county-border"
        type="line"
        minzoom={COUNTY_MIN_RENDER_ZOOM}
        paint={{
          'line-color': 'rgba(240, 246, 252, 0.45)',
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
          'line-color': '#35c2c9',
          'line-width': 2.5,
        }}
      />
    </Source>
  )
}
