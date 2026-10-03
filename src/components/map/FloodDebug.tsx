import { useEffect, useState } from 'react'
import { useMap } from 'react-map-gl/mapbox'
import { getMapMode } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

/**
 * Development readout for debugging the FEMA flood chain:
 * toggle → mode gating → request → store → layer → rendered polygons.
 * Hidden unless VITE_DEBUG_GIS=true is set in .env, so it stays out of
 * demos but is one env var away when FEMA acts up.
 */
const DEBUG_GIS = import.meta.env.VITE_DEBUG_GIS === 'true'

export default function FloodDebug() {
  const { current: map } = useMap()
  const visible = useSiteStore((s) => s.floodVisible)
  const zoom = useSiteStore((s) => s.viewState.zoom)
  const loading = useSiteStore((s) => s.floodZonesLoading)
  const error = useSiteStore((s) => s.floodError)
  const floodZones = useSiteStore((s) => s.floodZones)

  const [rendered, setRendered] = useState<number | null>(null)

  useEffect(() => {
    if (!map) return
    const update = () => {
      try {
        const feats = map.getLayer('flood-fill')
          ? map.queryRenderedFeatures({ layers: ['flood-fill'] })
          : []
        setRendered(feats.length)
      } catch {
        setRendered(null)
      }
    }
    map.on('idle', update)
    return () => {
      map.off('idle', update)
    }
  }, [map])

  if (!DEBUG_GIS || !visible) return null

  const status = loading
    ? 'loading'
    : error
      ? 'error'
      : floodZones
        ? 'success'
        : 'idle'

  const bounds = floodZones
    ? floodZones.bounds.map((c) => c.map((n) => n.toFixed(2)).join(',')).join(' → ')
    : '—'

  return (
    <div className="flood-debug mono" role="status">
      <div>FLOOD DEBUG</div>
      <div>enabled: yes · mode: {getMapMode(zoom)} · zoom: {zoom.toFixed(2)}</div>
      <div>
        request: {status}
        {floodZones?.fc.features.length === 8000 ? ' (page cap hit)' : ''}
      </div>
      <div>
        features: {floodZones ? floodZones.fc.features.length : 0} · rendered:{' '}
        {rendered ?? '—'}
      </div>
      <div>cached bounds: {bounds}</div>
      {error && <div>last error: {error}</div>}
    </div>
  )
}
