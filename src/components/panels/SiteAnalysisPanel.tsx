import { scoreToColor } from '../../lib/colors'
import {
  generateLocalCells,
  type LocalCellScore,
} from '../../lib/localScoring'
import { METRICS, type StateScore } from '../../lib/scoring'
import { useSiteStore } from '../../store/useSiteStore'

interface Bar {
  label: string
  value: number
}

function MetricBars({ bars }: { bars: Bar[] }) {
  return (
    <div className="metric-rows">
      {bars.map(({ label, value }) => (
        <div key={label} className="metric-row">
          <div className="metric-row__top">
            <span className="metric-row__label">{label}</span>
            <span className="metric-row__value">{value}</span>
          </div>
          <div className="metric-row__track">
            <div
              className="metric-row__bar"
              style={{
                width: `${value}%`,
                background: scoreToColor(value),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const scoreBars = (score: StateScore): Bar[] =>
  METRICS.map(({ id, label }) => ({ label, value: score[id] }))

const cellBars = (cell: LocalCellScore): Bar[] => [
  { label: 'Local Suitability', value: cell.overall },
  { label: 'Regional baseline', value: cell.regionalScore },
  { label: 'Land', value: cell.landScore },
  { label: 'Flood', value: cell.floodScore },
  { label: 'Transmission', value: cell.transmissionScore },
]

export default function SiteAnalysisPanel() {
  const selectedStateId = useSiteStore((s) => s.selectedStateId)
  const setSelectedStateId = useSiteStore((s) => s.setSelectedStateId)
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const setSelectedCountyId = useSiteStore((s) => s.setSelectedCountyId)
  const selectedH3Index = useSiteStore((s) => s.selectedH3Index)
  const setSelectedH3Index = useSiteStore((s) => s.setSelectedH3Index)
  const stateScores = useSiteStore((s) => s.stateScores)
  const countyScores = useSiteStore((s) => s.countyScores)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const scoredCounties = useSiteStore((s) => s.scoredCounties)

  const stateName = selectedStateId
    ? (statesGeo?.features.find((f) => f.properties.id === selectedStateId)
        ?.properties.name ?? selectedStateId)
    : null

  const countyFeature = selectedCountyId
    ? scoredCounties?.features.find(
        (f) => f.properties.geoid === selectedCountyId,
      )
    : null
  const countyName = selectedCountyId
    ? (countyFeature?.properties.name ?? selectedCountyId)
    : null

  const countyScore = selectedCountyId
    ? (countyScores?.[selectedCountyId] ?? null)
    : null
  const stateScore = selectedStateId
    ? (stateScores?.[selectedStateId] ?? null)
    : null

  // Cells are generated deterministically and cached, so this lookup is cheap.
  const selectedCell =
    selectedH3Index && selectedCountyId && countyFeature && countyScore
      ? (generateLocalCells(selectedCountyId, countyFeature, countyScore).find(
          (c) => c.h3Index === selectedH3Index,
        ) ?? null)
      : null

  const showCell = Boolean(selectedCell)
  const showCounty = !showCell && Boolean(selectedCountyId && countyScore)

  const clearAll = () => {
    setSelectedH3Index(null)
    setSelectedCountyId(null)
    setSelectedStateId(null)
  }

  return (
    <aside className="panel panel--right" aria-label="Site analysis">
      <section className="panel__section">
        <h2 className="panel__heading">Site Analysis</h2>

        {selectedStateId && (selectedCell || countyScore || stateScore) ? (
          <div className="state-report">
            <div className="state-report__header">
              <div>
                {(showCounty || showCell) && (
                  <button
                    type="button"
                    className="state-report__parent"
                    onClick={() => {
                      setSelectedH3Index(null)
                      if (showCounty) setSelectedCountyId(null)
                    }}
                  >
                    {showCell ? `${stateName} · ${countyName}` : stateName}
                  </button>
                )}
                <div className="state-report__name">
                  {showCell
                    ? 'Local Analysis'
                    : showCounty
                      ? countyName
                      : stateName}
                </div>
                {showCell && selectedCell ? (
                  <div className="state-report__sub">
                    Cell <span className="mono">{selectedCell.h3Index}</span> ·
                    demo data
                  </div>
                ) : (
                  <div className="state-report__sub">
                    Confidence{' '}
                    {Math.round(
                      ((showCounty ? countyScore : stateScore)?.confidence ??
                        0) * 100,
                    )}
                    % · demo data
                  </div>
                )}
              </div>
              <button
                type="button"
                className="state-report__clear"
                onClick={clearAll}
                aria-label="Clear selection"
              >
                ✕
              </button>
            </div>

            {showCell && selectedCell ? (
              <MetricBars bars={cellBars(selectedCell)} />
            ) : showCounty && countyScore ? (
              <MetricBars bars={scoreBars(countyScore)} />
            ) : stateScore ? (
              <MetricBars bars={scoreBars(stateScore)} />
            ) : null}

            {!showCell && !showCounty && (
              <p className="state-report__hint">
                Zoom in or click within the state to drill down to counties.
              </p>
            )}
            {showCounty && (
              <p className="state-report__hint">
                Zoom in further to analyze local suitability cells.
              </p>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">
              ◎
            </div>
            <p className="empty-state__title">No area selected</p>
            <p className="empty-state__hint">
              Click a state to zoom in, a county to drill down, then a local
              cell to inspect granular suitability. Exact site placement
              arrives in a later phase.
            </p>
          </div>
        )}
      </section>
    </aside>
  )
}
