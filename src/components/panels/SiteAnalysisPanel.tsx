import { scoreToColor } from '../../lib/colors'
import { METRICS } from '../../lib/scoring'
import { useSiteStore } from '../../store/useSiteStore'

export default function SiteAnalysisPanel() {
  const selectedStateId = useSiteStore((s) => s.selectedStateId)
  const setSelectedStateId = useSiteStore((s) => s.setSelectedStateId)
  const stateScores = useSiteStore((s) => s.stateScores)
  const statesGeo = useSiteStore((s) => s.statesGeo)

  const stateName =
    statesGeo?.features.find((f) => f.properties.id === selectedStateId)
      ?.properties.name ?? selectedStateId

  const score = selectedStateId ? stateScores?.[selectedStateId] : null

  return (
    <aside className="panel panel--right" aria-label="Site analysis">
      <section className="panel__section">
        <h2 className="panel__heading">Site Analysis</h2>

        {selectedStateId && score ? (
          <div className="state-report">
            <div className="state-report__header">
              <div>
                <div className="state-report__name">{stateName}</div>
                <div className="state-report__sub">
                  Confidence {Math.round(score.confidence * 100)}% · demo data
                </div>
              </div>
              <button
                type="button"
                className="state-report__clear"
                onClick={() => setSelectedStateId(null)}
                aria-label="Clear selection"
              >
                ✕
              </button>
            </div>

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
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">
              ◎
            </div>
            <p className="empty-state__title">No state selected</p>
            <p className="empty-state__hint">
              Click a state on the map to zoom in and review its suitability
              metrics. Site-level analysis arrives in a later phase.
            </p>
          </div>
        )}
      </section>
    </aside>
  )
}
