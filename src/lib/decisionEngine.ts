import {
  classifyDemandGrowth,
  classifyFacilityBurden,
  classifyReserveHeadroom,
  facilityShareOfStateSalesPct,
  type NercRiskSeasonal,
} from './gridContext.ts'
import { NLCD_CLASSES } from './landCover.ts'
import type { RegulatoryActivityLevel } from './regulatory.ts'
import { simulateFacility } from './simulation.ts'

/**
 * P1 facility-aware decision engine — Sustainable Site Score for ONE
 * exact coordinate and ONE configured facility, from REAL evidence only
 * (HIFLD, NERC 2026 SRA, EIA state generation/sales, EPA eGRID, WRI
 * Aqueduct 4.0, FEMA NFHL, USGS NLCD, Moratorium Nation 2026).
 *
 * ZERO mock inputs: the H3/local/state/county demo scores never enter
 * this score. Missing evidence lowers CONFIDENCE and is renormalized out
 * of the affected pillar — it is never silently scored as zero and never
 * guessed.
 *
 * Architecture (kept strictly separate):
 * - FacilityProfile   — what we want to build (IT MW, PUE, WUE, horizon)
 * - LocationEvidence  — what is real at the site
 * - PriorityProfile   — how the decision-maker weights pillars (only)
 */

// ---------------------------------------------------------------------------
// Profiles

export interface FacilityProfile {
  itLoadMW: number
  pue: number
  wueLPerKwh: number
  planningHorizonYears: 20 | 30
}

export type PriorityProfileId = 'balanced' | 'sustainability' | 'deployment'

export type PillarId = 'power' | 'carbon' | 'water' | 'physical' | 'community'

export const PILLAR_LABELS: Record<PillarId, string> = {
  power: 'Power & Grid Readiness',
  carbon: 'Grid Carbon',
  water: 'Water Sustainability',
  physical: 'Physical Site & Resilience',
  community: 'Community & Regulation',
}

export const PRIORITY_PROFILES: Record<
  PriorityProfileId,
  { label: string; weights: Record<PillarId, number> }
> = {
  balanced: {
    label: 'Balanced Sustainable',
    weights: { power: 30, carbon: 20, water: 20, physical: 15, community: 15 },
  },
  sustainability: {
    label: 'Sustainability First',
    weights: { power: 20, carbon: 25, water: 25, physical: 20, community: 10 },
  },
  deployment: {
    label: 'Deployment First',
    weights: { power: 40, carbon: 10, water: 10, physical: 15, community: 25 },
  },
}

// ---------------------------------------------------------------------------
// Location evidence (all REAL; null = honestly unavailable)

export interface LocationEvidence {
  /** Nearest HIFLD line; 'none' = dataset loaded but no line within reach. */
  transmission: { distanceMiles: number; voltageKv: number | null } | 'none' | null
  nerc: {
    area: string
    reserveHeadroomPp: number
    riskSeasonal: NercRiskSeasonal
  } | null
  growthPct5yr: number | null
  generationToSalesRatio: number | null
  stateSalesTWh: number | null
  /** eGRID CO2e total output rate at the site (kg/MWh). */
  egridRateKg: number | null
  /** Fixed national distribution: every eGRID subregion's rate (kg/MWh). */
  egridNationalRatesKg: number[]
  water: {
    baselineScore: number | null
    bau2030Score: number | null
    bau2050Score: number | null
  } | null
  flood: {
    mapped: boolean
    floodZone: string | null
    zoneSubtype: string | null
  } | null
  landCoverCode: number | null
  regulatoryLevel: RegulatoryActivityLevel | null
}

// ---------------------------------------------------------------------------
// Hard constraints — exclusion BEFORE scoring, with the exact reason.

const EXCLUDED_NLCD_CODES = new Set([11, 12, 90, 95])

export interface Exclusion {
  source: 'NLCD' | 'FEMA'
  reason: string
}

export function checkHardConstraints(evidence: LocationEvidence): Exclusion[] {
  const exclusions: Exclusion[] = []
  const code = evidence.landCoverCode
  if (code !== null && EXCLUDED_NLCD_CODES.has(code)) {
    exclusions.push({
      source: 'NLCD',
      reason: `Land cover is ${NLCD_CLASSES[code]} (NLCD class ${code})`,
    })
  }
  const f = evidence.flood
  if (f) {
    if ((f.zoneSubtype ?? '').toUpperCase().includes('FLOODWAY')) {
      exclusions.push({
        source: 'FEMA',
        reason: 'Site lies in a FEMA Regulatory Floodway',
      })
    } else if ((f.floodZone ?? '').toUpperCase().startsWith('V')) {
      exclusions.push({
        source: 'FEMA',
        reason: `Site lies in FEMA coastal high-hazard zone ${f.floodZone}`,
      })
    }
  }
  return exclusions
}

// ---------------------------------------------------------------------------
// Utility functions (each 0–100; null = evidence unavailable)

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n))

/** Piecewise-linear interpolation over [x, y] breakpoints. */
function piecewise(x: number, points: Array<[number, number]>): number {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    if (x <= x2) return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1)
  }
  return points[points.length - 1][1]
}

/**
 * Screening-preferred transmission voltage for a facility LOAD (IT × PUE).
 * Heuristic only — actual deliverable capacity requires a utility /
 * interconnection study.
 */
export function preferredVoltageKv(facilityLoadMW: number): number {
  if (facilityLoadMW <= 150) return 115
  if (facilityLoadMW <= 300) return 230
  if (facilityLoadMW <= 600) return 345
  return 500
}

/** 0.6 × distance utility + 0.4 × voltage-compatibility utility. */
export function transmissionUtility(
  distanceMiles: number,
  voltageKv: number | null,
  facilityLoadMW: number,
): number {
  const distanceScore = piecewise(distanceMiles, [
    [0.5, 100],
    [2, 85],
    [5, 65],
    [10, 45],
    [25, 25],
    [50, 10],
  ])
  const preferred = preferredVoltageKv(facilityLoadMW)
  const voltageScore =
    voltageKv === null
      ? 70 // line exists but voltage unreported — mild uncertainty penalty
      : voltageKv >= preferred
        ? 100
        : voltageKv >= preferred * 0.5
          ? 70 // roughly one class below the screening preference
          : 45
  return clamp(0.6 * distanceScore + 0.4 * voltageScore)
}

/** NERC reserve-headroom utility; official NERC wording stays separate. */
export function nercUtility(
  reserveHeadroomPp: number,
  riskSeasonal: NercRiskSeasonal,
): number {
  const base = {
    COMFORTABLE: 95,
    ADEQUATE: 75,
    TIGHT: 45,
    SHORTFALL: 15,
  }[classifyReserveHeadroom(reserveHeadroomPp)]
  return clamp(riskSeasonal === 'elevated' ? base - 10 : base, 5)
}

export function demandGrowthUtility(growthPct5yr: number): number {
  return { LOW: 90, MODERATE: 70, HIGH: 45, 'VERY HIGH': 25 }[
    classifyDemandGrowth(growthPct5yr)
  ]
}

export function facilityBurdenUtility(sharePct: number): number {
  return {
    'VERY LOW': 95,
    LOW: 80,
    MODERATE: 60,
    HIGH: 35,
    'VERY HIGH': 15,
  }[classifyFacilityBurden(sharePct)]
}

/** Context only (5% of Power) — NEVER spare capacity. */
export function generationBalanceUtility(generationToSalesRatio: number): number {
  if (generationToSalesRatio >= 1.25) return 85
  if (generationToSalesRatio >= 1.0) return 70
  if (generationToSalesRatio >= 0.8) return 50
  return 35
}

/**
 * Grid-carbon utility: percentile of the site's eGRID rate within the
 * FIXED national subregion distribution (never relative to currently
 * selected candidates). Lower carbon → higher score.
 */
export function carbonUtility(
  rateKg: number,
  nationalRatesKg: number[],
): number | null {
  if (nationalRatesKg.length < 2) return null
  const others = nationalRatesKg.length
  const dirtier = nationalRatesKg.filter((r) => r > rateKg).length
  const equal = nationalRatesKg.filter((r) => r === rateKg).length
  // Midpoint treatment of ties keeps the site's own subregion neutral.
  return clamp(((dirtier + equal / 2) / others) * 100)
}

/** Aqueduct 0–5 risk score → 0–100 utility (lower risk = better). */
export function waterRiskUtility(aqueductScore: number): number {
  return clamp(100 - aqueductScore * 20)
}

export const WATER_HORIZON_WEIGHTS: Record<
  20 | 30,
  { baseline: number; bau2030: number; bau2050: number }
> = {
  30: { baseline: 0.25, bau2030: 0.3, bau2050: 0.45 },
  20: { baseline: 0.35, bau2030: 0.4, bau2050: 0.25 },
}

/** FEMA zone utility after hard exclusions; unknown → null (missing). */
export function femaUtility(flood: {
  mapped: boolean
  floodZone: string | null
  zoneSubtype: string | null
}): number | null {
  if (!flood.mapped) return null
  const zone = (flood.floodZone ?? '').toUpperCase()
  const subty = (flood.zoneSubtype ?? '').toUpperCase()
  if (zone === 'X') return subty.includes('0.2 PCT') ? 60 : 100
  if (/^A/.test(zone)) return 20 // SFHA: A/AE/AH/AO/AR/A99
  return null // Zone D / unclassified → missing, not zero
}

/** NLCD developability utility after hard exclusions. */
export const NLCD_UTILITY: Record<number, number> = {
  21: 100, // Developed, Open Space
  22: 90, // Developed, Low Intensity
  31: 90, // Barren Land
  52: 80, // Shrub/Scrub
  71: 80, // Herbaceous
  23: 65, // Developed, Medium Intensity
  81: 55, // Pasture/Hay
  82: 50, // Cultivated Crops
  24: 45, // Developed, High Intensity
  41: 40, // Deciduous Forest
  42: 40, // Evergreen Forest
  43: 40, // Mixed Forest
}

export function communityUtility(level: RegulatoryActivityLevel): number {
  return { low: 100, elevated: 75, high: 45, 'very-high': 20 }[level]
}

// ---------------------------------------------------------------------------
// Weighted renormalizing mean for components inside a pillar

export interface Component {
  id: string
  label: string
  weight: number
  utility: number | null
  detail?: string
}

/** Weighted arithmetic mean over AVAILABLE components (renormalized). */
export function renormalizedMean(components: Component[]): number | null {
  const available = components.filter((c) => c.utility !== null)
  const totalWeight = available.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return null
  return (
    available.reduce((s, c) => s + c.weight * (c.utility as number), 0) /
    totalWeight
  )
}

// ---------------------------------------------------------------------------
// Final aggregation — weighted GEOMETRIC mean over available pillars, so a
// very weak pillar meaningfully drags the site instead of being cancelled.

export function weightedGeometricMean(
  entries: Array<{ weight: number; score: number | null }>,
): number | null {
  const available = entries.filter((e) => e.score !== null)
  const totalWeight = available.reduce((s, e) => s + e.weight, 0)
  if (totalWeight === 0) return null
  const logSum = available.reduce(
    (s, e) => s + e.weight * Math.log(Math.max(e.score as number, 1)),
    0,
  )
  return Math.exp(logSum / totalWeight)
}

export type Classification =
  | 'Exceptional'
  | 'Strong'
  | 'Promising'
  | 'Significant Tradeoffs'
  | 'Weak'

export function classifyOverall(
  overall: number,
  pillarScores: Array<number | null>,
): { classification: Classification; capped: boolean } {
  const base: Classification =
    overall >= 90
      ? 'Exceptional'
      : overall >= 80
        ? 'Strong'
        : overall >= 70
          ? 'Promising'
          : overall >= 60
            ? 'Significant Tradeoffs'
            : 'Weak'
  // Safeguard: any major pillar under 40 forbids the Exceptional label.
  const weakPillar = pillarScores.some((p) => p !== null && p < 40)
  if (base === 'Exceptional' && weakPillar) {
    return { classification: 'Strong', capped: true }
  }
  return { classification: base, capped: false }
}

// ---------------------------------------------------------------------------
// Evidence confidence — separate from suitability. Centralized rubric:
// availability, spatial resolution, direct measurement vs proxy, and known
// verification limitations. Missing data lowers confidence, never zeroes
// suitability.

export const CONFIDENCE_RUBRIC = {
  transmission: {
    present: 0.8, // real HIFLD geometry; deliverable capacity remains a proxy
    none: 0.35,
    missing: 0.2,
  },
  nerc: { present: 0.7, missing: 0.3 }, // assessment-area level, seasonal
  stateDemand: { present: 0.75, missing: 0.3 }, // state-level annual data
  egrid: { present: 0.75, missing: 0.25 }, // strong source, regional resolution
  aqueduct: { present: 0.7, missing: 0.25 }, // strong but modeled, basin-level
  fema: { present: 0.95, missing: 0.3 }, // exact local regulatory mapping
  nlcd: { present: 0.9, missing: 0.3 }, // direct 30 m measurement
  regulatory: { present: 0.6, missing: 0.3 }, // centroid precision, legal limits
} as const

export function evidenceConfidence(
  evidence: LocationEvidence,
  weights: Record<PillarId, number>,
): number {
  const R = CONFIDENCE_RUBRIC
  const powerConf =
    0.35 *
      (evidence.transmission === null
        ? R.transmission.missing
        : evidence.transmission === 'none'
          ? R.transmission.none
          : R.transmission.present) +
    0.3 * (evidence.nerc ? R.nerc.present : R.nerc.missing) +
    0.35 *
      (evidence.stateSalesTWh !== null
        ? R.stateDemand.present
        : R.stateDemand.missing)
  const pillarConf: Record<PillarId, number> = {
    power: powerConf,
    carbon: evidence.egridRateKg !== null ? R.egrid.present : R.egrid.missing,
    water: evidence.water ? R.aqueduct.present : R.aqueduct.missing,
    physical:
      0.6 * (evidence.flood?.mapped ? R.fema.present : R.fema.missing) +
      0.4 * (evidence.landCoverCode !== null ? R.nlcd.present : R.nlcd.missing),
    community: evidence.regulatoryLevel
      ? R.regulatory.present
      : R.regulatory.missing,
  }
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  const conf =
    (Object.keys(weights) as PillarId[]).reduce(
      (s, p) => s + weights[p] * pillarConf[p],
      0,
    ) / totalWeight
  return Math.round(conf * 100)
}

// ---------------------------------------------------------------------------
// Full evaluation

export interface PillarResult {
  id: PillarId
  label: string
  weight: number
  score: number | null
  components: Component[]
}

export interface FacilityImpact {
  facilityLoadMW: number
  facilityEnergyTWh: number
  annualCO2eTonnes: number | null
  annualWaterMillionLiters: number
  annualWaterMillionGallons: number
  facilityShareOfStateSalesPct: number | null
  preferredVoltageKv: number
}

export interface SiteEvaluation {
  excluded: boolean
  exclusions: Exclusion[]
  pillars: PillarResult[]
  overall: number | null
  classification: Classification | null
  classificationCapped: boolean
  confidencePct: number
  positives: string[]
  risks: string[]
  impact: FacilityImpact
}

export function evaluateSite(
  facility: FacilityProfile,
  evidence: LocationEvidence,
  profileId: PriorityProfileId,
): SiteEvaluation {
  const weights = PRIORITY_PROFILES[profileId].weights
  const sim = simulateFacility(
    {
      itLoadMW: facility.itLoadMW,
      pue: facility.pue,
      wueLPerKwh: facility.wueLPerKwh,
    },
    evidence.egridRateKg,
  )
  const sharePct =
    evidence.stateSalesTWh !== null
      ? facilityShareOfStateSalesPct(sim.facilityEnergyTWh, evidence.stateSalesTWh)
      : null

  const impact: FacilityImpact = {
    facilityLoadMW: sim.facilityLoadMW,
    facilityEnergyTWh: sim.facilityEnergyTWh,
    annualCO2eTonnes: sim.carbon?.annualCO2eTonnes ?? null,
    annualWaterMillionLiters: sim.annualWaterMillionLiters,
    annualWaterMillionGallons: sim.annualWaterMillionGallons,
    facilityShareOfStateSalesPct: sharePct,
    preferredVoltageKv: preferredVoltageKv(sim.facilityLoadMW),
  }

  const exclusions = checkHardConstraints(evidence)
  if (exclusions.length > 0) {
    return {
      excluded: true,
      exclusions,
      pillars: [],
      overall: null,
      classification: null,
      classificationCapped: false,
      confidencePct: evidenceConfidence(evidence, weights),
      positives: [],
      risks: exclusions.map((e) => `${e.source} exclusion: ${e.reason}`),
      impact,
    }
  }

  // ---- Power & Grid Readiness (renormalized over available evidence)
  const t = evidence.transmission
  const powerComponents: Component[] = [
    {
      id: 'transmission',
      label: 'Transmission Readiness',
      weight: 0.35,
      utility:
        t === null
          ? null
          : t === 'none'
            ? 20 // dataset loaded, no line within reach — real negative signal
            : transmissionUtility(t.distanceMiles, t.voltageKv, sim.facilityLoadMW),
      detail:
        t && t !== 'none'
          ? `${t.distanceMiles.toFixed(1)} mi · ${t.voltageKv ?? '?'} kV vs ≥${preferredVoltageKv(sim.facilityLoadMW)} kV preferred`
          : undefined,
    },
    {
      id: 'nerc',
      label: 'NERC Resource Adequacy',
      weight: 0.3,
      utility: evidence.nerc
        ? nercUtility(evidence.nerc.reserveHeadroomPp, evidence.nerc.riskSeasonal)
        : null,
      detail: evidence.nerc
        ? `${evidence.nerc.area} · ${evidence.nerc.reserveHeadroomPp >= 0 ? '+' : ''}${evidence.nerc.reserveHeadroomPp.toFixed(1)}pp headroom`
        : undefined,
    },
    {
      id: 'demand',
      label: 'Demand Growth Pressure',
      weight: 0.15,
      utility:
        evidence.growthPct5yr !== null
          ? demandGrowthUtility(evidence.growthPct5yr)
          : null,
    },
    {
      id: 'burden',
      label: 'Relative Facility Burden',
      weight: 0.15,
      utility: sharePct !== null ? facilityBurdenUtility(sharePct) : null,
      detail:
        sharePct !== null
          ? `${sharePct.toFixed(sharePct < 1 ? 2 : 1)}% of state retail sales`
          : undefined,
    },
    {
      id: 'balance',
      label: 'Annual Generation Balance',
      weight: 0.05,
      utility:
        evidence.generationToSalesRatio !== null
          ? generationBalanceUtility(evidence.generationToSalesRatio)
          : null,
    },
  ]

  // ---- Grid Carbon
  const carbonScore =
    evidence.egridRateKg !== null
      ? carbonUtility(evidence.egridRateKg, evidence.egridNationalRatesKg)
      : null
  const carbonComponents: Component[] = [
    {
      id: 'egrid',
      label: 'eGRID national percentile',
      weight: 1,
      utility: carbonScore,
      detail:
        evidence.egridRateKg !== null
          ? `${Math.round(evidence.egridRateKg)} kg CO2e/MWh`
          : undefined,
    },
  ]

  // ---- Water Sustainability
  const hw = WATER_HORIZON_WEIGHTS[facility.planningHorizonYears]
  const w = evidence.water
  const waterComponents: Component[] = [
    {
      id: 'baseline',
      label: 'Aqueduct baseline stress',
      weight: hw.baseline,
      utility:
        w?.baselineScore != null ? waterRiskUtility(w.baselineScore) : null,
    },
    {
      id: 'bau2030',
      label: 'Aqueduct 2030 BAU',
      weight: hw.bau2030,
      utility: w?.bau2030Score != null ? waterRiskUtility(w.bau2030Score) : null,
    },
    {
      id: 'bau2050',
      label: 'Aqueduct 2050 BAU',
      weight: hw.bau2050,
      utility: w?.bau2050Score != null ? waterRiskUtility(w.bau2050Score) : null,
    },
  ]

  // ---- Physical Site & Resilience
  const physicalComponents: Component[] = [
    {
      id: 'fema',
      label: 'FEMA flood zone',
      weight: 0.6,
      utility: evidence.flood ? femaUtility(evidence.flood) : null,
      detail: evidence.flood?.floodZone
        ? `Zone ${evidence.flood.floodZone}`
        : undefined,
    },
    {
      id: 'nlcd',
      label: 'NLCD land cover',
      weight: 0.4,
      utility:
        evidence.landCoverCode !== null
          ? (NLCD_UTILITY[evidence.landCoverCode] ?? null)
          : null,
      detail:
        evidence.landCoverCode !== null
          ? NLCD_CLASSES[evidence.landCoverCode]
          : undefined,
    },
  ]

  // ---- Community & Regulation
  const communityComponents: Component[] = [
    {
      id: 'regulatory',
      label: 'Regulatory activity (Moratorium Nation)',
      weight: 1,
      utility: evidence.regulatoryLevel
        ? communityUtility(evidence.regulatoryLevel)
        : null,
    },
  ]

  const pillars: PillarResult[] = (
    [
      ['power', powerComponents],
      ['carbon', carbonComponents],
      ['water', waterComponents],
      ['physical', physicalComponents],
      ['community', communityComponents],
    ] as Array<[PillarId, Component[]]>
  ).map(([id, components]) => ({
    id,
    label: PILLAR_LABELS[id],
    weight: weights[id],
    score: renormalizedMean(components),
    components,
  }))

  const overallRaw = weightedGeometricMean(
    pillars.map((p) => ({ weight: p.weight, score: p.score })),
  )
  const overall = overallRaw !== null ? Math.round(overallRaw) : null
  const cls =
    overall !== null
      ? classifyOverall(
          overall,
          pillars.map((p) => p.score),
        )
      : null

  return {
    excluded: false,
    exclusions: [],
    pillars,
    overall,
    classification: cls?.classification ?? null,
    classificationCapped: cls?.capped ?? false,
    confidencePct: evidenceConfidence(evidence, weights),
    ...buildExplanations(evidence, pillars, sim.facilityLoadMW, sharePct),
    impact,
  }
}

// ---------------------------------------------------------------------------
// Deterministic explanations — no LLM involved.

function buildExplanations(
  evidence: LocationEvidence,
  pillars: PillarResult[],
  facilityLoadMW: number,
  sharePct: number | null,
): { positives: string[]; risks: string[] } {
  const positives: string[] = []
  const risks: string[] = []
  const pillar = (id: PillarId) => pillars.find((p) => p.id === id)
  const component = (pid: PillarId, cid: string) =>
    pillar(pid)?.components.find((c) => c.id === cid)

  const t = evidence.transmission
  if (t && t !== 'none') {
    const preferred = preferredVoltageKv(facilityLoadMW)
    if (t.distanceMiles <= 5 && (t.voltageKv ?? 0) >= preferred) {
      positives.push(
        `Transmission within ${t.distanceMiles.toFixed(1)} mi at ${t.voltageKv} kV — meets the ≥${preferred} kV screening preference for this facility size`,
      )
    } else if (t.distanceMiles > 10) {
      risks.push(
        `Nearest transmission line is ${t.distanceMiles.toFixed(1)} mi away`,
      )
    }
    if (t.voltageKv !== null && t.voltageKv < preferred) {
      risks.push(
        `Nearest line is ${t.voltageKv} kV, below the ≥${preferred} kV screening preference for a ${Math.round(facilityLoadMW)} MW facility`,
      )
    }
  } else if (t === 'none') {
    risks.push('No transmission line found near the site in the HIFLD dataset')
  }

  if (evidence.nerc) {
    const u = component('power', 'nerc')?.utility ?? 0
    if (u >= 75) {
      positives.push(
        `${evidence.nerc.area} reserve headroom ${evidence.nerc.reserveHeadroomPp >= 0 ? '+' : ''}${evidence.nerc.reserveHeadroomPp.toFixed(1)}pp above the NERC reference margin`,
      )
    } else if (u < 50) {
      risks.push(
        `${evidence.nerc.area} reserve margins are tight relative to the NERC reference level`,
      )
    }
    if (evidence.nerc.riskSeasonal === 'elevated') {
      risks.push(
        `NERC flags ${evidence.nerc.area} as elevated risk under extreme seasonal conditions`,
      )
    }
  } else {
    risks.push('NERC regional adequacy context unavailable for this state')
  }

  if (evidence.growthPct5yr !== null && evidence.growthPct5yr >= 10) {
    risks.push(
      `State electricity demand grew ${evidence.growthPct5yr >= 0 ? '+' : ''}${evidence.growthPct5yr.toFixed(1)}% over 5 years — competition for grid capacity`,
    )
  }
  if (sharePct !== null) {
    if (sharePct >= 3) {
      risks.push(
        `This facility alone equals ${sharePct.toFixed(1)}% of the state's annual retail electricity sales`,
      )
    } else if (sharePct < 0.5) {
      positives.push(
        `Facility demand is small relative to the state system (${sharePct.toFixed(2)}% of annual retail sales)`,
      )
    }
  }

  const carbon = pillar('carbon')?.score
  if (carbon !== null && carbon !== undefined) {
    if (carbon >= 70) {
      positives.push(
        `Grid carbon intensity is cleaner than ~${Math.round(carbon)}% of U.S. eGRID subregions`,
      )
    } else if (carbon < 40) {
      risks.push(
        `Grid carbon intensity is higher than most U.S. eGRID subregions (${Math.round(evidence.egridRateKg ?? 0)} kg CO2e/MWh)`,
      )
    }
  } else {
    risks.push('Grid carbon unavailable — eGRID region unresolved')
  }

  const w = evidence.water
  if (w) {
    const water = pillar('water')?.score
    if (water !== null && water !== undefined && water >= 70) {
      positives.push('Basin water stress is low across baseline and projections')
    }
    if (
      w.baselineScore != null &&
      w.bau2050Score != null &&
      w.bau2050Score >= w.baselineScore + 1
    ) {
      risks.push(
        'Aqueduct projects materially higher basin water stress by 2050',
      )
    }
    if (w.baselineScore != null && w.baselineScore >= 4) {
      risks.push(
        'Basin is already in extremely high baseline water stress (Aqueduct)',
      )
    }
  } else {
    risks.push('Water-stress context unavailable for this site')
  }

  const fema = component('physical', 'fema')?.utility
  if (fema === 100) {
    positives.push('FEMA minimal flood hazard (Zone X) at the exact site')
  } else if (fema !== null && fema !== undefined && fema <= 20) {
    risks.push(
      `Site is in FEMA special flood hazard area (Zone ${evidence.flood?.floodZone ?? '?'})`,
    )
  } else if (evidence.flood && !evidence.flood.mapped) {
    risks.push('No FEMA flood mapping at this location — flood risk unverified')
  }
  const nlcdU = component('physical', 'nlcd')?.utility
  if (nlcdU !== null && nlcdU !== undefined && nlcdU >= 80) {
    positives.push(
      `Land cover (${NLCD_CLASSES[evidence.landCoverCode ?? -1]}) is favorable for development`,
    )
  } else if (nlcdU !== null && nlcdU !== undefined && nlcdU <= 45) {
    risks.push(
      `Land cover is ${NLCD_CLASSES[evidence.landCoverCode ?? -1]} — conversion and permitting burden likely`,
    )
  }

  if (evidence.regulatoryLevel) {
    if (evidence.regulatoryLevel === 'low') {
      positives.push(
        'No active/extended data-center moratoria recorded in nearby jurisdictions',
      )
    } else if (
      evidence.regulatoryLevel === 'high' ||
      evidence.regulatoryLevel === 'very-high'
    ) {
      risks.push(
        'Significant data-center moratorium activity recorded in nearby jurisdictions (centroid proximity — not proof of legal applicability)',
      )
    }
  }

  return { positives, risks }
}
