import { scoreToColor } from '../../lib/colors'
import {
  cellForLocation,
  getCellScore,
  type LocalCellScore,
} from '../../lib/localScoring'
import { METRICS, type StateScore } from '../../lib/scoring'
import {
  nearestTransmissionLine,
  TRANSMISSION_DATASET,
} from '../../lib/transmission'
import {
  RADIUS_OPTIONS_MILES,
  useSiteStore,
} from '../../store/useSiteStore'

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

interface Assessment {
  label: string
  value: number | null
  resolution: string
}

/** Assessment rows with explicit data-resolution labels — values are NOT
 * exact-coordinate measurements. */
function AssessmentRows({ rows }: { rows: Assessment[] }) {
  return (
    <div className="assessment-rows">
      {rows.map(({ label, value, resolution }) => (
        <div key={label} className="assessment-row">
          <div>
            <div className="assessment-row__label">{label}</div>
            <div className="assessment-row__resolution">{resolution}</div>
          </div>
          <span
            className="assessment-row__value"
            style={value !== null ? { color: scoreToColor(value) } : undefined}
          >
            {value ?? '—'}
          </span>
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
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const clearSelectedSite = useSiteStore((s) => s.clearSelectedSite)
  const analysisRadiusMiles = useSiteStore((s) => s.analysisRadiusMiles)
  const setAnalysisRadiusMiles = useSiteStore((s) => s.setAnalysisRadiusMiles)
  const stateScores = useSiteStore((s) => s.stateScores)
  const countyScores = useSiteStore((s) => s.countyScores)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const scoredCounties = useSiteStore((s) => s.scoredCounties)
  const countyViewStateId = useSiteStore((s) => s.countyViewStateId)
  const transmissionByState = useSiteStore((s) => s.transmissionByState)

  const transmissionData = countyViewStateId
    ? transmissionByState[countyViewStateId]
    : undefined
  const nearestLine =
    selectedSite && transmissionData && transmissionData !== 'missing'
      ? nearestTransmissionLine(selectedSite, transmissionData)
      : null

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

  // Cells are generated deterministically and cached, so lookups are cheap.
  const selectedCell =
    selectedH3Index && selectedCountyId && countyFeature && countyScore
      ? getCellScore(
          selectedCountyId,
          countyFeature,
          countyScore,
          selectedH3Index,
        )
      : null

  // Local estimates for the site come from the cell CONTAINING the exact
  // coordinate (falling back to the selected cell) — kept separate from
  // H3 selection logic.
  const siteCell =
    selectedSite && selectedCountyId && countyFeature && countyScore
      ? (cellForLocation(
          selectedCountyId,
          countyFeature,
          countyScore,
          selectedSite.latitude,
          selectedSite.longitude,
        ) ?? selectedCell)
      : null

  const showSite = Boolean(selectedSite)
  const showCell = !showSite && Boolean(selectedCell)
  const showCounty = !showSite && !showCell && Boolean(selectedCountyId && countyScore)

  const clearAll = () => {
    clearSelectedSite()
    setSelectedH3Index(null)
    setSelectedCountyId(null)
    setSelectedStateId(null)
  }

  return (
    <aside className="panel panel--right" aria-label="Site analysis">
      <section className="panel__section">
        <h2 className="panel__heading">Site Analysis</h2>

        {showSite && selectedSite ? (
          <div className="state-report">
            <div className="state-report__header">
              <div>
                <button
                  type="button"
                  className="state-report__parent"
                  onClick={clearSelectedSite}
                >
                  {stateName} · {countyName} · Local Analysis
                </button>
                <div className="state-report__name">Candidate Site</div>
                <div className="state-report__sub">
                  <span className="mono">
                    {selectedSite.latitude.toFixed(5)},{' '}
                    {selectedSite.longitude.toFixed(5)}
                  </span>{' '}
                  · demo data
                </div>
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

            <div className="site-facts">
              <div className="site-fact">
                <span>Parent state</span>
                <span>{stateName}</span>
              </div>
              <div className="site-fact">
                <span>Parent county</span>
                <span>{countyName}</span>
              </div>
              <div className="site-fact">
                <span>H3 cell</span>
                <span className="mono">
                  {siteCell?.h3Index ?? selectedH3Index ?? '—'}
                </span>
              </div>
            </div>

            <MetricBars
              bars={[
                ...(countyScore
                  ? [{ label: 'Regional Score', value: countyScore.overall }]
                  : []),
                ...(siteCell
                  ? [{ label: 'Local Score', value: siteCell.overall }]
                  : []),
              ]}
            />

            <div>
              <div className="panel__subheading">Analysis Radius</div>
              <div className="segmented" role="group" aria-label="Analysis radius">
                {RADIUS_OPTIONS_MILES.map((miles) => (
                  <button
                    key={miles}
                    type="button"
                    className={`segmented__option${analysisRadiusMiles === miles ? ' segmented__option--active' : ''}`}
                    aria-pressed={analysisRadiusMiles === miles}
                    onClick={() => setAnalysisRadiusMiles(miles)}
                  >
                    {miles} mi
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="panel__subheading">Assessment</div>
              <AssessmentRows
                rows={[
                  {
                    label: 'Power',
                    value: countyScore?.power ?? null,
                    resolution: 'Regional estimate',
                  },
                  {
                    label: 'Water',
                    value: countyScore?.water ?? null,
                    resolution: 'Regional estimate',
                  },
                  {
                    label: 'Buildability',
                    value: countyScore?.buildability ?? null,
                    resolution: 'Regional estimate',
                  },
                  {
                    label: 'Flood',
                    value: siteCell?.floodScore ?? null,
                    resolution: 'Demo local estimate',
                  },
                  {
                    label: 'Land',
                    value: siteCell?.landScore ?? null,
                    resolution: 'Demo local estimate',
                  },
                ]}
              />
            </div>

            <div>
              <div className="panel__subheading">Nearest Transmission</div>
              {nearestLine ? (
                <div className="site-facts">
                  <div className="site-fact">
                    <span>Distance</span>
                    <span>{nearestLine.distanceMiles.toFixed(1)} mi</span>
                  </div>
                  <div className="site-fact">
                    <span>Voltage</span>
                    <span>
                      {nearestLine.properties.voltage
                        ? `${nearestLine.properties.voltage} kV`
                        : 'Unknown'}
                    </span>
                  </div>
                  <div className="site-fact">
                    <span>Owner</span>
                    <span>{nearestLine.properties.owner ?? 'Unknown'}</span>
                  </div>
                  <div className="site-fact">
                    <span>Status</span>
                    <span>{nearestLine.properties.status ?? 'Unknown'}</span>
                  </div>
                  <div className="site-fact">
                    <span>Data resolution</span>
                    <span>Geospatial proximity</span>
                  </div>
                  <div className="site-fact">
                    <span>Source</span>
                    <span>
                      {TRANSMISSION_DATASET.source} ·{' '}
                      {TRANSMISSION_DATASET.dataStatus}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="panel__placeholder">
                  No nearby line in loaded dataset
                </p>
              )}
              <p className="state-report__hint">
                {TRANSMISSION_DATASET.caveat}
              </p>
            </div>

            <p className="state-report__hint">
              Regional/local scores are MOCK / DEMO values — transmission
              proximity is the only real measurement.
            </p>
          </div>
        ) : selectedStateId && (selectedCell || countyScore || stateScore) ? (
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
            {showCell && (
              <p className="state-report__hint">
                Zoom deeper and click the map to place a candidate site.
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
              Click a state to zoom in, a county to drill down, a local cell
              to inspect suitability, then place an exact candidate site.
            </p>
          </div>
        )}
      </section>
    </aside>
  )
}
