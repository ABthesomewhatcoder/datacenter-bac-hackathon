import type { ExpressionSpecification } from 'mapbox-gl'
import type { Metric } from './scoring.ts'

/**
 * Suitability ramp — analytical red → orange → amber → yellow-green →
 * green. Muted so it reads over satellite imagery without going neon.
 * Green = stronger candidate, red = weaker candidate; missing evidence
 * is NEVER red (see NO_DATA_COLOR: neutral gray = "cannot evaluate").
 * Single source of truth for the Mapbox expression and DOM UI.
 */
export const SCORE_STOPS: Array<[number, string]> = [
  [35, '#9e4b42'],
  [50, '#c07a3c'],
  [65, '#c9a83e'],
  [78, '#9bae4c'],
  [88, '#5f9e5f'],
  [96, '#3f8e58'],
]

export const NO_DATA_COLOR = '#596069'

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
