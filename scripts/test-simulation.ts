/**
 * Unit tests for src/lib/simulation.ts — run with:
 *   npm run test:sim
 * (uses Node's native type stripping; no test framework needed)
 */
import assert from 'node:assert/strict'
import { simulateFacility } from '../src/lib/simulation.ts'

const approx = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  )

// Acceptance case: 250 MW IT, PUE 1.20, WUE 0.34 L/kWh
{
  const sim = simulateFacility(
    { itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.34 },
    null,
  )
  approx(sim.facilityLoadMW, 300)
  approx(sim.overheadMW, 50)
  approx(sim.overheadPercent, 20)
  approx(sim.facilityEnergyMWh, 2_628_000)
  approx(sim.facilityEnergyTWh, 2.628)
  approx(sim.itEnergyMWh, 2_190_000)
  approx(sim.itEnergyKWh, 2_190_000_000)
  approx(sim.annualWaterLiters, 744_600_000)
  approx(sim.annualWaterMillionLiters, 744.6)
  approx(sim.annualWaterMillionGallons, 196.70251, 1e-4)
  assert.equal(sim.carbon, null, 'carbon must be null without an eGRID rate')
}

// Carbon uses FACILITY electricity and the provided eGRID total-output rate
{
  const sim = simulateFacility(
    { itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.34 },
    500, // kg CO2e/MWh
  )
  assert.ok(sim.carbon)
  approx(sim.carbon.annualCO2eKg, 2_628_000 * 500)
  approx(sim.carbon.annualCO2eTonnes, 1_314_000)
}

// PUE change: electricity/carbon change, water does not
{
  const base = simulateFacility({ itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.34 }, 500)
  const hiPue = simulateFacility({ itLoadMW: 250, pue: 1.4, wueLPerKwh: 0.34 }, 500)
  assert.ok(hiPue.facilityLoadMW > base.facilityLoadMW)
  assert.ok(hiPue.facilityEnergyMWh > base.facilityEnergyMWh)
  assert.ok(hiPue.carbon!.annualCO2eTonnes > base.carbon!.annualCO2eTonnes)
  approx(hiPue.annualWaterLiters, base.annualWaterLiters)
}

// WUE change: water changes, electricity/carbon do not
{
  const base = simulateFacility({ itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.34 }, 500)
  const loWue = simulateFacility({ itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.27 }, 500)
  assert.ok(loWue.annualWaterLiters < base.annualWaterLiters)
  approx(loWue.facilityEnergyMWh, base.facilityEnergyMWh)
  approx(loWue.carbon!.annualCO2eTonnes, base.carbon!.annualCO2eTonnes)
}

// IT load change scales everything proportionally
{
  const base = simulateFacility({ itLoadMW: 250, pue: 1.2, wueLPerKwh: 0.34 }, 500)
  const double = simulateFacility({ itLoadMW: 500, pue: 1.2, wueLPerKwh: 0.34 }, 500)
  approx(double.facilityLoadMW, base.facilityLoadMW * 2)
  approx(double.facilityEnergyMWh, base.facilityEnergyMWh * 2)
  approx(double.annualWaterLiters, base.annualWaterLiters * 2)
  approx(double.carbon!.annualCO2eTonnes, base.carbon!.annualCO2eTonnes * 2)
}

// Non-finite eGRID rate is treated as unavailable, never guessed
{
  const sim = simulateFacility({ itLoadMW: 100, pue: 1.1, wueLPerKwh: 0.27 }, NaN)
  assert.equal(sim.carbon, null)
}

console.log('simulation.ts: all tests passed')
