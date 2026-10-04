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

> **Mock vs. real data:** state/county/H3 suitability scores are
> **mock/demo values** for prototyping the navigation flow. Flood, land
> cover, water stress, grid carbon, transmission proximity, and everything
> in the facility simulator derive from the real sources listed below.

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

| Layer / metric | Source | How it's accessed |
| --- | --- | --- |
| Grid carbon intensity | [EPA eGRID2023 Rev. 2](https://www.epa.gov/egrid/summary-data) — subregion polygons + CO2e total output emission rates | Preprocessed by `scripts/prepare-egrid.mjs`, committed in `public/data/egrid/` |
| Water stress | [WRI Aqueduct 4.0](https://www.wri.org/data/aqueduct-global-maps-40-data) — baseline + 2030/2050 BAU projections | Preprocessed by `scripts/prepare-aqueduct.mjs`, committed in `public/data/aqueduct/` |
| Transmission lines | [HIFLD Electric Power Transmission Lines](https://hifld-geoplatform.hub.arcgis.com/) | Fetched per state by `scripts/fetch-transmission.mjs`, committed in `public/data/transmission/` |
| Flood zones | [FEMA National Flood Hazard Layer](https://hazards.fema.gov/) | Live ArcGIS REST queries at runtime |
| Land cover | [USGS Annual NLCD](https://www.mrlc.gov/) | Live WMS queries at runtime |
| State/county geometry | U.S. Census (2010, 20m) | Preprocessed by `scripts/prepare-states.mjs` / `prepare-counties.mjs` |

Facility-simulator methodology: [DOE Data Center Best Practices Guide](https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design_0.pdf)
(PUE definition and reference points), [DOE FEMP cooling/water efficiency guidance](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers),
and [Microsoft's PUE/WUE methodology](https://datacenters.microsoft.com/sustainability/efficiency/)
(WUE = annual liters for cooling/humidification ÷ annual IT equipment kWh).

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
