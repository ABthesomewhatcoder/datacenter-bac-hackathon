/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string
  /** Set to 'true' to show GIS debug readouts (FEMA flood chain). */
  readonly VITE_DEBUG_GIS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
