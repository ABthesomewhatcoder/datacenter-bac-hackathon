# Data Center Site Intelligence

Geospatial web app for evaluating U.S. data center sites. Built with React,
TypeScript, Vite, Mapbox GL (via react-map-gl), and Zustand.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Add a Mapbox access token (free at <https://account.mapbox.com/>):

   ```sh
   # .env
   VITE_MAPBOX_TOKEN=pk.your_token_here
   ```

3. Run the dev server:

   ```sh
   npm run dev
   ```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build

## Structure

```
public/data/
  us_states.geojson              state geometry (Census 2010 20m, see scripts/)
  state_scores.json              MOCK suitability scores, joined at runtime
  counties/<USPS>.geojson        per-state county geometry, fetched on demand
  county_scores.json             MOCK county scores keyed by 5-digit GEOID
scripts/
  prepare-states.mjs             regenerates us_states.geojson from Census raw
  prepare-counties.mjs           splits Census counties into per-state files
  generate-county-scores.mjs     regenerates mock county scores
src/
  components/
    layout/Header.tsx            compact top header
    layout/Breadcrumb.tsx        United States › State › County navigation
    map/SiteMap.tsx              full-screen Mapbox map + interactivity
    map/StateLayer.tsx           state suitability choropleth
    map/CountyLayer.tsx          county drilldown choropleth
    map/MapTooltip.tsx           hover tooltip
    panels/ControlPanel.tsx      basemap toggle, active metric, legend
    panels/SiteAnalysisPanel.tsx selected-state metrics
  lib/
    scoring.ts                   metric types, data loading, geometry↔score join
    colors.ts                    score color ramp (map expression + CSS)
    geo.ts                       feature bounds + point-in-polygon
    mapMode.ts                   zoom → mode mapping and fade thresholds
  store/useSiteStore.ts          Zustand store (basemap, metric, selection, data)
```

> State scores are **mock/demo data** — synthetic values for prototyping only.
