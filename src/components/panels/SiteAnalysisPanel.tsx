import { useEffect } from 'react'
import { scoreToColor } from '../../lib/colors'
import {
  FLOOD_DATASET,
  FLOOD_RISK_COLORS,
  FLOOD_RISK_LABELS,
} from '../../lib/flood'
import { AQUEDUCT_DATASET } from '../../lib/aqueduct'
import { EGRID_DATASET } from '../../lib/egrid'
import { NLCD_DATASET } from '../../lib/landCover'
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
import FacilitySimulator from './FacilitySimulator'
import PowerGridContext from './PowerGridContext'
import RegulatoryContext from './RegulatoryContext'
import SiteScoreCard from './SiteScoreCard'
import TopRegionalCandidates from './TopRegionalCandidates'
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
  const floodAssessment = useSiteStore((s) => s.floodAssessment)
  const assessSiteFlood = useSiteStore((s) => s.assessSiteFlood)
  const landCoverAssessment = useSiteStore((s) => s.landCoverAssessment)
  const assessSiteLandCover = useSiteStore((s) => s.assessSiteLandCover)
  const egridAssessment = useSiteStore((s) => s.egridAssessment)
  const assessSiteEgrid = useSiteStore((s) => s.assessSiteEgrid)
  const waterAssessment = useSiteStore((s) => s.waterAssessment)
  const assessSiteWater = useSiteStore((s) => s.assessSiteWater)
  const assessSiteRegulatory = useSiteStore((s) => s.assessSiteRegulatory)
  const regionalScoreByFips = useSiteStore((s) => s.regionalScoreByFips)
  const regionalStateMedians = useSiteStore((s) => s.regionalStateMedians)

  useEffect(() => {
    if (selectedSite) {
      assessSiteFlood(selectedSite)
      assessSiteLandCover(selectedSite)
      assessSiteEgrid(selectedSite)
      assessSiteWater(selectedSite)
      assessSiteRegulatory(selectedSite)
    }
  }, [
    selectedSite,
    assessSiteFlood,
    assessSiteLandCover,
    assessSiteEgrid,
    assessSiteWater,
    assessSiteRegulatory,
  ])

  const siteKey = selectedSite
    ? `${selectedSite.latitude.toFixed(5)},${selectedSite.longitude.toFixed(5)}`
    : null
  const flood =
    siteKey && floodAssessment?.key === siteKey ? floodAssessment.result : null
  const landCover =
    siteKey && landCoverAssessment?.key === siteKey
      ? landCoverAssessment.result
      : null
  const egrid =
    siteKey && egridAssessment?.key === siteKey ? egridAssessment.result : null
  const water =
    siteKey && waterAssessment?.key === siteKey
      ? waterAssessment.result
      : undefined

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
                  </span>
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

            <SiteScoreCard
              nearestLine={nearestLine}
              transmissionMissing={transmissionData === 'missing'}
            />

            <div className="panel__subheading panel__subheading--minor">
              Demo navigation scores{' '}
              <span className="tag tag--scenario">Mock</span>
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
                ]}
              />
            </div>

            <div>
              <div className="panel__subheading">Land Cover</div>
              {landCover === 'loading' || (selectedSite && !landCover) ? (
                <p className="panel__placeholder">Querying USGS NLCD…</p>
              ) : landCover === 'error' ? (
                <>
                  <div className="site-facts">
                    <div className="site-fact">
                      <span>Land Cover</span>
                      <span>UNKNOWN</span>
                    </div>
                    <div className="site-fact">
                      <span>Source</span>
                      <span>{NLCD_DATASET.source}</span>
                    </div>
                  </div>
                  <p className="state-report__hint">
                    USGS land-cover data temporarily unavailable
                  </p>
                </>
              ) : landCover ? (
                <>
                  <div className="site-facts">
                    <div className="site-fact">
                      <span>Land Cover</span>
                      <span>{landCover.className}</span>
                    </div>
                    <div className="site-fact">
                      <span>NLCD Class</span>
                      <span className="mono">{landCover.classCode}</span>
                    </div>
                    <div className="site-fact">
                      <span>Mapping year</span>
                      <span>{landCover.year}</span>
                    </div>
                    <div className="site-fact">
                      <span>Constraint</span>
                      <span className="mono">
                        {landCover.constraint.toUpperCase()}
                      </span>
                    </div>
                    <div className="site-fact">
                      <span>Resolution</span>
                      <span>{landCover.resolution}</span>
                    </div>
                    <div className="site-fact">
                      <span>Source</span>
                      <span>
                        {landCover.source} · {NLCD_DATASET.dataStatus}
                      </span>
                    </div>
                  </div>
                  <p className="state-report__hint">{NLCD_DATASET.caveat}</p>
                </>
              ) : null}
            </div>

            <div>
              <div className="panel__subheading">Water Stress</div>
              {water === 'loading' || (selectedSite && water === undefined) ? (
                <p className="panel__placeholder">Resolving Aqueduct basin…</p>
              ) : water === 'error' ? (
                <p className="panel__placeholder">
                  WRI Aqueduct data temporarily unavailable
                </p>
              ) : water === null ? (
                <>
                  <div className="site-facts">
                    <div className="site-fact">
                      <span>Water Stress</span>
                      <span>UNKNOWN</span>
                    </div>
                    <div className="site-fact">
                      <span>Coverage</span>
                      <span>No Aqueduct basin at this location</span>
                    </div>
                  </div>
                  <p className="state-report__hint">
                    {AQUEDUCT_DATASET.caveat}
                  </p>
                </>
              ) : water ? (
                <>
                  <div className="site-facts">
                    <div className="site-fact">
                      <span>Water Stress</span>
                      <span>{water.baseline.label ?? 'Unknown'}</span>
                    </div>
                    <div className="site-fact">
                      <span>Aqueduct Score</span>
                      <span>
                        {water.baseline.score !== null
                          ? `${water.baseline.score.toFixed(1)} / 5`
                          : 'Unknown'}
                      </span>
                    </div>
                    <div className="site-fact">
                      <span>2030 BAU</span>
                      <span>{water.bau2030.label ?? 'Unknown'}</span>
                    </div>
                    <div className="site-fact">
                      <span>2050 BAU</span>
                      <span>{water.bau2050.label ?? 'Unknown'}</span>
                    </div>
                    <div className="site-fact">
                      <span>Constraint</span>
                      <span className="mono">
                        {water.constraint.toUpperCase()}
                      </span>
                    </div>
                    <div className="site-fact">
                      <span>Basin</span>
                      <span className="mono">{water.basinId}</span>
                    </div>
                    <div className="site-fact">
                      <span>Resolution</span>
                      <span>{water.resolution}</span>
                    </div>
                    <div className="site-fact">
                      <span>Source</span>
                      <span>
                        {AQUEDUCT_DATASET.source} ·{' '}
                        {AQUEDUCT_DATASET.dataStatus}
                      </span>
                    </div>
                  </div>
                  <p className="state-report__hint">
                    {AQUEDUCT_DATASET.caveat} {AQUEDUCT_DATASET.attribution}.
                  </p>
                </>
              ) : null}
            </div>

            <div>
              <div className="panel__subheading">Grid Carbon Intensity</div>
              {egrid === 'loading' || (selectedSite && egrid === null && egridAssessment?.key !== siteKey) ? (
                <p className="panel__placeholder">Resolving eGRID subregion…</p>
              ) : egrid === 'error' ? (
                <p className="panel__placeholder">
                  EPA eGRID data temporarily unavailable
                </p>
              ) : egrid ? (
                egrid.ambiguous ? (
                  <>
                    <div className="site-facts">
                      <div className="site-fact">
                        <span>eGRID Subregion</span>
                        <span>Multiple possible eGRID subregions</span>
                      </div>
                      {egrid.candidates.map((c) => (
                        <div className="site-fact" key={c.acronym}>
                          <span className="mono">{c.acronym}</span>
                          <span>
                            {c.co2eRateLb !== null
                              ? `${c.co2eRateLb.toFixed(0)} lb CO2e/MWh`
                              : '—'}
                          </span>
                        </div>
                      ))}
                      <div className="site-fact">
                        <span>Source</span>
                        <span>
                          {EGRID_DATASET.source} · {EGRID_DATASET.dataStatus}
                        </span>
                      </div>
                    </div>
                    <p className="state-report__hint">
                      {EGRID_DATASET.ambiguousNote}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="site-facts">
                      <div className="site-fact">
                        <span>Grid Carbon Intensity</span>
                        <span>
                          {egrid.co2eRateLb !== null
                            ? `${egrid.co2eRateLb.toFixed(0)} lb CO2e/MWh`
                            : 'Unknown'}
                        </span>
                      </div>
                      <div className="site-fact">
                        <span>Converted</span>
                        <span>
                          {egrid.co2eRateKg !== null
                            ? `${egrid.co2eRateKg.toFixed(0)} kg CO2e/MWh`
                            : '—'}
                        </span>
                      </div>
                      <div className="site-fact">
                        <span>eGRID Subregion</span>
                        <span>
                          <span className="mono">{egrid.acronym}</span> ·{' '}
                          {egrid.name}
                        </span>
                      </div>
                      {egrid.gridGrossLoss !== null && (
                        <div className="site-fact">
                          <span>Grid gross loss</span>
                          <span>{(egrid.gridGrossLoss * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      <div className="site-fact">
                        <span>Resolution</span>
                        <span>{EGRID_DATASET.resolution}</span>
                      </div>
                      <div className="site-fact">
                        <span>Source</span>
                        <span>
                          {EGRID_DATASET.source} · {EGRID_DATASET.dataStatus}
                        </span>
                      </div>
                    </div>
                    <p className="state-report__hint">{EGRID_DATASET.caveat}</p>
                  </>
                )
              ) : selectedSite ? (
                <p className="panel__placeholder">
                  Outside eGRID subregion coverage
                </p>
              ) : null}
            </div>

            <div>
              <div className="panel__subheading">Flood Risk</div>
              {flood === 'loading' || (selectedSite && !flood) ? (
                <p className="panel__placeholder">Querying FEMA NFHL…</p>
              ) : flood ? (
                <>
                  <div className="site-facts">
                    <div className="site-fact">
                      <span>Flood Risk</span>
                      <span
                        className="flood-risk"
                        style={{ color: FLOOD_RISK_COLORS[flood.riskLevel] }}
                      >
                        {FLOOD_RISK_LABELS[flood.riskLevel]}
                      </span>
                    </div>
                    {flood.mapped ? (
                      <>
                        <div className="site-fact">
                          <span>FEMA Zone</span>
                          <span>{flood.floodZone ?? 'Unknown'}</span>
                        </div>
                        {flood.zoneSubtype && (
                          <div className="site-fact">
                            <span>Zone subtype</span>
                            <span>{flood.zoneSubtype}</span>
                          </div>
                        )}
                        <div className="site-fact">
                          <span>Special Flood Hazard Area</span>
                          <span>{flood.sfha ? 'Yes' : 'No'}</span>
                        </div>
                      </>
                    ) : (
                      <div className="site-fact">
                        <span>Coverage</span>
                        <span>No FEMA data / Unknown</span>
                      </div>
                    )}
                    <div className="site-fact">
                      <span>Constraint</span>
                      <span className="mono">{flood.constraint.toUpperCase()}</span>
                    </div>
                    <div className="site-fact">
                      <span>Data resolution</span>
                      <span>{flood.resolution}</span>
                    </div>
                    <div className="site-fact">
                      <span>Source</span>
                      <span>
                        {FLOOD_DATASET.source} · {FLOOD_DATASET.dataStatus}
                      </span>
                    </div>
                  </div>
                  <p className="state-report__hint">{FLOOD_DATASET.caveat}</p>
                </>
              ) : null}
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
              ) : transmissionData === 'missing' ? (
                <p className="panel__placeholder">
                  Transmission data unavailable for this state
                </p>
              ) : (
                <p className="panel__placeholder">
                  No nearby line in loaded dataset
                </p>
              )}
              <p className="state-report__hint">
                {TRANSMISSION_DATASET.caveat}
              </p>
            </div>

            <FacilitySimulator
              nearestLine={nearestLine}
              transmissionMissing={transmissionData === 'missing'}
            />

            <PowerGridContext
              nearestLine={nearestLine}
              transmissionMissing={transmissionData === 'missing'}
            />

            <RegulatoryContext />

            <p className="state-report__hint">
              Regional/local scores (including H3 cell scores and the mock
              power/water scores) are MOCK / DEMO values. Flood risk, land
              cover, water stress, grid carbon intensity, and transmission
              proximity are REAL measurements.
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

            {!showCell && (
              <>
                {(() => {
                  const real = showCounty
                    ? selectedCountyId
                      ? (regionalScoreByFips[selectedCountyId] ?? null)
                      : null
                    : selectedStateId
                      ? (regionalStateMedians[selectedStateId] ?? null)
                      : null
                  return real !== null ? (
                    <div className="site-facts">
                      <div className="site-fact">
                        <span>
                          {showCounty
                            ? 'Regional Opportunity'
                            : 'State Regional Screening Summary'}{' '}
                          <span className="tag tag--real">Real</span>
                        </span>
                        <span>{Math.round(real)} / 100</span>
                      </div>
                    </div>
                  ) : null
                })()}
                <div className="panel__subheading panel__subheading--minor">
                  Demo navigation scores{' '}
                  <span className="tag tag--scenario">Mock</span>
                </div>
              </>
            )}
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
          <>
            <TopRegionalCandidates />
            <div className="empty-state empty-state--compact">
              <p className="empty-state__hint">
                Click a state to zoom in, a county to drill down, a local
                cell to inspect suitability, then place an exact candidate
                site.
              </p>
            </div>
          </>
        )}
      </section>
    </aside>
  )
}
