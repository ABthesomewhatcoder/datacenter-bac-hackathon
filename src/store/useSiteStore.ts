import { create } from 'zustand'

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

  // Placeholder for upcoming phases (site selection, layers, scoring).
  selectedSiteId: string | null
  setSelectedSiteId: (id: string | null) => void
}

export const useSiteStore = create<SiteStore>((set) => ({
  basemap: 'satellite',
  setBasemap: (basemap) => set({ basemap }),

  viewState: INITIAL_VIEW_STATE,
  setViewState: (viewState) => set({ viewState }),

  selectedSiteId: null,
  setSelectedSiteId: (selectedSiteId) => set({ selectedSiteId }),
}))
