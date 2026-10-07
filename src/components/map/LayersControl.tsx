import { useEffect, useRef, useState } from 'react'
import { FLOOD_MIN_ZOOM } from '../../lib/flood'
import { useSiteStore } from '../../store/useSiteStore'

interface LayerToggle {
  label: string
  sub: string
  checked: boolean
  onToggle: () => void
}

/**
 * Compact floating Layers menu over the map (mature-GIS style) so the
 * data overlays don't permanently occupy a panel. Pure presentation over
 * the existing store toggles.
 */
export default function LayersControl() {
  const transmissionVisible = useSiteStore((s) => s.transmissionVisible)
  const toggleTransmission = useSiteStore((s) => s.toggleTransmission)
  const floodVisible = useSiteStore((s) => s.floodVisible)
  const toggleFlood = useSiteStore((s) => s.toggleFlood)
  const floodZonesLoading = useSiteStore((s) => s.floodZonesLoading)
  const floodError = useSiteStore((s) => s.floodError)
  const landCoverVisible = useSiteStore((s) => s.landCoverVisible)
  const toggleLandCover = useSiteStore((s) => s.toggleLandCover)
  const egridVisible = useSiteStore((s) => s.egridVisible)
  const toggleEgrid = useSiteStore((s) => s.toggleEgrid)
  const waterStressVisible = useSiteStore((s) => s.waterStressVisible)
  const toggleWaterStress = useSiteStore((s) => s.toggleWaterStress)
  const regulatoryVisible = useSiteStore((s) => s.regulatoryVisible)
  const toggleRegulatory = useSiteStore((s) => s.toggleRegulatory)
  const zoom = useSiteStore((s) => s.viewState.zoom)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const layers: LayerToggle[] = [
    {
      label: 'Transmission',
      sub: 'HIFLD · real data',
      checked: transmissionVisible,
      onToggle: toggleTransmission,
    },
    {
      label: 'Flood hazard',
      sub: 'FEMA NFHL · real data',
      checked: floodVisible,
      onToggle: toggleFlood,
    },
    {
      label: 'Land cover',
      sub: 'USGS NLCD 2025 · real data',
      checked: landCoverVisible,
      onToggle: toggleLandCover,
    },
    {
      label: 'Grid carbon',
      sub: 'EPA eGRID2023 · real data',
      checked: egridVisible,
      onToggle: toggleEgrid,
    },
    {
      label: 'Water stress',
      sub: 'WRI Aqueduct 4.0 · real data',
      checked: waterStressVisible,
      onToggle: toggleWaterStress,
    },
    {
      label: 'Regulatory activity',
      sub: 'Moratorium Nation · thru 2026-09-23',
      checked: regulatoryVisible,
      onToggle: toggleRegulatory,
    },
  ]

  const activeCount = layers.filter((l) => l.checked).length

  return (
    <div className="layers-control" ref={rootRef}>
      <button
        type="button"
        className={`layers-control__button${open ? ' layers-control__button--open' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        Layers{activeCount > 0 ? ` · ${activeCount}` : ''}
      </button>
      {open && (
        <div className="layers-control__popover" role="group" aria-label="Map layers">
          <div className="layers-control__title">Data layers</div>
          {layers.map((layer) => (
            <div key={layer.label} className="toggle-row">
              <div>
                <div className="toggle-row__label">{layer.label}</div>
                <div className="toggle-row__sub">{layer.sub}</div>
              </div>
              <button
                type="button"
                className={`toggle${layer.checked ? ' toggle--on' : ''}`}
                role="switch"
                aria-checked={layer.checked}
                aria-label={`Toggle ${layer.label}`}
                onClick={layer.onToggle}
              >
                <span className="toggle__thumb" />
              </button>
            </div>
          ))}
          {floodVisible && zoom < FLOOD_MIN_ZOOM && (
            <p className="toggle-status">Zoom in to view FEMA flood hazards</p>
          )}
          {floodVisible && floodZonesLoading && (
            <p className="toggle-status">Loading FEMA flood data…</p>
          )}
          {floodVisible && !floodZonesLoading && floodError && (
            <p className="toggle-status toggle-status--error">
              FEMA flood data temporarily unavailable
            </p>
          )}
        </div>
      )}
    </div>
  )
}
