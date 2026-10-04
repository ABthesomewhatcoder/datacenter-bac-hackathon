import {
  PRIORITY_PROFILES,
  type PriorityProfileId,
} from '../../lib/decisionEngine'
import {
  IT_CAPACITY_PRESETS_MW,
  PUE_PRESETS,
  simulateFacility,
  WUE_PRESETS,
} from '../../lib/simulation'
import { useSiteStore } from '../../store/useSiteStore'

const PROFILE_ORDER: PriorityProfileId[] = [
  'balanced',
  'sustainability',
  'deployment',
]

function Segmented<T extends number | string>({
  label,
  options,
  value,
  format,
  onSelect,
}: {
  label: string
  options: T[]
  value: T
  format: (v: T) => string
  onSelect: (v: T) => void
}) {
  return (
    <div className="project-config__row">
      <div className="sim-input__label">{label}</div>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((v) => (
          <button
            key={String(v)}
            type="button"
            className={`segmented__option${value === v ? ' segmented__option--active' : ''}`}
            aria-pressed={value === v}
            onClick={() => onSelect(v)}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * PROJECT CONFIGURATION — the same shared facility + decision-profile
 * state that drives P1 and P2 (no duplicate state). Changing anything
 * here recomputes the nationwide rankings through the existing store
 * pipeline (store setters call recomputeRegional).
 */
export default function ProjectConfiguration() {
  const inputs = useSiteStore((s) => s.simulationInputs)
  const setInputs = useSiteStore((s) => s.setSimulationInputs)
  const planningHorizonYears = useSiteStore((s) => s.planningHorizonYears)
  const setPlanningHorizonYears = useSiteStore((s) => s.setPlanningHorizonYears)
  const priorityProfile = useSiteStore((s) => s.priorityProfile)
  const setPriorityProfile = useSiteStore((s) => s.setPriorityProfile)

  const sim = simulateFacility(inputs, null)
  const wueOptions = WUE_PRESETS.map((w) => w.value).includes(inputs.wueLPerKwh)
    ? WUE_PRESETS.map((w) => w.value)
    : [...WUE_PRESETS.map((w) => w.value), inputs.wueLPerKwh]

  return (
    <div className="project-config">
      <h3 className="panel__subheading">
        Project Configuration <span className="tag tag--scenario">Scenario</span>
      </h3>

      <Segmented
        label="IT Capacity (MW)"
        options={IT_CAPACITY_PRESETS_MW}
        value={inputs.itLoadMW}
        format={(v) => `${v}`}
        onSelect={(v) => setInputs({ itLoadMW: v })}
      />
      <Segmented
        label="PUE"
        options={PUE_PRESETS}
        value={inputs.pue}
        format={(v) => v.toFixed(2)}
        onSelect={(v) => setInputs({ pue: v })}
      />
      <Segmented
        label="Planning Horizon"
        options={[20, 30] as const}
        value={planningHorizonYears}
        format={(v) => `${v} yr`}
        onSelect={setPlanningHorizonYears}
      />
      <Segmented
        label="Decision Profile"
        options={PROFILE_ORDER}
        value={priorityProfile}
        format={(v) =>
          PRIORITY_PROFILES[v].label
            .replace(' Sustainable', '')
            .replace(' First', '')
        }
        onSelect={setPriorityProfile}
      />
      <Segmented
        label="WUE (L/kWh)"
        options={wueOptions}
        value={inputs.wueLPerKwh}
        format={(v) => v.toFixed(2)}
        onSelect={(v) => setInputs({ wueLPerKwh: v })}
      />
      <p className="sim-note">
        WUE affects the facility water simulation; it is not used to alter
        regional suitability because basin supply capacity is not
        available.
      </p>

      <div className="site-facts">
        <div className="site-fact">
          <span>Facility Load</span>
          <span>{Math.round(sim.facilityLoadMW)} MW</span>
        </div>
        <div className="site-fact">
          <span>Annual Electricity</span>
          <span>{sim.facilityEnergyTWh.toFixed(3)} TWh</span>
        </div>
      </div>
      <p className="sim-note project-config__hint">
        Rankings update for this project configuration.
      </p>
    </div>
  )
}
