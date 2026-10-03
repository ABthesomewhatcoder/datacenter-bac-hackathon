import { Marker } from 'react-map-gl/mapbox'
import { useSiteStore } from '../../store/useSiteStore'

/**
 * Crosshair/target marker for the exact candidate coordinate. Pointer events
 * are disabled so clicking near (or on) the marker re-places the site rather
 * than being swallowed by the marker DOM.
 */
export default function SiteMarker() {
  const selectedSite = useSiteStore((s) => s.selectedSite)
  if (!selectedSite) return null

  return (
    <Marker
      longitude={selectedSite.longitude}
      latitude={selectedSite.latitude}
      anchor="center"
      style={{ pointerEvents: 'none' }}
    >
      <div className="site-marker" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          {/* dark halo for contrast over bright satellite imagery */}
          <circle cx="28" cy="28" r="15" stroke="rgba(6, 10, 14, 0.65)" strokeWidth="5" />
          <circle cx="28" cy="28" r="15" stroke="#35c2c9" strokeWidth="2" />
          {/* crosshair ticks */}
          <g stroke="rgba(6, 10, 14, 0.65)" strokeWidth="5" strokeLinecap="round">
            <line x1="28" y1="3" x2="28" y2="12" />
            <line x1="28" y1="44" x2="28" y2="53" />
            <line x1="3" y1="28" x2="12" y2="28" />
            <line x1="44" y1="28" x2="53" y2="28" />
          </g>
          <g stroke="#35c2c9" strokeWidth="2" strokeLinecap="round">
            <line x1="28" y1="3" x2="28" y2="12" />
            <line x1="28" y1="44" x2="28" y2="53" />
            <line x1="3" y1="28" x2="12" y2="28" />
            <line x1="44" y1="28" x2="53" y2="28" />
          </g>
          {/* center dot */}
          <circle cx="28" cy="28" r="4" fill="rgba(6, 10, 14, 0.65)" />
          <circle cx="28" cy="28" r="2.4" fill="#35c2c9" />
        </svg>
      </div>
    </Marker>
  )
}
