import type { Feature, Geometry, Position } from 'geojson'

export type LngLatBounds = [[number, number], [number, number]]

function walkPositions(
  coords: Position | Position[] | Position[][] | Position[][][],
  visit: (lng: number, lat: number) => void,
): void {
  if (typeof coords[0] === 'number') {
    visit(coords[0] as number, coords[1] as number)
    return
  }
  for (const child of coords as Position[]) {
    walkPositions(child, visit)
  }
}

/**
 * Bounding box of a feature, computed from the source GeoJSON (NOT from
 * tile-clipped geometries returned by queryRenderedFeatures).
 *
 * Handles the antimeridian (Alaska's Aleutians reach +179°E): when a feature
 * spans the ±180 seam, eastern-hemisphere longitudes are shifted by -360 so
 * fitBounds doesn't try to frame the entire globe.
 */
export function featureBounds(feature: Feature<Geometry>): LngLatBounds {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  let hasFarEast = false
  let hasFarWest = false

  walkPositions(
    (feature.geometry as { coordinates: Position[] }).coordinates,
    (lng) => {
      if (lng > 150) hasFarEast = true
      if (lng < -150) hasFarWest = true
    },
  )
  const crossesAntimeridian = hasFarEast && hasFarWest

  walkPositions(
    (feature.geometry as { coordinates: Position[] }).coordinates,
    (lng, lat) => {
      const adjLng = crossesAntimeridian && lng > 0 ? lng - 360 : lng
      if (adjLng < minLng) minLng = adjLng
      if (adjLng > maxLng) maxLng = adjLng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    },
  )

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}
