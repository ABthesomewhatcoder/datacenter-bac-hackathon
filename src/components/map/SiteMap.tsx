import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { NavigationControl, ScaleControl } from 'react-map-gl/mapbox'
import type { MapMouseEvent, MapRef, ViewStateChangeEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { featureBounds, featureContains } from '../../lib/geo'
import { getMapMode } from '../../lib/mapMode'
import Breadcrumb from '../layout/Breadcrumb'
import {
  BASEMAPS,
  INITIAL_VIEW_STATE,
  useSiteStore,
} from '../../store/useSiteStore'
import StateLayer, { STATE_FILL_LAYER_ID, STATE_SOURCE_ID } from './StateLayer'
import CountyLayer, {
  COUNTY_FILL_LAYER_ID,
  COUNTY_SOURCE_ID,
} from './CountyLayer'
import MapTooltip, { type TooltipInfo } from './MapTooltip'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

/** fitBounds padding that keeps the zoomed area clear of the UI panels. */
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

interface HoverTarget {
  source: string
  id: string
}

export default function SiteMap() {
  const basemap = useSiteStore((s) => s.basemap)
  const viewState = useSiteStore((s) => s.viewState)
  const setViewState = useSiteStore((s) => s.setViewState)
  const loadStateData = useSiteStore((s) => s.loadStateData)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const stateScores = useSiteStore((s) => s.stateScores)
  const countyScores = useSiteStore((s) => s.countyScores)
  const scoredCounties = useSiteStore((s) => s.scoredCounties)
  const setSelectedStateId = useSiteStore((s) => s.setSelectedStateId)
  const setSelectedCountyId = useSiteStore((s) => s.setSelectedCountyId)
  const showCountiesFor = useSiteStore((s) => s.showCountiesFor)

  const mapRef = useRef<MapRef>(null)
  const hoveredRef = useRef<HoverTarget | null>(null)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const [cursor, setCursor] = useState<string>('grab')

  const stateNameById = useMemo(() => {
    const names: Record<string, string> = {}
    for (const f of statesGeo?.features ?? []) {
      names[f.properties.id] = f.properties.name
    }
    return names
  }, [statesGeo])

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

  /** When settled in county mode, load counties for the state in focus. */
  const handleMoveEnd = useCallback(
    (evt: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom } = evt.viewState
      if (getMapMode(zoom) !== 'county' || !statesGeo) return
      const centerState = statesGeo.features.find((f) =>
        featureContains(f, longitude, latitude),
      )?.properties.id
      const target = centerState ?? useSiteStore.getState().selectedStateId
      if (target) showCountiesFor(target)
    },
    [statesGeo, showCountiesFor],
  )

  const setHover = useCallback((target: HoverTarget | null) => {
    const map = mapRef.current
    const prev = hoveredRef.current
    if (!map || (prev?.source === target?.source && prev?.id === target?.id)) {
      return
    }
    // Guarded: sources are briefly absent while a basemap switch reloads
    // the style, and setFeatureState throws on a missing source.
    try {
      if (prev) {
        map.setFeatureState({ source: prev.source, id: prev.id }, { hover: false })
      }
      if (target) {
        map.setFeatureState(
          { source: target.source, id: target.id },
          { hover: true },
        )
      }
    } catch {
      // source not ready yet — hover emphasis resumes on the next move
    }
    hoveredRef.current = target
  }, [])

  const handleMouseMove = useCallback(
    (evt: MapMouseEvent) => {
      const feature = evt.features?.[0]
      if (!feature) {
        setHover(null)
        setTooltip(null)
        setCursor('grab')
        return
      }
      setCursor('pointer')

      if (feature.layer?.id === COUNTY_FILL_LAYER_ID) {
        const props = feature.properties as {
          geoid: string
          name: string
          state: string
        }
        setHover({ source: COUNTY_SOURCE_ID, id: props.geoid })
        setTooltip({
          x: evt.point.x,
          y: evt.point.y,
          name: props.name,
          subtitle: stateNameById[props.state] ?? props.state,
          score: countyScores?.[props.geoid] ?? null,
        })
        return
      }

      const props = feature.properties as { id: string; name: string }
      setHover({ source: STATE_SOURCE_ID, id: props.id })
      setTooltip({
        x: evt.point.x,
        y: evt.point.y,
        name: props.name,
        score: stateScores?.[props.id] ?? null,
      })
    },
    [setHover, stateScores, countyScores, stateNameById],
  )

  const handleMouseLeave = useCallback(() => {
    setHover(null)
    setTooltip(null)
    setCursor('grab')
  }, [setHover])

  const zoomToState = useCallback(
    (id: string) => {
      const feature = statesGeo?.features.find((f) => f.properties.id === id)
      if (feature && mapRef.current) {
        mapRef.current.fitBounds(featureBounds(feature), {
          padding: FIT_PADDING,
          duration: 1400,
          maxZoom: 7.5,
        })
      }
    },
    [statesGeo],
  )

  const handleClick = useCallback(
    (evt: MapMouseEvent) => {
      const feature = evt.features?.[0]
      if (!feature) {
        setSelectedStateId(null)
        return
      }

      if (feature.layer?.id === COUNTY_FILL_LAYER_ID) {
        const { geoid, state } = feature.properties as {
          geoid: string
          state: string
        }
        if (useSiteStore.getState().selectedStateId !== state) {
          setSelectedStateId(state)
        }
        setSelectedCountyId(geoid)
        // fitBounds uses the original (unclipped) geometry from the store,
        // not the tile-clipped feature returned by the event.
        const source = scoredCounties?.features.find(
          (f) => f.properties.geoid === geoid,
        )
        if (source && mapRef.current) {
          mapRef.current.fitBounds(featureBounds(source), {
            padding: FIT_PADDING,
            duration: 1200,
            maxZoom: 9.5,
          })
        }
        return
      }

      const { id } = feature.properties as { id: string }
      setSelectedStateId(id)
      showCountiesFor(id) // prefetch while the zoom animation runs
      zoomToState(id)
    },
    [
      setSelectedStateId,
      setSelectedCountyId,
      scoredCounties,
      showCountiesFor,
      zoomToState,
    ],
  )

  const navigateHome = useCallback(() => {
    setSelectedStateId(null)
    mapRef.current?.flyTo({
      center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: INITIAL_VIEW_STATE.zoom,
      duration: 1400,
    })
  }, [setSelectedStateId])

  const navigateToState = useCallback(
    (id: string) => {
      setSelectedCountyId(null)
      zoomToState(id)
    },
    [setSelectedCountyId, zoomToState],
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
        onMoveEnd={handleMoveEnd}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        interactiveLayerIds={[COUNTY_FILL_LAYER_ID, STATE_FILL_LAYER_ID]}
        cursor={cursor}
        mapStyle={BASEMAPS[basemap].styleUrl}
        style={{ position: 'absolute', inset: 0 }}
        minZoom={2.5}
        maxPitch={60}
      >
        <StateLayer />
        <CountyLayer />
        <NavigationControl position="bottom-right" visualizePitch />
        <ScaleControl position="bottom-left" unit="imperial" />
      </Map>
      <Breadcrumb onHome={navigateHome} onState={navigateToState} />
      {tooltip && <MapTooltip info={tooltip} />}
    </>
  )
}
