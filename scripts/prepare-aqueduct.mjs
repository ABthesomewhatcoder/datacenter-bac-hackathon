// Builds the U.S. water-stress GeoJSON from official WRI Aqueduct 4.0 data.
//
// Inputs (see meta.json for exact URLs):
// 1. Aqueduct 4.0 water risk download (Y2023M07D05, zip dated 2023-08-07):
//    https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip
//    - CVS/Aqueduct40_baseline_annual_y2023m07d05.csv:
//        pfaf_id, bws_raw, bws_score, bws_cat, bws_label
//    - CVS/Aqueduct40_future_annual_y2023m07d05.csv:
//        pfaf_id, bau30_ws_x_{r,s,c,l}, bau50_ws_x_{r,s,c,l},
//        bau80_ws_x_{r,s,c,l}
// 2. HydroBASINS North America level 6 (the sub-basin framework Aqueduct
//    4.0 annual indicators are computed on; PFAF_ID joins to pfaf_id):
//    https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_na_lev06_v1c.zip
//
// License: Aqueduct 4.0 is CC BY 4.0 — attribution preserved in meta.json
// and in the UI source line.
//
// Usage: node scripts/prepare-aqueduct.mjs <dir-with-downloads>

import { createReadStream, writeFileSync, mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { open } from 'shapefile'

const [, , dir] = process.argv
if (!dir) {
  console.error('usage: node scripts/prepare-aqueduct.mjs <dir>')
  process.exit(1)
}

const CSV_DIR = `${dir}/Aqueduct40_waterrisk_download_Y2023M07D05/CVS`
const CONUS = { xmin: -125.5, ymin: 24, xmax: -66, ymax: 50 }

// --- minimal quoted-field CSV line parser ---
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const num = (v) => {
  const n = Number(v)
  return v === '' || Number.isNaN(n) || n <= -9000 ? null : n
}
const txt = (v) => (!v || v === 'NoData' || v === '-9999' ? null : v)

async function readCsv(path, wanted) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let header = null
  let idx = null
  const map = new Map()
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line)
      idx = Object.fromEntries(wanted.map((w) => [w, header.indexOf(w)]))
      for (const w of wanted) if (idx[w] < 0) throw new Error(`missing column ${w} in ${path}`)
      continue
    }
    const cols = parseCsvLine(line)
    const pfaf = cols[idx.pfaf_id]
    if (!pfaf) continue
    const row = {}
    for (const w of wanted) row[w] = cols[idx[w]]
    map.set(String(parseInt(pfaf, 10)), row)
  }
  return map
}

console.log('reading baseline CSV…')
const baseline = await readCsv(`${CSV_DIR}/Aqueduct40_baseline_annual_y2023m07d05.csv`, [
  'pfaf_id', 'bws_raw', 'bws_score', 'bws_cat', 'bws_label',
])
console.log(`baseline rows: ${baseline.size}`)

console.log('reading future CSV…')
const future = await readCsv(`${CSV_DIR}/Aqueduct40_future_annual_y2023m07d05.csv`, [
  'pfaf_id',
  'bau30_ws_x_r', 'bau30_ws_x_s', 'bau30_ws_x_c', 'bau30_ws_x_l',
  'bau50_ws_x_r', 'bau50_ws_x_s', 'bau50_ws_x_c', 'bau50_ws_x_l',
  'bau80_ws_x_r', 'bau80_ws_x_s', 'bau80_ws_x_c', 'bau80_ws_x_l',
])
console.log(`future rows: ${future.size}`)

// --- geometry: RDP simplification (same approach as prepare-egrid) ---
const RDP_TOLERANCE = 0.005
const round = (n) => Math.round(n * 1e3) / 1e3

function perpDistSq(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) { const ex = p[0] - a[0], ey = p[1] - a[1]; return ex * ex + ey * ey }
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
  return rdp(points.slice(0, idx + 1), tol2).slice(0, -1).concat(rdp(points.slice(idx), tol2))
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
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const cleaned = polys
    .map((poly) => poly.map(cleanRing).filter((r) => r.length >= 4))
    .filter((poly) => poly.length > 0)
  return cleaned.length === 1
    ? { type: 'Polygon', coordinates: cleaned[0] }
    : { type: 'MultiPolygon', coordinates: cleaned }
}

function bboxOverlaps(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < minX) minX = c[0]
      if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]
      if (c[1] > maxY) maxY = c[1]
      return
    }
    for (const x of c) walk(x)
  }
  walk(geom.coordinates)
  return !(maxX < CONUS.xmin || minX > CONUS.xmax || maxY < CONUS.ymin || minY > CONUS.ymax)
}

console.log('reading HydroBASINS…')
const src = await open(`${dir}/hybas/hybas_na_lev06_v1c.shp`)
const features = []
let total = 0
for (;;) {
  const r = await src.read()
  if (r.done) break
  total++
  if (!bboxOverlaps(r.value.geometry)) continue
  const pfaf = String(r.value.properties.PFAF_ID)
  const b = baseline.get(pfaf)
  const f = future.get(pfaf)
  features.push({
    type: 'Feature',
    properties: {
      pfafId: pfaf,
      bwsRaw: b ? num(b.bws_raw) : null,
      bwsScore: b ? num(b.bws_score) : null,
      bwsCat: b ? num(b.bws_cat) : null,
      bwsLabel: b ? txt(b.bws_label) : null,
      bau30Raw: f ? num(f.bau30_ws_x_r) : null,
      bau30Score: f ? num(f.bau30_ws_x_s) : null,
      bau30Label: f ? txt(f.bau30_ws_x_l) : null,
      bau50Raw: f ? num(f.bau50_ws_x_r) : null,
      bau50Score: f ? num(f.bau50_ws_x_s) : null,
      bau50Label: f ? txt(f.bau50_ws_x_l) : null,
      bau80Score: f ? num(f.bau80_ws_x_s) : null,
      bau80Label: f ? txt(f.bau80_ws_x_l) : null,
    },
    geometry: cleanGeometry(r.value.geometry),
  })
}

mkdirSync('public/data/aqueduct', { recursive: true })
writeFileSync(
  'public/data/aqueduct/us_basins.geojson',
  JSON.stringify({ type: 'FeatureCollection', features }),
)
writeFileSync(
  'public/data/aqueduct/meta.json',
  JSON.stringify(
    {
      dataset: 'WRI Aqueduct 4.0 (Y2023M07D05 release, download dated 2023-08-07)',
      sourceOrganization: 'World Resources Institute',
      dataStatus: 'REAL DATA',
      license: 'CC BY 4.0 — Aqueduct 4.0 © World Resources Institute (wri.org/aqueduct)',
      geometry:
        'HydroBASINS North America level 6 (© HydroSHEDS/WWF), the sub-basin framework of Aqueduct 4.0 annual indicators, joined by Pfafstetter id',
      fields: {
        baseline: 'bws_raw, bws_score, bws_cat, bws_label',
        future:
          'bau30_ws_x_{r,s,l}, bau50_ws_x_{r,s,l}, bau80_ws_x_{s,l} (Business as Usual)',
      },
      note: 'Basin/sub-basin screening estimates — not parcel-level water availability.',
      sources: [
        'https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip',
        'https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_na_lev06_v1c.zip',
        'https://github.com/wri/Aqueduct40/blob/master/data_dictionary_water-risk-atlas.md',
      ],
      generated: new Date().toISOString().slice(0, 10),
    },
    null,
    2,
  ) + '\n',
)
console.log(`kept ${features.length}/${total} basins (CONUS bbox)`)
