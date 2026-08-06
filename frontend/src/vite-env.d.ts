/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the API, no trailing slash — e.g. https://saulado-api.up.railway.app
   *
   * Left empty in dev so requests stay relative and go through the Vite proxy
   * (see vite.config.ts), which keeps the browser same-origin.
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
