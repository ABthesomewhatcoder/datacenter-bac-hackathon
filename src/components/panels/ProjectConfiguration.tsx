import { useEffect, useRef, useState } from 'react'
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

const PROFILE_SHORT: Record<PriorityProfileId, string> = {
  balanced: 'Balanced',
  sustainability: 'Sustainability first',
  deployment: 'Deployment first',
}

function Segmented<T extends number | string>({
  label,
  helper,
  options,
  value,
  format,
  onSelect,
}: {
  label: string
  helper?: string
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
      {helper && <div className="sim-input__helper">{helper}</div>}
    </div>
  )
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

/**
 * Project configuration — the assumptions zone. Drives the same shared
 * store state used by P1 and P2 (no duplicate state); any change here
 * recomputes rankings through the existing store pipeline.
 */
export default function ProjectConfiguration() {
  const inputs = useSiteStore((s) => s.simulationInputs)
  const setInputs = useSiteStore((s) => s.setSimulationInputs)
  const planningHorizonYears = useSiteStore((s) => s.planningHorizonYears)
  const setPlanningHorizonYears = useSiteStore((s) => s.setPlanningHorizonYears)
  const priorityProfile = useSiteStore((s) => s.priorityProfile)
  const setPriorityProfile = useSiteStore((s) => s.setPriorityProfile)

  // Subtle, transient "recalculated" note — no toast spam.
  const [recalcNote, setRecalcNote] = useState(false)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setRecalcNote(true)
    const t = setTimeout(() => setRecalcNote(false), 2200)
    return () => clearTimeout(t)
  }, [inputs, planningHorizonYears, priorityProfile])

  const sim = simulateFacility(inputs, null)
  const wueOptions = WUE_PRESETS.map((w) => w.value).includes(inputs.wueLPerKwh)
    ? WUE_PRESETS.map((w) => w.value)
    : [...WUE_PRESETS.map((w) => w.value), inputs.wueLPerKwh]

  return (
    <div className="project-config">
      <h2 className="panel__heading">Project configuration</h2>
      <p className="panel__intro">Configure the facility you want to site.</p>

      <Segmented
        label="Facility size"
        options={IT_CAPACITY_PRESETS_MW}
        value={inputs.itLoadMW}
        format={(v) => `${v} MW`}
        onSelect={(v) => setInputs({ itLoadMW: v })}
      />
      <Segmented
        label="PUE"
        helper="Power Usage Effectiveness"
        options={PUE_PRESETS}
        value={inputs.pue}
        format={(v) => v.toFixed(2)}
        onSelect={(v) => setInputs({ pue: v })}
      />
      <Segmented
        label="WUE"
        helper="Water Usage Effectiveness · affects water simulation, not rankings"
        options={wueOptions}
        value={inputs.wueLPerKwh}
        format={(v) => v.toFixed(2)}
        onSelect={(v) => setInputs({ wueLPerKwh: v })}
      />
      <Segmented
        label="Planning horizon"
        options={[20, 30] as const}
        value={planningHorizonYears}
        format={(v) => `${v} years`}
        onSelect={setPlanningHorizonYears}
      />
      <div className="project-config__row">
        <div className="sim-input__label">Decision strategy</div>
        <div className="segmented segmented--stack" role="group" aria-label="Decision strategy">
          {PROFILE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`segmented__option${priorityProfile === id ? ' segmented__option--active' : ''}`}
              aria-pressed={priorityProfile === id}
              onClick={() => setPriorityProfile(id)}
              title={PRIORITY_PROFILES[id].label}
            >
              {PROFILE_SHORT[id]}
            </button>
          ))}
        </div>
      </div>

      <h3 className="panel__subheading">Facility requirements</h3>
      <div className="site-facts">
        <div className="site-fact">
          <span>Total facility load</span>
          <span>{fmt(sim.facilityLoadMW)} MW</span>
        </div>
        <div className="site-fact">
          <span>Annual electricity</span>
          <span>{sim.facilityEnergyTWh.toFixed(3)} TWh</span>
        </div>
        <div className="site-fact">
          <span>Cooling water</span>
          <span>{fmt(sim.annualWaterMillionLiters, 1)}M L/year</span>
        </div>
        <div className="site-fact">
          <span>Operational carbon</span>
          <span>Depends on site grid</span>
        </div>
      </div>
      <p
        className="sim-note project-config__hint"
        role="status"
        style={{ minHeight: '1.2em' }}
      >
        {recalcNote
          ? `Rankings recalculated for ${inputs.itLoadMW} MW · ${PROFILE_SHORT[priorityProfile]}`
          : 'Rankings update for this configuration.'}
      </p>
    </div>
  )
}
