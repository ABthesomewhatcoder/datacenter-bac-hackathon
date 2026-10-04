# Data Center Site Intelligence

Interactive geospatial app for screening U.S. data center sites. Zoom from a
nationwide suitability view down to a specific parcel, drop a pin, and get a
site report built from **real federal and institutional datasets** — grid
carbon intensity, water stress, flood risk, land cover, and transmission
proximity — then simulate a hypothetical AI data center at that location.

Built with React 19, TypeScript, Vite, Mapbox GL (via react-map-gl),
deck.gl, Zustand, and Turf.

## Features

- **Progressive map disclosure** — nationwide state choropleth → county
  drilldown → H3 cell view → candidate site, with the transmission backbone
  appearing from state zoom onward.
- **Candidate site analysis** — click anywhere to drop a site pin and get:
  - Nearest transmission line (distance, voltage, owner, status)
  - FEMA flood-zone screening (PASS / WARNING / FAIL)
  - USGS NLCD land-cover screening at the point and analysis radius
  - EPA eGRID subregion + CO2e grid carbon intensity
  - WRI Aqueduct basin water stress (baseline, 2030 BAU, 2050 BAU)
- **Facility simulator** — model a hypothetical facility at the selected
  site: choose IT capacity (100/250/500 MW or custom), PUE, and WUE
  (Microsoft FY25 benchmark presets: 0.27 global, 0.34 Americas), and get
  total facility load, annual electricity (TWh/yr), annual operational CO2e
  from the site's real eGRID rate, and annual cooling/humidification water —
  with real Aqueduct water-stress context alongside. The UI explicitly
  separates **scenario inputs** from **real site data**.

## Real vs. mock data

Every metric in the app is explicitly labeled. The split today:

| Data | Status | Notes |
| --- | --- | --- |
| Grid carbon intensity (eGRID subregion + CO2e rate) | ✅ **REAL** | EPA eGRID2023 Rev. 2 |
| Water stress (baseline, 2030/2050 BAU) | ✅ **REAL** | WRI Aqueduct 4.0 |
| Flood-zone screening | ✅ **REAL** | FEMA NFHL, queried live |
| Land-cover screening | ✅ **REAL** | USGS Annual NLCD 2025, queried live |
| Transmission lines + nearest-line proximity | ✅ **REAL** | HIFLD, all 48 contiguous states + DC |
| State/county geometry | ✅ **REAL** | U.S. Census |
| Facility-simulator outputs | ✅ **REAL formulas** | DOE/EPA/Microsoft methodology; carbon uses the site's real eGRID rate. IT capacity, PUE, and WUE are user **scenario assumptions**, labeled as such in the UI |
| Regulatory / moratorium activity | ✅ **REAL** | Moratorium Nation 2026 snapshot (through 2026-09-23); record coordinates are jurisdiction **centroids** — proximity is discovery context, never legal applicability |
| Power & grid context (generation/sales balance, demand growth, NERC reserve margins, facility burden) | ✅ **REAL** | EIA-style state generation + sales data and NERC 2026 SRA margins; generation balance is an accounting figure, **not** spare capacity, and the facility-burden share is a scenario output |
| Sustainable Site Score (decision engine) | ✅ **REAL inputs only** | Hard constraints (NLCD water/wetlands/ice, FEMA floodway/V-VE) then five pillars aggregated by weighted geometric mean, with a separate evidence-confidence figure; zero mock inputs — demo scores never enter it |
| Regional Opportunity Score (nationwide screening) | ✅ **REAL** | 3,109 CONUS counties scored from precomputed raw evidence with the same P1 utilities (minus FEMA/NLCD, which stay exact-site); drives the map's Overall view and the Top Regional Candidates list. Representative county points — not parcels |
| State/county map "Overall" view | ✅ **REAL** | Now the Regional Opportunity Score (county) and its state median (State Regional Screening Summary) |
| State/county Power·Water·Buildability metric views | ⚠️ **MOCK** | Synthetic demo values (`state_scores.json`, `county_scores.json`), labeled mock in tooltips and panels |
| H3 cell scores + local power/water scores | ⚠️ **MOCK** | Synthetic demo values for prototyping the drilldown flow |

Mock scores exist only to prototype the national → state → county → cell
navigation; they are not derived from any real dataset and are flagged
"MOCK / DEMO" in the UI. All candidate-site assessments and simulator math
use the real sources below.

## Run locally

Prerequisites: **Node.js 22+** and npm.

1. Clone and install:

   ```sh
   git clone https://github.com/ABthesomewhatcoder/datacenter-bac-hackathon.git
   cd datacenter-bac-hackathon
   npm install
   ```

2. Add a Mapbox access token (free at <https://account.mapbox.com/>):

   ```sh
   cp .env.example .env
   # then edit .env and set:
   # VITE_MAPBOX_TOKEN=pk.your_token_here
   ```

3. Start the dev server:

   ```sh
   npm run dev
   ```

   Open the printed URL (default <http://localhost:5173>).

That's it — all geospatial datasets (eGRID, Aqueduct, transmission, state
and county geometry) are preprocessed and committed under `public/data/`,
so no downloads or API keys are needed beyond the Mapbox token. FEMA flood
and USGS NLCD land-cover lookups call free public government APIs at
runtime (no key required).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build
- `npm run lint` — run oxlint
- `npm run test:sim` — unit tests for the facility-simulator formulas
  (plain Node, no test framework)

## Data sources

Every source used anywhere in the product, at a glance:

| Source | Used for | Access |
| --- | --- | --- |
| EPA eGRID2023 Rev. 2 | Grid carbon intensity (site context, simulator CO2e, carbon pillar, map overlay) | Preprocessed, committed |
| WRI Aqueduct 4.0 (+ HydroSHEDS basins) | Water stress baseline/2030/2050 (site context, water pillar, map overlay) | Preprocessed, committed |
| HIFLD Transmission Lines | Nearest-line distance/voltage (site + regional screening, map layer) | Preprocessed, committed |
| FEMA National Flood Hazard Layer | Flood zones, hard exclusions, physical pillar | Live API at runtime |
| USGS Annual NLCD 2025 (Collection 1.2) | Land cover, hard exclusions, physical pillar | Live API at runtime |
| Moratorium Nation 2026 | Local moratoria + state policy (regulatory context, community pillar, map layer) | Preprocessed, committed |
| NERC 2026 Summer Reliability Assessment | Reserve margins + seasonal risk (power pillar, grid context) | Hand-extracted, committed |
| EIA-style state generation & retail sales | Generation/sales balance, demand growth, facility burden | Committed in `data-sources/` |
| U.S. Census boundaries (2010, 20m) | State/county geometry + representative points | Preprocessed, committed |
| DOE / EPA / Microsoft methodology docs | Simulator formulas and PUE/WUE benchmarks | Cited methodology |
| Mapbox (© Mapbox/OpenStreetMap/Maxar) | Satellite + dark basemaps | Runtime, needs free token |

### EPA eGRID2023 Revision 2 (grid carbon intensity)

Subregion polygons + CO2e **total output** emission rates (field SRC2ERTA —
not non-baseload). Preprocessed by `scripts/prepare-egrid.mjs`, committed
in `public/data/egrid/`.

- <https://www.epa.gov/egrid/summary-data>
- <https://www.epa.gov/system/files/documents/2025-06/egrid2023_data_rev2.xlsx>
- <https://www.epa.gov/system/files/other-files/2025-01/egrid2023_subregions.zip>
- <https://www.epa.gov/system/files/other-files/2025-01/egrid2023_multiple_subregions.zip>

### WRI Aqueduct 4.0 (water stress)

Baseline water stress + 2030/2050/2080 Business-as-Usual projections on
HydroBASINS level-6 sub-basins. CC BY 4.0 © World Resources Institute.
Preprocessed by `scripts/prepare-aqueduct.mjs`, committed in
`public/data/aqueduct/`.

- <https://www.wri.org/data/aqueduct-global-maps-40-data>
- <https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip>
- <https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_na_lev06_v1c.zip> (basin geometry © HydroSHEDS/WWF)
- <https://github.com/wri/Aqueduct40/blob/master/data_dictionary_water-risk-atlas.md>

### HIFLD Electric Power Transmission Lines (transmission)

Statewide extracts for all 48 contiguous states + DC, fetched by
`scripts/fetch-transmission.mjs`, committed in `public/data/transmission/`.

- Service: <https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0>
- Catalog: <https://catalog.data.gov/dataset/electric-power-transmission-lines>

### FEMA National Flood Hazard Layer (flood zones)

Flood Hazard Zones (S_FLD_HAZ_AR, layer 28), queried **live at runtime**
from the public ArcGIS REST service — no key required.

- <https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28>

### USGS Annual NLCD, Collection 1.2 (land cover)

2025 land cover at 30 m resolution, queried **live at runtime** from the
official USGS/MRLC GeoServer WMS — no key required.

- Product: <https://www.usgs.gov/data/annual-national-land-cover-database-nlcd-collection-1-products-ver-12-june-2026>
- WMS: <https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wms>
- Legend: <https://www.mrlc.gov/data/type/land-cover>

### U.S. Census (state/county geometry)

2010 cartographic boundaries (20m), preprocessed by
`scripts/prepare-states.mjs` / `scripts/prepare-counties.mjs`.

### Moratorium Nation 2026 (regulatory / moratorium intelligence)

Local data-center moratorium inventory + state policy tracker by
Michael J. Bommarito. Data CC BY 4.0, code MIT; snapshot **current through
September 23, 2026** — not live legislative monitoring. Preprocessed by
`scripts/prepare-regulatory-data.mjs`, committed in `public/data/regulatory/`.
Record coordinates are jurisdiction centroids; centroid proximity never
establishes that a site is legally subject to a moratorium.

- <https://github.com/mjbommar/moratorium-data-2026>
- <https://raw.githubusercontent.com/mjbommar/moratorium-data-2026/main/data/moratorium_inventory.csv>
- <https://raw.githubusercontent.com/mjbommar/moratorium-data-2026/main/data/state_legislation.csv>
- Codebook: <https://github.com/mjbommar/moratorium-data-2026/blob/main/docs/codebook.md>
- Methodology / known gaps: <https://github.com/mjbommar/moratorium-data-2026/blob/main/docs/methodology.md> · <https://github.com/mjbommar/moratorium-data-2026/blob/main/docs/known-gaps.md>
- Paper: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6242898>

Attribution: *Regulatory data: Bommarito, M.J. (2026), Moratorium Nation — CC BY 4.0.*

### Power & grid context (EIA-style state data + NERC)

Per-state generation (annual net generation, Total Electric Power
Industry / Total, latest year 2024) and retail sales with 5-year growth —
committed as `data-sources/annual_energy_supply.json` and
`data-sources/state_electricity_demand.json` — joined with NERC Summer
2026 reserve margins by `scripts/prepare-grid-context.mjs` into
`public/data/grid/`. The NERC Anticipated Reserve Margin / Reference
Margin Level values for all 22 assessment areas were extracted from the
2026 SRA's Demand and Resource Tables (pp. 45–55) into
`data-sources/nerc_sra_2026_margins.json` with the Key Findings risk
classification. States split across NERC assessment areas are reported
as "NERC regional context unavailable" rather than guessed. Annual
generation balance (generation − sales) is an energy accounting figure —
never spare capacity or available power.

- NERC 2026 Summer Reliability Assessment: <https://www.nerc.com/globalassets/our-work/assessments/nerc_sra_2026.pdf>
- NERC 2025 Long-Term Reliability Assessment: <https://www.nerc.com/globalassets/our-work/assessments/nerc_ltra_2025.pdf>
- 2026 SRA data instructions: <https://www.nerc.com/globalassets/who-we-are/standing-committees/rstc/ras/2026_sra_data_instructions.pdf>

### Facility-simulator methodology

- [DOE Data Center Best Practices Guide](https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design_0.pdf) — PUE definition and reference points (1.6 Standard / 1.4 Good / 1.1 Better)
- [DOE FEMP cooling/water efficiency guidance](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers)
- [Microsoft PUE/WUE methodology and FY25 benchmarks](https://datacenters.microsoft.com/sustainability/efficiency/) — WUE = annual liters for cooling/humidification ÷ annual IT equipment kWh; FY25 WUE 0.27 L/kWh global, 0.34 L/kWh Americas (used as scenario presets, not site measurements)

### Basemaps

Map rendering via Mapbox GL (`satellite-streets-v12`, `dark-v11` styles) —
imagery/tiles © Mapbox, © OpenStreetMap contributors, © Maxar. Requires a
free Mapbox token (the only credential in the project).

## Structure

```
public/data/
  us_states.geojson              state geometry (Census 2010 20m)
  state_scores.json              MOCK suitability scores
  counties/<USPS>.geojson        per-state county geometry
  county_scores.json             MOCK county scores keyed by 5-digit GEOID
  egrid/                         EPA eGRID2023 subregions + emission rates (REAL)
  aqueduct/                      WRI Aqueduct 4.0 U.S. basins (REAL)
  transmission/<USPS>.geojson    HIFLD transmission lines per state (REAL)
scripts/
  prepare-states.mjs             regenerates us_states.geojson from Census raw
  prepare-counties.mjs           splits Census counties into per-state files
  generate-county-scores.mjs     regenerates mock county scores
  prepare-egrid.mjs              builds eGRID polygons + rates from EPA files
  prepare-aqueduct.mjs           builds U.S. basin subset from WRI Aqueduct 4.0
  fetch-transmission.mjs         downloads HIFLD transmission lines per state
  test-simulation.ts             unit tests for simulation formulas
src/
  components/
    layout/                      header + United States › State › County breadcrumb
    map/                         Mapbox map, choropleths, H3 cells, and the
                                 flood / land-cover / eGRID / water-stress /
                                 transmission overlay layers
    panels/ControlPanel.tsx      basemap toggle, active metric, layer toggles, legend
    panels/SiteAnalysisPanel.tsx selected-site / state report
    panels/FacilitySimulator.tsx facility scenario simulator
  lib/
    simulation.ts                facility-simulator formulas (pure, tested)
    egrid.ts                     eGRID loading + point-in-polygon lookup
    aqueduct.ts                  Aqueduct loading + basin lookup
    flood.ts                     FEMA NFHL live queries + constraint logic
    landCover.ts                 USGS NLCD live queries + constraint logic
    transmission.ts              transmission loading + nearest-line search
    scoring.ts / localScoring.ts metric types and (mock) score joins
    colors.ts, geo.ts, mapMode.ts color ramps, geometry helpers, zoom modes
  store/useSiteStore.ts          Zustand store (selection, layers, assessments,
                                 simulator inputs)
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_MAPBOX_TOKEN` | Yes | Mapbox GL basemap rendering |
| `VITE_DEBUG_GIS` | No | Show GIS debug readouts (FEMA request chain) |
