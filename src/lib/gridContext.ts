/**
 * REAL DATA — state power & grid context, preprocessed by
 * scripts/prepare-grid-context.mjs from:
 * - EIA-style annual net generation by state (latest year)
 * - state retail electricity sales (latest 12 months vs 5 years earlier)
 * - NERC 2026 Summer Reliability Assessment reserve margins:
 *   https://www.nerc.com/globalassets/our-work/assessments/nerc_sra_2026.pdf
 *   (see also the 2025 LTRA and 2026 SRA data instructions)
 *
 * FRAMING RULES:
 * - Generation minus sales is the ANNUAL GENERATION BALANCE — an energy
 *   accounting figure, never "spare capacity" or "available power".
 * - Transmission proximity does not establish interconnection capacity.
 * - NERC regional adequacy does not guarantee utility service to a project.
 * - All classification thresholds here are screening labels, NOT a final
 *   power score; nothing feeds the suitability/decision engine yet.
 */

export const GRID_DATASET = {
  name: 'State Power & Grid Context',
  source: 'EIA state generation/sales · NERC 2026 SRA',
  dataStatus: 'REAL DATA',
  caveats: [
    'Transmission proximity does not establish available interconnection capacity.',
    'Annual generation balance does not represent spare grid capacity or guaranteed power availability.',
    'NERC regional adequacy does not guarantee utility service to this project.',
  ],
} as const

export type NercRiskSeasonal = 'normal' | 'elevated'

export interface NercAreaContext {
  area: string
  anticipatedReserveMarginPct: number
  referenceMarginPct: number
  reserveHeadroomPp: number
  riskSeasonal: NercRiskSeasonal
  /** NERC's own wording/context, kept separate from our screening label. */
  riskNote: string | null
  areaNote: string | null
}

export interface NercUnavailable {
  unavailableReason: string
}

export interface StateGridContext {
  generationTWh: number
  generationYear: number
  salesTWh: number
  sales5yrEarlierTWh: number
  growthPct5yr: number
  avgPriceCentsPerKwh: number
  generationToSalesRatio: number
  /** Annual Generation Balance — NOT spare electricity. */
  netGenerationBalanceTWh: number
  nerc: NercAreaContext | NercUnavailable
}

export type StateGridContextMap = Record<string, StateGridContext>

export const hasNercArea = (
  nerc: NercAreaContext | NercUnavailable,
): nerc is NercAreaContext => 'area' in nerc

let dataPromise: Promise<StateGridContextMap> | null = null

export function loadGridContext(): Promise<StateGridContextMap> {
  if (!dataPromise) {
    dataPromise = (async () => {
      const res = await fetch('/data/grid/state_grid_context.json')
      if (!res.ok) {
        dataPromise = null
        throw new Error('Failed to load grid context data')
      }
      return (await res.json()) as StateGridContextMap
    })()
  }
  return dataPromise
}

// ---------------------------------------------------------------------------
// Pure classifiers (unit-tested in scripts/test-grid.ts)

export type DemandGrowthPressure = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH'

/** 5-year retail sales growth → Demand Growth Pressure. */
export function classifyDemandGrowth(growthPct5yr: number): DemandGrowthPressure {
  if (growthPct5yr < 5) return 'LOW'
  if (growthPct5yr < 10) return 'MODERATE'
  if (growthPct5yr < 20) return 'HIGH'
  return 'VERY HIGH'
}

export type FacilityBurden = 'VERY LOW' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH'

/** Facility annual TWh as % of state retail sales → Relative Facility Burden. */
export function facilityShareOfStateSalesPct(
  facilityAnnualTWh: number,
  stateSalesTWh: number,
): number {
  return (facilityAnnualTWh / stateSalesTWh) * 100
}

export function classifyFacilityBurden(sharePct: number): FacilityBurden {
  if (sharePct < 0.5) return 'VERY LOW'
  if (sharePct < 1) return 'LOW'
  if (sharePct < 3) return 'MODERATE'
  if (sharePct < 7.5) return 'HIGH'
  return 'VERY HIGH'
}

export type ReserveHeadroomLabel =
  | 'COMFORTABLE'
  | 'ADEQUATE'
  | 'TIGHT'
  | 'SHORTFALL'

/**
 * Screening label on anticipated-minus-reference reserve margin, in
 * percentage points. NERC's official risk wording is carried separately
 * (riskSeasonal/riskNote) and is never overwritten by this label.
 */
export function classifyReserveHeadroom(headroomPp: number): ReserveHeadroomLabel {
  if (headroomPp < 0) return 'SHORTFALL'
  if (headroomPp < 2) return 'TIGHT'
  if (headroomPp < 5) return 'ADEQUATE'
  return 'COMFORTABLE'
}
