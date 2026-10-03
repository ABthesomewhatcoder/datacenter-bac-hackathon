import { create } from 'zustand'
import {
  fetchStateData,
  joinScores,
  type Metric,
  type ScoredStatesGeo,
  type StateScoreMap,
  type StatesGeo,
} from '../lib/scoring'

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
}

export const useSiteStore = create<SiteStore>((set, get) => ({
  basemap: 'satellite',
  setBasemap: (basemap) => set({ basemap }),

  viewState: INITIAL_VIEW_STATE,
  setViewState: (viewState) => set({ viewState }),

  activeMetric: 'overall',
  setActiveMetric: (activeMetric) => set({ activeMetric }),

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
  setSelectedStateId: (selectedStateId) => set({ selectedStateId }),
}))
