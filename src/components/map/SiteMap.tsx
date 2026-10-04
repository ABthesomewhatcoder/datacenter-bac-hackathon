import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { NavigationControl, ScaleControl } from 'react-map-gl/mapbox'
import type { MapMouseEvent, MapRef, ViewStateChangeEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { scoreToColor } from '../../lib/colors'
import { featureBounds, featureContains } from '../../lib/geo'
import type { LocalCellScore } from '../../lib/localScoring'
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
import H3SuitabilityLayer, { type H3HoverInfo } from './H3SuitabilityLayer'
import SiteMarker from './SiteMarker'
import TransmissionLayer from './TransmissionLayer'
import FloodLayer from './FloodLayer'
import LandCoverLayer from './LandCoverLayer'
import FloodDebug from './FloodDebug'
import AnalysisRadius from './AnalysisRadius'
import MapTooltip, { scoreRows, type TooltipInfo } from './MapTooltip'

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
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const setSelectedStateId = useSiteStore((s) => s.setSelectedStateId)
  const setSelectedCountyId = useSiteStore((s) => s.setSelectedCountyId)
  const setSelectedH3Index = useSiteStore((s) => s.setSelectedH3Index)
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const setSelectedSite = useSiteStore((s) => s.setSelectedSite)
  const clearSelectedSite = useSiteStore((s) => s.clearSelectedSite)
  const showCountiesFor = useSiteStore((s) => s.showCountiesFor)

  const mapRef = useRef<MapRef>(null)
  const hoveredRef = useRef<HoverTarget | null>(null)
  // Whether the visible tooltip belongs to an H3 cell (deck-owned); the
  // deck layer's null-hover must not clear a county/state tooltip.
  const cellTooltipRef = useRef(false)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const [cursor, setCursor] = useState<string>('grab')

  const mode = getMapMode(viewState.zoom)
  // Local mode hands hover/click to the deck.gl H3 layer.
  const localActive = mode === 'local' && selectedCountyId !== null
  // Site mode turns clicks into exact candidate placement.
  const siteActive = mode === 'site' && selectedCountyId !== null

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

  // Debug handle for development tooling.
  useEffect(() => {
    ;(window as unknown as { __map?: MapRef | null }).__map = mapRef.current
  })

  const handleMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom } = evt.viewState
      setViewState({ longitude, latitude, zoom })
    },
    [setViewState],
  )

  /** When settled past state zoom, load counties for the state in focus. */
  const handleMoveEnd = useCallback(
    (evt: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom } = evt.viewState
      const mode = getMapMode(zoom)
      if (mode === 'state' || !statesGeo) return
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
      if (siteActive) {
        // Site mode: crosshair placement, no region hover feedback.
        setHover(null)
        cellTooltipRef.current = false
        setTooltip(null)
        setCursor('crosshair')
        return
      }
      if (localActive) {
        // The H3 layer owns hover feedback inside the selected county, but
        // neighboring counties stay hoverable (cells are clipped to the
        // county, so a hit on another county is genuinely outside them).
        const neighbor = evt.features?.[0]
        if (neighbor?.layer?.id === COUNTY_FILL_LAYER_ID) {
          const props = neighbor.properties as {
            geoid: string
            name: string
            state: string
          }
          if (props.geoid !== selectedCountyId) {
            const score = countyScores?.[props.geoid]
            setHover({ source: COUNTY_SOURCE_ID, id: props.geoid })
            setCursor('pointer')
            cellTooltipRef.current = false
            setTooltip({
              x: evt.point.x,
              y: evt.point.y,
              title: props.name,
              subtitle: stateNameById[props.state] ?? props.state,
              rows: score ? scoreRows(score) : null,
            })
            return
          }
        }
        setHover(null)
        return
      }
      const feature = evt.features?.[0]
      if (!feature) {
        setHover(null)
        cellTooltipRef.current = false
        setTooltip(null)
        setCursor('grab')
        return
      }
      cellTooltipRef.current = false
      setCursor('pointer')

      if (feature.layer?.id === COUNTY_FILL_LAYER_ID) {
        const props = feature.properties as {
          geoid: string
          name: string
          state: string
        }
        const score = countyScores?.[props.geoid]
        setHover({ source: COUNTY_SOURCE_ID, id: props.geoid })
        setTooltip({
          x: evt.point.x,
          y: evt.point.y,
          title: props.name,
          subtitle: stateNameById[props.state] ?? props.state,
          rows: score ? scoreRows(score) : null,
        })
        return
      }

      const props = feature.properties as { id: string; name: string }
      const score = stateScores?.[props.id]
      setHover({ source: STATE_SOURCE_ID, id: props.id })
      setTooltip({
        x: evt.point.x,
        y: evt.point.y,
        title: props.name,
        rows: score ? scoreRows(score) : null,
      })
    },
    [
      siteActive,
      localActive,
      selectedCountyId,
      setHover,
      stateScores,
      countyScores,
      stateNameById,
    ],
  )

  const handleMouseLeave = useCallback(() => {
    setHover(null)
    cellTooltipRef.current = false
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
          maxZoom: 7.4,
        })
      }
    },
    [statesGeo],
  )

  const zoomToCounty = useCallback((geoid: string) => {
    const feature = useSiteStore
      .getState()
      .scoredCounties?.features.find((f) => f.properties.geoid === geoid)
    if (feature && mapRef.current) {
      mapRef.current.fitBounds(featureBounds(feature), {
        padding: FIT_PADDING,
        duration: 1200,
        maxZoom: 9.5,
      })
    }
  }, [])

  const handleClick = useCallback(
    (evt: MapMouseEvent) => {
      if (siteActive) {
        // Exact placement: use the raw click coordinate, nothing H3-based.
        setSelectedSite({
          latitude: evt.lngLat.lat,
          longitude: evt.lngLat.lng,
        })
        return
      }
      if (localActive) {
        // The H3 layer owns clicks on the selected county's cells, but a
        // click on a DIFFERENT county switches the local view to it.
        const neighbor = evt.features?.[0]
        if (neighbor?.layer?.id === COUNTY_FILL_LAYER_ID) {
          const { geoid, state } = neighbor.properties as {
            geoid: string
            state: string
          }
          if (geoid !== selectedCountyId) {
            if (useSiteStore.getState().selectedStateId !== state) {
              setSelectedStateId(state)
            }
            setSelectedCountyId(geoid)
            zoomToCounty(geoid)
          }
        }
        return
      }

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
        zoomToCounty(geoid)
        return
      }

      const { id } = feature.properties as { id: string }
      setSelectedStateId(id)
      showCountiesFor(id) // prefetch while the zoom animation runs
      zoomToState(id)
    },
    [
      siteActive,
      localActive,
      selectedCountyId,
      setSelectedSite,
      setSelectedStateId,
      setSelectedCountyId,
      showCountiesFor,
      zoomToState,
      zoomToCounty,
    ],
  )

  const countyNameById = useCallback(
    (geoid: string) =>
      scoredCounties?.features.find((f) => f.properties.geoid === geoid)
        ?.properties.name ?? geoid,
    [scoredCounties],
  )

  const handleHoverCell = useCallback(
    (info: H3HoverInfo | null) => {
      if (!info) {
        if (cellTooltipRef.current) {
          cellTooltipRef.current = false
          setTooltip(null)
          setCursor('grab')
        }
        return
      }
      const { cell } = info
      cellTooltipRef.current = true
      setCursor('pointer')
      const row = (label: string, value: number) => ({
        label,
        value,
        color: scoreToColor(value),
      })
      setTooltip({
        x: info.x,
        y: info.y,
        title: selectedCountyId ? countyNameById(selectedCountyId) : 'Local cell',
        subtitle: 'Local analysis · demo data',
        rows: [
          row('Local Suitability', cell.overall),
          row('Land', cell.landScore),
          row('Flood', cell.floodScore),
          row('Transmission', cell.transmissionScore),
          row('Regional baseline', cell.regionalScore),
        ],
      })
    },
    [selectedCountyId, countyNameById],
  )

  const handleClickCell = useCallback(
    (cell: LocalCellScore) => {
      setSelectedH3Index(cell.h3Index)
    },
    [setSelectedH3Index],
  )

  const navigateHome = useCallback(() => {
    setSelectedStateId(null)
    clearSelectedSite()
    setHover(null)
    setTooltip(null)
    mapRef.current?.flyTo({
      center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: INITIAL_VIEW_STATE.zoom,
      duration: 1400,
    })
  }, [setSelectedStateId, clearSelectedSite, setHover])

  const navigateToState = useCallback(
    (id: string) => {
      setSelectedCountyId(null)
      clearSelectedSite()
      setHover(null)
      setTooltip(null)
      zoomToState(id)
    },
    [setSelectedCountyId, clearSelectedSite, setHover, zoomToState],
  )

  const navigateToCounty = useCallback(
    (geoid: string) => {
      setSelectedH3Index(null)
      clearSelectedSite()
      setHover(null)
      setTooltip(null)
      zoomToCounty(geoid)
    },
    [setSelectedH3Index, clearSelectedSite, setHover, zoomToCounty],
  )

  /** Breadcrumb "Local Analysis": drop the site, return to the H3 surface. */
  const navigateToLocal = useCallback(() => {
    clearSelectedSite()
    setHover(null)
    setTooltip(null)
    if (selectedCountyId) zoomToCounty(selectedCountyId)
  }, [clearSelectedSite, setHover, selectedCountyId, zoomToCounty])

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
        <AnalysisRadius />
        <LandCoverLayer />
        <FloodLayer />
        <FloodDebug />
        <TransmissionLayer />
        <H3SuitabilityLayer
          onHoverCell={handleHoverCell}
          onClickCell={handleClickCell}
        />
        <SiteMarker />
        <NavigationControl position="bottom-right" visualizePitch />
        <ScaleControl position="bottom-left" unit="imperial" />
      </Map>
      <Breadcrumb
        onHome={navigateHome}
        onState={navigateToState}
        onCounty={navigateToCounty}
        onLocal={navigateToLocal}
      />
      {siteActive && !selectedSite && (
        <div className="site-instruction" role="status">
          <span className="site-instruction__glyph" aria-hidden="true">
            ⌖
          </span>
          Click map to place candidate site
        </div>
      )}
      {tooltip && <MapTooltip info={tooltip} />}
    </>
  )
}
