import { useMemo } from 'react'
import { useControl } from 'react-map-gl/mapbox'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import type { DeckProps, PickingInfo } from '@deck.gl/core'
import { scoreToRgb } from '../../lib/colors'
import {
  generateLocalCells,
  localMetricValue,
  type LocalCellScore,
} from '../../lib/localScoring'
import { H3_FADE_RANGE } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

export interface H3HoverInfo {
  x: number
  y: number
  cell: LocalCellScore
}

interface H3SuitabilityLayerProps {
  onHoverCell: (info: H3HoverInfo | null) => void
  onClickCell: (cell: LocalCellScore) => void
}

/**
 * Local suitability surface: H3 hexagons generated on the fly (and cached)
 * for the selected county only. Opacity tracks zoom so cells fade in as the
 * county choropleth fades out across H3_FADE_RANGE.
 */
export default function H3SuitabilityLayer({
  onHoverCell,
  onClickCell,
}: H3SuitabilityLayerProps) {
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const scoredCounties = useSiteStore((s) => s.scoredCounties)
  const countyScores = useSiteStore((s) => s.countyScores)
  const activeLocalMetric = useSiteStore((s) => s.activeLocalMetric)
  const selectedH3Index = useSiteStore((s) => s.selectedH3Index)
  const zoom = useSiteStore((s) => s.viewState.zoom)

  const cells = useMemo(() => {
    if (!selectedCountyId) return null
    const feature = scoredCounties?.features.find(
      (f) => f.properties.geoid === selectedCountyId,
    )
    const score = countyScores?.[selectedCountyId]
    if (!feature || !score) return null
    return generateLocalCells(selectedCountyId, feature, score)
  }, [selectedCountyId, scoredCounties, countyScores])

  const [fadeFrom, fadeTo] = H3_FADE_RANGE
  const fade = Math.max(0, Math.min(1, (zoom - fadeFrom) / (fadeTo - fadeFrom)))

  const layers = useMemo(() => {
    if (!cells || fade === 0) return []
    return [
      new H3HexagonLayer<LocalCellScore>({
        id: 'h3-suitability',
        data: cells,
        opacity: fade,
        extruded: false,
        filled: true,
        stroked: true,
        getHexagon: (d) => d.h3Index,
        getFillColor: (d) => [
          ...scoreToRgb(localMetricValue(d, activeLocalMetric)),
          150,
        ],
        getLineColor: (d) =>
          d.h3Index === selectedH3Index
            ? [53, 194, 201, 255]
            : [240, 246, 252, 60],
        getLineWidth: (d) => (d.h3Index === selectedH3Index ? 3 : 1),
        lineWidthUnits: 'pixels',
        pickable: true,
        onHover: (info: PickingInfo<LocalCellScore>) => {
          onHoverCell(
            info.object
              ? { x: info.x, y: info.y, cell: info.object }
              : null,
          )
        },
        onClick: (info: PickingInfo<LocalCellScore>) => {
          if (info.object) onClickCell(info.object)
        },
        updateTriggers: {
          getFillColor: [activeLocalMetric],
          getLineColor: [selectedH3Index],
          getLineWidth: [selectedH3Index],
        },
      }),
    ]
  }, [cells, fade, activeLocalMetric, selectedH3Index, onHoverCell, onClickCell])

  return <DeckGLOverlay layers={layers} />
}
