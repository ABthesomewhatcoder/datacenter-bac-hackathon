import { Layer, Source } from 'react-map-gl/mapbox'
import { stateFillColor } from '../../lib/colors'
import { STATE_FADE_RANGE } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

export const STATE_SOURCE_ID = 'us-states'
export const STATE_FILL_LAYER_ID = 'state-fill'

/**
 * Choropleth of state suitability for the active metric. Fill opacity stays
 * ~60% at national zoom so satellite imagery reads through, then fades out
 * across STATE_FADE_RANGE as the county layer fades in. State borders stay
 * visible at county zoom for context. The fill remains queryable while
 * transparent, so clicking a neighboring state at county zoom still works.
 */
export default function StateLayer() {
  const scoredStates = useSiteStore((s) => s.scoredStates)
  const activeMetric = useSiteStore((s) => s.activeMetric)
  const selectedStateId = useSiteStore((s) => s.selectedStateId)

  if (!scoredStates) return null

  const [fadeFrom, fadeTo] = STATE_FADE_RANGE

  return (
    <Source
      id={STATE_SOURCE_ID}
      type="geojson"
      data={scoredStates}
      promoteId="id"
    >
      <Layer
        id={STATE_FILL_LAYER_ID}
        type="fill"
        paint={{
          'fill-color': stateFillColor(activeMetric),
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            fadeFrom,
            [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.78,
              0.6,
            ],
            fadeTo,
            0,
          ],
        }}
      />
      <Layer
        id="state-border"
        type="line"
        paint={{
          'line-color': 'rgba(222, 230, 238, 0.5)',
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2,
            0.8,
          ],
        }}
      />
      <Layer
        id="state-selected-border"
        type="line"
        filter={['==', ['get', 'id'], selectedStateId ?? '']}
        paint={{
          'line-color': '#e8edf2',
          'line-width': 2.5,
        }}
      />
    </Source>
  )
}
