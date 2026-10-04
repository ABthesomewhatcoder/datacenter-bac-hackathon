import { Layer, Source } from 'react-map-gl/mapbox'
import { nlcdTileUrl } from '../../lib/landCover'
import { MODE_THRESHOLDS } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

/**
 * Optional REAL USGS Annual NLCD raster overlay, served straight from the
 * official MRLC WMS as 256px tiles. Low opacity keeps satellite readable.
 * Raster failures degrade to missing tiles only — the exact-site
 * GetFeatureInfo lookup is a separate request path and is unaffected.
 */
export default function LandCoverLayer() {
  const visible = useSiteStore((s) => s.landCoverVisible)
  if (!visible) return null

  return (
    <Source
      id="nlcd-landcover"
      type="raster"
      tiles={[nlcdTileUrl()]}
      tileSize={256}
    >
      <Layer
        id="nlcd-landcover-raster"
        type="raster"
        minzoom={MODE_THRESHOLDS.local - 0.5}
        paint={{
          'raster-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            7, 0,
            7.8, 0.4,
          ],
          'raster-resampling': 'nearest',
        }}
      />
    </Source>
  )
}
