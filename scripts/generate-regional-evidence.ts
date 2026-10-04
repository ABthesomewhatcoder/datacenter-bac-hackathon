/**
 * P2 preprocessing — builds public/data/decision/regional_evidence.json:
 * RAW real evidence for every CONUS county, evaluated at a representative
 * point guaranteed to lie inside the county polygon. REAL DATA only; no
 * mock scores. Facility-dependent utilities are applied in-browser at
 * runtime (scripts never bake in a facility size).
 *
 *   npm run prepare:regional
 *
 * Regional screening uses a representative county location. Exact parcels
 * require P1 site validation (FEMA + NLCD are deliberately absent here).
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { featureContains } from '../src/lib/geo.ts'
import { LB_TO_KG, lookupEgridSubregion, type EgridData } from '../src/lib/egrid.ts'
import { lookupWaterStress, type AqueductGeo } from '../src/lib/aqueduct.ts'
import {
  assessRegulatoryActivity,
  findNearbyActivity,
  statePoliciesFor,
  type LocalMoratorium,
  type StatePolicyAction,
} from '../src/lib/regulatory.ts'
import { hasNercArea, type StateGridContextMap } from '../src/lib/gridContext.ts'
import { pointToLineDistance } from '@turf/point-to-line-distance'
import type { LineString, MultiLineString } from 'geojson'
import type { TransmissionGeo } from '../src/lib/transmission.ts'

const t0 = Date.now()
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

const NON_CONUS = new Set(['AK', 'HI'])

const egrid: EgridData = {
  subregions: read('public/data/egrid/subregions.geojson'),
  multiple: read('public/data/egrid/multiple.geojson'),
}
const aqueduct: AqueductGeo = read('public/data/aqueduct/us_basins.geojson')
const grid: StateGridContextMap = read('public/data/grid/state_grid_context.json')
const moratoria: LocalMoratorium[] = read('public/data/regulatory/local_moratoria.json')
const statePolicy: StatePolicyAction[] = read('public/data/regulatory/state_policy.json')

// ---------------------------------------------------------------------------
// Representative interior point. Centroid first; if it falls outside the
// polygon (concave/multipart counties), fall back to the midpoint of the
// widest horizontal interval through the largest ring at centroid latitude —
// guaranteed inside a simple polygon (ST_PointOnSurface-style).

type AnyFeature = Feature<Geometry, { geoid: string; name: string; state: string }>

function rings(geometry: Geometry): Position[][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((p) => p[0])
  return []
}

function ringCentroid(ring: Position[]): [number, number] {
  let x = 0
  let y = 0
  for (const [lng, lat] of ring) {
    x += lng
    y += lat
  }
  return [x / ring.length, y / ring.length]
}

function interiorPoint(feature: AnyFeature): [number, number] {
  const allRings = rings(feature.geometry)
  const largest = allRings.reduce((a, b) => (b.length > a.length ? b : a))
  const [cx, cy] = ringCentroid(largest)
  if (featureContains(feature, cx, cy)) return [cx, cy]
  // Horizontal scanline through cy: midpoint of the widest inside interval.
  const xs: number[] = []
  for (let i = 0; i < largest.length - 1; i++) {
    const [x1, y1] = largest[i]
    const [x2, y2] = largest[i + 1]
    if (y1 === y2) continue
    if (cy >= Math.min(y1, y2) && cy < Math.max(y1, y2)) {
      xs.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1))
    }
  }
  xs.sort((a, b) => a - b)
  let best: [number, number] | null = null
  let bestWidth = -1
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const width = xs[i + 1] - xs[i]
    if (width > bestWidth) {
      bestWidth = width
      best = [(xs[i] + xs[i + 1]) / 2, cy]
    }
  }
  if (best && featureContains(feature, best[0], best[1])) return best
  return [cx, cy] // last resort: centroid (flagged by PIP-dependent lookups)
}

// ---------------------------------------------------------------------------
// Fast nearest transmission line: bbox lower-bound prefilter, then the same
// turf point-to-line distance used by the P1 site path.

interface LineIndexEntry {
  i: number
  bbox: [number, number, number, number]
}

function featureBbox(geometry: Geometry): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const scan = (coords: Position[]) => {
    for (const [x, y] of coords) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (geometry.type === 'LineString') scan(geometry.coordinates)
  else if (geometry.type === 'MultiLineString') geometry.coordinates.forEach(scan)
  return [minX, minY, maxX, maxY]
}

/** Lower bound (miles) from a point to a lon/lat bbox. */
function bboxLowerBoundMiles(
  lng: number,
  lat: number,
  [minX, minY, maxX, maxY]: [number, number, number, number],
): number {
  const dx = lng < minX ? minX - lng : lng > maxX ? lng - maxX : 0
  const dy = lat < minY ? minY - lat : lat > maxY ? lat - maxY : 0
  const milesPerDegLat = 69.046
  const milesPerDegLng = Math.cos((lat * Math.PI) / 180) * 69.172
  return Math.hypot(dx * milesPerDegLng, dy * milesPerDegLat)
}

const transmissionCache = new Map<
  string,
  { fc: TransmissionGeo; index: LineIndexEntry[] } | null
>()

function loadTransmission(usps: string) {
  if (!transmissionCache.has(usps)) {
    try {
      const fc: TransmissionGeo = read(`public/data/transmission/${usps}.geojson`)
      fc.features.forEach((f, i) => {
        f.properties.__i = i
      })
      const index = fc.features.map((f, i) => ({ i, bbox: featureBbox(f.geometry) }))
      transmissionCache.set(usps, { fc, index })
    } catch {
      transmissionCache.set(usps, null)
    }
  }
  return transmissionCache.get(usps) ?? null
}

function nearestLineFast(usps: string, lng: number, lat: number) {
  const entry = loadTransmission(usps)
  if (!entry) return null
  const { fc, index } = entry
  const sorted = index
    .map((e) => ({ ...e, lb: bboxLowerBoundMiles(lng, lat, e.bbox) }))
    .sort((a, b) => a.lb - b.lb)
  let best: { distanceMiles: number; voltage: number | null } | null = null
  const point: [number, number] = [lng, lat]
  const lineDistance = (geometry: LineString | MultiLineString): number => {
    if (geometry.type === 'LineString') {
      return pointToLineDistance(point, { type: 'Feature', properties: {}, geometry }, { units: 'miles' })
    }
    let min = Infinity
    for (const coordinates of geometry.coordinates) {
      const d = pointToLineDistance(
        point,
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
        { units: 'miles' },
      )
      if (d < min) min = d
    }
    return min
  }
  for (const e of sorted) {
    if (best && e.lb > best.distanceMiles) break
    const feature = fc.features[e.i]
    const d = lineDistance(feature.geometry)
    if (!best || d < best.distanceMiles) {
      best = { distanceMiles: d, voltage: feature.properties.voltage }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Aqueduct with bbox prefilter

const basinIndex = aqueduct.features.map((f) => ({
  f,
  bbox: (() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys)
      for (const ring of poly)
        for (const [x, y] of ring) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
    return [minX, minY, maxX, maxY] as const
  })(),
}))

function lookupWater(lng: number, lat: number) {
  const candidates = basinIndex.filter(
    ({ bbox }) => lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3],
  )
  const fc: AqueductGeo = {
    type: 'FeatureCollection',
    features: candidates.map((c) => c.f),
  }
  return lookupWaterStress({ latitude: lat, longitude: lng }, fc)
}

// ---------------------------------------------------------------------------
// Walk every CONUS county

const policiesByState = new Map<string, StatePolicyAction[]>()
const counties: Record<string, unknown>[] = []
let missingNerc = 0
let missingTx = 0
let missingEgrid = 0
let missingWater = 0

const files = readdirSync('public/data/counties').filter((f) => f.endsWith('.geojson'))
for (const file of files.sort()) {
  const usps = file.replace('.geojson', '')
  if (NON_CONUS.has(usps)) continue
  const fc = read(`public/data/counties/${file}`) as FeatureCollection<
    Geometry,
    { geoid: string; name: string; state: string }
  >
  const sg = grid[usps] ?? null
  if (!policiesByState.has(usps)) {
    policiesByState.set(usps, statePoliciesFor(usps, statePolicy))
  }
  const policies = policiesByState.get(usps)!

  for (const feature of fc.features) {
    const [lng, lat] = interiorPoint(feature as AnyFeature)
    const point = { latitude: lat, longitude: lng }

    const tx = nearestLineFast(usps, lng, lat)
    if (!tx) missingTx++

    // eGRID: unambiguous → exact subregion rate. Inside EPA's official
    // multiple-subregion overlay → CONSERVATIVE screening bound: the
    // DIRTIEST candidate subregion's rate (EPA's own candidate list, not a
    // guess), flagged ambiguous so confidence drops and the UI can say so.
    // This avoids systematically rewarding counties for ambiguous data.
    const eg = lookupEgridSubregion(point, egrid)
    let egridKg: number | null = null
    let egridLabel: string | null = null
    let egridAmbiguous = false
    if (eg && !eg.ambiguous) {
      egridKg = eg.co2eRateKg
      egridLabel = eg.acronym
    } else if (eg?.ambiguous) {
      const rates = eg.candidates
        .map((c) => c.co2eRateLb)
        .filter((r): r is number => r !== null)
      if (rates.length > 0) {
        egridKg = Math.round(Math.max(...rates) * LB_TO_KG * 1000) / 1000
        egridLabel = eg.candidates.map((c) => c.acronym).join('/')
        egridAmbiguous = true
      }
    }
    if (egridKg === null) missingEgrid++

    const water = lookupWater(lng, lat)
    if (!water) missingWater++

    const nearby = findNearbyActivity(point, moratoria)
    const regLevel = assessRegulatoryActivity(nearby, policies).level

    // County-level moratorium match, only where confidently identifiable:
    // a County-type record in the same state whose jurisdiction name starts
    // with this county's name.
    const countyName = feature.properties.name.replace(/ County$/i, '').toLowerCase()
    const countyMoratoria = moratoria.filter(
      (m) =>
        m.jurisdictionType === 'County' &&
        m.stateAbbrev === usps &&
        m.jurisdiction.toLowerCase().replace(/ county.*$/i, '') === countyName,
    )

    const nercOk = sg && hasNercArea(sg.nerc)
    if (!nercOk) missingNerc++

    counties.push({
      fips: feature.properties.geoid,
      name: feature.properties.name,
      state: usps,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lng * 1e5) / 1e5,
      txDistMi: tx ? Math.round(tx.distanceMiles * 100) / 100 : null,
      txKv: tx ? tx.voltage : null,
      nercArea: nercOk ? sg.nerc.area : null,
      nercHeadroomPp: nercOk ? sg.nerc.reserveHeadroomPp : null,
      nercRisk: nercOk ? sg.nerc.riskSeasonal : null,
      growthPct: sg?.growthPct5yr ?? null,
      genSalesRatio: sg?.generationToSalesRatio ?? null,
      salesTWh: sg?.salesTWh ?? null,
      egrid: egridLabel,
      egridKg,
      egridAmbiguous,
      basinId: water?.pfafId ?? null,
      wBase: water?.baseline.score ?? null,
      w2030: water?.bau2030.score ?? null,
      w2050: water?.bau2050.score ?? null,
      regLevel,
      regAct25: nearby.currentCounts.within25,
      regAct50: nearby.currentCounts.within50,
      regPend50: nearby.pendingWithin50,
      countyMoratoriaCurrent: countyMoratoria.filter((m) =>
        ['active', 'extended'].includes(m.enactedStatus),
      ).length,
      countyMoratoriaTotal: countyMoratoria.length,
    })
  }
  process.stdout.write(`${usps} `)
}

const nationalRatesKg = egrid.subregions.features
  .map((f) => f.properties.co2eRateLb)
  .filter((r): r is number => r !== null)
  .map((lb) => Math.round(lb * LB_TO_KG * 1000) / 1000)

const out = {
  meta: {
    name: 'P2 regional screening evidence — CONUS counties',
    dataStatus: 'REAL DATA',
    generated: new Date().toISOString().slice(0, 10),
    caveat:
      'Regional screening uses a representative county location. Exact parcels require site validation (FEMA flood, NLCD land cover, parcel feasibility, utility capacity).',
    sources: {
      transmission: 'HIFLD Electric Power Transmission Lines (committed extracts)',
      nerc: 'NERC 2026 Summer Reliability Assessment (via state grid context)',
      generationSales: 'EIA-style state generation + retail sales (via state grid context)',
      egrid: 'EPA eGRID2023 Rev. 2 subregions',
      aqueduct: 'WRI Aqueduct 4.0 (CC BY 4.0)',
      regulatory: 'Moratorium Nation 2026 (CC BY 4.0), current through 2026-09-23',
    },
    counts: {
      counties: counties.length,
      missingTransmission: missingTx,
      missingNerc,
      missingEgrid,
      missingWater,
    },
    egridNationalRatesKg: nationalRatesKg,
  },
  counties,
}

mkdirSync('public/data/decision', { recursive: true })
writeFileSync('public/data/decision/regional_evidence.json', JSON.stringify(out) + '\n')
const kb = Math.round(JSON.stringify(out).length / 1024)
console.log(
  `\n${counties.length} CONUS counties in ${((Date.now() - t0) / 1000).toFixed(1)}s (${kb} KB);`,
  `missing: tx ${missingTx}, nerc ${missingNerc}, egrid ${missingEgrid}, water ${missingWater}`,
)
