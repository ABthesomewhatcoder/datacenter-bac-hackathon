// Builds public/data/grid/ — per-state power & grid context. REAL DATA.
//
//   node scripts/prepare-grid-context.mjs
//
// Inputs (committed under data-sources/):
// - annual_energy_supply.json         EIA-style annual net generation by state
// - state_electricity_demand.json     retail sales (latest 12 mo + 5 yr earlier)
// - nerc_sra_2026_margins.json        reserve margins extracted from the NERC
//                                     2026 Summer Reliability Assessment PDF
//
// IMPORTANT FRAMING: generation minus sales is the ANNUAL GENERATION
// BALANCE — an energy accounting figure. It is NOT spare capacity, unused
// energy, or available power, and must never be labeled as such.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const supply = JSON.parse(readFileSync('data-sources/annual_energy_supply.json', 'utf8'))
const demand = JSON.parse(readFileSync('data-sources/state_electricity_demand.json', 'utf8'))
const nerc = JSON.parse(readFileSync('data-sources/nerc_sra_2026_margins.json', 'utf8'))

// ---- State generation: Total Electric Power Industry / Total, latest year.
const totals = supply.filter(
  (r) =>
    r.producer_type === 'Total Electric Power Industry' &&
    r.energy_source === 'Total' &&
    r.state !== 'US-Total',
)
const latestYear = Math.max(...totals.map((r) => r.year))
const generationByState = new Map(
  totals.filter((r) => r.year === latestYear).map((r) => [r.state, r.generation_mwh]),
)

// ---- State → NERC assessment area. Only states that sit predominantly in
// ONE assessment area are mapped; states split across areas get null so the
// UI honestly shows "NERC regional context unavailable" instead of a guess.
const STATE_TO_NERC_AREA = {
  CT: 'NPCC-New England', MA: 'NPCC-New England', ME: 'NPCC-New England',
  NH: 'NPCC-New England', RI: 'NPCC-New England', VT: 'NPCC-New England',
  NY: 'NPCC-New York',
  PA: 'PJM', NJ: 'PJM', MD: 'PJM', DE: 'PJM', DC: 'PJM', VA: 'PJM',
  OH: 'PJM', WV: 'PJM',
  MN: 'MISO', WI: 'MISO', IA: 'MISO', IN: 'MISO', MI: 'MISO', LA: 'MISO',
  MS: 'MISO', AR: 'MISO',
  KS: 'MRO-SPP', OK: 'MRO-SPP', NE: 'MRO-SPP',
  TN: 'SERC-Central',
  GA: 'SERC-Southeast',
  NC: 'SERC-East', SC: 'SERC-East',
  FL: 'SERC-Florida Peninsula',
  TX: 'Texas RE-ERCOT',
  CA: 'WECC-California',
  WA: 'WECC-Northwest', OR: 'WECC-Northwest',
  AZ: 'WECC-Southwest', NM: 'WECC-Southwest',
  CO: 'WECC-Rocky Mountain',
  UT: 'WECC-Basin',
}

/** Split/out-of-scope states and why the assignment would be a guess. */
const UNMAPPED_REASON = {
  IL: 'Split between MISO and PJM',
  MO: 'Split between MISO and MRO-SPP',
  ND: 'Split between MISO and MRO-SPP',
  SD: 'Split between MRO-SPP and MISO',
  KY: 'Split between SERC-Central and PJM',
  AL: 'Split between SERC-Southeast and SERC-Central',
  WY: 'Split between WECC-Basin and WECC-Rocky Mountain',
  MT: 'Split between WECC-Northwest and MRO areas',
  ID: 'Split between WECC-Northwest and WECC-Basin',
  NV: 'Split between WECC-Basin and WECC-Southwest',
  AK: 'Outside NERC SRA assessment areas',
  HI: 'Outside NERC SRA assessment areas',
}

const STATE_AREA_NOTES = {
  TX: 'ERCOT serves most Texas load; edges of the state are in MRO-SPP, MISO, and WECC.',
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d

const states = {}
const unmatched = []
for (const row of demand) {
  const genMwh = generationByState.get(row.state)
  if (genMwh === undefined) {
    unmatched.push(row.state)
    continue
  }
  const generationTWh = genMwh / 1_000_000
  const salesTWh = row.sales_TWh_latest_12mo
  const areaName = STATE_TO_NERC_AREA[row.state] ?? null
  const area = areaName ? nerc.areas[areaName] : null
  if (areaName && !area) throw new Error(`No NERC margins for ${areaName}`)

  states[row.state] = {
    generationTWh: round(generationTWh, 2),
    generationYear: latestYear,
    salesTWh: round(salesTWh, 2),
    sales5yrEarlierTWh: row.sales_TWh_5yr_earlier,
    growthPct5yr: row.growth_pct_5yr,
    avgPriceCentsPerKwh: row.avg_price_cents_per_kWh,
    generationToSalesRatio: round(generationTWh / salesTWh, 3),
    // Annual Generation Balance — NOT spare capacity (see header).
    netGenerationBalanceTWh: round(generationTWh - salesTWh, 2),
    nerc: area
      ? {
          area: areaName,
          anticipatedReserveMarginPct: area.anticipatedReserveMarginPct,
          referenceMarginPct: area.referenceMarginPct,
          reserveHeadroomPp: round(
            area.anticipatedReserveMarginPct - area.referenceMarginPct,
            2,
          ),
          riskSeasonal: area.riskSeasonal,
          riskNote: area.riskNote ?? null,
          areaNote: STATE_AREA_NOTES[row.state] ?? null,
        }
      : { unavailableReason: UNMAPPED_REASON[row.state] ?? 'Assignment uncertain' },
  }
}

const meta = {
  name: 'State power & grid context',
  dataStatus: 'REAL DATA',
  generated: new Date().toISOString().slice(0, 10),
  generationYear: latestYear,
  sources: {
    generation:
      'EIA annual net generation by state (data-sources/annual_energy_supply.json; producer_type "Total Electric Power Industry", energy_source "Total")',
    demand:
      'State retail electricity sales, latest 12 months vs 5 years earlier (data-sources/state_electricity_demand.json)',
    nerc: nerc.url,
    nercLtra2025:
      'https://www.nerc.com/globalassets/our-work/assessments/nerc_ltra_2025.pdf',
    nercDataInstructions:
      'https://www.nerc.com/globalassets/who-we-are/standing-committees/rstc/ras/2026_sra_data_instructions.pdf',
    transmission:
      'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0',
  },
  caveats: [
    'Annual generation balance does not represent spare grid capacity or guaranteed power availability.',
    'Transmission proximity does not establish available interconnection capacity.',
    'NERC regional adequacy does not guarantee utility service to any specific project.',
    'States split across NERC assessment areas are reported as "NERC regional context unavailable" rather than guessed.',
  ],
  counts: {
    statesJoined: Object.keys(states).length,
    statesWithNercArea: Object.values(states).filter((s) => s.nerc.area).length,
    nercAreasReferenced: new Set(
      Object.values(states).map((s) => s.nerc.area).filter(Boolean),
    ).size,
    unmatchedDemandStates: unmatched,
  },
  unmappedStates: UNMAPPED_REASON,
}

mkdirSync('public/data/grid', { recursive: true })
writeFileSync(
  'public/data/grid/state_grid_context.json',
  JSON.stringify(states) + '\n',
)
writeFileSync('public/data/grid/meta.json', JSON.stringify(meta, null, 2) + '\n')
console.log(
  `generation year ${latestYear};`,
  `${meta.counts.statesJoined} states joined,`,
  `${meta.counts.statesWithNercArea} with a NERC area (${meta.counts.nercAreasReferenced} areas);`,
  'unmatched:', unmatched.length ? unmatched : 'none',
)
