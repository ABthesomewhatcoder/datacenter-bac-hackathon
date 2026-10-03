// Generates public/data/county_scores.json — MOCK/DEMO county suitability
// scores keyed by 5-digit county GEOID. Values are synthetic: each county
// starts from its state's mock power/water/buildability scores and gets a
// deterministic hash-based jitter, so output is stable across runs.
//
// Run after prepare-counties.mjs:
//   node scripts/generate-county-scores.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const stateFile = JSON.parse(
  readFileSync('public/data/state_scores.json', 'utf8'),
)

// Hand-tuned counties (real data-center markets, still mock values).
const FEATURED = {
  39089: { overall: 91, power: 93, water: 86, buildability: 94, confidence: 0.84 }, // Licking, OH
  39049: { overall: 87, power: 90, water: 83, buildability: 86, confidence: 0.82 }, // Franklin, OH
  51107: { overall: 93, power: 95, water: 84, buildability: 92, confidence: 0.9 },  // Loudoun, VA
  51153: { overall: 89, power: 91, water: 82, buildability: 88, confidence: 0.86 }, // Prince William, VA
  '04013': { overall: 74, power: 88, water: 34, buildability: 90, confidence: 0.8 }, // Maricopa, AZ
  53025: { overall: 85, power: 96, water: 68, buildability: 82, confidence: 0.83 }, // Grant, WA
  53021: { overall: 82, power: 94, water: 64, buildability: 80, confidence: 0.78 }, // Franklin, WA
}

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7)
const clamp = (n) => Math.max(15, Math.min(98, Math.round(n)))
const jitter = (geoid, field, spread) =>
  ((hash(geoid + field) % (spread * 2 + 1)) - spread)

const scores = {}
const files = readdirSync('public/data/counties').filter((f) => f.endsWith('.geojson'))
for (const file of files.sort()) {
  const fc = JSON.parse(readFileSync(`public/data/counties/${file}`, 'utf8'))
  for (const f of fc.features) {
    const { geoid, state } = f.properties
    if (FEATURED[geoid]) {
      scores[geoid] = FEATURED[geoid]
      continue
    }
    const base = stateFile.scores[state]
    const power = clamp(base.power + jitter(geoid, 'p', 12))
    const water = clamp(base.water + jitter(geoid, 'w', 10))
    const buildability = clamp(base.buildability + jitter(geoid, 'b', 14))
    scores[geoid] = {
      overall: clamp(power * 0.4 + water * 0.3 + buildability * 0.3),
      power,
      water,
      buildability,
      confidence: Math.round((0.55 + (hash(geoid + 'c') % 35) / 100) * 100) / 100,
    }
  }
}

const out = {
  meta: {
    title: 'U.S. county data-center suitability scores',
    warning:
      'MOCK / DEMO DATA ONLY — synthetic values for prototyping, not real analysis.',
    keyedBy: '5-digit county GEOID (state FIPS + county FIPS)',
    metrics: ['overall', 'power', 'water', 'buildability'],
    scoreRange: [0, 100],
    confidenceRange: [0, 1],
  },
  scores,
}
writeFileSync('public/data/county_scores.json', JSON.stringify(out) + '\n')
console.log('wrote county_scores.json with', Object.keys(scores).length, 'counties')
