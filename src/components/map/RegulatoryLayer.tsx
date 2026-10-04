import { useEffect, useMemo, useState } from 'react'
import { Layer, Popup, Source, useMap } from 'react-map-gl/mapbox'
import type { ExpressionSpecification, MapMouseEvent } from 'mapbox-gl'
import type { Feature, FeatureCollection, Point } from 'geojson'
import { MODE_THRESHOLDS } from '../../lib/mapMode'
import {
  ENACTED_STATUS_META,
  loadRegulatoryData,
  triggerCategoryLabel,
  REGULATORY_DATASET,
  type LocalMoratorium,
  type RegulatoryData,
} from '../../lib/regulatory'
import { useSiteStore } from '../../store/useSiteStore'

export const REGULATORY_MARKER_LAYER_ID = 'regulatory-markers'

/** Aggregate state shading below this zoom; jurisdiction markers above. */
const MARKER_MIN_ZOOM = MODE_THRESHOLDS.county

/** Shading by count of active+extended data-center moratoria per state. */
const STATE_ACTIVITY_COLOR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'currentCount'],
  0, 'rgba(110, 118, 129, 0.05)',
  1, 'rgba(233, 194, 63, 0.25)',
  5, 'rgba(238, 108, 77, 0.35)',
  20, 'rgba(229, 72, 77, 0.45)',
  60, 'rgba(179, 37, 45, 0.55)',
]

const STATUS_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'enactedStatus'],
  'active', ENACTED_STATUS_META.active.color,
  'extended', ENACTED_STATUS_META.extended.color,
  'pending', ENACTED_STATUS_META.pending.color,
  'replaced', ENACTED_STATUS_META.replaced.color,
  ENACTED_STATUS_META.expired.color, // expired + rescinded
]

/** active/extended/pending emphasized; historical records subdued. */
const STATUS_RADIUS: ExpressionSpecification = [
  'match',
  ['get', 'enactedStatus'],
  'active', 6,
  'extended', 6,
  'pending', 5,
  3.5,
]
const STATUS_OPACITY: ExpressionSpecification = [
  'match',
  ['get', 'enactedStatus'],
  'active', 0.92,
  'extended', 0.92,
  'pending', 0.85,
  0.38,
]
const STATUS_SORT: ExpressionSpecification = [
  'match',
  ['get', 'enactedStatus'],
  'active', 3,
  'extended', 3,
  'pending', 2,
  1,
]

interface MarkerProps {
  /** Index into data.moratoria — mapbox stringifies nested properties. */
  i: number
  enactedStatus: string
}

function PopupRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="reg-popup__row">
      <span className="reg-popup__label">{label}</span>
      <span className="reg-popup__value">{value}</span>
    </div>
  )
}

/**
 * Optional REAL Moratorium Nation 2026 overlay. National/state zoom shows
 * per-state active+extended data-center moratorium counts (activity, NOT
 * approval probability); closer zooms show jurisdiction-CENTROID markers —
 * centroids are not boundaries and do not imply a site is covered.
 */
export default function RegulatoryLayer() {
  const visible = useSiteStore((s) => s.regulatoryVisible)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const { current: map } = useMap()
  const [data, setData] = useState<RegulatoryData | null>(null)
  const [selected, setSelected] = useState<{
    record: LocalMoratorium
    longitude: number
    latitude: number
  } | null>(null)

  useEffect(() => {
    if (!visible || data) return
    loadRegulatoryData()
      .then(setData)
      .catch(() => {
        // Layer stays empty; the site panel handles its own errors.
      })
  }, [visible, data])

  // Marker click → details popup. Bound directly to the layer so region
  // click-through (state/county selection) keeps working elsewhere.
  useEffect(() => {
    if (!map || !visible || !data) return
    const mapbox = map.getMap()
    const onClick = (e: MapMouseEvent) => {
      const feature = (
        e as MapMouseEvent & {
          features?: Array<{ properties: Record<string, unknown> }>
        }
      ).features?.[0]
      if (!feature) return
      const { i } = feature.properties as unknown as MarkerProps
      const record = data.moratoria[i]
      if (!record || record.longitude === null || record.latitude === null) return
      setSelected({
        record,
        longitude: record.longitude,
        latitude: record.latitude,
      })
    }
    const onEnter = () => {
      mapbox.getCanvas().style.cursor = 'pointer'
    }
    const onLeave = () => {
      mapbox.getCanvas().style.cursor = ''
    }
    mapbox.on('click', REGULATORY_MARKER_LAYER_ID, onClick)
    mapbox.on('mouseenter', REGULATORY_MARKER_LAYER_ID, onEnter)
    mapbox.on('mouseleave', REGULATORY_MARKER_LAYER_ID, onLeave)
    return () => {
      mapbox.off('click', REGULATORY_MARKER_LAYER_ID, onClick)
      mapbox.off('mouseenter', REGULATORY_MARKER_LAYER_ID, onEnter)
      mapbox.off('mouseleave', REGULATORY_MARKER_LAYER_ID, onLeave)
    }
  }, [map, visible, data])

  // Later-mounting layers (counties, flood) would stack above the markers,
  // so keep the regulatory pair pinned to the top of the style. Guarded to
  // only move when out of position — moveLayer itself emits styledata.
  useEffect(() => {
    if (!map || !visible || !data) return
    const mapbox = map.getMap()
    const raise = () => {
      try {
        const layers = mapbox.getStyle()?.layers
        if (!layers || !mapbox.getLayer(REGULATORY_MARKER_LAYER_ID)) return
        if (layers[layers.length - 1]?.id !== REGULATORY_MARKER_LAYER_ID) {
          mapbox.moveLayer(REGULATORY_MARKER_LAYER_ID)
        }
        if (
          mapbox.getLayer('regulatory-state-fill') &&
          layers[layers.length - 2]?.id !== 'regulatory-state-fill'
        ) {
          mapbox.moveLayer('regulatory-state-fill', REGULATORY_MARKER_LAYER_ID)
        }
      } catch {
        // style mid-reload (basemap switch) — retried on the next styledata
      }
    }
    raise()
    mapbox.on('styledata', raise)
    return () => {
      mapbox.off('styledata', raise)
    }
  }, [map, visible, data])

  const stateFill = useMemo(() => {
    if (!data || !statesGeo) return null
    return {
      type: 'FeatureCollection',
      features: statesGeo.features.map((f) => ({
        ...f,
        properties: {
          currentCount: (() => {
            const s = data.stateSummary[f.properties.id]
            return s
              ? s.dataCenterMoratoria.active + s.dataCenterMoratoria.extended
              : 0
          })(),
        },
      })),
    } as FeatureCollection
  }, [data, statesGeo])

  const markers = useMemo(() => {
    if (!data) return null
    const features: Array<Feature<Point, MarkerProps>> = []
    data.moratoria.forEach((m, i) => {
      if (m.latitude === null || m.longitude === null) return
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.longitude, m.latitude] },
        properties: { i, enactedStatus: m.enactedStatus },
      })
    })
    return { type: 'FeatureCollection', features } as FeatureCollection<
      Point,
      MarkerProps
    >
  }, [data])

  if (!visible || !data) return null

  const sel = selected?.record
  const selMeta = sel ? ENACTED_STATUS_META[sel.enactedStatus] : null

  return (
    <>
      {stateFill && (
        <Source id="regulatory-states" type="geojson" data={stateFill}>
          <Layer
            id="regulatory-state-fill"
            type="fill"
            maxzoom={MARKER_MIN_ZOOM}
            paint={{ 'fill-color': STATE_ACTIVITY_COLOR }}
          />
        </Source>
      )}
      {markers && (
        <Source id="regulatory-markers-src" type="geojson" data={markers}>
          <Layer
            id={REGULATORY_MARKER_LAYER_ID}
            type="circle"
            minzoom={MARKER_MIN_ZOOM}
            paint={{
              'circle-color': STATUS_COLOR,
              'circle-radius': STATUS_RADIUS,
              'circle-opacity': STATUS_OPACITY,
              'circle-stroke-color': 'rgba(240, 246, 252, 0.7)',
              'circle-stroke-width': [
                'match',
                ['get', 'enactedStatus'],
                'active', 1,
                'extended', 1,
                0.5,
              ] as ExpressionSpecification,
            }}
            layout={{ 'circle-sort-key': STATUS_SORT }}
          />
        </Source>
      )}
      {sel && selMeta && selected && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          onClose={() => setSelected(null)}
          closeOnClick={false}
          maxWidth="340px"
          className="reg-popup"
        >
          <div className="reg-popup__title">
            {sel.jurisdiction}
            <span className="reg-popup__type">
              {sel.jurisdictionType} · {sel.stateAbbrev}
            </span>
          </div>
          <div
            className="reg-popup__status"
            style={{ color: selMeta.color }}
          >
            {selMeta.label} — {selMeta.meaning}
          </div>
          <PopupRow label="Date enacted" value={sel.dateEnactedIso} />
          {sel.dateEnactedUncertainty && sel.dateEnactedUncertainty !== 'exact' && (
            <PopupRow label="Date certainty" value={sel.dateEnactedUncertainty} />
          )}
          <PopupRow label="Current end" value={sel.currentEndDateIso} />
          {sel.triggerCategories.length > 0 && (
            <PopupRow
              label="Triggers"
              value={sel.triggerCategories.map(triggerCategoryLabel).join(' · ')}
            />
          )}
          <PopupRow label="Affected projects" value={sel.affectedProjects} />
          <PopupRow
            label="Verification"
            value={
              sel.hasVerifyTags
                ? `Source record contains verification flags (${sel.verifyCount} unresolved)`
                : 'No outstanding verification tags'
            }
          />
          <PopupRow label="Legal basis" value={sel.legalBasis} />
          <p className="reg-popup__caveat">
            Marker shows the jurisdiction centroid, not the moratorium
            boundary. {REGULATORY_DATASET.attribution} · current through{' '}
            {REGULATORY_DATASET.currentThrough}.
          </p>
        </Popup>
      )}
    </>
  )
}
