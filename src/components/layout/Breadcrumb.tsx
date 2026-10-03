import { getMapMode } from '../../lib/mapMode'
import { useSiteStore } from '../../store/useSiteStore'

interface BreadcrumbProps {
  onHome: () => void
  onState: (id: string) => void
  onCounty: (geoid: string) => void
  onLocal: () => void
}

/** United States › Ohio › Licking County › Local Analysis › Candidate Site */
export default function Breadcrumb({
  onHome,
  onState,
  onCounty,
  onLocal,
}: BreadcrumbProps) {
  const selectedStateId = useSiteStore((s) => s.selectedStateId)
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const selectedSite = useSiteStore((s) => s.selectedSite)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const scoredCounties = useSiteStore((s) => s.scoredCounties)
  const zoom = useSiteStore((s) => s.viewState.zoom)

  const mode = getMapMode(zoom)
  const localOrDeeper =
    (mode === 'local' || mode === 'site') && selectedCountyId !== null
  const hasSite = selectedSite !== null

  const stateName = selectedStateId
    ? (statesGeo?.features.find((f) => f.properties.id === selectedStateId)
        ?.properties.name ?? selectedStateId)
    : null

  const countyName = selectedCountyId
    ? (scoredCounties?.features.find(
        (f) => f.properties.geoid === selectedCountyId,
      )?.properties.name ?? selectedCountyId)
    : null

  const sep = (
    <span className="breadcrumb__sep" aria-hidden="true">
      ›
    </span>
  )

  return (
    <nav className="breadcrumb" aria-label="Map drilldown">
      <button
        type="button"
        className="breadcrumb__link"
        onClick={onHome}
        disabled={!selectedStateId}
      >
        United States
      </button>
      {selectedStateId && stateName && (
        <>
          {sep}
          <button
            type="button"
            className="breadcrumb__link"
            onClick={() => onState(selectedStateId)}
            disabled={!selectedCountyId}
          >
            {stateName}
          </button>
        </>
      )}
      {selectedCountyId && countyName && (
        <>
          {sep}
          <button
            type="button"
            className="breadcrumb__link"
            onClick={() => onCounty(selectedCountyId)}
            disabled={!localOrDeeper}
          >
            {countyName}
          </button>
        </>
      )}
      {localOrDeeper && (
        <>
          {sep}
          {hasSite ? (
            <button type="button" className="breadcrumb__link" onClick={onLocal}>
              Local Analysis
            </button>
          ) : (
            <span className="breadcrumb__current">Local Analysis</span>
          )}
        </>
      )}
      {hasSite && (
        <>
          {sep}
          <span className="breadcrumb__current">Candidate Site</span>
        </>
      )}
    </nav>
  )
}
