import { useEffect, useMemo, useState } from 'react'
import { PRIORITY_PROFILES } from '../../lib/decisionEngine'
import {
  rankCounties,
  REGIONAL_DATASET,
  regionalReasons,
  type RegionalCountyScore,
} from '../../lib/regionalScreening'
import { useSiteStore } from '../../store/useSiteStore'

const TOP_N = 15

function PillarMini({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="regional-row__pillar">
      {label} {value !== null ? Math.round(value) : '–'}
    </span>
  )
}

/**
 * P2 — TOP REGIONAL CANDIDATES. Nationwide screening of every CONUS
 * county's REAL precomputed evidence under the current facility profile
 * and decision priority profile. Identifies regions for deeper P1
 * exact-site investigation — never a final site verdict.
 */
export default function TopRegionalCandidates() {
  const regionalEvidence = useSiteStore((s) => s.regionalEvidence)
  const regionalScores = useSiteStore((s) => s.regionalScores)
  const ensureRegionalEvidence = useSiteStore((s) => s.ensureRegionalEvidence)
  const inputs = useSiteStore((s) => s.simulationInputs)
  const priorityProfile = useSiteStore((s) => s.priorityProfile)
  const focusCounty = useSiteStore((s) => s.focusCounty)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    ensureRegionalEvidence()
  }, [ensureRegionalEvidence])

  const top = useMemo(
    () => (regionalScores ? rankCounties(regionalScores).slice(0, TOP_N) : null),
    [regionalScores],
  )
  const evidenceByFips = useMemo(() => {
    if (!regionalEvidence) return null
    return new Map(regionalEvidence.counties.map((c) => [c.fips, c]))
  }, [regionalEvidence])

  if (!top || !evidenceByFips) {
    return (
      <div className="regional-panel">
        <h3 className="panel__heading">National screening</h3>
        <p className="panel__intro">
          Rank U.S. regions for the selected facility.
        </p>
        <p className="panel__placeholder">Loading regional evidence…</p>
      </div>
    )
  }

  const evaluated = regionalScores!.filter((s) => s.score !== null).length
  const eligible = regionalScores!.filter((s) => s.rankingEligible).length

  const renderRow = (s: RegionalCountyScore, i: number) => {
    const evidence = evidenceByFips.get(s.fips)
    const reasons = evidence ? regionalReasons(evidence, s) : null
    const open = expanded === s.fips
    return (
      <div key={s.fips} className="regional-row">
        <button
          type="button"
          className="regional-row__main"
          onClick={() => focusCounty(s.state, s.fips)}
          title="Zoom to county and place an exact candidate site"
        >
          <span className="regional-row__rank mono">{String(i + 1).padStart(2, '0')}</span>
          <span className="regional-row__name">
            {s.name}, {s.state}
          </span>
          <span className="regional-row__score">{Math.round(s.score!)}</span>
        </button>
        <div className="regional-row__pillars">
          <PillarMini label="Power" value={s.pillars.power} />
          <PillarMini label="Carbon" value={s.pillars.carbon} />
          <PillarMini label="Water" value={s.pillars.water} />
          <PillarMini label="Regulation" value={s.pillars.community} />
          <span className="regional-row__conf">conf {s.confidencePct}%</span>
          {reasons && (
            <button
              type="button"
              className="regional-row__why"
              onClick={() => setExpanded(open ? null : s.fips)}
              aria-expanded={open}
            >
              {open ? 'hide' : 'why?'}
            </button>
          )}
        </div>
        {open && reasons && (
          <ul className="score-card__list regional-row__reasons">
            {reasons.positives.map((p) => (
              <li key={p} className="regional-reason--good">
                ✓ {p}
              </li>
            ))}
            {reasons.risks.map((r) => (
              <li key={r} className="regional-reason--risk">
                ⚠ {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="regional-panel">
      <h3 className="panel__heading">
        National screening <span className="tag tag--real">Real data</span>
      </h3>
      <p className="panel__intro">
        Rank U.S. regions for the selected facility —{' '}
        {inputs.itLoadMW} MW IT · PUE {inputs.pue.toFixed(2)} ·{' '}
        {PRIORITY_PROFILES[priorityProfile].label}.
      </p>
      <div className="site-facts">
        <div className="site-fact">
          <span>Counties evaluated</span>
          <span>{evaluated.toLocaleString('en-US')}</span>
        </div>
        <div className="site-fact">
          <span
            title="Counties missing carbon, water, transmission or state grid evidence — or under 65% evidence confidence — keep their score on the map but are not nationally ranked."
          >
            Recommendation-eligible ⓘ
          </span>
          <span>{eligible.toLocaleString('en-US')}</span>
        </div>
      </div>

      <h3 className="panel__subheading">Top regional candidates</h3>
      <div className="regional-list">{top.map(renderRow)}</div>

      <p className="sim-note">
        Click a county to zoom in and place an exact candidate site for
        coordinate-level screening.
      </p>
      <details className="disclosure">
        <summary>About regional scores</summary>
        <div className="disclosure__body">
          {REGIONAL_DATASET.caveat}{' '}
          {REGIONAL_DATASET.representativePointCaveat} This tool supports
          early-stage site screening; parcel acreage, ownership, zoning,
          fiber availability, permitting, geotechnical conditions and
          utility interconnection require additional due diligence.
        </div>
      </details>
      <details className="disclosure">
        <summary>Data &amp; methodology</summary>
        <div className="disclosure__body">
          Evidence: EPA eGRID2023 · WRI Aqueduct 4.0 · HIFLD transmission ·
          NERC 2026 SRA · state generation/demand data · Moratorium Nation
          2026 (CC BY 4.0). Scores use the same utilities and weighted
          geometric mean as exact-site screening, with the physical pillar
          reserved for coordinate-level evidence. Full source links are in
          the project README.
        </div>
      </details>
    </div>
  )
}
