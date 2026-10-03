import { useSiteStore } from '../../store/useSiteStore'

export default function SiteAnalysisPanel() {
  const selectedSiteId = useSiteStore((s) => s.selectedSiteId)

  return (
    <aside className="panel panel--right" aria-label="Site analysis">
      <section className="panel__section">
        <h2 className="panel__heading">Site Analysis</h2>
        {selectedSiteId ? (
          <p className="panel__placeholder">Analyzing site {selectedSiteId}…</p>
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">
              ◎
            </div>
            <p className="empty-state__title">No site selected</p>
            <p className="empty-state__hint">
              Select a location on the map to evaluate it as a data center
              site. Scoring and analysis arrive in a later phase.
            </p>
          </div>
        )}
      </section>
    </aside>
  )
}
