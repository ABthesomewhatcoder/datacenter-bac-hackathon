import { useEffect, useState } from 'react'
import { featureContains } from '../../lib/geo'
import {
  classifyDemandGrowth,
  classifyFacilityBurden,
  classifyReserveHeadroom,
  facilityShareOfStateSalesPct,
  hasNercArea,
  loadGridContext,
  type StateGridContextMap,
} from '../../lib/gridContext'
import { simulateFacility } from '../../lib/simulation'
import type { NearestLine } from '../../lib/transmission'
import { useSiteStore } from '../../store/useSiteStore'

const fmt = (n: number, digits = 1) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

const signed = (n: number, digits = 1) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`

const LEVEL_CLASS: Record<string, string> = {
  'VERY LOW': 'low',
  LOW: 'low',
  ADEQUATE: 'low',
  COMFORTABLE: 'low',
  MODERATE: 'elevated',
  HIGH: 'high',
  TIGHT: 'high',
  'VERY HIGH': 'very-high',
  SHORTFALL: 'very-high',
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`reg-level reg-level--${LEVEL_CLASS[level] ?? 'elevated'}`}>
      {level}
    </span>
  )
}

interface PowerGridContextProps {
  nearestLine: NearestLine | null
  transmissionMissing: boolean
}

/**
 * POWER & GRID CONTEXT — separate evidence lines (transmission readiness,
 * NERC resource adequacy, demand-growth pressure, annual generation
 * balance, relative facility burden), each from REAL data. Deliberately
 * NOT combined into a power score and NOT wired into suitability.
 */
export default function PowerGridContext({
  nearestLine,
  transmissionMissing,
}: PowerGridContextProps) {
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const inputs = useSiteStore((s) => s.simulationInputs)
  const [data, setData] = useState<StateGridContextMap | null | 'error'>(null)

  useEffect(() => {
    if (!selectedSite || data) return
    loadGridContext()
      .then(setData)
      .catch(() => setData('error'))
  }, [selectedSite, data])

  if (!selectedSite) return null

  const heading = (
    <div className="panel__subheading">
      Power &amp; Grid Context <span className="tag tag--real">Real site data</span>
    </div>
  )

  if (!data) {
    return (
      <div>
        {heading}
        <p className="panel__placeholder">Loading grid context…</p>
      </div>
    )
  }
  if (data === 'error') {
    return (
      <div>
        {heading}
        <p className="panel__placeholder">Grid context data unavailable</p>
      </div>
    )
  }

  const stateFeature = statesGeo?.features.find((f) =>
    featureContains(f, selectedSite.longitude, selectedSite.latitude),
  )
  const stateAbbrev = stateFeature?.properties.id ?? null
  const grid = stateAbbrev ? (data[stateAbbrev] ?? null) : null

  if (!grid) {
    return (
      <div>
        {heading}
        <p className="panel__placeholder">
          State grid context unavailable for this site
        </p>
      </div>
    )
  }

  // Facility burden derives from the simulator scenario (IT MW × PUE) and
  // updates automatically with it.
  const sim = simulateFacility(inputs, null)
  const sharePct = facilityShareOfStateSalesPct(
    sim.facilityEnergyTWh,
    grid.salesTWh,
  )
  const burden = classifyFacilityBurden(sharePct)
  const demandPressure = classifyDemandGrowth(grid.growthPct5yr)
  const nerc = grid.nerc

  return (
    <div>
      {heading}

      <div className="site-facts">
        <div className="site-fact">
          <span>Transmission</span>
          <span>
            {nearestLine
              ? `${nearestLine.distanceMiles.toFixed(1)} mi · ${
                  nearestLine.properties.voltage
                    ? `${nearestLine.properties.voltage} kV`
                    : 'unknown kV'
                }`
              : transmissionMissing
                ? 'Data unavailable'
                : 'No nearby line in loaded dataset'}
          </span>
        </div>
      </div>

      <div className="panel__subheading panel__subheading--minor">
        NERC Resource Adequacy · Summer 2026
      </div>
      {hasNercArea(nerc) ? (
        <>
          <div className="site-facts">
            <div className="site-fact">
              <span>Assessment Area</span>
              <span className="mono">{nerc.area}</span>
            </div>
            <div className="site-fact">
              <span>Reserve Headroom</span>
              <span>
                {signed(nerc.reserveHeadroomPp)}pp{' '}
                <LevelBadge level={classifyReserveHeadroom(nerc.reserveHeadroomPp)} />
              </span>
            </div>
            <div className="site-fact">
              <span>Anticipated Reserve Margin</span>
              <span>{fmt(nerc.anticipatedReserveMarginPct)}%</span>
            </div>
            <div className="site-fact">
              <span>Reference Margin</span>
              <span>{fmt(nerc.referenceMarginPct)}%</span>
            </div>
            <div className="site-fact">
              <span>NERC Seasonal Risk</span>
              <span className="mono">{nerc.riskSeasonal.toUpperCase()}</span>
            </div>
          </div>
          {(nerc.riskNote || nerc.areaNote) && (
            <p className="sim-note">
              {nerc.riskNote} {nerc.areaNote}
            </p>
          )}
        </>
      ) : (
        <p className="panel__placeholder">
          NERC regional context unavailable — {nerc.unavailableReason}
        </p>
      )}

      <div className="panel__subheading panel__subheading--minor">
        State Electricity Balance · {stateFeature?.properties.name ?? stateAbbrev}
      </div>
      <div className="site-facts">
        <div className="site-fact">
          <span>5-Year Demand Growth</span>
          <span>
            {signed(grid.growthPct5yr)}% <LevelBadge level={demandPressure} />
          </span>
        </div>
        <div className="site-fact">
          <span>Generation ({grid.generationYear})</span>
          <span>{fmt(grid.generationTWh)} TWh</span>
        </div>
        <div className="site-fact">
          <span>Retail Sales (latest 12 mo)</span>
          <span>{fmt(grid.salesTWh)} TWh</span>
        </div>
        <div className="site-fact">
          <span>Generation / Sales</span>
          <span>{grid.generationToSalesRatio.toFixed(2)}×</span>
        </div>
        <div className="site-fact">
          <span>Annual Generation Balance</span>
          <span>{signed(grid.netGenerationBalanceTWh)} TWh</span>
        </div>
        <div className="site-fact">
          <span>Avg Retail Price</span>
          <span>{fmt(grid.avgPriceCentsPerKwh, 2)} ¢/kWh</span>
        </div>
      </div>

      <div className="panel__subheading panel__subheading--minor">
        Relative Facility Burden{' '}
        <span className="tag tag--scenario">Scenario</span>
      </div>
      <div className="site-facts">
        <div className="site-fact">
          <span>Facility Load</span>
          <span>{fmt(sim.facilityLoadMW, 0)} MW</span>
        </div>
        <div className="site-fact">
          <span>Facility Electricity</span>
          <span>{sim.facilityEnergyTWh.toFixed(3)} TWh/year</span>
        </div>
        <div className="site-fact">
          <span>Facility vs State Sales</span>
          <span>
            {fmt(sharePct, sharePct < 1 ? 2 : 1)}% <LevelBadge level={burden} />
          </span>
        </div>
      </div>

      <p className="sim-note">
        Transmission proximity does not establish available interconnection
        capacity. Annual generation balance does not represent spare grid
        capacity or guaranteed power availability. NERC regional adequacy
        does not guarantee utility service to this project. These are
        separate screening indicators — not a combined power score.
      </p>
    </div>
  )
}
