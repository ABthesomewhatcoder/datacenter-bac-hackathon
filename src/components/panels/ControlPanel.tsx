import { BASEMAPS, useSiteStore, type BasemapId } from '../../store/useSiteStore'

const BASEMAP_ORDER: BasemapId[] = ['satellite', 'clean']

export default function ControlPanel() {
  const basemap = useSiteStore((s) => s.basemap)
  const setBasemap = useSiteStore((s) => s.setBasemap)

  return (
    <aside className="panel panel--left" aria-label="Map controls">
      <section className="panel__section">
        <h2 className="panel__heading">Basemap</h2>
        <div className="segmented" role="group" aria-label="Basemap style">
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
      </section>

      <section className="panel__section">
        <h2 className="panel__heading">Data Layers</h2>
        <p className="panel__placeholder">
          Infrastructure, power, fiber, and risk layers will appear here in a
          later phase.
        </p>
      </section>
    </aside>
  )
}
