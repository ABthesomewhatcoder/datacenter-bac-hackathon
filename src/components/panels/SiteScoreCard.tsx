import { useEffect, useState } from 'react'
import {
  evaluateSite,
  PRIORITY_PROFILES,
  type LocationEvidence,
  type PriorityProfileId,
} from '../../lib/decisionEngine'
import { LB_TO_KG, loadEgridData } from '../../lib/egrid'
import { featureContains } from '../../lib/geo'
import { hasNercArea, loadGridContext, type StateGridContextMap } from '../../lib/gridContext'
import type { NearestLine } from '../../lib/transmission'
import { useSiteStore } from '../../store/useSiteStore'

const PROFILE_ORDER: PriorityProfileId[] = [
  'balanced',
  'sustainability',
  'deployment',
]

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

interface SiteScoreCardProps {
  nearestLine: NearestLine | null
  transmissionMissing: boolean
}

/**
 * SUSTAINABLE SITE SCORE — P1 facility-aware decision engine output for
 * the exact selected coordinate. REAL evidence only; the mock regional /
 * H3 demo scores shown elsewhere in this panel never enter this score.
 */
export default function SiteScoreCard({
  nearestLine,
  transmissionMissing,
}: SiteScoreCardProps) {
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const inputs = useSiteStore((s) => s.simulationInputs)
  const planningHorizonYears = useSiteStore((s) => s.planningHorizonYears)
  const setPlanningHorizonYears = useSiteStore((s) => s.setPlanningHorizonYears)
  const priorityProfile = useSiteStore((s) => s.priorityProfile)
  const setPriorityProfile = useSiteStore((s) => s.setPriorityProfile)
  const floodAssessment = useSiteStore((s) => s.floodAssessment)
  const landCoverAssessment = useSiteStore((s) => s.landCoverAssessment)
  const egridAssessment = useSiteStore((s) => s.egridAssessment)
  const waterAssessment = useSiteStore((s) => s.waterAssessment)
  const regulatoryAssessment = useSiteStore((s) => s.regulatoryAssessment)

  const [grid, setGrid] = useState<StateGridContextMap | null>(null)
  const [nationalRatesKg, setNationalRatesKg] = useState<number[] | null>(null)

  useEffect(() => {
    if (!selectedSite) return
    if (!grid) loadGridContext().then(setGrid).catch(() => setGrid({}))
    if (!nationalRatesKg) {
      loadEgridData()
        .then((d) =>
          setNationalRatesKg(
            d.subregions.features
              .map((f) => f.properties.co2eRateLb)
              .filter((r): r is number => r !== null)
              .map((lb) => lb * LB_TO_KG),
          ),
        )
        .catch(() => setNationalRatesKg([]))
    }
  }, [selectedSite, grid, nationalRatesKg])

  if (!selectedSite) return null

  const siteKey = `${selectedSite.latitude.toFixed(5)},${selectedSite.longitude.toFixed(5)}`
  const settled = <T,>(a: { key: string; result: T | 'loading' } | null) =>
    a?.key === siteKey && a.result !== 'loading' ? a.result : undefined

  const flood = settled(floodAssessment)
  const land = settled(landCoverAssessment)
  const egrid = settled(egridAssessment)
  const water = settled(waterAssessment)
  const regulatory = settled(regulatoryAssessment)

  const pending =
    flood === undefined ||
    land === undefined ||
    egrid === undefined ||
    water === undefined ||
    regulatory === undefined ||
    grid === null ||
    nationalRatesKg === null

  if (pending) {
    return (
      <div className="score-card score-card--pending">
        <div className="panel__subheading">
          Exact-site sustainability screening{' '}
          <span className="tag tag--real">Real data only</span>
        </div>
        <p className="panel__placeholder">Evaluating site evidence…</p>
      </div>
    )
  }

  const stateFeature = statesGeo?.features.find((f) =>
    featureContains(f, selectedSite.longitude, selectedSite.latitude),
  )
  const stateGrid = stateFeature ? (grid[stateFeature.properties.id] ?? null) : null

  const egridResult = egrid !== 'error' ? egrid : null
  const waterResult = water !== 'error' ? water : null
  const landResult = land !== 'error' ? land : null
  const regResult = regulatory !== 'error' ? regulatory : null

  const evidence: LocationEvidence = {
    transmission: transmissionMissing
      ? null
      : nearestLine
        ? {
            distanceMiles: nearestLine.distanceMiles,
            voltageKv: nearestLine.properties.voltage,
          }
        : 'none',
    nerc:
      stateGrid && hasNercArea(stateGrid.nerc)
        ? {
            area: stateGrid.nerc.area,
            reserveHeadroomPp: stateGrid.nerc.reserveHeadroomPp,
            riskSeasonal: stateGrid.nerc.riskSeasonal,
          }
        : null,
    growthPct5yr: stateGrid?.growthPct5yr ?? null,
    generationToSalesRatio: stateGrid?.generationToSalesRatio ?? null,
    stateSalesTWh: stateGrid?.salesTWh ?? null,
    egridRateKg:
      egridResult && !egridResult.ambiguous ? egridResult.co2eRateKg : null,
    egridNationalRatesKg: nationalRatesKg,
    water: waterResult
      ? {
          baselineScore: waterResult.baseline.score,
          bau2030Score: waterResult.bau2030.score,
          bau2050Score: waterResult.bau2050.score,
        }
      : null,
    flood: flood
      ? {
          mapped: flood.mapped,
          floodZone: flood.floodZone,
          zoneSubtype: flood.zoneSubtype,
        }
      : null,
    landCoverCode: landResult ? landResult.classCode : null,
    regulatoryLevel: regResult ? regResult.indicator.level : null,
  }

  const result = evaluateSite(
    { ...inputs, planningHorizonYears },
    evidence,
    priorityProfile,
  )

  return (
    <div className="score-card">
      <div className="panel__subheading">
        Exact-site sustainability screening{' '}
        <span className="tag tag--real">Real data only</span>
      </div>

      <div className="segmented score-card__profiles" role="group" aria-label="Priority profile">
        {PROFILE_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={`segmented__option${priorityProfile === id ? ' segmented__option--active' : ''}`}
            aria-pressed={priorityProfile === id}
            onClick={() => setPriorityProfile(id)}
          >
            {PRIORITY_PROFILES[id].label.replace(' First', '').replace(' Sustainable', '')}
          </button>
        ))}
      </div>
      <div className="segmented score-card__horizon" role="group" aria-label="Planning horizon">
        {([20, 30] as const).map((y) => (
          <button
            key={y}
            type="button"
            className={`segmented__option${planningHorizonYears === y ? ' segmented__option--active' : ''}`}
            aria-pressed={planningHorizonYears === y}
            onClick={() => setPlanningHorizonYears(y)}
          >
            {y}-yr horizon
          </button>
        ))}
      </div>

      {result.excluded ? (
        <>
          <div className="score-card__headline score-card__headline--excluded">
            EXCLUDED
          </div>
          {result.exclusions.map((e) => (
            <p key={e.reason} className="score-card__exclusion">
              {e.source}: {e.reason}
            </p>
          ))}
          <div className="site-facts">
            <div className="site-fact">
              <span>Screening constraints</span>
              <span className="score-card__fail">Fail</span>
            </div>
            <div className="site-fact">
              <span>Evidence confidence</span>
              <span>{result.confidencePct}%</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="score-card__headline">
            {result.overall ?? '—'}
            <span className="score-card__denom"> / 100</span>
            <span className="score-card__class">
              {result.classification}
            </span>
          </div>
          {result.classificationCapped && (
            <p className="sim-note">
              Label capped: a major pillar scores below 40, so this site
              cannot be rated Exceptional.
            </p>
          )}
          <div className="site-facts">
            <div className="site-fact">
              <span
                title="Confidence reflects completeness, resolution and reliability of the supporting evidence. It is separate from the suitability score."
              >
                Evidence confidence
              </span>
              <span>{result.confidencePct}%</span>
            </div>
            <div className="site-fact">
              <span>Screening constraints</span>
              <span className="score-card__pass">Pass</span>
            </div>
          </div>

          <div className="score-card__pillars">
            {result.pillars.map((p) => (
              <div key={p.id} className="score-pillar">
                <div className="score-pillar__head">
                  <span>
                    {p.label}{' '}
                    <span className="score-pillar__weight">{p.weight}%</span>
                  </span>
                  <span className="score-pillar__value">
                    {p.score !== null ? Math.round(p.score) : 'n/a'}
                  </span>
                </div>
                <div className="score-pillar__bar">
                  <div
                    className="score-pillar__fill"
                    style={{ width: `${p.score ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {result.positives.length > 0 && (
            <>
              <div className="panel__subheading panel__subheading--minor">
                Why it ranks well
              </div>
              <ul className="score-card__list score-card__list--good">
                {result.positives.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {result.risks.length > 0 && (
            <>
              <div className="panel__subheading panel__subheading--minor">
                Key risks
              </div>
              <ul className="score-card__list score-card__list--risk">
                {result.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="panel__subheading panel__subheading--minor">
        Facility impact <span className="tag tag--scenario">Scenario</span>
      </div>
      <div className="site-facts">
        <div className="site-fact">
          <span>Total Facility Load</span>
          <span>{fmt(result.impact.facilityLoadMW)} MW</span>
        </div>
        <div className="site-fact">
          <span>Annual Electricity</span>
          <span>{result.impact.facilityEnergyTWh.toFixed(3)} TWh/year</span>
        </div>
        <div className="site-fact">
          <span>Annual CO2e</span>
          <span>
            {result.impact.annualCO2eTonnes !== null
              ? `${fmt(result.impact.annualCO2eTonnes)} t/year`
              : 'Unavailable — eGRID unresolved'}
          </span>
        </div>
        <div className="site-fact">
          <span>Annual Water</span>
          <span>
            {fmt(result.impact.annualWaterMillionLiters, 1)} M L ·{' '}
            {fmt(result.impact.annualWaterMillionGallons, 1)} M gal
          </span>
        </div>
      </div>
      <details className="disclosure">
        <summary>How scoring works</summary>
        <div className="disclosure__body">
          <ol>
            <li>Real-world evidence is normalized into 0–100 utility scores.</li>
            <li>Scores are grouped into Power, Carbon, Water, Physical and Regulatory pillars.</li>
            <li>Decision-strategy weights define the importance of each pillar.</li>
            <li>A weighted geometric mean combines the pillars so a severe weakness cannot be completely averaged away.</li>
            <li>Exact-coordinate screening adds FEMA, land-cover and hard exclusions.</li>
          </ol>
        </div>
      </details>
      <details className="disclosure">
        <summary>About this screening</summary>
        <div className="disclosure__body">
          This tool supports early-stage site screening. Parcel acreage,
          ownership, zoning, fiber availability, permitting, geotechnical
          conditions and utility interconnection require additional due
          diligence. Aqueduct does not prove water availability; centroid
          proximity does not establish moratorium applicability; mock demo
          scores never enter this screening.
        </div>
      </details>
    </div>
  )
}
