const API_BASE_PATH = '/api'
const PRODUCTION_HOSTNAME = 'caregiver.guardianova.com'
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname)
}

function getConfiguredApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
}

function getWindowLocation(): Location | null {
  return typeof window === 'undefined' ? null : window.location
}

function shouldForceRelativeApi(location: Location): boolean {
  return location.protocol === 'https:' || location.hostname === PRODUCTION_HOSTNAME || !isLocalHostname(location.hostname)
}

function withoutApiPrefix(path: string): string {
  return path.replace(/^\/api(?=\/|$)/, '')
}

export function getApiBaseUrl(): string {
  const location = getWindowLocation()
  if (location && shouldForceRelativeApi(location)) return API_BASE_PATH

  return getConfiguredApiBaseUrl() || API_BASE_PATH
}

export function buildApiUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const baseUrl = getApiBaseUrl()
  const routePath = baseUrl.endsWith(API_BASE_PATH) ? withoutApiPrefix(normalized) : normalized
  const joined = `${baseUrl}${routePath}`
  const origin = getWindowLocation()?.origin ?? 'http://localhost'
  const url = new URL(joined, origin)

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  return baseUrl.startsWith('http') ? url.toString() : `${url.pathname}${url.search}`
}
