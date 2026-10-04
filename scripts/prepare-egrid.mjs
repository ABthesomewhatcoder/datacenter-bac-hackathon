// Builds frontend eGRID data from official EPA files (eGRID2023 Rev 2):
//
// 1. eGRID2023 subregion shapefile (WGS84):
//    https://www.epa.gov/system/files/other-files/2025-01/egrid2023_subregions.zip
// 2. eGRID2023 multiple-subregions shapefile (areas EPA marks as served by
//    more than one possible subregion):
//    https://www.epa.gov/system/files/other-files/2025-01/egrid2023_multiple_subregions.zip
// 3. eGRID2023 Rev 2 data workbook (June 12, 2025):
//    https://www.epa.gov/system/files/documents/2025-06/egrid2023_data_rev2.xlsx
//    - SRL23 sheet: SRCO2RTA (CO2 total output emission rate, lb/MWh),
//      SRC2ERTA (CO2e total output emission rate, lb/MWh), SRNAME
//    - GGL23 sheet: grid gross loss by interconnect
//
// Outputs public/data/egrid/{subregions.geojson,multiple.geojson,meta.json}.
// Coordinates rounded to 3 decimals (~110 m) with consecutive-duplicate
// removal — fine for subregion-scale polygons.
//
// Usage: node scripts/prepare-egrid.mjs <dir-with-downloads>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { open } from 'shapefile'
import XLSX from 'xlsx'

const [, , dir] = process.argv
if (!dir) {
  console.error('usage: node scripts/prepare-egrid.mjs <dir-with-downloads>')
  process.exit(1)
}

/** eGRID subregion → interconnect, for attaching GGL23 grid gross loss. */
const INTERCONNECT = {
  ERCT: 'ERCOT',
  AKGD: 'Alaska', AKMS: 'Alaska',
  HIMS: 'Hawaii', HIOA: 'Hawaii',
  AZNM: 'Western', CAMX: 'Western', NWPP: 'Western', RMPA: 'Western',
}
const interconnectOf = (sub) => INTERCONNECT[sub] ?? 'Eastern'

const round = (n) => Math.round(n * 1e3) / 1e3

// Douglas-Peucker simplification. ~0.005 deg (~550 m) tolerance is
// appropriate for subregion-scale boundaries; the EPA multiple-subregions
// overlay plus the panel caveat cover near-boundary ambiguity.
const RDP_TOLERANCE = 0.005

function perpDistSq(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) {
    const ex = p[0] - a[0], ey = p[1] - a[1]
    return ex * ex + ey * ey
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  const px = a[0] + t * dx, py = a[1] + t * dy
  const ex = p[0] - px, ey = p[1] - py
  return ex * ex + ey * ey
}

function rdp(points, tol2) {
  if (points.length < 3) return points
  let maxD = 0, idx = 0
  const a = points[0], b = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistSq(points[i], a, b)
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD <= tol2) return [a, b]
  const left = rdp(points.slice(0, idx + 1), tol2)
  const right = rdp(points.slice(idx), tol2)
  return left.slice(0, -1).concat(right)
}

function cleanRing(ring) {
  let out = []
  for (const [x, y] of ring) {
    const p = [round(x), round(y)]
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  out = rdp(out, RDP_TOLERANCE * RDP_TOLERANCE)
  if (out.length > 1) {
    const [f, l] = [out[0], out[out.length - 1]]
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]])
  }
  return out
}

function cleanGeometry(geom) {
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map(cleanRing).filter((r) => r.length >= 4) }
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates
        .map((poly) => poly.map(cleanRing).filter((r) => r.length >= 4))
        .filter((poly) => poly.length > 0),
    }
  }
  return geom
}

async function readShapefile(path) {
  const src = await open(path)
  const features = []
  for (;;) {
    const r = await src.read()
    if (r.done) break
    features.push(r.value)
  }
  return features
}

// --- emissions rates from SRL23 ---
const wb = XLSX.readFile(`${dir}/egrid2023_data_rev2.xlsx`, { sheets: ['SRL23', 'GGL23'] })
const srl = XLSX.utils.sheet_to_json(wb.Sheets.SRL23, { range: 1 })
const ggl = XLSX.utils.sheet_to_json(wb.Sheets.GGL23, { range: 1 })
const lossByInterconnect = Object.fromEntries(ggl.map((r) => [r.REGION, r.GGRSLOSS]))

const rates = {}
for (const r of srl) {
  if (!r.SUBRGN) continue
  rates[r.SUBRGN] = {
    name: r.SRNAME,
    co2RateLb: Math.round(r.SRCO2RTA * 1000) / 1000,
    co2eRateLb: Math.round(r.SRC2ERTA * 1000) / 1000,
    interconnect: interconnectOf(r.SUBRGN),
    gridGrossLoss: lossByInterconnect[interconnectOf(r.SUBRGN)] ?? null,
  }
}

// --- subregion polygons ---
const subFeatures = await readShapefile(`${dir}/egrid_sub/eGRID2023_Subregions.shp`)
const outFeatures = subFeatures.map((f) => {
  const acronym = f.properties.Subregion
  const rate = rates[acronym]
  if (!rate) console.warn(`no SRL23 rates for ${acronym}`)
  return {
    type: 'Feature',
    properties: {
      acronym,
      name: rate?.name ?? acronym,
      co2RateLb: rate?.co2RateLb ?? null,
      co2eRateLb: rate?.co2eRateLb ?? null,
      gridGrossLoss: rate?.gridGrossLoss ?? null,
      interconnect: rate?.interconnect ?? null,
    },
    geometry: cleanGeometry(f.geometry),
  }
})

// --- EPA multiple-subregions overlay (ambiguous service areas) ---
const multiFeatures = (await readShapefile(`${dir}/egrid_multi/eGRID2023_Multiple_Subregions.shp`)).map(
  (f) => ({
    type: 'Feature',
    properties: { multiple: true },
    geometry: cleanGeometry(f.geometry),
  }),
)

mkdirSync('public/data/egrid', { recursive: true })
writeFileSync(
  'public/data/egrid/subregions.geojson',
  JSON.stringify({ type: 'FeatureCollection', features: outFeatures }),
)
writeFileSync(
  'public/data/egrid/multiple.geojson',
  JSON.stringify({ type: 'FeatureCollection', features: multiFeatures }),
)
writeFileSync(
  'public/data/egrid/meta.json',
  JSON.stringify(
    {
      dataset: 'eGRID2023 Revision 2 (released June 12, 2025)',
      sourceOrganization: 'U.S. EPA',
      dataStatus: 'REAL DATA',
      fields: {
        co2RateLb: 'SRCO2RTA — CO2 total output emission rate (lb/MWh)',
        co2eRateLb: 'SRC2ERTA — CO2e total output emission rate (lb/MWh)',
        gridGrossLoss: 'GGL23 GGRSLOSS by interconnect (fraction)',
      },
      note: 'Total output emission rates (not non-baseload) — appropriate for electricity-footprint estimates.',
      sources: [
        'https://www.epa.gov/system/files/other-files/2025-01/egrid2023_subregions.zip',
        'https://www.epa.gov/system/files/other-files/2025-01/egrid2023_multiple_subregions.zip',
        'https://www.epa.gov/system/files/documents/2025-06/egrid2023_data_rev2.xlsx',
      ],
      generated: new Date().toISOString().slice(0, 10),
    },
    null,
    2,
  ) + '\n',
)

console.log(`subregions: ${outFeatures.length}`)
for (const s of ['AZNM', 'CAMX', 'ERCT']) {
  console.log(`${s}: CO2e ${rates[s].co2eRateLb} lb/MWh (${rates[s].name})`)
}
