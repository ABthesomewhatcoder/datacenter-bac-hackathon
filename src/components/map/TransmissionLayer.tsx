import { useEffect } from 'react'
import { Layer, Source } from 'react-map-gl/mapbox'
import type { ExpressionSpecification } from 'mapbox-gl'
import { nearestTransmissionLine } from '../../lib/transmission'
import { MODE_THRESHOLDS } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

/** Voltage (kV) → width in px; unknown voltage coalesces to 0 (thin). */
const WIDTH_BY_VOLTAGE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['coalesce', ['get', 'voltage'], 0],
  0, 1,
  69, 1.3,
  230, 2,
  345, 2.8,
  500, 3.6,
  765, 4.4,
]

/** Voltage → color; unknown stays neutral gray, high voltage runs hot. */
const COLOR_BY_VOLTAGE: ExpressionSpecification = [
  'case',
  ['==', ['coalesce', ['get', 'voltage'], 0], 0],
  '#9aa5b1',
  [
    'interpolate',
    ['linear'],
    ['get', 'voltage'],
    69, '#e9c46a',
    230, '#f4a261',
    345, '#ee6c4d',
    500, '#e63946',
    765, '#c1121f',
  ],
] as ExpressionSpecification

/**
 * Progressive disclosure: the high-voltage backbone (>=200 kV) appears as
 * soon as a state is in view; lower-voltage lines fade in approaching
 * local zoom so the state/county view shows the grid without clutter.
 */
const IS_BACKBONE: ExpressionSpecification = [
  '>=',
  ['coalesce', ['get', 'voltage'], 0],
  200,
]

const OPACITY_BY_ZOOM: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  5.3, 0,
  6, ['case', IS_BACKBONE, 0.85, 0],
  7, ['case', IS_BACKBONE, 0.9, 0.35],
  7.8, 0.9,
]

/**
 * REAL HIFLD transmission lines for the state in county/local view.
 * Rendered only at local/site zoom (minzoom + opacity ramp), with a dark
 * casing so lines stay readable over bright satellite imagery. When a
 * candidate site exists, its nearest line gets a cyan glow.
 */
export default function TransmissionLayer() {
  const visible = useSiteStore((s) => s.transmissionVisible)
  const countyViewStateId = useSiteStore((s) => s.countyViewStateId)
  const transmissionByState = useSiteStore((s) => s.transmissionByState)
  const loadTransmissionFor = useSiteStore((s) => s.loadTransmissionFor)
  const selectedSite = useSiteStore((s) => s.selectedSite)

  useEffect(() => {
    if (visible && countyViewStateId) loadTransmissionFor(countyViewStateId)
  }, [visible, countyViewStateId, loadTransmissionFor])

  const data = countyViewStateId
    ? transmissionByState[countyViewStateId]
    : undefined
  if (!visible || !data || data === 'missing') return null

  const nearest = selectedSite
    ? nearestTransmissionLine(selectedSite, data)
    : null

  // Lines render from county zoom on; opacity handles the staged reveal.
  const minzoom = MODE_THRESHOLDS.county - 0.3

  return (
    <Source id="transmission" type="geojson" data={data}>
      {nearest && (
        <Layer
          id="transmission-nearest-glow"
          type="line"
          minzoom={minzoom}
          filter={['==', ['get', '__i'], nearest.properties.__i]}
          paint={{
            'line-color': 'rgba(102, 224, 232, 0.85)',
            'line-width': 9,
            'line-blur': 3,
            'line-opacity': OPACITY_BY_ZOOM,
          }}
        />
      )}
      <Layer
        id="transmission-casing"
        type="line"
        minzoom={minzoom}
        paint={{
          'line-color': 'rgba(8, 11, 17, 0.75)',
          'line-width': ['+', WIDTH_BY_VOLTAGE, 2],
          'line-opacity': OPACITY_BY_ZOOM,
        }}
      />
      <Layer
        id="transmission-lines"
        type="line"
        minzoom={minzoom}
        paint={{
          'line-color': COLOR_BY_VOLTAGE,
          'line-width': WIDTH_BY_VOLTAGE,
          'line-opacity': OPACITY_BY_ZOOM,
        }}
      />
    </Source>
  )
}
