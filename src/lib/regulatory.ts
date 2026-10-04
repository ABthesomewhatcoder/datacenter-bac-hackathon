import type { SelectedSite } from '../store/useSiteStore'

/**
 * REAL DATA — Moratorium Nation 2026 (Bommarito, M.J.), local data-center
 * moratorium inventory + state policy tracker, preprocessed by
 * scripts/prepare-regulatory-data.mjs. Data license CC BY 4.0.
 *
 * CRITICAL GEOGRAPHY RULE: record coordinates are JURISDICTION CENTROIDS.
 * They are not parcel coordinates, moratorium boundaries, or proof that a
 * selected site lies inside the jurisdiction. Distance to a centroid is
 * discovery/context only — never legal applicability, never a hard
 * constraint, and never an input to suitability scoring.
 */
export const REGULATORY_DATASET = {
  name: 'Moratorium Nation 2026',
  source: 'Moratorium Nation 2026',
  attribution:
    'Regulatory data: Bommarito, M.J. (2026), Moratorium Nation — CC BY 4.0',
  dataStatus: 'REAL DATA',
  currentThrough: 'September 23, 2026',
  caveat:
    'Regulatory records can change rapidly. This dataset is current through September 23, 2026 and should be verified against current government sources before investment or permitting decisions.',
  centroidCaveat:
    'Jurisdiction-centroid proximity does not establish that this site is subject to the moratorium.',
} as const

/** Closed vocabulary from the dataset codebook (enacted_status). */
export type EnactedStatus =
  | 'active'
  | 'extended'
  | 'pending'
  | 'replaced'
  | 'expired'
  | 'rescinded'

/** Closed vocabulary from the dataset codebook (legal_effect_status). */
export type LegalEffectStatus =
  | 'in_force'
  | 'proposed'
  | 'expired'
  | 'superseded'
  | 'failed'
  | 'withdrawn'
  | 'unknown'

export interface LocalMoratorium {
  moratoriumId: string
  state: string
  stateAbbrev: string
  jurisdiction: string
  jurisdictionType: string
  dateEnactedIso: string | null
  dateEnactedUncertainty: string | null
  durationKind: string | null
  currentEndDateIso: string | null
  enactedStatus: EnactedStatus
  currentStatus: string | null
  legalBasis: string | null
  trigger: string | null
  triggerCategories: string[]
  affectedProjects: string | null
  outcome: string | null
  /** Jurisdiction CENTROID — not a parcel or boundary. */
  latitude: number | null
  longitude: number | null
  hasVerifyTags: boolean
  verifyCount: number
  citeCount: number
  activityLevel: string | null
  sectors: string[]
}

export interface StatePolicyAction {
  policyActionId: string
  state: string
  stateAbbrev: string
  bill: string
  status: string | null
  keyProvisions: string | null
  billStatusCategory: string | null
  lastActionDateIso: string | null
  policyInstrumentType: string | null
  policyMechanism: string | null
  legalEffectStatus: LegalEffectStatus
  scopeOfAction: string | null
  effectiveDateIso: string | null
  endCondition: string | null
  primarySourceUrl: string | null
}

export interface StateRegulatorySummary {
  state: string
  activityLevel: 'None' | 'Low' | 'Medium' | 'High'
  dataCenterMoratoria: Record<EnactedStatus, number>
  dataCenterTotal: number
  policyActions: number
  policyByLegalEffect: Partial<Record<LegalEffectStatus, number>>
}

export interface RegulatoryData {
  moratoria: LocalMoratorium[]
  statePolicy: StatePolicyAction[]
  stateSummary: Record<string, StateRegulatorySummary>
}

/** UI semantics for each enacted_status bucket. */
export const ENACTED_STATUS_META: Record<
  EnactedStatus,
  { label: string; meaning: string; color: string; current: boolean }
> = {
  active: {
    label: 'ACTIVE',
    meaning: 'Moratorium currently in force',
    color: '#e5484d',
    current: true,
  },
  extended: {
    label: 'EXTENDED',
    meaning: 'Moratorium remains in force after extension',
    color: '#b3252d',
    current: true,
  },
  pending: {
    label: 'PENDING',
    meaning: 'Proposed but not yet legally in force',
    color: '#e9c23f',
    current: false,
  },
  replaced: {
    label: 'REPLACED',
    meaning: 'Ended; superseded by permanent regulation',
    color: '#8d7aa8',
    current: false,
  },
  expired: {
    label: 'EXPIRED',
    meaning: 'Historical — no documented replacement',
    color: '#6f7a85',
    current: false,
  },
  rescinded: {
    label: 'RESCINDED',
    meaning: 'Historical — repealed before expiration',
    color: '#6f7a85',
    current: false,
  },
}

/** UI labels for legal_effect_status — proposed is never shown as law. */
export const LEGAL_EFFECT_META: Record<LegalEffectStatus, string> = {
  in_force: 'In force',
  proposed: 'Proposed — not enacted law',
  expired: 'Expired',
  superseded: 'Superseded',
  failed: 'Failed',
  withdrawn: 'Withdrawn',
  unknown: 'Enacted/other — current legal effect unverified',
}

/** Human labels for the codebook's trigger_categories vocabulary. */
export const TRIGGER_CATEGORY_LABELS: Record<string, string> = {
  specific_project: 'Specific project',
  regulatory_gap: 'Regulatory gap',
  infrastructure_capacity: 'Infrastructure capacity',
  environmental: 'Environmental',
  noise: 'Noise',
  water: 'Water',
  grid_energy: 'Grid / energy capacity',
  fire_safety: 'Fire safety',
  land_use_compatibility: 'Land-use compatibility',
  property_values: 'Property values',
  legal_or_litigation: 'Legal / litigation',
  agricultural_preservation: 'Agricultural preservation',
  other: 'Other',
}

export const triggerCategoryLabel = (c: string): string =>
  TRIGGER_CATEGORY_LABELS[c] ?? c

/** State policy mechanisms that meaningfully restrict siting when in force. */
export const RESTRICTIVE_MECHANISMS = new Set([
  'statewide_moratorium',
  'local_moratorium_preemption',
  'permitting_restriction',
  'utility_large_load_restriction',
  'incentive_restriction',
])

// ---------------------------------------------------------------------------
// Data loading (cached, same pattern as the other REAL-data libs)

let dataPromise: Promise<RegulatoryData> | null = null

export function loadRegulatoryData(): Promise<RegulatoryData> {
  if (!dataPromise) {
    dataPromise = (async () => {
      const [mRes, pRes, sRes] = await Promise.all([
        fetch('/data/regulatory/local_moratoria.json'),
        fetch('/data/regulatory/state_policy.json'),
        fetch('/data/regulatory/state_summary.json'),
      ])
      if (!mRes.ok || !pRes.ok || !sRes.ok) {
        dataPromise = null
        throw new Error('Failed to load regulatory data')
      }
      return {
        moratoria: (await mRes.json()) as LocalMoratorium[],
        statePolicy: (await pRes.json()) as StatePolicyAction[],
        stateSummary: (await sRes.json()) as Record<string, StateRegulatorySummary>,
      }
    })()
  }
  return dataPromise
}

// ---------------------------------------------------------------------------
// Pure geometry + context functions (unit-tested in scripts/test-regulatory.ts)

const EARTH_RADIUS_MILES = 3958.7613

/** Great-circle (haversine) distance in miles. */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a))
}

export interface NearbyMoratorium {
  record: LocalMoratorium
  /** Distance from the site to the JURISDICTION CENTROID, in miles. */
  centroidDistanceMiles: number
}

export const NEARBY_BANDS_MILES = [10, 25, 50] as const

export interface NearbyActivity {
  /** All data-center records within the widest band, nearest first. */
  within50: NearbyMoratorium[]
  /** Counts of active+extended ("current") records per band. */
  currentCounts: { within10: number; within25: number; within50: number }
  pendingWithin50: number
  closest: NearbyMoratorium | null
  /** Trigger categories across current+pending nearby records, most common first. */
  triggerCategories: Array<{ category: string; count: number }>
  /** Records within 50 mi carrying unresolved verification flags. */
  verifyFlagged: number
}

/**
 * Nearby jurisdictional moratorium activity around a site. Pure discovery
 * context: distances are to jurisdiction centroids and NEVER imply the
 * site is legally covered by any record.
 */
export function findNearbyActivity(
  site: SelectedSite,
  moratoria: LocalMoratorium[],
): NearbyActivity {
  const within50: NearbyMoratorium[] = []
  for (const m of moratoria) {
    if (m.latitude === null || m.longitude === null) continue
    const d = haversineMiles(site.latitude, site.longitude, m.latitude, m.longitude)
    if (d <= 50) within50.push({ record: m, centroidDistanceMiles: d })
  }
  within50.sort((a, b) => a.centroidDistanceMiles - b.centroidDistanceMiles)

  const isCurrent = (m: LocalMoratorium) =>
    ENACTED_STATUS_META[m.enactedStatus].current
  const currentCounts = { within10: 0, within25: 0, within50: 0 }
  let pendingWithin50 = 0
  let verifyFlagged = 0
  const triggers = new Map<string, number>()

  for (const { record, centroidDistanceMiles: d } of within50) {
    if (isCurrent(record)) {
      currentCounts.within50 += 1
      if (d <= 25) currentCounts.within25 += 1
      if (d <= 10) currentCounts.within10 += 1
    } else if (record.enactedStatus === 'pending') {
      pendingWithin50 += 1
    }
    if (record.hasVerifyTags) verifyFlagged += 1
    if (isCurrent(record) || record.enactedStatus === 'pending') {
      for (const c of record.triggerCategories) {
        triggers.set(c, (triggers.get(c) ?? 0) + 1)
      }
    }
  }

  return {
    within50,
    currentCounts,
    pendingWithin50,
    closest: within50[0] ?? null,
    triggerCategories: [...triggers.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    verifyFlagged,
  }
}

/** State policy actions for a state, most legally operative first. */
export function statePoliciesFor(
  stateAbbrev: string,
  statePolicy: StatePolicyAction[],
): StatePolicyAction[] {
  const order: Record<string, number> = {
    in_force: 0,
    unknown: 1, // includes enacted-but-unverified measures per the codebook
    proposed: 2,
    expired: 3,
    superseded: 4,
    withdrawn: 5,
    failed: 6,
  }
  return statePolicy
    .filter((p) => p.stateAbbrev === stateAbbrev)
    .sort(
      (a, b) =>
        (order[a.legalEffectStatus] ?? 9) - (order[b.legalEffectStatus] ?? 9),
    )
}

export type RegulatoryActivityLevel = 'low' | 'elevated' | 'high' | 'very-high'

export interface RegulatoryActivityIndicator {
  level: RegulatoryActivityLevel
  /** Transparent, human-readable basis for the level. */
  reasons: string[]
}

/**
 * Contextual "Regulatory Activity" indicator — NOT a legal risk score and
 * NOT part of suitability. Transparent rules on nearby centroid activity
 * (25 mi band) + in-force restrictive state policy:
 *   very-high  ≥3 active/extended within 25 mi AND restrictive state policy
 *   high       ≥1 active/extended within 25 mi OR restrictive state policy
 *   elevated   pending within 50 mi OR historical (replaced/expired/
 *              rescinded) activity within 50 mi
 *   low        none of the above
 */
export function assessRegulatoryActivity(
  nearby: NearbyActivity,
  policies: StatePolicyAction[],
): RegulatoryActivityIndicator {
  const reasons: string[] = []
  const current25 = nearby.currentCounts.within25
  const restrictive = policies.filter(
    (p) =>
      p.legalEffectStatus === 'in_force' &&
      p.policyMechanism !== null &&
      RESTRICTIVE_MECHANISMS.has(p.policyMechanism),
  )

  if (current25 > 0) {
    reasons.push(
      `${current25} active/extended data-center moratori${current25 === 1 ? 'um' : 'a'} recorded in jurisdictions within 25 mi`,
    )
  }
  if (restrictive.length > 0) {
    reasons.push(
      `${restrictive.length} restrictive state polic${restrictive.length === 1 ? 'y' : 'ies'} in force (${restrictive
        .map((p) => p.bill)
        .slice(0, 2)
        .join('; ')})`,
    )
  }
  if (current25 >= 3 && restrictive.length > 0) {
    return { level: 'very-high', reasons }
  }
  if (current25 > 0 || restrictive.length > 0) {
    return { level: 'high', reasons }
  }

  const historical =
    nearby.within50.length - nearby.pendingWithin50 - nearby.currentCounts.within50
  if (nearby.pendingWithin50 > 0) {
    reasons.push(
      `${nearby.pendingWithin50} pending (not yet in force) moratori${nearby.pendingWithin50 === 1 ? 'um' : 'a'} within 50 mi`,
    )
  }
  if (historical > 0) {
    reasons.push(
      `${historical} historical/replaced record${historical === 1 ? '' : 's'} within 50 mi`,
    )
  }
  if (nearby.pendingWithin50 > 0 || historical > 0) {
    return { level: 'elevated', reasons }
  }

  reasons.push(
    'No nearby active/extended data-center moratoria; no restrictive state action in force',
  )
  return { level: 'low', reasons }
}
