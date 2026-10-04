/**
 * Unit tests for the pure functions in src/lib/regulatory.ts — run with:
 *   npm run test:reg
 */
import assert from 'node:assert/strict'
import {
  assessRegulatoryActivity,
  findNearbyActivity,
  haversineMiles,
  statePoliciesFor,
  type LocalMoratorium,
  type StatePolicyAction,
} from '../src/lib/regulatory.ts'

const site = { latitude: 40.0, longitude: -83.0 }

/** Offset in degrees latitude ≈ miles/69 for synthetic fixtures. */
const atMiles = (miles: number) => ({
  latitude: site.latitude + miles / 69.046,
  longitude: site.longitude,
})

let nextId = 0
const moratorium = (
  miles: number,
  enactedStatus: LocalMoratorium['enactedStatus'],
  extra: Partial<LocalMoratorium> = {},
): LocalMoratorium => ({
  moratoriumId: `m${nextId++}`,
  state: 'Ohio',
  stateAbbrev: 'OH',
  jurisdiction: `Jurisdiction ${nextId}`,
  jurisdictionType: 'Township',
  dateEnactedIso: '2026-01-01',
  dateEnactedUncertainty: 'exact',
  durationKind: 'fixed_days',
  currentEndDateIso: '2027-01-01',
  enactedStatus,
  currentStatus: null,
  legalBasis: null,
  trigger: null,
  triggerCategories: ['grid_energy', 'water'],
  affectedProjects: null,
  outcome: null,
  ...atMiles(miles),
  hasVerifyTags: false,
  verifyCount: 0,
  citeCount: 1,
  activityLevel: 'High',
  sectors: ['data_center'],
  ...extra,
})

const policy = (
  legalEffectStatus: StatePolicyAction['legalEffectStatus'],
  policyMechanism: string,
  stateAbbrev = 'OH',
): StatePolicyAction => ({
  policyActionId: `p${nextId++}`,
  state: 'Ohio',
  stateAbbrev,
  bill: `HB ${nextId}`,
  status: null,
  keyProvisions: null,
  billStatusCategory: null,
  lastActionDateIso: null,
  policyInstrumentType: 'bill',
  policyMechanism,
  legalEffectStatus,
  scopeOfAction: null,
  effectiveDateIso: null,
  endCondition: null,
  primarySourceUrl: null,
})

// Haversine sanity: Columbus → Cleveland ≈ 125 mi
{
  const d = haversineMiles(39.9612, -82.9988, 41.4993, -81.6944)
  assert.ok(Math.abs(d - 125) < 5, `Columbus-Cleveland ${d} mi`)
}

// Band counting: active/extended counted per band; pending and historical
// tracked separately; records beyond 50 mi excluded entirely.
{
  const nearby = findNearbyActivity(site, [
    moratorium(5, 'active'),
    moratorium(15, 'extended'),
    moratorium(40, 'active'),
    moratorium(20, 'pending'),
    moratorium(30, 'expired'),
    moratorium(45, 'replaced'),
    moratorium(60, 'active'), // outside the 50 mi discovery radius
  ])
  assert.equal(nearby.currentCounts.within10, 1)
  assert.equal(nearby.currentCounts.within25, 2)
  assert.equal(nearby.currentCounts.within50, 3)
  assert.equal(nearby.pendingWithin50, 1)
  assert.equal(nearby.within50.length, 6)
  assert.equal(nearby.closest!.record.enactedStatus, 'active')
  assert.ok(Math.abs(nearby.closest!.centroidDistanceMiles - 5) < 0.1)
  // Triggers aggregate over current+pending only (4 records × 2 categories)
  assert.deepEqual(
    nearby.triggerCategories.map((t) => t.count),
    [4, 4],
  )
}

// Records without coordinates are skipped, never fabricated.
{
  const nearby = findNearbyActivity(site, [
    moratorium(5, 'active', { latitude: null, longitude: null }),
  ])
  assert.equal(nearby.within50.length, 0)
  assert.equal(nearby.closest, null)
}

// Activity indicator thresholds
{
  const none = findNearbyActivity(site, [])
  assert.equal(assessRegulatoryActivity(none, []).level, 'low')

  const historicalOnly = findNearbyActivity(site, [moratorium(20, 'expired')])
  assert.equal(assessRegulatoryActivity(historicalOnly, []).level, 'elevated')

  const pendingOnly = findNearbyActivity(site, [moratorium(20, 'pending')])
  assert.equal(assessRegulatoryActivity(pendingOnly, []).level, 'elevated')

  const oneActive = findNearbyActivity(site, [moratorium(20, 'active')])
  assert.equal(assessRegulatoryActivity(oneActive, []).level, 'high')

  // Restrictive in-force state policy alone → high
  assert.equal(
    assessRegulatoryActivity(none, [policy('in_force', 'statewide_moratorium')])
      .level,
    'high',
  )
  // Proposed/failed restrictive policy is NOT treated as law
  assert.equal(
    assessRegulatoryActivity(none, [
      policy('proposed', 'statewide_moratorium'),
      policy('failed', 'statewide_moratorium'),
    ]).level,
    'low',
  )
  // Non-restrictive in-force mechanism does not escalate
  assert.equal(
    assessRegulatoryActivity(none, [policy('in_force', 'reporting_disclosure')])
      .level,
    'low',
  )

  const threeActive = findNearbyActivity(site, [
    moratorium(5, 'active'),
    moratorium(10, 'extended'),
    moratorium(20, 'active'),
  ])
  assert.equal(
    assessRegulatoryActivity(threeActive, [
      policy('in_force', 'statewide_moratorium'),
    ]).level,
    'very-high',
  )
  // Same density without state restriction stays high
  assert.equal(assessRegulatoryActivity(threeActive, []).level, 'high')
}

// State policy filter + ordering: in_force first, failed last, other states excluded
{
  const ordered = statePoliciesFor('OH', [
    policy('failed', 'statewide_moratorium'),
    policy('proposed', 'permitting_restriction'),
    policy('in_force', 'utility_large_load_restriction'),
    policy('unknown', 'incentive_restriction'),
    policy('in_force', 'statewide_moratorium', 'TX'),
  ])
  assert.equal(ordered.length, 4)
  assert.deepEqual(
    ordered.map((p) => p.legalEffectStatus),
    ['in_force', 'unknown', 'proposed', 'failed'],
  )
}

console.log('regulatory.ts: all tests passed')
