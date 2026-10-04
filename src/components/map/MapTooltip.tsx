import { scoreToColor } from '../../lib/colors'
import type { StateScore } from '../../lib/scoring'

export interface TooltipRow {
  label: string
  value: number
  color?: string
}

export interface TooltipInfo {
  x: number
  y: number
  title: string
  /** Secondary line, e.g. the parent state for a county. */
  subtitle?: string
  rows: TooltipRow[] | null
}

/**
 * Standard rows for a state/county hover. The headline row is the REAL
 * Regional Opportunity Score (P2 screening) when available; the remaining
 * rows are the legacy mock navigation scores, labeled as such.
 */
export function scoreRows(
  score: StateScore | undefined,
  regionalOverall: number | null | undefined,
): TooltipRow[] {
  const rows: Array<[string, number]> = []
  if (regionalOverall !== null && regionalOverall !== undefined) {
    rows.push(['Regional Opportunity · REAL', Math.round(regionalOverall)])
  }
  if (score) {
    rows.push(
      ['Power (mock)', score.power],
      ['Water (mock)', score.water],
      ['Buildability (mock)', score.buildability],
    )
  }
  return rows.map(([label, value]) => ({
    label,
    value,
    color: scoreToColor(value),
  }))
}

export default function MapTooltip({ info }: { info: TooltipInfo }) {
  return (
    <div
      className="map-tooltip"
      style={{ transform: `translate(${info.x + 14}px, ${info.y + 14}px)` }}
    >
      <div className="map-tooltip__title">{info.title}</div>
      {info.subtitle && (
        <div className="map-tooltip__subtitle">{info.subtitle}</div>
      )}
      {info.rows ? (
        <dl className="map-tooltip__rows">
          {info.rows.map(({ label, value, color }) => (
            <div key={label} className="map-tooltip__row">
              <dt>{label}</dt>
              <dd>
                {color && (
                  <span
                    className="map-tooltip__dot"
                    style={{ background: color }}
                  />
                )}
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="map-tooltip__empty">No score data</div>
      )}
    </div>
  )
}
