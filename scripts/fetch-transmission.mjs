// Fetches REAL transmission-line data from HIFLD (Electric Power
// Transmission Lines) via the public ArcGIS FeatureServer, per state, and
// writes frontend-friendly GeoJSON to public/data/transmission/<USPS>.geojson.
//
// Dataset: HIFLD — Electric Power Transmission Lines
// Service: https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/
//          Electric_Power_Transmission_Lines/FeatureServer/0
//
// The query uses the state's bounding box (envelope intersect), so lines just
// across a border are included — useful for nearest-line checks near edges.
// Geometry is kept as-is except coordinate rounding to 5 decimals (~1 m).
//
// Usage: node scripts/fetch-transmission.mjs OH VA AZ WA WY

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const SERVICE =
  'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query'
const PAGE_SIZE = 2000
const OUT_FIELDS = 'ID,TYPE,STATUS,OWNER,VOLTAGE,VOLT_CLASS'

const states = process.argv.slice(2).map((s) => s.toUpperCase())
if (states.length === 0) {
  console.error('usage: node scripts/fetch-transmission.mjs <USPS...>')
  process.exit(1)
}

const statesGeo = JSON.parse(
  readFileSync('public/data/us_states.geojson', 'utf8'),
)

function bboxOf(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < minX) minX = c[0]
      if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]
      if (c[1] > maxY) maxY = c[1]
      return
    }
    for (const child of c) walk(child)
  }
  walk(feature.geometry.coordinates)
  return [minX, minY, maxX, maxY]
}

const round = (n) => Math.round(n * 1e5) / 1e5
const roundCoords = (coords) =>
  typeof coords[0] === 'number'
    ? [round(coords[0]), round(coords[1])]
    : coords.map(roundCoords)

const cleanText = (v) =>
  v && v !== 'NOT AVAILABLE' && v !== 'UNKNOWN' ? v : null

async function fetchState(usps) {
  const stateFeature = statesGeo.features.find((f) => f.properties.id === usps)
  if (!stateFeature) throw new Error(`unknown state ${usps}`)
  const [xmin, ymin, xmax, ymax] = bboxOf(stateFeature)

  const features = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: JSON.stringify({ xmin, ymin, xmax, ymax }),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outSR: '4326',
      outFields: OUT_FIELDS,
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: 'geojson',
    })
    const res = await fetch(`${SERVICE}?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${usps}`)
    const page = await res.json()
    if (page.error) throw new Error(JSON.stringify(page.error))

    for (const f of page.features) {
      const p = f.properties
      features.push({
        type: 'Feature',
        properties: {
          id: p.ID ?? null,
          type: cleanText(p.TYPE),
          status: cleanText(p.STATUS),
          owner: cleanText(p.OWNER),
          voltage: typeof p.VOLTAGE === 'number' && p.VOLTAGE > 0 ? p.VOLTAGE : null,
          voltClass: cleanText(p.VOLT_CLASS),
        },
        geometry: {
          type: f.geometry.type,
          coordinates: roundCoords(f.geometry.coordinates),
        },
      })
    }
    const more = page.properties?.exceededTransferLimit || page.features.length === PAGE_SIZE
    process.stdout.write(`${usps}: ${features.length} lines\r`)
    if (!more) break
  }
  return features
}

mkdirSync('public/data/transmission', { recursive: true })

const metaPath = 'public/data/transmission/meta.json'
const meta = existsSync(metaPath)
  ? JSON.parse(readFileSync(metaPath, 'utf8'))
  : {
      dataset: 'Electric Power Transmission Lines',
      sourceOrganization: 'HIFLD (Homeland Infrastructure Foundation-Level Data)',
      service:
        'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0',
      datasetLastEdited: '2023-09-05',
      dataStatus: 'REAL DATA',
      references: {
        catalog:
          'https://catalog.data.gov/dataset/electric-power-transmission-lines',
        eiaFaq: 'https://www.eia.gov/tools/faqs/faq.php?id=567&t=1',
        futureEnrichment:
          'https://data.openei.org/submissions/8742 (Berkeley Lab 2026 harmonized transmission dataset)',
      },
      limitations: [
        'Statewide extracts by bounding box; lines just outside a state border are included.',
        'Voltage/owner/status missing on some features (shown as Unknown).',
        'Proximity to a line does not imply available interconnection capacity.',
        'Geometry rounded to 5 decimal places (~1 m).',
      ],
      states: {},
    }

for (const usps of states) {
  const features = await fetchState(usps)
  writeFileSync(
    `public/data/transmission/${usps}.geojson`,
    JSON.stringify({ type: 'FeatureCollection', features }),
  )
  meta.states[usps] = {
    lineCount: features.length,
    generated: new Date().toISOString().slice(0, 10),
  }
  console.log(`${usps}: wrote ${features.length} lines`)
}

writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
console.log('updated', metaPath)
