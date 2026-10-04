// Builds public/data/regulatory/ from the Moratorium Nation 2026 dataset
// (Bommarito, M.J. 2026 — data CC BY 4.0, code MIT). REAL DATA.
//
//   node scripts/prepare-regulatory-data.mjs
//
// Fetches the two source CSVs + summary stats from GitHub, filters the
// local inventory to data-center-relevant rows, and writes lightweight
// JSON for the frontend so the app never queries GitHub at runtime.
//
// Dataset is a snapshot current through 2026-09-23 — NOT live monitoring.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_RAW = 'https://raw.githubusercontent.com/mjbommar/moratorium-data-2026/main'
const SOURCES = {
  inventory: `${REPO_RAW}/data/moratorium_inventory.csv`,
  stateLegislation: `${REPO_RAW}/data/state_legislation.csv`,
  summaryStats: `${REPO_RAW}/data/summary_stats.json`,
}
const DATASET_CURRENT_THROUGH = '2026-09-23'
const OUT_DIR = 'public/data/regulatory'

/** Minimal RFC 4180 CSV parser (quoted fields may hold commas/newlines). */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows
  return body.map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])),
  )
}

const asNumber = (v) => {
  const n = Number(v)
  return v !== '' && Number.isFinite(n) ? n : null
}
const asJsonArray = (v) => {
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
const orNull = (v) => (v === '' ? null : v)

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  return res.text()
}

const [inventoryCsv, legislationCsv, summaryStatsText] = await Promise.all([
  fetchText(SOURCES.inventory),
  fetchText(SOURCES.stateLegislation),
  fetchText(SOURCES.summaryStats),
])

const inventory = parseCsv(inventoryCsv)
const legislation = parseCsv(legislationCsv)
const summaryStats = JSON.parse(summaryStatsText)

// ---- Local moratoria: keep only rows whose sectors include data_center.
// Rows are instruments (one jurisdiction can have several); lat/lon are
// JURISDICTION CENTROIDS, never parcel coordinates or boundaries.
const ENACTED_STATUSES = ['active', 'extended', 'pending', 'replaced', 'expired', 'rescinded']

const dcRows = inventory.filter((r) =>
  asJsonArray(r.sectors).includes('data_center'),
)

const localMoratoria = dcRows.map((r) => ({
  moratoriumId: r.moratorium_id,
  state: r.state,
  stateAbbrev: r.state_abbrev,
  jurisdiction: r.jurisdiction,
  jurisdictionType: r.jurisdiction_type,
  dateEnactedIso: orNull(r.date_enacted_iso),
  dateEnactedUncertainty: orNull(r.date_enacted_uncertainty),
  durationKind: orNull(r.duration_kind),
  currentEndDateIso: orNull(r.current_end_date_iso),
  enactedStatus: r.enacted_status,
  currentStatus: orNull(r.current_status),
  legalBasis: orNull(r.legal_basis),
  trigger: orNull(r.trigger),
  triggerCategories: asJsonArray(r.trigger_categories),
  affectedProjects: orNull(r.affected_projects),
  outcome: orNull(r.outcome),
  latitude: asNumber(r.latitude),
  longitude: asNumber(r.longitude),
  hasVerifyTags: r.has_verify_tags === 'True',
  verifyCount: asNumber(r.verify_count) ?? 0,
  citeCount: asNumber(r.cite_count) ?? 0,
  activityLevel: orNull(r.activity_level),
  sectors: asJsonArray(r.sectors),
}))

for (const m of localMoratoria) {
  if (!ENACTED_STATUSES.includes(m.enactedStatus)) {
    throw new Error(`Unexpected enacted_status "${m.enactedStatus}" (${m.moratoriumId})`)
  }
}

// ---- State policy actions. NOT all are moratoria — many regulate large
// loads without stopping construction. legal_effect_status is authoritative
// for current operative state; per the codebook an enacted temporary
// measure stays "unknown" until its current legal effect is verified.
const statePolicy = legislation.map((r) => ({
  policyActionId: r.policy_action_id,
  state: r.state,
  stateAbbrev: r.state_abbrev,
  bill: r.bill,
  status: orNull(r.status),
  keyProvisions: orNull(r.key_provisions),
  billStatusCategory: orNull(r.bill_status_category),
  lastActionDateIso: orNull(r.last_action_date_iso),
  policyInstrumentType: orNull(r.policy_instrument_type),
  policyMechanism: orNull(r.policy_mechanism),
  legalEffectStatus: orNull(r.legal_effect_status) ?? 'unknown',
  scopeOfAction: orNull(r.scope_of_action),
  effectiveDateIso: orNull(r.effective_date_iso),
  endCondition: orNull(r.end_condition),
  primarySourceUrl: orNull(r.primary_source_url),
}))

// ---- Per-state aggregates for the national-zoom map + panel summary.
const countBy = (rows, key) => {
  const out = {}
  for (const r of rows) out[r[key]] = (out[r[key]] ?? 0) + 1
  return out
}

const stateSummary = {}
for (const [name, detail] of Object.entries(summaryStats.state_details ?? {})) {
  stateSummary[detail.abbreviation] = {
    state: name,
    activityLevel: detail.activity_level ?? 'None',
    dataCenterMoratoria: { active: 0, extended: 0, pending: 0, replaced: 0, expired: 0, rescinded: 0 },
    dataCenterTotal: 0,
    policyActions: 0,
    policyByLegalEffect: {},
  }
}
for (const m of localMoratoria) {
  const s = stateSummary[m.stateAbbrev]
  if (!s) continue
  s.dataCenterMoratoria[m.enactedStatus] += 1
  s.dataCenterTotal += 1
}
for (const p of statePolicy) {
  const s = stateSummary[p.stateAbbrev]
  if (!s) continue
  s.policyActions += 1
  s.policyByLegalEffect[p.legalEffectStatus] =
    (s.policyByLegalEffect[p.legalEffectStatus] ?? 0) + 1
}

const meta = {
  dataset: 'Moratorium Nation 2026 — U.S. Infrastructure Moratorium Data',
  attribution:
    'Regulatory data: Bommarito, M.J. (2026), Moratorium Nation — CC BY 4.0',
  dataStatus: 'REAL DATA',
  licenses: {
    data: 'CC BY 4.0 — https://github.com/mjbommar/moratorium-data-2026/blob/main/LICENSE-data',
    code: 'MIT — https://github.com/mjbommar/moratorium-data-2026/blob/main/LICENSE-code',
  },
  currentThrough: DATASET_CURRENT_THROUGH,
  generated: new Date().toISOString().slice(0, 10),
  sources: SOURCES,
  documentation: {
    repository: 'https://github.com/mjbommar/moratorium-data-2026',
    codebook: 'https://github.com/mjbommar/moratorium-data-2026/blob/main/docs/codebook.md',
    methodology: 'https://github.com/mjbommar/moratorium-data-2026/blob/main/docs/methodology.md',
    knownGaps: 'https://github.com/mjbommar/moratorium-data-2026/blob/main/docs/known-gaps.md',
    paper: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6242898',
  },
  counts: {
    inventoryTotalRows: inventory.length,
    dataCenterRows: localMoratoria.length,
    dataCenterByStatus: countBy(localMoratoria, 'enactedStatus'),
    statePolicyActions: statePolicy.length,
    statePolicyByLegalEffect: countBy(statePolicy, 'legalEffectStatus'),
  },
  limitations: [
    'Local-government records can be incomplete; small jurisdictions may be missing.',
    'Some records carry unresolved verification flags (has_verify_tags).',
    'Latitude/longitude are jurisdiction CENTROIDS — not parcel coordinates, moratorium boundaries, or proof a given site lies inside the jurisdiction.',
    'Centroid proximity does not establish jurisdictional applicability.',
    'Moratorium counts are not approval probabilities.',
    'Permanent zoning rules are not comprehensively represented.',
    `Policies may have changed after ${DATASET_CURRENT_THROUGH}; verify against current government sources before investment or permitting decisions.`,
  ],
}

mkdirSync(OUT_DIR, { recursive: true })
const write = (name, data) => {
  const path = join(OUT_DIR, name)
  const json = JSON.stringify(data)
  writeFileSync(path, json + '\n')
  console.log(`wrote ${path} (${(json.length / 1024).toFixed(0)} KB)`)
}
write('local_moratoria.json', localMoratoria)
write('state_policy.json', statePolicy)
write('state_summary.json', stateSummary)
write('meta.json', meta)
console.log(
  `data_center rows: ${localMoratoria.length}/${inventory.length};`,
  'status:', JSON.stringify(meta.counts.dataCenterByStatus),
)
