import { scoreToColor } from '../../lib/colors'
import type { StateScore } from '../../lib/scoring'

export interface TooltipInfo {
  x: number
  y: number
  name: string
  /** Secondary line, e.g. the parent state for a county. */
  subtitle?: string
  score: StateScore | null
}

const ROWS: Array<{ key: keyof StateScore; label: string }> = [
  { key: 'overall', label: 'Overall' },
  { key: 'power', label: 'Power' },
  { key: 'water', label: 'Water' },
  { key: 'buildability', label: 'Buildability' },
]

export default function MapTooltip({ info }: { info: TooltipInfo }) {
  return (
    <div
      className="map-tooltip"
      style={{ transform: `translate(${info.x + 14}px, ${info.y + 14}px)` }}
    >
      <div className="map-tooltip__title">{info.name}</div>
      {info.subtitle && (
        <div className="map-tooltip__subtitle">{info.subtitle}</div>
      )}
      {info.score ? (
        <dl className="map-tooltip__rows">
          {ROWS.map(({ key, label }) => (
            <div key={key} className="map-tooltip__row">
              <dt>{label}</dt>
              <dd>
                <span
                  className="map-tooltip__dot"
                  style={{ background: scoreToColor(info.score![key]) }}
                />
                {info.score![key]}
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
