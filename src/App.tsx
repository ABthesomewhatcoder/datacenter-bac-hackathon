import Header from './components/layout/Header'
import SiteMap from './components/map/SiteMap'
import ControlPanel from './components/panels/ControlPanel'
import SiteAnalysisPanel from './components/panels/SiteAnalysisPanel'

export default function App() {
  return (
    <div className="app-shell">
      <SiteMap />
      <Header />
      <ControlPanel />
      <SiteAnalysisPanel />
    </div>
  )
}
