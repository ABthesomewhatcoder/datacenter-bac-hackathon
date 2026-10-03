// Converts the Census 2010 cartographic boundary file (20m resolution) into
// the slim GeoJSON served at public/data/us_states.geojson.
//
// Source: https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_040_00_20m.json
//         (mirror of census.gov gz_2010_us_040_00_20m)
//
// Usage: node scripts/prepare-states.mjs <path-to-raw-census-geojson>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const FIPS_TO_USPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO',
  '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI',
  '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY',
}

const [, , inputPath] = process.argv
if (!inputPath) {
  console.error('usage: node scripts/prepare-states.mjs <raw-census-geojson>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'latin1'))

const round = (n) => Math.round(n * 1e4) / 1e4
const roundCoords = (coords) =>
  typeof coords[0] === 'number'
    ? [round(coords[0]), round(coords[1])]
    : coords.map(roundCoords)

const features = raw.features
  .filter((f) => FIPS_TO_USPS[f.properties.STATE])
  .map((f) => ({
    type: 'Feature',
    properties: {
      id: FIPS_TO_USPS[f.properties.STATE],
      name: f.properties.NAME,
    },
    geometry: {
      type: f.geometry.type,
      coordinates: roundCoords(f.geometry.coordinates),
    },
  }))
  .sort((a, b) => a.properties.id.localeCompare(b.properties.id))

mkdirSync('public/data', { recursive: true })
writeFileSync(
  'public/data/us_states.geojson',
  JSON.stringify({ type: 'FeatureCollection', features }),
)
console.log(`wrote public/data/us_states.geojson with ${features.length} states`)
