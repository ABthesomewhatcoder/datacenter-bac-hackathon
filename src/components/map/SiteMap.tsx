import { useCallback } from 'react'
import Map, { NavigationControl, ScaleControl } from 'react-map-gl/mapbox'
import type { ViewStateChangeEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { BASEMAPS, useSiteStore } from '../../store/useSiteStore'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

function MissingTokenNotice() {
  return (
    <div className="map-token-notice">
      <div className="map-token-notice__card">
        <h2>Mapbox token required</h2>
        <p>
          Add your access token to <code>.env</code> as{' '}
          <code>VITE_MAPBOX_TOKEN=pk.…</code> and restart the dev server.
        </p>
        <p>
          Tokens are free at{' '}
          <a href="https://account.mapbox.com/" target="_blank" rel="noreferrer">
            account.mapbox.com
          </a>
        </p>
      </div>
    </div>
  )
}

export default function SiteMap() {
  const basemap = useSiteStore((s) => s.basemap)
  const viewState = useSiteStore((s) => s.viewState)
  const setViewState = useSiteStore((s) => s.setViewState)

  const handleMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom } = evt.viewState
      setViewState({ longitude, latitude, zoom })
    },
    [setViewState],
  )

  if (!MAPBOX_TOKEN) {
    return <MissingTokenNotice />
  }

  return (
    <Map
      mapboxAccessToken={MAPBOX_TOKEN}
      {...viewState}
      onMove={handleMove}
      mapStyle={BASEMAPS[basemap].styleUrl}
      style={{ position: 'absolute', inset: 0 }}
      minZoom={2.5}
      maxPitch={60}
    >
      <NavigationControl position="bottom-right" visualizePitch />
      <ScaleControl position="bottom-left" unit="imperial" />
    </Map>
  )
}
