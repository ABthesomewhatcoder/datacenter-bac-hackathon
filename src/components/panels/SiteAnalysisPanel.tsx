import { scoreToColor } from '../../lib/colors'
import { METRICS, type StateScore } from '../../lib/scoring'
import { useSiteStore } from '../../store/useSiteStore'

function MetricBars({ score }: { score: StateScore }) {
  return (
    <div className="metric-rows">
      {METRICS.map(({ id, label }) => (
        <div key={id} className="metric-row">
          <div className="metric-row__top">
            <span className="metric-row__label">{label}</span>
            <span className="metric-row__value">{score[id]}</span>
          </div>
          <div className="metric-row__track">
            <div
              className="metric-row__bar"
              style={{
                width: `${score[id]}%`,
                background: scoreToColor(score[id]),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SiteAnalysisPanel() {
  const selectedStateId = useSiteStore((s) => s.selectedStateId)
  const setSelectedStateId = useSiteStore((s) => s.setSelectedStateId)
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const setSelectedCountyId = useSiteStore((s) => s.setSelectedCountyId)
  const stateScores = useSiteStore((s) => s.stateScores)
  const countyScores = useSiteStore((s) => s.countyScores)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const scoredCounties = useSiteStore((s) => s.scoredCounties)

  const stateName = selectedStateId
    ? (statesGeo?.features.find((f) => f.properties.id === selectedStateId)
        ?.properties.name ?? selectedStateId)
    : null

  const countyName = selectedCountyId
    ? (scoredCounties?.features.find(
        (f) => f.properties.geoid === selectedCountyId,
      )?.properties.name ?? selectedCountyId)
    : null

  const countyScore = selectedCountyId
    ? (countyScores?.[selectedCountyId] ?? null)
    : null
  const stateScore = selectedStateId
    ? (stateScores?.[selectedStateId] ?? null)
    : null

  const showCounty = Boolean(selectedCountyId && countyScore)
  const score = showCounty ? countyScore : stateScore

  return (
    <aside className="panel panel--right" aria-label="Site analysis">
      <section className="panel__section">
        <h2 className="panel__heading">Site Analysis</h2>

        {selectedStateId && score ? (
          <div className="state-report">
            <div className="state-report__header">
              <div>
                {showCounty && (
                  <button
                    type="button"
                    className="state-report__parent"
                    onClick={() => setSelectedCountyId(null)}
                  >
                    {stateName}
                  </button>
                )}
                <div className="state-report__name">
                  {showCounty ? countyName : stateName}
                </div>
                <div className="state-report__sub">
                  Confidence {Math.round(score.confidence * 100)}% · demo data
                </div>
              </div>
              <button
                type="button"
                className="state-report__clear"
                onClick={() => {
                  setSelectedCountyId(null)
                  setSelectedStateId(null)
                }}
                aria-label="Clear selection"
              >
                ✕
              </button>
            </div>

            <MetricBars score={score} />

            {!showCounty && (
              <p className="state-report__hint">
                Zoom in or click within the state to drill down to counties.
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
              Click a state to zoom in, then a county to drill down into its
              suitability metrics. Site-level analysis arrives in a later
              phase.
            </p>
          </div>
        )}
      </section>
    </aside>
  )
}
