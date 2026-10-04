import { AQUEDUCT_DATASET } from '../../lib/aqueduct'
import {
  IT_CAPACITY_PRESETS_MW,
  PUE_PRESETS,
  simulateFacility,
  WUE_PRESETS,
} from '../../lib/simulation'
import type { NearestLine } from '../../lib/transmission'
import { useSiteStore } from '../../store/useSiteStore'

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

function PresetRow({
  options,
  value,
  onSelect,
  format,
  ariaLabel,
}: {
  options: number[]
  value: number
  onSelect: (v: number) => void
  format: (v: number) => string
  ariaLabel: string
}) {
  const isPreset = options.includes(value)
  return (
    <div className="sim-input">
      <div className="segmented sim-input__segmented" role="group" aria-label={ariaLabel}>
        {options.map((v) => (
          <button
            key={v}
            type="button"
            className={`segmented__option${value === v ? ' segmented__option--active' : ''}`}
            aria-pressed={value === v}
            onClick={() => onSelect(v)}
          >
            {format(v)}
          </button>
        ))}
        <input
          type="number"
          className={`num-input${isPreset ? '' : ' num-input--active'}`}
          value={isPreset ? '' : value}
          placeholder="Custom"
          min={0}
          step="any"
          aria-label={`${ariaLabel} custom value`}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v) && v > 0) onSelect(v)
          }}
        />
      </div>
    </div>
  )
}

interface FacilitySimulatorProps {
  nearestLine: NearestLine | null
  transmissionMissing: boolean
}

/**
 * Facility scenario simulator. SCENARIO INPUTS (IT capacity, PUE, WUE)
 * are user assumptions; carbon context comes from REAL eGRID data and
 * water-stress context from REAL Aqueduct data already resolved for the
 * site. Formulas live in lib/simulation.ts.
 */
export default function FacilitySimulator({
  nearestLine,
  transmissionMissing,
}: FacilitySimulatorProps) {
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const inputs = useSiteStore((s) => s.simulationInputs)
  const setInputs = useSiteStore((s) => s.setSimulationInputs)
  const egridAssessment = useSiteStore((s) => s.egridAssessment)
  const waterAssessment = useSiteStore((s) => s.waterAssessment)
  const constraints = useSiteStore((s) => s.siteConstraints)

  if (!selectedSite) return null

  const siteKey = `${selectedSite.latitude.toFixed(5)},${selectedSite.longitude.toFixed(5)}`
  const egrid =
    egridAssessment?.key === siteKey &&
    egridAssessment.result !== 'loading' &&
    egridAssessment.result !== 'error'
      ? egridAssessment.result
      : null
  const water =
    waterAssessment?.key === siteKey &&
    waterAssessment.result !== 'loading' &&
    waterAssessment.result !== 'error'
      ? waterAssessment.result
      : null

  // REAL eGRID CO2e total output rate (kg/MWh); null when unresolved or
  // when EPA marks the area as multiple possible subregions.
  const kgPerMWh =
    egrid && !egrid.ambiguous && egrid.co2eRateKg !== null
      ? egrid.co2eRateKg
      : null

  const sim = simulateFacility(inputs, kgPerMWh)

  return (
    <div>
      <div className="panel__subheading">
        Simulate Facility <span className="tag tag--scenario">Scenario</span>
      </div>

      <div className="sim-inputs">
        <div className="sim-input__label">IT Capacity (MW)</div>
        <PresetRow
          options={IT_CAPACITY_PRESETS_MW}
          value={inputs.itLoadMW}
          onSelect={(v) => setInputs({ itLoadMW: v })}
          format={(v) => `${v}`}
          ariaLabel="IT capacity"
        />
        <div className="sim-input__label">PUE</div>
        <PresetRow
          options={PUE_PRESETS}
          value={inputs.pue}
          onSelect={(v) => setInputs({ pue: v })}
          format={(v) => v.toFixed(2)}
          ariaLabel="Power usage effectiveness"
        />
        <div className="sim-input__label">WUE (L/kWh)</div>
        <PresetRow
          options={WUE_PRESETS.map((w) => w.value)}
          value={inputs.wueLPerKwh}
          onSelect={(v) => setInputs({ wueLPerKwh: v })}
          format={(v) => v.toFixed(2)}
          ariaLabel="Water usage effectiveness"
        />
        <p className="sim-note">
          WUE presets are Microsoft FY25 benchmark values (0.27 global ·
          0.34 Americas) — scenario assumptions, not measurements at this
          site. DOE PUE reference points: 1.6 Standard · 1.4 Good · 1.1
          Better.
        </p>
      </div>

      <div className="panel__subheading">
        Facility Scenario <span className="tag tag--scenario">Scenario</span>
      </div>
      <div className="site-facts">
        <div className="site-fact">
          <span>IT Capacity</span>
          <span>{fmt(sim.inputs.itLoadMW)} MW</span>
        </div>
        <div className="site-fact">
          <span>PUE</span>
          <span>{sim.inputs.pue.toFixed(2)}</span>
        </div>
        <div className="site-fact">
          <span>Total Facility Load</span>
          <span>{fmt(sim.facilityLoadMW)} MW</span>
        </div>
        <div className="site-fact">
          <span>Infrastructure Overhead</span>
          <span>
            {fmt(sim.overheadMW)} MW · {sim.overheadPercent.toFixed(0)}%
          </span>
        </div>
        <div className="site-fact">
          <span>Annual Electricity</span>
          <span>{sim.facilityEnergyTWh.toFixed(3)} TWh/year</span>
        </div>
      </div>
      <p className="sim-note">
        Overhead is all non-IT facility load, not only cooling.
      </p>

      <div className="panel__subheading">
        Grid Carbon <span className="tag tag--real">Real site data</span>
      </div>
      {sim.carbon && egrid && !egrid.ambiguous ? (
        <div className="site-facts">
          <div className="site-fact">
            <span>eGRID Subregion</span>
            <span className="mono">{egrid.acronym}</span>
          </div>
          <div className="site-fact">
            <span>Carbon Intensity</span>
            <span>{fmt(sim.carbon.kgCO2ePerMWh)} kg CO2e/MWh</span>
          </div>
          <div className="site-fact">
            <span>Annual Operational CO2e</span>
            <span>{fmt(sim.carbon.annualCO2eTonnes)} t/year</span>
          </div>
        </div>
      ) : (
        <p className="panel__placeholder">
          Carbon estimate unavailable — eGRID region unresolved
        </p>
      )}

      <div className="panel__subheading">
        Water <span className="tag tag--scenario">Scenario</span>
        <span className="tag tag--real">Real stress context</span>
      </div>
      <div className="site-facts">
        <div className="site-fact">
          <span>WUE</span>
          <span>{sim.inputs.wueLPerKwh.toFixed(2)} L/kWh · scenario</span>
        </div>
        <div className="site-fact">
          <span>Annual Water</span>
          <span>{fmt(sim.annualWaterMillionLiters, 1)} M liters/year</span>
        </div>
        <div className="site-fact">
          <span></span>
          <span>{fmt(sim.annualWaterMillionGallons, 1)} M US gal/year</span>
        </div>
        {water ? (
          <>
            <div className="site-fact">
              <span>Aqueduct Baseline Stress</span>
              <span>{water.baseline.label ?? 'Unknown'}</span>
            </div>
            <div className="site-fact">
              <span>2030 BAU</span>
              <span>{water.bau2030.label ?? 'Unknown'}</span>
            </div>
            <div className="site-fact">
              <span>2050 BAU</span>
              <span>{water.bau2050.label ?? 'Unknown'}</span>
            </div>
          </>
        ) : (
          <div className="site-fact">
            <span>Water stress</span>
            <span>Water-stress context unavailable</span>
          </div>
        )}
      </div>
      <p className="sim-note">
        Water stress is basin context from {AQUEDUCT_DATASET.source}; it
        does not change the calculated consumption.
      </p>

      <div className="panel__subheading">
        Site Constraints <span className="tag tag--real">Real site data</span>
      </div>
      <div className="site-facts">
        <div className="site-fact">
          <span>Transmission</span>
          <span>
            {nearestLine
              ? `${nearestLine.distanceMiles.toFixed(1)} mi to ${
                  nearestLine.properties.voltage
                    ? `${nearestLine.properties.voltage} kV`
                    : 'unknown kV'
                } line`
              : transmissionMissing
                ? 'Data unavailable'
                : 'No nearby line in loaded dataset'}
          </span>
        </div>
        <div className="site-fact">
          <span>Flood</span>
          <span className="mono">{constraints.flood.toUpperCase()}</span>
        </div>
        <div className="site-fact">
          <span>Land</span>
          <span className="mono">{constraints.land.toUpperCase()}</span>
        </div>
        <div className="site-fact">
          <span>Water</span>
          <span className="mono">{constraints.water.toUpperCase()}</span>
        </div>
      </div>
      <p className="sim-note">
        Screening indicators only — they do not alter the simulation except
        eGRID carbon and the WUE scenario.
      </p>
    </div>
  )
}
