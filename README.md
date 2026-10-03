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
src/
  components/
    layout/Header.tsx            compact top header
    map/SiteMap.tsx              full-screen Mapbox map
    panels/ControlPanel.tsx      left controls (basemap toggle, future layers)
    panels/SiteAnalysisPanel.tsx right analysis panel (empty for now)
  store/useSiteStore.ts          Zustand store (basemap, view state, selection)
```
