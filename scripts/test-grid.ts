/**
 * Unit tests for src/lib/gridContext.ts classifiers + facility burden,
 * verified against the real preprocessed data — run with:
 *   npm run test:grid
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  classifyDemandGrowth,
  classifyFacilityBurden,
  classifyReserveHeadroom,
  facilityShareOfStateSalesPct,
  hasNercArea,
  type StateGridContextMap,
} from '../src/lib/gridContext.ts'
import { simulateFacility } from '../src/lib/simulation.ts'

// Demand Growth Pressure bands
assert.equal(classifyDemandGrowth(3.8), 'LOW')
assert.equal(classifyDemandGrowth(5), 'MODERATE')
assert.equal(classifyDemandGrowth(9.9), 'MODERATE')
assert.equal(classifyDemandGrowth(14.5), 'HIGH')
assert.equal(classifyDemandGrowth(20), 'VERY HIGH')
assert.equal(classifyDemandGrowth(21.2), 'VERY HIGH')

// Relative Facility Burden bands
assert.equal(classifyFacilityBurden(0.49), 'VERY LOW')
assert.equal(classifyFacilityBurden(0.5), 'LOW')
assert.equal(classifyFacilityBurden(1), 'MODERATE')
assert.equal(classifyFacilityBurden(2.99), 'MODERATE')
assert.equal(classifyFacilityBurden(3), 'HIGH')
assert.equal(classifyFacilityBurden(7.5), 'VERY HIGH')

// Reserve headroom screening bands
assert.equal(classifyReserveHeadroom(-0.1), 'SHORTFALL')
assert.equal(classifyReserveHeadroom(0), 'TIGHT')
assert.equal(classifyReserveHeadroom(1.99), 'TIGHT')
assert.equal(classifyReserveHeadroom(2), 'ADEQUATE')
assert.equal(classifyReserveHeadroom(4.99), 'ADEQUATE')
assert.equal(classifyReserveHeadroom(5), 'COMFORTABLE')

// Real-data checks against the preprocessed output
const grid = JSON.parse(
  readFileSync('public/data/grid/state_grid_context.json', 'utf8'),
) as StateGridContextMap

for (const st of ['TX', 'OH', 'VA', 'AZ', 'WA', 'WY']) {
  assert.ok(grid[st], `${st} present`)
  assert.ok(grid[st].generationTWh > 0)
  assert.ok(grid[st].salesTWh > 0)
  // Ratio and balance must be mutually consistent
  const g = grid[st]
  assert.ok(
    Math.abs(g.generationToSalesRatio - g.generationTWh / g.salesTWh) < 0.01,
  )
  assert.ok(
    Math.abs(g.netGenerationBalanceTWh - (g.generationTWh - g.salesTWh)) < 0.05,
  )
}
assert.ok(hasNercArea(grid.TX.nerc) && grid.TX.nerc.area === 'Texas RE-ERCOT')
assert.ok(hasNercArea(grid.OH.nerc) && grid.OH.nerc.area === 'PJM')
assert.ok(hasNercArea(grid.VA.nerc) && grid.VA.nerc.area === 'PJM')
assert.ok(hasNercArea(grid.AZ.nerc) && grid.AZ.nerc.area === 'WECC-Southwest')
assert.ok(hasNercArea(grid.WA.nerc) && grid.WA.nerc.area === 'WECC-Northwest')
assert.ok(!hasNercArea(grid.WY.nerc), 'WY honestly unmapped (split areas)')

// Headroom consistency with source margins
if (hasNercArea(grid.OH.nerc)) {
  const n = grid.OH.nerc
  assert.ok(
    Math.abs(
      n.reserveHeadroomPp -
        (n.anticipatedReserveMarginPct - n.referenceMarginPct),
    ) < 0.01,
  )
}

// Facility burden: same 250 MW / PUE 1.20 facility (2.628 TWh/yr) must be a
// far larger share of demand in Wyoming than in Texas.
const sim250 = simulateFacility({ itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.34 }, null)
const txShare = facilityShareOfStateSalesPct(sim250.facilityEnergyTWh, grid.TX.salesTWh)
const wyShare = facilityShareOfStateSalesPct(sim250.facilityEnergyTWh, grid.WY.salesTWh)
assert.ok(txShare < 1, `TX share ${txShare.toFixed(2)}% should be <1%`)
assert.ok(wyShare > 10, `WY share ${wyShare.toFixed(2)}% should be >10%`)
assert.ok(wyShare > txShare * 10, 'WY share must dwarf TX share')
assert.equal(classifyFacilityBurden(txShare), 'LOW')
assert.equal(classifyFacilityBurden(wyShare), 'VERY HIGH')

// Burden responds proportionally to IT MW (100 / 250 / 500) and to PUE.
const shares = [100, 250, 500].map((mw) =>
  facilityShareOfStateSalesPct(
    simulateFacility({ itLoadMW: mw, pue: 1.2, wueLPerKwh: 0.34 }, null)
      .facilityEnergyTWh,
    grid.OH.salesTWh,
  ),
)
assert.ok(Math.abs(shares[1] / shares[0] - 2.5) < 1e-9)
assert.ok(Math.abs(shares[2] / shares[0] - 5) < 1e-9)
const lowPue = facilityShareOfStateSalesPct(
  simulateFacility({ itLoadMW: 250, pue: 1.1, wueLPerKwh: 0.34 }, null)
    .facilityEnergyTWh,
  grid.OH.salesTWh,
)
assert.ok(lowPue < shares[1], 'lower PUE must lower the burden')

console.log('gridContext.ts: all tests passed')
console.log(
  `  TX 250MW share ${txShare.toFixed(2)}% (${classifyFacilityBurden(txShare)}) · ` +
    `WY ${wyShare.toFixed(1)}% (${classifyFacilityBurden(wyShare)})`,
)
