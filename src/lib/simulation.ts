/**
 * Facility simulator — every formula lives here, pure and testable.
 *
 * Sources:
 * - DOE Data Center Best Practices Guide (PUE definition and reference
 *   points ~1.6 Standard / 1.4 Good / 1.1 Better):
 *   https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design_0.pdf
 * - DOE cooling/water efficiency guidance:
 *   https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers
 * - EPA eGRID2023 (CO2e total output emission rates — NOT non-baseload):
 *   https://www.epa.gov/egrid/summary-data
 * - Microsoft PUE/WUE methodology and FY25 benchmarks (WUE = annual liters
 *   for cooling/humidification ÷ annual IT equipment kWh):
 *   https://datacenters.microsoft.com/sustainability/efficiency/
 */

export const HOURS_PER_YEAR = 8760
export const LITERS_PER_US_GALLON = 3.785411784

export const IT_CAPACITY_PRESETS_MW = [100, 250, 500]
export const DEFAULT_IT_CAPACITY_MW = 250

export const PUE_PRESETS = [1.1, 1.2, 1.4]
export const DEFAULT_PUE = 1.2

/**
 * WUE presets are benchmark/scenario values, NOT measurements at the
 * selected site. Microsoft reports FY25 global WUE 0.27 L/kWh and FY25
 * Americas WUE 0.34 L/kWh; future facilities will differ.
 */
export const WUE_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0.27, label: 'Microsoft FY25 global benchmark' },
  { value: 0.34, label: 'Microsoft FY25 Americas benchmark' },
]
export const DEFAULT_WUE = 0.34

/** DOE 2024 guide reference points for PUE context (not averages). */
export const DOE_PUE_REFERENCE = [
  { pue: 1.6, label: 'Standard' },
  { pue: 1.4, label: 'Good' },
  { pue: 1.1, label: 'Better' },
] as const

export interface SimulationInputs {
  itLoadMW: number
  pue: number
  /** Liters per kWh of IT equipment electricity (Microsoft definition). */
  wueLPerKwh: number
}

export interface SimulationCarbon {
  kgCO2ePerMWh: number
  annualCO2eKg: number
  annualCO2eTonnes: number
}

export interface SimulationResult {
  inputs: SimulationInputs
  facilityLoadMW: number
  overheadMW: number
  overheadPercent: number
  itEnergyMWh: number
  itEnergyKWh: number
  facilityEnergyMWh: number
  facilityEnergyTWh: number
  annualWaterLiters: number
  annualWaterMillionLiters: number
  annualWaterMillionGallons: number
  /** null when the eGRID subregion is unresolved — never guessed. */
  carbon: SimulationCarbon | null
}

/**
 * Pure facility simulation.
 *
 * - facilityLoadMW = itLoadMW * PUE
 * - facilityEnergyMWh = facilityLoadMW * 8760
 * - annualCO2eKg = facilityEnergyMWh * kgCO2ePerMWh (eGRID total output)
 * - annualWaterLiters = itEnergyKWh * WUE  — IT electricity, NOT facility
 *   electricity, per the Microsoft WUE definition.
 */
export function simulateFacility(
  inputs: SimulationInputs,
  kgCO2ePerMWh: number | null,
): SimulationResult {
  const { itLoadMW, pue, wueLPerKwh } = inputs

  const facilityLoadMW = itLoadMW * pue
  const overheadMW = facilityLoadMW - itLoadMW
  const overheadPercent = (pue - 1) * 100

  const itEnergyMWh = itLoadMW * HOURS_PER_YEAR
  const itEnergyKWh = itEnergyMWh * 1000
  const facilityEnergyMWh = facilityLoadMW * HOURS_PER_YEAR
  const facilityEnergyTWh = facilityEnergyMWh / 1_000_000

  const annualWaterLiters = itEnergyKWh * wueLPerKwh
  const annualWaterMillionLiters = annualWaterLiters / 1_000_000
  const annualWaterMillionGallons =
    annualWaterLiters / LITERS_PER_US_GALLON / 1_000_000

  let carbon: SimulationCarbon | null = null
  if (kgCO2ePerMWh !== null && Number.isFinite(kgCO2ePerMWh)) {
    const annualCO2eKg = facilityEnergyMWh * kgCO2ePerMWh
    carbon = {
      kgCO2ePerMWh,
      annualCO2eKg,
      annualCO2eTonnes: annualCO2eKg / 1000,
    }
  }

  return {
    inputs,
    facilityLoadMW,
    overheadMW,
    overheadPercent,
    itEnergyMWh,
    itEnergyKWh,
    facilityEnergyMWh,
    facilityEnergyTWh,
    annualWaterLiters,
    annualWaterMillionLiters,
    annualWaterMillionGallons,
    carbon,
  }
}
