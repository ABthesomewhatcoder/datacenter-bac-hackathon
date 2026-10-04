import {
  carbonUtility,
  communityUtility,
  demandGrowthUtility,
  facilityBurdenUtility,
  generationBalanceUtility,
  nercUtility,
  PRIORITY_PROFILES,
  renormalizedMean,
  transmissionUtility,
  WATER_HORIZON_WEIGHTS,
  waterRiskUtility,
  weightedGeometricMean,
  CONFIDENCE_RUBRIC,
  type FacilityProfile,
  type PillarId,
  type PriorityProfileId,
} from './decisionEngine.ts'
import { facilityShareOfStateSalesPct, type NercRiskSeasonal } from './gridContext.ts'
import type { RegulatoryActivityLevel } from './regulatory.ts'

/**
 * P2 — Nationwide Regional Screening. Scores every CONUS county's RAW
 * precomputed evidence (scripts/generate-regional-evidence.ts) with the
 * SAME P1 utility functions and the SAME weighted geometric mean. The
 * Physical Site & Resilience pillar is deliberately absent (FEMA/NLCD
 * vary inside a county), so the remaining P1 profile weights renormalize
 * automatically. This is a Regional Opportunity Score — never a final
 * site score — and there are NO regional hard exclusions.
 */
export const REGIONAL_DATASET = {
  name: 'Nationwide Regional Screening',
  dataStatus: 'REAL DATA',
  caveat:
    'Regional scores identify areas for further investigation. FEMA flood exposure, land cover, parcel feasibility and actual utility capacity require exact-site due diligence.',
  representativePointCaveat:
    'Regional screening uses a representative county location. Exact parcels require site validation.',
} as const

export interface RegionalCountyEvidence {
  fips: string
  name: string
  state: string
  lat: number
  lon: number
  txDistMi: number | null
  txKv: number | null
  nercArea: string | null
  nercHeadroomPp: number | null
  nercRisk: NercRiskSeasonal | null
  growthPct: number | null
  genSalesRatio: number | null
  salesTWh: number | null
  egrid: string | null
  egridKg: number | null
  /** True when EPA marks the area as multiple possible subregions; egridKg
   *  is then the DIRTIEST candidate's rate — a conservative bound. */
  egridAmbiguous: boolean
  basinId: string | null
  wBase: number | null
  w2030: number | null
  w2050: number | null
  regLevel: RegulatoryActivityLevel
  regAct25: number
  regAct50: number
  regPend50: number
  countyMoratoriaCurrent: number
  countyMoratoriaTotal: number
}

export interface RegionalEvidenceFile {
  meta: {
    caveat: string
    counts: Record<string, number>
    egridNationalRatesKg: number[]
    [key: string]: unknown
  }
  counties: RegionalCountyEvidence[]
}

let dataPromise: Promise<RegionalEvidenceFile> | null = null

export function loadRegionalEvidence(): Promise<RegionalEvidenceFile> {
  if (!dataPromise) {
    dataPromise = (async () => {
      const res = await fetch('/data/decision/regional_evidence.json')
      if (!res.ok) {
        dataPromise = null
        throw new Error('Failed to load regional evidence')
      }
      return (await res.json()) as RegionalEvidenceFile
    })()
  }
  return dataPromise
}

// ---------------------------------------------------------------------------

export type RegionalPillarId = Exclude<PillarId, 'physical'>

export interface RegionalCountyScore {
  fips: string
  name: string
  state: string
  score: number | null
  confidencePct: number
  pillars: Record<RegionalPillarId, number | null>
}

/** P1 profile weights with Physical removed; geometric mean renormalizes. */
export function regionalWeights(
  profileId: PriorityProfileId,
): Record<RegionalPillarId, number> {
  const { physical: _physical, ...rest } = PRIORITY_PROFILES[profileId].weights
  return rest
}

/** Full scoring of all counties for the current facility + profile. */
export function scoreAllCounties(
  evidence: RegionalEvidenceFile,
  facility: FacilityProfile,
  profileId: PriorityProfileId,
): RegionalCountyScore[] {
  const weights = regionalWeights(profileId)
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  const rates = evidence.meta.egridNationalRatesKg
  const R = CONFIDENCE_RUBRIC

  return evidence.counties.map((c) => {
    const facilityLoadMW = facility.itLoadMW * facility.pue
    const facilityTWh = (facilityLoadMW * 8760) / 1_000_000
    const sharePct =
      c.salesTWh !== null
        ? facilityShareOfStateSalesPct(facilityTWh, c.salesTWh)
        : null

    const power = renormalizedMean([
      { id: 't', label: '', weight: 0.35, utility: c.txDistMi !== null ? transmissionUtility(c.txDistMi, c.txKv, facilityLoadMW) : null },
      { id: 'n', label: '', weight: 0.3, utility: c.nercHeadroomPp !== null && c.nercRisk !== null ? nercUtility(c.nercHeadroomPp, c.nercRisk) : null },
      { id: 'd', label: '', weight: 0.15, utility: c.growthPct !== null ? demandGrowthUtility(c.growthPct) : null },
      { id: 'b', label: '', weight: 0.15, utility: sharePct !== null ? facilityBurdenUtility(sharePct) : null },
      { id: 'g', label: '', weight: 0.05, utility: c.genSalesRatio !== null ? generationBalanceUtility(c.genSalesRatio) : null },
    ])
    const hw = WATER_HORIZON_WEIGHTS[facility.planningHorizonYears]
    const water = renormalizedMean([
      { id: 'b', label: '', weight: hw.baseline, utility: c.wBase !== null ? waterRiskUtility(c.wBase) : null },
      { id: '3', label: '', weight: hw.bau2030, utility: c.w2030 !== null ? waterRiskUtility(c.w2030) : null },
      { id: '5', label: '', weight: hw.bau2050, utility: c.w2050 !== null ? waterRiskUtility(c.w2050) : null },
    ])
    const pillars: Record<RegionalPillarId, number | null> = {
      power,
      carbon: c.egridKg !== null ? carbonUtility(c.egridKg, rates) : null,
      water,
      community: communityUtility(c.regLevel),
    }

    const score = weightedGeometricMean(
      (Object.keys(weights) as RegionalPillarId[]).map((p) => ({
        weight: weights[p],
        score: pillars[p],
      })),
    )

    const powerConf =
      0.35 * (c.txDistMi !== null ? R.transmission.present - 0.1 : R.transmission.missing) +
      0.3 * (c.nercArea !== null ? R.nerc.present : R.nerc.missing) +
      0.35 * (c.salesTWh !== null ? R.stateDemand.present : R.stateDemand.missing)
    const pillarConf: Record<RegionalPillarId, number> = {
      power: powerConf,
      carbon:
        c.egridKg === null
          ? R.egrid.missing
          : c.egridAmbiguous
            ? 0.45 // conservative bound from EPA's candidate list
            : R.egrid.present,
      water: c.wBase !== null ? R.aqueduct.present : R.aqueduct.missing,
      community: R.regulatory.present,
    }
    const confidencePct = Math.round(
      ((Object.keys(weights) as RegionalPillarId[]).reduce(
        (s, p) => s + weights[p] * pillarConf[p],
        0,
      ) / totalWeight) * 100,
    )

    return {
      fips: c.fips,
      name: c.name,
      state: c.state,
      score: score !== null ? Math.round(score * 10) / 10 : null,
      confidencePct,
      pillars,
    }
  })
}

/** Rank: Regional Opportunity desc, Evidence Confidence as tie-breaker. */
export function rankCounties(scores: RegionalCountyScore[]): RegionalCountyScore[] {
  return scores
    .filter((s) => s.score !== null)
    .sort(
      (a, b) =>
        (b.score as number) - (a.score as number) ||
        b.confidencePct - a.confidencePct,
    )
}

/** Per-state median of available county Regional Opportunity Scores. */
export function stateMedians(scores: RegionalCountyScore[]): Record<string, number> {
  const byState = new Map<string, number[]>()
  for (const s of scores) {
    if (s.score === null) continue
    const list = byState.get(s.state) ?? []
    list.push(s.score)
    byState.set(s.state, list)
  }
  const medians: Record<string, number> = {}
  for (const [state, values] of byState) {
    values.sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    medians[state] =
      values.length % 2
        ? values[mid]
        : Math.round(((values[mid - 1] + values[mid]) / 2) * 10) / 10
  }
  return medians
}

/** Deterministic reasons for a ranked county — no LLM. */
export function regionalReasons(
  c: RegionalCountyEvidence,
  s: RegionalCountyScore,
): { positives: string[]; risks: string[] } {
  const positives: string[] = []
  const risks: string[] = []
  if (c.nercHeadroomPp !== null && c.nercHeadroomPp >= 5) {
    positives.push('Comfortable regional resource adequacy (NERC)')
  } else if (c.nercHeadroomPp !== null && c.nercHeadroomPp < 2) {
    risks.push('Tight regional reserve margins (NERC)')
  } else if (c.nercArea === null) {
    risks.push('NERC regional context unavailable')
  }
  if (c.nercRisk === 'elevated') {
    risks.push('NERC flags this area as elevated seasonal risk')
  }
  if (c.txDistMi !== null && c.txDistMi <= 5 && (c.txKv ?? 0) >= 230) {
    positives.push(`Major high-voltage transmission nearby (${c.txKv} kV, ${c.txDistMi.toFixed(1)} mi)`)
  } else if (c.txDistMi !== null && c.txDistMi > 15) {
    risks.push(`Nearest known transmission ${c.txDistMi.toFixed(0)} mi from county point`)
  }
  if ((s.pillars.carbon ?? 0) >= 65) {
    positives.push('Cleaner-than-average grid electricity (eGRID)')
  } else if (s.pillars.carbon !== null && s.pillars.carbon < 35) {
    risks.push('Carbon-intensive regional grid (eGRID)')
  }
  if (c.egridAmbiguous) {
    risks.push(
      'eGRID subregion ambiguous here — scored on the dirtiest candidate subregion (conservative)',
    )
  }
  if (c.egridKg === null) {
    risks.push('Grid carbon evidence unavailable — pillar renormalized out')
  }
  if (c.wBase === null) {
    risks.push('Water-stress evidence unavailable — pillar renormalized out')
  }
  if ((s.pillars.water ?? 0) >= 70) {
    positives.push('Low long-term basin water stress (Aqueduct)')
  } else if (s.pillars.water !== null && s.pillars.water < 40) {
    risks.push('High basin water stress (Aqueduct)')
  }
  if (c.regLevel === 'low') {
    positives.push('No nearby active data-center moratoria recorded')
  } else if (c.regLevel === 'elevated') {
    risks.push('Some regulatory friction nearby (pending/historical activity)')
  } else {
    risks.push('Significant data-center moratorium activity nearby')
  }
  if (c.countyMoratoriaCurrent > 0) {
    risks.push('County-level data-center moratorium recorded (verify current status)')
  }
  if (c.growthPct !== null && c.growthPct >= 10) {
    risks.push(`Fast-growing state electricity demand (+${c.growthPct.toFixed(1)}% / 5 yr)`)
  }
  return { positives, risks }
}
