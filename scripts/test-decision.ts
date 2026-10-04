/**
 * Unit tests for src/lib/decisionEngine.ts — run with:
 *   npm run test:decision
 */
import assert from 'node:assert/strict'
import {
  carbonUtility,
  checkHardConstraints,
  classifyOverall,
  demandGrowthUtility,
  evaluateSite,
  evidenceConfidence,
  femaUtility,
  generationBalanceUtility,
  nercUtility,
  preferredVoltageKv,
  PRIORITY_PROFILES,
  renormalizedMean,
  transmissionUtility,
  waterRiskUtility,
  weightedGeometricMean,
  type LocationEvidence,
} from '../src/lib/decisionEngine.ts'

// ---- Base evidence: a strong, fully-populated site
const goodEvidence: LocationEvidence = {
  transmission: { distanceMiles: 1.1, voltageKv: 345 },
  nerc: { area: 'PJM', reserveHeadroomPp: 7.6, riskSeasonal: 'normal' },
  growthPct5yr: 4.0,
  generationToSalesRatio: 1.1,
  stateSalesTWh: 166.4,
  egridRateKg: 300,
  egridNationalRatesKg: [100, 200, 300, 400, 500, 600, 700, 800],
  water: { baselineScore: 1, bau2030Score: 1, bau2050Score: 1.5 },
  flood: { mapped: true, floodZone: 'X', zoneSubtype: 'AREA OF MINIMAL FLOOD HAZARD' },
  landCoverCode: 21,
  regulatoryLevel: 'low',
}
const facility250 = { itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.34, planningHorizonYears: 30 as const }

// ---- Hard constraints
for (const code of [11, 12, 90, 95]) {
  const ex = checkHardConstraints({ ...goodEvidence, landCoverCode: code })
  assert.equal(ex.length, 1, `NLCD ${code} excludes`)
  assert.equal(ex[0].source, 'NLCD')
}
assert.equal(
  checkHardConstraints({
    ...goodEvidence,
    flood: { mapped: true, floodZone: 'AE', zoneSubtype: 'FLOODWAY' },
  })[0].reason,
  'Site lies in a FEMA Regulatory Floodway',
)
assert.ok(
  checkHardConstraints({
    ...goodEvidence,
    flood: { mapped: true, floodZone: 'VE', zoneSubtype: null },
  })[0].reason.includes('coastal high-hazard'),
)
// No exclusion for soft factors: SFHA warning zone, forest, high stress
assert.equal(
  checkHardConstraints({
    ...goodEvidence,
    flood: { mapped: true, floodZone: 'AE', zoneSubtype: null },
    landCoverCode: 41,
    water: { baselineScore: 5, bau2030Score: 5, bau2050Score: 5 },
    regulatoryLevel: 'very-high',
  }).length,
  0,
)
const excluded = evaluateSite(facility250, { ...goodEvidence, landCoverCode: 11 }, 'balanced')
assert.ok(excluded.excluded && excluded.overall === null)
assert.ok(excluded.risks[0].includes('Open Water'))

// ---- Utility functions
assert.equal(preferredVoltageKv(150), 115)
assert.equal(preferredVoltageKv(300), 230)
assert.equal(preferredVoltageKv(600), 345)
assert.equal(preferredVoltageKv(601), 500)

assert.equal(transmissionUtility(0.3, 345, 300), 100) // close + sufficient
assert.ok(transmissionUtility(0.3, 115, 600) < transmissionUtility(0.3, 345, 600))
assert.ok(transmissionUtility(30, 345, 300) < transmissionUtility(3, 345, 300))
// Voltage compatibility shifts with facility size at fixed line voltage
assert.ok(transmissionUtility(1, 138, 150) > transmissionUtility(1, 138, 400))

assert.equal(nercUtility(7.6, 'normal'), 95)
assert.equal(nercUtility(4, 'normal'), 75)
assert.equal(nercUtility(1, 'normal'), 45)
assert.equal(nercUtility(-1, 'normal'), 15)
assert.equal(nercUtility(16.9, 'elevated'), 85) // WECC-NW: comfortable − elevated

assert.equal(demandGrowthUtility(3), 90)
assert.equal(demandGrowthUtility(21.2), 25)
assert.equal(generationBalanceUtility(2.3), 85)
assert.equal(generationBalanceUtility(0.7), 35)

// Carbon percentile: fixed national distribution, lower = better
assert.ok(carbonUtility(100, goodEvidence.egridNationalRatesKg)! > 85)
assert.ok(carbonUtility(800, goodEvidence.egridNationalRatesKg)! < 15)
assert.equal(carbonUtility(300, [300, 300]), 50) // tie → midpoint
assert.equal(carbonUtility(300, [300]), null) // n<2 → missing

assert.equal(waterRiskUtility(0), 100)
assert.equal(waterRiskUtility(5), 0)
assert.equal(waterRiskUtility(2.8), 44)

assert.equal(femaUtility({ mapped: true, floodZone: 'X', zoneSubtype: null }), 100)
assert.equal(femaUtility({ mapped: true, floodZone: 'X', zoneSubtype: '0.2 PCT ANNUAL CHANCE FLOOD HAZARD' }), 60)
assert.equal(femaUtility({ mapped: true, floodZone: 'AE', zoneSubtype: null }), 20)
assert.equal(femaUtility({ mapped: false, floodZone: null, zoneSubtype: null }), null)

// ---- Renormalization
assert.equal(
  renormalizedMean([
    { id: 'a', label: 'a', weight: 0.6, utility: 100 },
    { id: 'b', label: 'b', weight: 0.4, utility: null },
  ]),
  100,
)
assert.equal(renormalizedMean([{ id: 'a', label: 'a', weight: 1, utility: null }]), null)

// ---- Geometric mean: one weak pillar hurts more than arithmetic average
const gm = weightedGeometricMean([
  { weight: 50, score: 95 },
  { weight: 50, score: 20 },
])!
assert.ok(gm < (95 + 20) / 2, 'geometric < arithmetic for unequal scores')
assert.ok(Math.abs(weightedGeometricMean([{ weight: 1, score: 80 }])! - 80) < 1e-9)
assert.equal(weightedGeometricMean([{ weight: 1, score: null }]), null)

// ---- Classification + safeguard
assert.equal(classifyOverall(92, [95, 90, 88, 91, 93]).classification, 'Exceptional')
const capped = classifyOverall(91, [95, 95, 95, 95, 35])
assert.equal(capped.classification, 'Strong')
assert.ok(capped.capped)
assert.equal(classifyOverall(55, [60, 50]).classification, 'Weak')

// ---- Full evaluation on strong evidence
const result = evaluateSite(facility250, goodEvidence, 'balanced')
assert.ok(!result.excluded)
assert.ok(result.overall! >= 75, `overall ${result.overall}`)
assert.equal(result.pillars.length, 5)
for (const p of result.pillars) assert.ok(p.score !== null)
assert.ok(result.positives.length > 0)
assert.ok(result.impact.facilityEnergyTWh.toFixed(3) === '2.628')

// ---- Priority profile changes weights, not evidence or impacts
const sus = evaluateSite(facility250, goodEvidence, 'sustainability')
const dep = evaluateSite(facility250, goodEvidence, 'deployment')
assert.deepEqual(
  sus.pillars.map((p) => p.score),
  result.pillars.map((p) => p.score),
  'pillar scores identical across profiles',
)
assert.deepEqual(
  dep.pillars.map((p) => p.score),
  result.pillars.map((p) => p.score),
)
assert.notEqual(dep.overall, sus.overall, 'weights change the overall score')
assert.equal(sus.impact.facilityEnergyTWh, result.impact.facilityEnergyTWh)
assert.deepEqual(PRIORITY_PROFILES.sustainability.weights, {
  power: 20, carbon: 25, water: 25, physical: 20, community: 10,
})

// ---- Facility size changes power pillar via burden + voltage compatibility
// Line is 345 kV: fine for ≤600 MW load, below preference above 600 MW.
const small = evaluateSite({ ...facility250, itLoadMW: 100 }, goodEvidence, 'balanced')
const large = evaluateSite({ ...facility250, itLoadMW: 500 }, goodEvidence, 'balanced')
const huge = evaluateSite({ ...facility250, itLoadMW: 600 }, goodEvidence, 'balanced')
const power = (r: typeof small) => r.pillars.find((p) => p.id === 'power')!.score!
assert.ok(power(small) >= power(large), '100 MW power ≥ 500 MW power')
assert.ok(power(large) > power(huge), '600 MW IT (720 MW load) loses voltage compatibility on a 345 kV line')
assert.ok(small.impact.annualCO2eTonnes! < large.impact.annualCO2eTonnes!)
assert.ok(small.impact.annualWaterMillionLiters < large.impact.annualWaterMillionLiters)
// Carbon REGIONAL score does not change with size; annual CO2e does
const carbonOf = (r: typeof small) => r.pillars.find((p) => p.id === 'carbon')!.score
assert.equal(carbonOf(small), carbonOf(large))

// ---- PUE changes burden/electricity, not water; WUE changes only water
const hiPue = evaluateSite({ ...facility250, pue: 1.4 }, goodEvidence, 'balanced')
assert.ok(hiPue.impact.facilityEnergyTWh > result.impact.facilityEnergyTWh)
assert.equal(hiPue.impact.annualWaterMillionLiters, result.impact.annualWaterMillionLiters)
const hiWue = evaluateSite({ ...facility250, wueLPerKwh: 0.5 }, goodEvidence, 'balanced')
assert.ok(hiWue.impact.annualWaterMillionLiters > result.impact.annualWaterMillionLiters)
assert.equal(hiWue.overall, result.overall, 'WUE change must not move suitability (no basin-capacity evidence)')

// ---- Horizon shifts water weighting toward 2050
const stressed2050: LocationEvidence = {
  ...goodEvidence,
  water: { baselineScore: 1, bau2030Score: 2, bau2050Score: 5 },
}
const w30 = evaluateSite(facility250, stressed2050, 'balanced')
const w20 = evaluateSite({ ...facility250, planningHorizonYears: 20 }, stressed2050, 'balanced')
const waterOf = (r: typeof w30) => r.pillars.find((p) => p.id === 'water')!.score!
assert.ok(waterOf(w30) < waterOf(w20), '30-yr horizon weights 2050 stress more')

// ---- Missing evidence: renormalized, lowers confidence, never zero
const noNerc = evaluateSite(facility250, { ...goodEvidence, nerc: null }, 'balanced')
assert.ok(power(noNerc) > 0, 'power still scored without NERC')
assert.ok(noNerc.confidencePct < result.confidencePct)
const noFlood = { ...goodEvidence, flood: { mapped: false, floodZone: null, zoneSubtype: null } }
const nf = evaluateSite(facility250, noFlood, 'balanced')
const phys = nf.pillars.find((p) => p.id === 'physical')!
assert.equal(Math.round(phys.score!), 100, 'physical renormalizes to NLCD-only')
assert.ok(nf.confidencePct < result.confidencePct)
assert.ok(
  evidenceConfidence(goodEvidence, PRIORITY_PROFILES.balanced.weights) >
    evidenceConfidence({ ...goodEvidence, water: null, nerc: null }, PRIORITY_PROFILES.balanced.weights),
)

console.log('decisionEngine.ts: all tests passed')
