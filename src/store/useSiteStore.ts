import { create } from 'zustand'
import {
  fetchCountiesForState,
  fetchCountyScores,
  fetchStateData,
  joinCountyScores,
  joinScores,
  type CountiesGeo,
  type CountyScoreMap,
  type Metric,
  type ScoredCountiesGeo,
  type ScoredStatesGeo,
  type StateScoreMap,
  type StatesGeo,
} from '../lib/scoring'
import type { LocalMetric } from '../lib/localScoring'
import {
  fetchTransmissionForState,
  type TransmissionGeo,
} from '../lib/transmission'
import {
  assessFloodRisk,
  assessFloodRiskLocal,
  loadFloodZones,
  type FloodAssessment,
  type FloodConstraint,
  type FloodGeo,
} from '../lib/flood'
import {
  boundsContainBounds,
  boundsContainPoint,
  expandBounds,
  type LngLatBounds,
} from '../lib/geo'

export type BasemapId = 'satellite' | 'clean'

export interface BasemapOption {
  id: BasemapId
  label: string
  styleUrl: string
}

export const BASEMAPS: Record<BasemapId, BasemapOption> = {
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    styleUrl: 'mapbox://styles/mapbox/satellite-streets-v12',
  },
  clean: {
    id: 'clean',
    label: 'Clean Map',
    styleUrl: 'mapbox://styles/mapbox/dark-v11',
  },
}

export interface MapViewState {
  longitude: number
  latitude: number
  zoom: number
}

export interface SelectedSite {
  latitude: number
  longitude: number
}

export const RADIUS_OPTIONS_MILES = [5, 10, 25, 50]
export const DEFAULT_RADIUS_MILES = 10

export const INITIAL_VIEW_STATE: MapViewState = {
  longitude: -98,
  latitude: 39,
  zoom: 3.2,
}

interface SiteStore {
  basemap: BasemapId
  setBasemap: (basemap: BasemapId) => void

  viewState: MapViewState
  setViewState: (viewState: MapViewState) => void

  activeMetric: Metric
  setActiveMetric: (metric: Metric) => void

  /** Metric driving H3 cell colors in local mode (separate from region metric). */
  activeLocalMetric: LocalMetric
  setActiveLocalMetric: (metric: LocalMetric) => void

  selectedH3Index: string | null
  setSelectedH3Index: (h3Index: string | null) => void

  /** Exact candidate coordinate, placed by clicking the map in site mode. */
  selectedSite: SelectedSite | null
  setSelectedSite: (site: SelectedSite) => void
  clearSelectedSite: () => void

  analysisRadiusMiles: number
  setAnalysisRadiusMiles: (miles: number) => void

  /** REAL transmission-line extracts (HIFLD), cached per state. */
  transmissionVisible: boolean
  toggleTransmission: () => void
  transmissionByState: Record<string, TransmissionGeo | 'missing'>
  loadTransmissionFor: (usps: string) => Promise<void>

  /** REAL FEMA NFHL flood hazard zones, fetched live per viewport area. */
  floodVisible: boolean
  toggleFlood: () => void
  floodZones: { bounds: LngLatBounds; fc: FloodGeo } | null
  floodZonesLoading: boolean
  floodError: string | null
  ensureFloodZones: (view: LngLatBounds) => Promise<void>
  /** Flood assessment for the current site, keyed by its coordinates. */
  floodAssessment: {
    key: string
    result: FloodAssessment | 'loading'
  } | null
  assessSiteFlood: (site: SelectedSite) => Promise<void>
  /** Hard-constraint preparation (not yet folded into overall scoring). */
  siteConstraints: { flood: FloodConstraint }

  /** Raw state geometry (no scores) — source of truth for fitBounds. */
  statesGeo: StatesGeo | null
  /** Score lookup by USPS code, loaded separately from geometry. */
  stateScores: StateScoreMap | null
  /** Geometry with scores joined in, fed to the Mapbox source. */
  scoredStates: ScoredStatesGeo | null
  stateDataError: string | null
  loadStateData: () => Promise<void>

  selectedStateId: string | null
  setSelectedStateId: (id: string | null) => void

  selectedCountyId: string | null
  setSelectedCountyId: (geoid: string | null) => void

  /** USPS code of the state whose counties are currently displayed. */
  countyViewStateId: string | null
  /** Counties of countyViewStateId with scores joined, fed to the map source. */
  scoredCounties: ScoredCountiesGeo | null
  /** Raw county geometry cache so revisiting a state doesn't refetch. */
  countiesCache: Record<string, CountiesGeo>
  countyScores: CountyScoreMap | null
  /** Loads (or reuses) a state's counties and makes them the county view. */
  showCountiesFor: (usps: string | null) => Promise<void>
}

let countyRequestToken = 0

export const useSiteStore = create<SiteStore>((set, get) => ({
  basemap: 'satellite',
  setBasemap: (basemap) => set({ basemap }),

  viewState: INITIAL_VIEW_STATE,
  setViewState: (viewState) => set({ viewState }),

  activeMetric: 'overall',
  setActiveMetric: (activeMetric) => set({ activeMetric }),

  activeLocalMetric: 'overall',
  setActiveLocalMetric: (activeLocalMetric) => set({ activeLocalMetric }),

  selectedH3Index: null,
  setSelectedH3Index: (selectedH3Index) =>
    set((prev) => ({
      selectedH3Index,
      // Picking a different cell invalidates the previous exact site.
      selectedSite:
        selectedH3Index === prev.selectedH3Index ? prev.selectedSite : null,
    })),

  selectedSite: null,
  setSelectedSite: (selectedSite) => set({ selectedSite }),
  clearSelectedSite: () => set({ selectedSite: null }),

  analysisRadiusMiles: DEFAULT_RADIUS_MILES,
  setAnalysisRadiusMiles: (analysisRadiusMiles) => set({ analysisRadiusMiles }),

  floodVisible: true,
  toggleFlood: () => set((prev) => ({ floodVisible: !prev.floodVisible })),
  floodZones: null,
  floodZonesLoading: false,
  floodError: null,
  ensureFloodZones: async (view) => {
    const current = get().floodZones
    if (current && boundsContainBounds(current.bounds, view)) return
    if (get().floodZonesLoading) return
    set({ floodZonesLoading: true })
    try {
      const bounds = expandBounds(view, 0.5)
      const fc = await loadFloodZones(bounds)
      set({ floodZones: { bounds, fc }, floodZonesLoading: false, floodError: null })
    } catch {
      // Failed FEMA requests must not break the map — layer just stays empty.
      set({ floodZonesLoading: false, floodError: 'FEMA flood service unavailable' })
    }
  },
  floodAssessment: null,
  assessSiteFlood: async (site) => {
    const key = `${site.latitude.toFixed(5)},${site.longitude.toFixed(5)}`
    if (get().floodAssessment?.key === key) return

    // Already-loaded polygons covering the point answer synchronously —
    // no FEMA round-trip for small marker moves inside the cached area.
    const zones = get().floodZones
    if (zones && boundsContainPoint(zones.bounds, site.longitude, site.latitude)) {
      const result = assessFloodRiskLocal(site, zones.fc)
      set({ floodAssessment: { key, result }, siteConstraints: { flood: result.constraint } })
      return
    }

    set({ floodAssessment: { key, result: 'loading' } })
    try {
      const result = await assessFloodRisk(site)
      if (get().floodAssessment?.key !== key) return // site moved meanwhile
      set({ floodAssessment: { key, result }, siteConstraints: { flood: result.constraint } })
    } catch {
      if (get().floodAssessment?.key !== key) return
      const result: FloodAssessment = {
        mapped: false,
        riskLevel: 'unknown',
        floodZone: null,
        zoneSubtype: null,
        sfha: null,
        constraint: 'unknown',
        source: 'FEMA NFHL',
        resolution: 'FEMA query failed / service unavailable',
      }
      set({ floodAssessment: { key, result }, siteConstraints: { flood: 'unknown' } })
    }
  },
  siteConstraints: { flood: 'unknown' },

  transmissionVisible: true,
  toggleTransmission: () =>
    set((prev) => ({ transmissionVisible: !prev.transmissionVisible })),
  transmissionByState: {},
  loadTransmissionFor: async (usps) => {
    if (get().transmissionByState[usps]) return
    try {
      const fc = await fetchTransmissionForState(usps)
      set((prev) => ({
        transmissionByState: {
          ...prev.transmissionByState,
          [usps]: fc ?? 'missing',
        },
      }))
    } catch {
      set((prev) => ({
        transmissionByState: { ...prev.transmissionByState, [usps]: 'missing' },
      }))
    }
  },

  statesGeo: null,
  stateScores: null,
  scoredStates: null,
  stateDataError: null,
  loadStateData: async () => {
    if (get().statesGeo) return
    try {
      const { geo, scores } = await fetchStateData()
      set({
        statesGeo: geo,
        stateScores: scores,
        scoredStates: joinScores(geo, scores),
        stateDataError: null,
      })
    } catch (err) {
      set({ stateDataError: err instanceof Error ? err.message : String(err) })
    }
  },

  selectedStateId: null,
  setSelectedStateId: (selectedStateId) =>
    set((prev) => {
      // A county selection only makes sense inside its own state.
      const keepCounty =
        selectedStateId &&
        prev.selectedCountyId &&
        prev.countyViewStateId === selectedStateId
      return {
        selectedStateId,
        selectedCountyId: keepCounty ? prev.selectedCountyId : null,
        selectedH3Index: keepCounty ? prev.selectedH3Index : null,
        selectedSite: keepCounty ? prev.selectedSite : null,
      }
    }),

  selectedCountyId: null,
  setSelectedCountyId: (selectedCountyId) =>
    set((prev) => {
      // Cell and site selections belong to one county's local surface.
      const sameCounty = selectedCountyId === prev.selectedCountyId
      return {
        selectedCountyId,
        selectedH3Index: sameCounty ? prev.selectedH3Index : null,
        selectedSite: sameCounty ? prev.selectedSite : null,
      }
    }),

  countyViewStateId: null,
  scoredCounties: null,
  countiesCache: {},
  countyScores: null,
  showCountiesFor: async (usps) => {
    const token = ++countyRequestToken
    if (usps === null) {
      set({ countyViewStateId: null, scoredCounties: null })
      return
    }
    if (get().countyViewStateId === usps && get().scoredCounties) return
    try {
      const scores = get().countyScores ?? (await fetchCountyScores())
      const cached = get().countiesCache[usps]
      const geo = cached ?? (await fetchCountiesForState(usps))
      // A newer request superseded this one while fetching — drop the result.
      if (token !== countyRequestToken) return
      set((prev) => ({
        countyScores: scores,
        countiesCache: cached
          ? prev.countiesCache
          : { ...prev.countiesCache, [usps]: geo },
        countyViewStateId: usps,
        scoredCounties: joinCountyScores(geo, scores),
      }))
    } catch (err) {
      set({ stateDataError: err instanceof Error ? err.message : String(err) })
    }
  },
}))

// Debug handle for development tooling.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __siteStore?: typeof useSiteStore }).__siteStore =
    useSiteStore
}
