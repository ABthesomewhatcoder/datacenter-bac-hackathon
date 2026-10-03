import { useSiteStore } from '../../store/useSiteStore'

interface BreadcrumbProps {
  onHome: () => void
  onState: (id: string) => void
}

/** United States > Ohio > Licking County — drilldown context + navigation. */
export default function Breadcrumb({ onHome, onState }: BreadcrumbProps) {
  const selectedStateId = useSiteStore((s) => s.selectedStateId)
  const selectedCountyId = useSiteStore((s) => s.selectedCountyId)
  const statesGeo = useSiteStore((s) => s.statesGeo)
  const scoredCounties = useSiteStore((s) => s.scoredCounties)

  const stateName = selectedStateId
    ? (statesGeo?.features.find((f) => f.properties.id === selectedStateId)
        ?.properties.name ?? selectedStateId)
    : null

  const countyName = selectedCountyId
    ? (scoredCounties?.features.find(
        (f) => f.properties.geoid === selectedCountyId,
      )?.properties.name ?? selectedCountyId)
    : null

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
          <span className="breadcrumb__sep" aria-hidden="true">
            ›
          </span>
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
      {countyName && (
        <>
          <span className="breadcrumb__sep" aria-hidden="true">
            ›
          </span>
          <span className="breadcrumb__current">{countyName}</span>
        </>
      )}
    </nav>
  )
}
