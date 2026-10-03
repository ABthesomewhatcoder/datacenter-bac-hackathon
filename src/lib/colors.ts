import type { ExpressionSpecification } from 'mapbox-gl'
import type { Metric } from './scoring'

/**
 * Score → color ramp (red = low, yellow/orange = mid, green = high).
 * Single source of truth for both the Mapbox layer expression and any
 * DOM UI (panel bars, legend).
 */
export const SCORE_STOPS: Array<[number, string]> = [
  [30, '#d64550'],
  [50, '#e8833d'],
  [65, '#e9c23f'],
  [80, '#7fbf4d'],
  [95, '#1f9d55'],
]

export const NO_DATA_COLOR = '#5b6676'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

/** JS-side equivalent of the map's linear interpolation over SCORE_STOPS. */
export function scoreToColor(score: number): string {
  const stops = SCORE_STOPS
  if (score <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [stop, color] = stops[i]
    if (score <= stop) {
      const [prevStop, prevColor] = stops[i - 1]
      return mix(prevColor, color, (score - prevStop) / (stop - prevStop))
    }
  }
  return stops[stops.length - 1][1]
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
