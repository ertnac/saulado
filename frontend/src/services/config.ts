/**
 * Base URL for API requests.
 *
 * Dev: empty, so paths stay relative and the Vite proxy forwards `/api` to
 *      localhost:3000 — the browser stays same-origin.
 * Prod: the deployed API origin, because the frontend is served from a
 *       different host than the API. The proxy does NOT exist in a production
 *       build; without this the app would request /api from its own origin
 *       and 404.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalized}`
}
