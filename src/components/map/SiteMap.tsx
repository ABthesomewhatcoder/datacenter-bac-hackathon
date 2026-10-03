import { useCallback, useEffect, useRef, useState } from 'react'
import Map, { NavigationControl, ScaleControl } from 'react-map-gl/mapbox'
import type { MapMouseEvent, MapRef, ViewStateChangeEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { featureBounds } from '../../lib/geo'
import { BASEMAPS, useSiteStore } from '../../store/useSiteStore'
import StateLayer, { STATE_FILL_LAYER_ID, STATE_SOURCE_ID } from './StateLayer'
import MapTooltip, { type TooltipInfo } from './MapTooltip'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

/** fitBounds padding that keeps the zoomed state clear of the UI panels. */
const FIT_PADDING = { top: 96, bottom: 64, left: 330, right: 370 }

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
  const loadStateData = useSiteStore((s) => s.loadStateData)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const stateScores = useSiteStore((s) => s.stateScores)
  const setSelectedStateId = useSiteStore((s) => s.setSelectedStateId)

  const mapRef = useRef<MapRef>(null)
  const hoveredIdRef = useRef<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const [cursor, setCursor] = useState<string>('grab')

  useEffect(() => {
    loadStateData()
  }, [loadStateData])

  const handleMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom } = evt.viewState
      setViewState({ longitude, latitude, zoom })
    },
    [setViewState],
  )

  const setHoverState = useCallback((id: string | null) => {
    const map = mapRef.current
    if (!map || hoveredIdRef.current === id) return
    // Guarded: the source is briefly absent while a basemap switch reloads
    // the style, and setFeatureState throws on a missing source.
    try {
      if (hoveredIdRef.current !== null) {
        map.setFeatureState(
          { source: STATE_SOURCE_ID, id: hoveredIdRef.current },
          { hover: false },
        )
      }
      if (id !== null) {
        map.setFeatureState({ source: STATE_SOURCE_ID, id }, { hover: true })
      }
    } catch {
      // source not ready yet — hover emphasis resumes on the next move
    }
    hoveredIdRef.current = id
  }, [])

  const handleMouseMove = useCallback(
    (evt: MapMouseEvent) => {
      const feature = evt.features?.[0]
      if (!feature) {
        setHoverState(null)
        setTooltip(null)
        setCursor('grab')
        return
      }
      const { id, name } = feature.properties as { id: string; name: string }
      setHoverState(id)
      setCursor('pointer')
      setTooltip({
        x: evt.point.x,
        y: evt.point.y,
        name,
        score: stateScores?.[id] ?? null,
      })
    },
    [setHoverState, stateScores],
  )

  const handleMouseLeave = useCallback(() => {
    setHoverState(null)
    setTooltip(null)
    setCursor('grab')
  }, [setHoverState])

  const handleClick = useCallback(
    (evt: MapMouseEvent) => {
      const feature = evt.features?.[0]
      if (!feature) {
        setSelectedStateId(null)
        return
      }
      const { id } = feature.properties as { id: string }
      setSelectedStateId(id)

      // fitBounds uses the original (unclipped) geometry, not the
      // tile-clipped feature returned by the event.
      const source = statesGeo?.features.find((f) => f.properties.id === id)
      if (source && mapRef.current) {
        mapRef.current.fitBounds(featureBounds(source), {
          padding: FIT_PADDING,
          duration: 1400,
          maxZoom: 7.5,
        })
      }
    },
    [setSelectedStateId, statesGeo],
  )

  if (!MAPBOX_TOKEN) {
    return <MissingTokenNotice />
  }

  return (
    <>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        {...viewState}
        onMove={handleMove}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        interactiveLayerIds={[STATE_FILL_LAYER_ID]}
        cursor={cursor}
        mapStyle={BASEMAPS[basemap].styleUrl}
        style={{ position: 'absolute', inset: 0 }}
        minZoom={2.5}
        maxPitch={60}
      >
        <StateLayer />
        <NavigationControl position="bottom-right" visualizePitch />
        <ScaleControl position="bottom-left" unit="imperial" />
      </Map>
      {tooltip && <MapTooltip info={tooltip} />}
    </>
  )
}
