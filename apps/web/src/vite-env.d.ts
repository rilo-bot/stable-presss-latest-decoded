/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for non-mocked API calls (e.g. /api/auth/*). Unset in dev. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
