import { legendGradient, SCORE_STOPS } from '../../lib/colors'
import { LOCAL_METRICS } from '../../lib/localScoring'
import { getMapMode } from '../../lib/mapMode'
import { METRICS } from '../../lib/scoring'
import { BASEMAPS, useSiteStore, type BasemapId } from '../../store/useSiteStore'

const BASEMAP_ORDER: BasemapId[] = ['satellite', 'clean']

export default function ControlPanel() {
  const basemap = useSiteStore((s) => s.basemap)
  const setBasemap = useSiteStore((s) => s.setBasemap)
  const activeMetric = useSiteStore((s) => s.activeMetric)
  const setActiveMetric = useSiteStore((s) => s.setActiveMetric)
  const activeLocalMetric = useSiteStore((s) => s.activeLocalMetric)
  const setActiveLocalMetric = useSiteStore((s) => s.setActiveLocalMetric)
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const zoom = useSiteStore((s) => s.viewState.zoom)
  const stateDataError = useSiteStore((s) => s.stateDataError)
  const transmissionVisible = useSiteStore((s) => s.transmissionVisible)
  const toggleTransmission = useSiteStore((s) => s.toggleTransmission)

  // In local and site modes the metric selector drives the H3 surface.
  const mode = getMapMode(zoom)
  const localActive =
    (mode === 'local' || mode === 'site') && selectedCountyId !== null

  return (
    <aside className="panel panel--left" aria-label="Map controls">
      <section className="panel__section">
        <h2 className="panel__heading">Basemap</h2>
        <div className="segmented" role="group" aria-label="Basemap style">
          {BASEMAP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`segmented__option${basemap === id ? ' segmented__option--active' : ''}`}
              aria-pressed={basemap === id}
              onClick={() => setBasemap(id)}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel__section">
        <h2 className="panel__heading">
          {localActive ? 'Active Metric · Local' : 'Active Metric'}
        </h2>
        {localActive ? (
          <div
            className="segmented segmented--grid"
            role="group"
            aria-label="Local suitability metric"
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
        ) : (
          <div
            className="segmented segmented--grid"
            role="group"
            aria-label="Suitability metric"
          >
            {METRICS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`segmented__option${activeMetric === id ? ' segmented__option--active' : ''}`}
                aria-pressed={activeMetric === id}
                onClick={() => setActiveMetric(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel__section">
        <h2 className="panel__heading">Infrastructure</h2>
        <div className="toggle-row">
          <div>
            <div className="toggle-row__label">Transmission Lines</div>
            <div className="toggle-row__sub">HIFLD · real data · local zoom</div>
          </div>
          <button
            type="button"
            className={`toggle${transmissionVisible ? ' toggle--on' : ''}`}
            role="switch"
            aria-checked={transmissionVisible}
            aria-label="Toggle transmission lines"
            onClick={toggleTransmission}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
      </section>

      <section className="panel__section">
        <h2 className="panel__heading">Suitability</h2>
        <div className="legend">
          <div
            className="legend__ramp"
            style={{ background: legendGradient() }}
          />
          <div className="legend__labels">
            <span>{SCORE_STOPS[0][0]} · Low</span>
            <span>High · {SCORE_STOPS[SCORE_STOPS.length - 1][0]}</span>
          </div>
        </div>
        <p className="panel__placeholder">
          Demo scores — synthetic data for prototyping.
        </p>
        {stateDataError && (
          <p className="panel__error">State data failed to load: {stateDataError}</p>
        )}
      </section>
    </aside>
  )
}
