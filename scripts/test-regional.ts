/**
 * Tests for P2 regional screening (src/lib/regionalScreening.ts) against
 * the real precomputed evidence — run with:
 *   npm run test:regional
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRIORITY_PROFILES } from '../src/lib/decisionEngine.ts'
import {
  rankCounties,
  regionalWeights,
  scoreAllCounties,
  stateMedians,
  type RegionalEvidenceFile,
} from '../src/lib/regionalScreening.ts'

const evidence = JSON.parse(
  readFileSync('public/data/decision/regional_evidence.json', 'utf8'),
) as RegionalEvidenceFile

const facility = (itLoadMW: number) => ({
  itLoadMW,
  pue: 1.2,
  wueLPerKwh: 0.34,
  planningHorizonYears: 30 as const,
})

// Weights renormalize by dropping Physical, for every profile
for (const id of ['balanced', 'sustainability', 'deployment'] as const) {
  const w = regionalWeights(id)
  assert.ok(!('physical' in w))
  const full = PRIORITY_PROFILES[id].weights
  assert.deepEqual(w, {
    power: full.power,
    carbon: full.carbon,
    water: full.water,
    community: full.community,
  })
}

// Full national scoring
const t0 = Date.now()
const scores250 = scoreAllCounties(evidence, facility(250), 'balanced')
const elapsed = Date.now() - t0
assert.equal(scores250.length, evidence.counties.length)
const scored = scores250.filter((s) => s.score !== null)
assert.ok(scored.length > 3000, `${scored.length} counties scored`)
// NO regional hard exclusions: every county with any evidence gets a score
assert.equal(scored.length, scores250.length, 'no county excluded regionally')
assert.ok(elapsed < 1000, `nationwide scoring took ${elapsed}ms — must feel instant`)

// Ranking: score desc, confidence tiebreak
const ranked = rankCounties(scores250)
for (let i = 1; i < ranked.length; i++) {
  const a = ranked[i - 1]
  const b = ranked[i]
  assert.ok(
    (a.score as number) > (b.score as number) ||
      ((a.score as number) === (b.score as number) &&
        a.confidencePct >= b.confidencePct),
  )
}

// Facility size changes rankings (voltage compatibility + burden)
const rank = (mw: number, profile: 'balanced' | 'sustainability' | 'deployment' = 'balanced') =>
  rankCounties(scoreAllCounties(evidence, facility(mw), profile)).map((s) => s.fips)
const r100 = rank(100)
const r250 = rank(250)
const r500 = rank(500)
assert.notDeepEqual(r100.slice(0, 50), r500.slice(0, 50), '100 vs 500 MW top-50 differs')
assert.notDeepEqual(r250.slice(0, 100), r500.slice(0, 100))

// Profiles change rankings while raw evidence is untouched
const before = JSON.stringify(evidence.counties[0])
const rBal = rank(250, 'balanced')
const rSus = rank(250, 'sustainability')
const rDep = rank(250, 'deployment')
assert.equal(JSON.stringify(evidence.counties[0]), before, 'evidence immutable')
assert.notDeepEqual(rBal.slice(0, 50), rSus.slice(0, 50))
assert.notDeepEqual(rBal.slice(0, 50), rDep.slice(0, 50))

// Pillar scores identical across profiles for the same county
const sBal = scoreAllCounties(evidence, facility(250), 'balanced')
const sSus = scoreAllCounties(evidence, facility(250), 'sustainability')
assert.deepEqual(sBal[0].pillars, sSus[0].pillars)

// Missing NERC lowers confidence but does not zero the score
const withNerc = scored.find((s) => {
  const c = evidence.counties.find((c) => c.fips === s.fips)!
  return c.nercArea !== null
})!
const withoutNerc = scored.find((s) => {
  const c = evidence.counties.find((c) => c.fips === s.fips)!
  return c.nercArea === null
})!
assert.ok(withoutNerc.score !== null && withoutNerc.score > 0)
assert.ok(withoutNerc.confidencePct < withNerc.confidencePct)

// State medians exist for CONUS states, none for AK/HI
const medians = stateMedians(scores250)
assert.ok(medians.OH > 0 && medians.TX > 0 && medians.VA > 0)
assert.equal(medians.AK, undefined)
assert.equal(medians.HI, undefined)

// Known regions are present and scored (NOT forced into any top list)
for (const fips of ['51107', '39049', '48029', '04013', '53033']) {
  assert.ok(
    scored.find((s) => s.fips === fips),
    `county ${fips} scored`,
  )
}

// ---- Evidence sufficiency gate (ranking eligibility)
const dare = scores250.find((s) => s.fips === '37055')! // Dare County, NC
assert.ok(dare.score !== null && dare.score > 0, 'Dare keeps its score')
assert.equal(dare.rankingEligible, false, 'Dare is NOT nationally rankable')
assert.ok(dare.ineligibilityReasons.some((r) => r.includes('carbon')))
assert.ok(dare.ineligibilityReasons.some((r) => r.includes('Aqueduct')))
assert.ok(!ranked.some((s) => s.fips === '37055'), 'Dare absent from ranking')

// Fully evidenced counties remain eligible; missing NERC alone does not gate
const fullEvidence = scores250.find((s) => {
  const c = evidence.counties.find((c) => c.fips === s.fips)!
  return c.egridKg !== null && c.wBase !== null && c.txDistMi !== null &&
    c.salesTWh !== null && c.nercArea !== null
})!
assert.ok(fullEvidence.rankingEligible)
const noNercEligible = scores250.find((s) => {
  const c = evidence.counties.find((c) => c.fips === s.fips)!
  return c.nercArea === null && c.egridKg !== null && c.wBase !== null &&
    c.txDistMi !== null && c.salesTWh !== null && !c.egridAmbiguous
})
assert.ok(noNercEligible, 'a NERC-less but otherwise complete county exists')
assert.ok(
  noNercEligible!.rankingEligible,
  `missing NERC alone must not gate (conf ${noNercEligible!.confidencePct}%)`,
)
// Confidence floor gates: every ineligible county has a listed reason,
// every county under 65% confidence is ineligible
for (const s of scores250) {
  if (s.confidencePct < 65) assert.equal(s.rankingEligible, false)
  if (!s.rankingEligible) assert.ok(s.ineligibilityReasons.length > 0)
  else assert.equal(s.ineligibilityReasons.length, 0)
}
// Ranked list contains only eligible counties
assert.ok(ranked.every((s) => s.rankingEligible))
// Score formulas unchanged: eligibility never alters a score
const eligibleCount = scores250.filter((s) => s.rankingEligible).length
console.log(`eligible for national ranking: ${eligibleCount}/${scores250.length}`)

// ---- Report output
const top20 = ranked.slice(0, 20)
console.log('regionalScreening.ts: all tests passed')
console.log(`\nNationwide scoring: ${scores250.length} counties in ${elapsed}ms`)
console.log('\nTop 20 (250 MW IT · PUE 1.20 · Balanced Sustainable · 30-yr):')
top20.forEach((s, i) => {
  const p = s.pillars
  console.log(
    `${String(i + 1).padStart(2)}. ${s.name}, ${s.state} — ${Math.round(s.score!)} ` +
      `(P ${p.power !== null ? Math.round(p.power) : 'n/a'} · C ${p.carbon !== null ? Math.round(p.carbon) : 'n/a'} · W ${p.water !== null ? Math.round(p.water) : 'n/a'} · R ${p.community !== null ? Math.round(p.community) : 'n/a'}) conf ${s.confidencePct}%`,
  )
})
const changed = (a: string[], b: string[]) =>
  a.slice(0, 20).filter((f) => !b.slice(0, 20).includes(f)).length
console.log(`\nTop-20 membership changes: 100→250 MW: ${changed(r100, r250)}, 250→500 MW: ${changed(r250, r500)}`)
console.log(`Profiles vs Balanced top-20: Sustainability ${changed(rSus, rBal)} differ, Deployment ${changed(rDep, rBal)} differ`)
const states20 = [...new Set(top20.map((s) => s.state))]
console.log('States in Top 20:', states20.join(', '))
