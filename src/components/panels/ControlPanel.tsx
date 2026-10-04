import { legendGradient, SCORE_STOPS } from '../../lib/colors'
import { FLOOD_MIN_ZOOM } from '../../lib/flood'
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
  const floodVisible = useSiteStore((s) => s.floodVisible)
  const toggleFlood = useSiteStore((s) => s.toggleFlood)
  const floodZonesLoading = useSiteStore((s) => s.floodZonesLoading)
  const floodError = useSiteStore((s) => s.floodError)
  const landCoverVisible = useSiteStore((s) => s.landCoverVisible)
  const toggleLandCover = useSiteStore((s) => s.toggleLandCover)
  const egridVisible = useSiteStore((s) => s.egridVisible)
  const toggleEgrid = useSiteStore((s) => s.toggleEgrid)
  const waterStressVisible = useSiteStore((s) => s.waterStressVisible)
  const toggleWaterStress = useSiteStore((s) => s.toggleWaterStress)
  const regulatoryVisible = useSiteStore((s) => s.regulatoryVisible)
  const toggleRegulatory = useSiteStore((s) => s.toggleRegulatory)

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
            <div className="toggle-row__sub">HIFLD · real data · state zoom +</div>
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
        <div className="toggle-row">
          <div>
            <div className="toggle-row__label">Flood Hazard</div>
            <div className="toggle-row__sub">FEMA NFHL · real data · local zoom</div>
          </div>
          <button
            type="button"
            className={`toggle${floodVisible ? ' toggle--on' : ''}`}
            role="switch"
            aria-checked={floodVisible}
            aria-label="Toggle FEMA flood hazard zones"
            onClick={toggleFlood}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-row__label">Land Cover</div>
            <div className="toggle-row__sub">USGS NLCD 2025 · real data · local zoom</div>
          </div>
          <button
            type="button"
            className={`toggle${landCoverVisible ? ' toggle--on' : ''}`}
            role="switch"
            aria-checked={landCoverVisible}
            aria-label="Toggle NLCD land cover overlay"
            onClick={toggleLandCover}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-row__label">Grid Carbon</div>
            <div className="toggle-row__sub">EPA eGRID2023 · real data</div>
          </div>
          <button
            type="button"
            className={`toggle${egridVisible ? ' toggle--on' : ''}`}
            role="switch"
            aria-checked={egridVisible}
            aria-label="Toggle eGRID carbon intensity overlay"
            onClick={toggleEgrid}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-row__label">Water Stress</div>
            <div className="toggle-row__sub">WRI Aqueduct 4.0 · real data</div>
          </div>
          <button
            type="button"
            className={`toggle${waterStressVisible ? ' toggle--on' : ''}`}
            role="switch"
            aria-checked={waterStressVisible}
            aria-label="Toggle Aqueduct water stress overlay"
            onClick={toggleWaterStress}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-row__label">Regulatory Activity</div>
            <div className="toggle-row__sub">
              Moratorium Nation 2026 · real data · thru 2026-09-23
            </div>
          </div>
          <button
            type="button"
            className={`toggle${regulatoryVisible ? ' toggle--on' : ''}`}
            role="switch"
            aria-checked={regulatoryVisible}
            aria-label="Toggle data-center regulatory activity overlay"
            onClick={toggleRegulatory}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
        {floodVisible && zoom < FLOOD_MIN_ZOOM && (
          <p className="toggle-status">Zoom in to view FEMA flood hazards</p>
        )}
        {floodVisible && floodZonesLoading && (
          <p className="toggle-status">Loading FEMA flood data…</p>
        )}
        {floodVisible && !floodZonesLoading && floodError && (
          <p className="toggle-status toggle-status--error">
            FEMA flood data temporarily unavailable
          </p>
        )}
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
