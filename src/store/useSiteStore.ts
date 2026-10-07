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
  DEFAULT_IT_CAPACITY_MW,
  DEFAULT_PUE,
  DEFAULT_WUE,
  type SimulationInputs,
} from '../lib/simulation'
import {
  loadAqueductData,
  lookupWaterStress,
  type WaterConstraint,
  type WaterStressResult,
} from '../lib/aqueduct'
import {
  loadEgridData,
  lookupEgridSubregion,
  type EgridResult,
} from '../lib/egrid'
import {
  fetchLandCover,
  type LandConstraint,
  type LandCoverResult,
} from '../lib/landCover'
import type { PriorityProfileId } from '../lib/decisionEngine'
import {
  loadRegionalEvidence,
  scoreAllCounties,
  stateMedians,
  type RegionalCountyScore,
  type RegionalEvidenceFile,
} from '../lib/regionalScreening'
import {
  assessRegulatoryActivity,
  findNearbyActivity,
  loadRegulatoryData,
  statePoliciesFor,
  type NearbyActivity,
  type RegulatoryActivityIndicator,
  type StatePolicyAction,
} from '../lib/regulatory'
import {
  boundsContainBounds,
  boundsContainPoint,
  expandBounds,
  featureContains,
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
    label: 'Map',
    styleUrl: 'mapbox://styles/mapbox/light-v11',
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

/**
 * Site regulatory context: state-level policy is valid (the state is
 * known), while nearby local records are centroid-distance DISCOVERY
 * context only — never legal applicability.
 */
export interface RegulatoryContext {
  stateAbbrev: string | null
  stateName: string | null
  nearby: NearbyActivity
  statePolicies: StatePolicyAction[]
  indicator: RegulatoryActivityIndicator
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
  /** REAL USGS NLCD land cover for the current site. */
  landCoverVisible: boolean
  toggleLandCover: () => void
  landCoverAssessment: {
    key: string
    result: LandCoverResult | 'loading' | 'error'
  } | null
  assessSiteLandCover: (site: SelectedSite) => Promise<void>
  /** REAL EPA eGRID2023 grid carbon intensity for the current site. */
  egridVisible: boolean
  toggleEgrid: () => void
  egridAssessment: {
    key: string
    result: EgridResult | 'loading' | 'error'
  } | null
  assessSiteEgrid: (site: SelectedSite) => Promise<void>
  /** REAL WRI Aqueduct 4.0 water stress for the current site. */
  waterStressVisible: boolean
  toggleWaterStress: () => void
  waterAssessment: {
    key: string
    result: WaterStressResult | null | 'loading' | 'error'
  } | null
  assessSiteWater: (site: SelectedSite) => Promise<void>
  /** Facility simulator scenario inputs (persist across sites). */
  simulationInputs: SimulationInputs
  setSimulationInputs: (inputs: Partial<SimulationInputs>) => void
  /** Facility planning horizon (drives Aqueduct horizon weighting). */
  planningHorizonYears: 20 | 30
  setPlanningHorizonYears: (years: 20 | 30) => void
  /** Decision priority profile — controls pillar WEIGHTS only. */
  priorityProfile: PriorityProfileId
  setPriorityProfile: (profile: PriorityProfileId) => void

  /** P2 nationwide regional screening (REAL evidence, CONUS counties). */
  regionalEvidence: RegionalEvidenceFile | null
  regionalScores: RegionalCountyScore[] | null
  regionalScoreByFips: Record<string, number>
  regionalStateMedians: Record<string, number>
  ensureRegionalEvidence: () => Promise<void>
  /** Jump target set by the Top Regional Candidates list. */
  focusCountyFips: string | null
  focusCounty: (state: string, fips: string) => void
  clearFocusCounty: () => void
  /** REAL Moratorium Nation 2026 regulatory context for the current site. */
  regulatoryVisible: boolean
  toggleRegulatory: () => void
  regulatoryAssessment: {
    key: string
    result: RegulatoryContext | 'loading' | 'error'
  } | null
  assessSiteRegulatory: (site: SelectedSite) => Promise<void>
  /** Hard-constraint preparation (not yet folded into overall scoring). */
  siteConstraints: {
    flood: FloodConstraint
    land: LandConstraint
    water: WaterConstraint
  }

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
let pendingFloodView: LngLatBounds | null = null

/**
 * P2 overlay: the map's "Overall" metric now shows the REAL Regional
 * Opportunity Score (state = median of county scores). Regions without a
 * regional score (AK/HI, missing evidence) get undefined → "no data"
 * styling, so the old synthetic overall never shows through.
 */
const overlayStateOverall = (
  fc: ScoredStatesGeo,
  medians: Record<string, number>,
): ScoredStatesGeo => ({
  ...fc,
  features: fc.features.map((f) => ({
    ...f,
    properties: { ...f.properties, overall: medians[f.properties.id] },
  })),
})

const overlayCountyOverall = (
  fc: ScoredCountiesGeo,
  byFips: Record<string, number>,
): ScoredCountiesGeo => ({
  ...fc,
  features: fc.features.map((f) => ({
    ...f,
    properties: { ...f.properties, overall: byFips[f.properties.geoid] },
  })),
})

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
    if (get().floodZonesLoading) {
      // Remember the latest wanted view instead of silently dropping it.
      pendingFloodView = view
      return
    }
    set({ floodZonesLoading: true })
    try {
      // Modest expansion keeps the envelope within what FEMA reliably
      // serves; on failure retry once with the exact viewport.
      let bounds = expandBounds(view, 0.25)
      let fc: FloodGeo
      try {
        fc = await loadFloodZones(bounds)
      } catch {
        bounds = view
        fc = await loadFloodZones(bounds)
      }
      set({ floodZones: { bounds, fc }, floodZonesLoading: false, floodError: null })
    } catch {
      // Failed FEMA requests must not break the map — layer just stays empty.
      set({ floodZonesLoading: false, floodError: 'FEMA flood service unavailable' })
    }
    const queued = pendingFloodView
    pendingFloodView = null
    if (queued) get().ensureFloodZones(queued)
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
      set((prev) => ({
        floodAssessment: { key, result },
        siteConstraints: { ...prev.siteConstraints, flood: result.constraint },
      }))
      return
    }

    set({ floodAssessment: { key, result: 'loading' } })
    try {
      const result = await assessFloodRisk(site)
      if (get().floodAssessment?.key !== key) return // site moved meanwhile
      set((prev) => ({
        floodAssessment: { key, result },
        siteConstraints: { ...prev.siteConstraints, flood: result.constraint },
      }))
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
      set((prev) => ({
        floodAssessment: { key, result },
        siteConstraints: { ...prev.siteConstraints, flood: 'unknown' },
      }))
    }
  },
  siteConstraints: { flood: 'unknown', land: 'unknown', water: 'unknown' },

  simulationInputs: {
    itLoadMW: DEFAULT_IT_CAPACITY_MW,
    pue: DEFAULT_PUE,
    wueLPerKwh: DEFAULT_WUE,
  },
  setSimulationInputs: (inputs) => {
    set((prev) => ({
      simulationInputs: { ...prev.simulationInputs, ...inputs },
    }))
    recomputeRegional()
  },
  planningHorizonYears: 30,
  setPlanningHorizonYears: (planningHorizonYears) => {
    set({ planningHorizonYears })
    recomputeRegional()
  },
  priorityProfile: 'balanced',
  setPriorityProfile: (priorityProfile) => {
    set({ priorityProfile })
    recomputeRegional()
  },

  regionalEvidence: null,
  regionalScores: null,
  regionalScoreByFips: {},
  regionalStateMedians: {},
  ensureRegionalEvidence: async () => {
    if (get().regionalEvidence) return
    try {
      const evidence = await loadRegionalEvidence()
      if (get().regionalEvidence) return
      set({ regionalEvidence: evidence })
      recomputeRegional()
    } catch {
      // Panel and map fall back to "no data" styling for Overall.
    }
  },
  focusCountyFips: null,
  focusCounty: (state, fips) => {
    get().setSelectedStateId(state)
    set({ focusCountyFips: fips })
    get().showCountiesFor(state)
  },
  clearFocusCounty: () => set({ focusCountyFips: null }),

  regulatoryVisible: false,
  toggleRegulatory: () =>
    set((prev) => ({ regulatoryVisible: !prev.regulatoryVisible })),
  regulatoryAssessment: null,
  assessSiteRegulatory: async (site) => {
    const key = `${site.latitude.toFixed(5)},${site.longitude.toFixed(5)}`
    if (get().regulatoryAssessment?.key === key) return
    set({ regulatoryAssessment: { key, result: 'loading' } })
    try {
      const data = await loadRegulatoryData()
      if (get().regulatoryAssessment?.key !== key) return
      // State membership via point-in-polygon on state geometry — valid,
      // unlike centroid proximity, which stays discovery-only context.
      const stateFeature = get().statesGeo?.features.find((f) =>
        featureContains(f, site.longitude, site.latitude),
      )
      const stateAbbrev = stateFeature?.properties.id ?? null
      const nearby = findNearbyActivity(site, data.moratoria)
      const statePolicies = stateAbbrev
        ? statePoliciesFor(stateAbbrev, data.statePolicy)
        : []
      const result: RegulatoryContext = {
        stateAbbrev,
        stateName: stateFeature?.properties.name ?? null,
        nearby,
        statePolicies,
        indicator: assessRegulatoryActivity(nearby, statePolicies),
      }
      set({ regulatoryAssessment: { key, result } })
    } catch {
      if (get().regulatoryAssessment?.key !== key) return
      set({ regulatoryAssessment: { key, result: 'error' } })
    }
  },

  waterStressVisible: false,
  toggleWaterStress: () =>
    set((prev) => ({ waterStressVisible: !prev.waterStressVisible })),
  waterAssessment: null,
  assessSiteWater: async (site) => {
    const key = `${site.latitude.toFixed(5)},${site.longitude.toFixed(5)}`
    if (get().waterAssessment?.key === key) return
    set({ waterAssessment: { key, result: 'loading' } })
    try {
      const geo = await loadAqueductData()
      if (get().waterAssessment?.key !== key) return
      const result = lookupWaterStress(site, geo)
      set((prev) => ({
        waterAssessment: { key, result },
        siteConstraints: {
          ...prev.siteConstraints,
          water: result?.constraint ?? 'unknown',
        },
      }))
    } catch {
      if (get().waterAssessment?.key !== key) return
      set((prev) => ({
        waterAssessment: { key, result: 'error' },
        siteConstraints: { ...prev.siteConstraints, water: 'unknown' },
      }))
    }
  },

  egridVisible: false,
  toggleEgrid: () => set((prev) => ({ egridVisible: !prev.egridVisible })),
  egridAssessment: null,
  assessSiteEgrid: async (site) => {
    const key = `${site.latitude.toFixed(5)},${site.longitude.toFixed(5)}`
    if (get().egridAssessment?.key === key) return
    set({ egridAssessment: { key, result: 'loading' } })
    try {
      const data = await loadEgridData()
      if (get().egridAssessment?.key !== key) return
      set({ egridAssessment: { key, result: lookupEgridSubregion(site, data) } })
    } catch {
      if (get().egridAssessment?.key !== key) return
      set({ egridAssessment: { key, result: 'error' } })
    }
  },

  landCoverVisible: false,
  toggleLandCover: () =>
    set((prev) => ({ landCoverVisible: !prev.landCoverVisible })),
  landCoverAssessment: null,
  assessSiteLandCover: async (site) => {
    const key = `${site.latitude.toFixed(5)},${site.longitude.toFixed(5)}`
    if (get().landCoverAssessment?.key === key) return
    set({ landCoverAssessment: { key, result: 'loading' } })
    try {
      const result = await fetchLandCover(site)
      if (get().landCoverAssessment?.key !== key) return
      set((prev) => ({
        landCoverAssessment: { key, result },
        siteConstraints: { ...prev.siteConstraints, land: result.constraint },
      }))
    } catch {
      if (get().landCoverAssessment?.key !== key) return
      // Never fabricate a class — surface UNKNOWN.
      set((prev) => ({
        landCoverAssessment: { key, result: 'error' },
        siteConstraints: { ...prev.siteConstraints, land: 'unknown' },
      }))
    }
  },

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
        scoredStates: overlayStateOverall(
          joinScores(geo, scores),
          get().regionalStateMedians,
        ),
        stateDataError: null,
      })
      get().ensureRegionalEvidence()
      recomputeRegional()
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
        scoredCounties: overlayCountyOverall(
          joinCountyScores(geo, scores),
          get().regionalScoreByFips,
        ),
      }))
    } catch (err) {
      set({ stateDataError: err instanceof Error ? err.message : String(err) })
    }
  },
}))

/**
 * Recomputes P2 regional scores for the current facility + profile and
 * refreshes the map joins. Pure in-memory work over precomputed evidence —
 * no refetching, no GIS — so facility/profile changes feel instant.
 */
function recomputeRegional() {
  const s = useSiteStore.getState()
  const evidence = s.regionalEvidence
  if (!evidence) return
  const scores = scoreAllCounties(
    evidence,
    { ...s.simulationInputs, planningHorizonYears: s.planningHorizonYears },
    s.priorityProfile,
  )
  const byFips: Record<string, number> = {}
  for (const r of scores) {
    if (r.score !== null) byFips[r.fips] = r.score
  }
  const medians = stateMedians(scores)
  const patch: Partial<SiteStore> = {
    regionalScores: scores,
    regionalScoreByFips: byFips,
    regionalStateMedians: medians,
  }
  if (s.statesGeo && s.stateScores) {
    patch.scoredStates = overlayStateOverall(
      joinScores(s.statesGeo, s.stateScores),
      medians,
    )
  }
  if (s.countyViewStateId && s.countyScores) {
    const geo = s.countiesCache[s.countyViewStateId]
    if (geo) {
      patch.scoredCounties = overlayCountyOverall(
        joinCountyScores(geo, s.countyScores),
        byFips,
      )
    }
  }
  useSiteStore.setState(patch)
}

// Debug handle for development tooling.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __siteStore?: typeof useSiteStore }).__siteStore =
    useSiteStore
}
