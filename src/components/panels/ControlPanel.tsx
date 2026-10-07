import { legendGradient, SCORE_STOPS } from '../../lib/colors'
import { LOCAL_METRICS } from '../../lib/localScoring'
import { getMapMode } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'
import ProjectConfiguration from './ProjectConfiguration'

/**
 * LEFT ZONE — assumptions. Project configuration + facility requirements
 * live here permanently; the map legend and the demo-only local metric
 * selector sit below. Data-layer toggles moved to the floating Layers
 * control on the map.
 */
export default function ControlPanel() {
  const activeLocalMetric = useSiteStore((s) => s.activeLocalMetric)
  const setActiveLocalMetric = useSiteStore((s) => s.setActiveLocalMetric)
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const zoom = useSiteStore((s) => s.viewState.zoom)
  const stateDataError = useSiteStore((s) => s.stateDataError)

  // In local and site modes the metric selector drives the H3 surface.
  const mode = getMapMode(zoom)
  const localActive =
    (mode === 'local' || mode === 'site') && selectedCountyId !== null

  return (
    <aside className="panel panel--left" aria-label="Project configuration">
      <section className="panel__section">
        <ProjectConfiguration />
      </section>

      {localActive && (
        <section className="panel__section">
          <h2 className="panel__heading">
            Local navigation surface{' '}
            <span className="tag tag--scenario">Demo</span>
          </h2>
          <p className="panel__intro">
            Prototype H3 cells for drill-down only — not used by any real
            score.
          </p>
          <div
            className="segmented segmented--grid"
            role="group"
            aria-label="Local metric (demo)"
          >
            {LOCAL_METRICS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`segmented__option${activeLocalMetric === id ? ' segmented__option--active' : ''}`}
                aria-pressed={activeLocalMetric === id}
                onClick={() => setActiveLocalMetric(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel__section">
        <h2 className="panel__heading">Regional opportunity</h2>
        <div className="legend">
          <div
            className="legend__ramp"
            style={{ background: legendGradient() }}
          />
          <div className="legend__labels">
            <span>{SCORE_STOPS[0][0]} · Lower</span>
            <span>Higher · {SCORE_STOPS[SCORE_STOPS.length - 1][0]}</span>
          </div>
        </div>
        <p className="panel__placeholder">
          Map shading reflects the real Regional Opportunity Score for the
          configured facility.
        </p>
        {stateDataError && (
          <p className="panel__error">
            State data failed to load: {stateDataError}
          </p>
        )}
      </section>
    </aside>
  )
}
