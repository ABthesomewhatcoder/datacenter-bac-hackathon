import type { ExpressionSpecification } from 'mapbox-gl'
import type { Metric } from './scoring.ts'

/**
 * Score → color ramp: restrained single-hue indigo (light = low,
 * deep = high) per the product design system — status is never encoded
 * as red/green on the analytical choropleth. Single source of truth for
 * both the Mapbox layer expression and any DOM UI (bars, legend).
 */
export const SCORE_STOPS: Array<[number, string]> = [
  [30, '#E4E7F3'],
  [50, '#BDC5E7'],
  [65, '#929ED6'],
  [80, '#5D6DC4'],
  [95, '#34459F'],
]

export const NO_DATA_COLOR = '#D5D8DD'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, t: number): [number, number, number] {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return [
    Math.round(ca[0] + (cb[0] - ca[0]) * t),
    Math.round(ca[1] + (cb[1] - ca[1]) * t),
    Math.round(ca[2] + (cb[2] - ca[2]) * t),
  ]
}

/** JS-side equivalent of the map's linear interpolation over SCORE_STOPS. */
export function scoreToRgb(score: number): [number, number, number] {
  const stops = SCORE_STOPS
  if (score <= stops[0][0]) return hexToRgb(stops[0][1])
  for (let i = 1; i < stops.length; i++) {
    const [stop, color] = stops[i]
    if (score <= stop) {
      const [prevStop, prevColor] = stops[i - 1]
      return mix(prevColor, color, (score - prevStop) / (stop - prevStop))
    }
  }
  return hexToRgb(stops[stops.length - 1][1])
}

export function scoreToColor(score: number): string {
  const [r, g, b] = scoreToRgb(score)
  return `rgb(${r}, ${g}, ${b})`
}

/** Data-driven fill color for the state layer, keyed to the active metric. */
export function stateFillColor(metric: Metric): ExpressionSpecification {
  return [
    'case',
    ['==', ['typeof', ['get', metric]], 'number'],
    [
      'interpolate',
      ['linear'],
      ['get', metric],
      ...SCORE_STOPS.flat(),
    ],
    NO_DATA_COLOR,
  ] as ExpressionSpecification
}

/** CSS gradient matching SCORE_STOPS, for the legend swatch. */
export function legendGradient(): string {
  const [min] = SCORE_STOPS[0]
  const [max] = SCORE_STOPS[SCORE_STOPS.length - 1]
  const stops = SCORE_STOPS.map(
    ([value, color]) => `${color} ${((value - min) / (max - min)) * 100}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}
