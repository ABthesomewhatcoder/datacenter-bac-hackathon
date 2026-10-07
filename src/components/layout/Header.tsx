import { BASEMAPS, useSiteStore, type BasemapId } from '../../store/useSiteStore'

const BASEMAP_ORDER: BasemapId[] = ['clean', 'satellite']

/**
 * Quiet white app bar: brand on the left (the breadcrumb renders into the
 * bar from SiteMap), map-style switch on the right.
 */
export default function Header() {
  const basemap = useSiteStore((s) => s.basemap)
  const setBasemap = useSiteStore((s) => s.setBasemap)

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__mark" aria-hidden="true" />
        <h1 className="app-header__title">Data Center Site Intelligence</h1>
      </div>
      <div className="app-header__actions">
        <div className="segmented" role="group" aria-label="Map style">
          {BASEMAP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`segmented__option${basemap === id ? ' segmented__option--active' : ''}`}
              aria-pressed={basemap === id}
              onClick={() => setBasemap(id)}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
