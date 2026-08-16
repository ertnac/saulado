/**
 * Base URL for API requests.
 *
 * Always absolute, unlike the web client. There is no dev proxy on a phone and
 * no origin to be relative to — a bare `/api/auth/login` is not a URL React
 * Native's `fetch` can resolve, so an unset value has to fail loudly rather
 * than produce requests that go nowhere.
 *
 * `EXPO_PUBLIC_` is the only prefix Expo inlines into the bundle. The name says
 * public because it is: this value ships inside the app and is readable by
 * anyone who unpacks it. That is fine for an API origin and is exactly why no
 * secret may ever be given this prefix.
 *
 * On a physical device `localhost` is the phone, not the development machine.
 * Point this at the machine's LAN address (`http://192.168.x.x:3000`) or at the
 * deployed API.
 */
const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://saulado-api.onrender.com').replace(
  /\/$/,
  '',
)

/**
 * Thrown when the base URL is missing.
 *
 * A distinct type because it needs a distinct answer from the user. Both this
 * and a dead network surface at the same place — the login screen — but one is
 * fixed by editing a file and restarting Metro, and the other by turning Wi-Fi
 * on. Reporting the config mistake as "could not reach the API" sends the user
 * looking at their network for a problem that is in their `.env`.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function apiUrl(path: string): string {
  if (!API_BASE) {
    throw new ConfigError(
      'EXPO_PUBLIC_API_URL is not set. Add it to mobile/.env and restart the dev server — ' +
        'Expo inlines it at build time, so a running Metro will not pick it up.',
    )
  }

  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalized}`
}
