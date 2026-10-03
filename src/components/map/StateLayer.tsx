import { Layer, Source } from 'react-map-gl/mapbox'
import { stateFillColor } from '../../lib/colors'
import { useSiteStore } from '../../store/useSiteStore'

export const STATE_SOURCE_ID = 'us-states'
export const STATE_FILL_LAYER_ID = 'state-fill'

/**
 * Choropleth of state suitability for the active metric. Fill opacity stays
 * ~60% so satellite imagery reads through; hover/selection emphasis comes
 * from feature-state (set in SiteMap) and the selection outline layer.
 */
export default function StateLayer() {
  const scoredStates = useSiteStore((s) => s.scoredStates)
  const activeMetric = useSiteStore((s) => s.activeMetric)
  const selectedStateId = useSiteStore((s) => s.selectedStateId)

  if (!scoredStates) return null

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
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.78,
            0.6,
          ],
        }}
      />
      <Layer
        id="state-border"
        type="line"
        paint={{
          'line-color': 'rgba(240, 246, 252, 0.55)',
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
          'line-color': '#35c2c9',
          'line-width': 2.5,
        }}
      />
    </Source>
  )
}
