/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set on production hosts (e.g. Render) to the deployed backend origin; omit locally for Vite proxy. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
