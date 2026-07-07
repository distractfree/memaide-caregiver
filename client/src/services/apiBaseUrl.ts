const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname)
}

function shouldUseRelativeApi(configuredBaseUrl: string): boolean {
  if (!configuredBaseUrl) return true
  if (typeof window === 'undefined') return false

  const pageHostname = window.location.hostname
  if (isLocalHostname(pageHostname)) return false

  try {
    const apiUrl = new URL(configuredBaseUrl)
    if (isLocalHostname(apiUrl.hostname)) return true
    if (window.location.protocol === 'https:' && apiUrl.protocol === 'http:' && apiUrl.hostname === pageHostname) {
      return true
    }
  } catch {
    return false
  }

  return false
}

export function getApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
  return shouldUseRelativeApi(configuredBaseUrl) ? '' : configuredBaseUrl
}

export function buildApiUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const baseUrl = getApiBaseUrl()
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const url = baseUrl ? new URL(`${baseUrl}${normalized}`) : new URL(normalized, origin)

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  return baseUrl ? url.toString() : `${url.pathname}${url.search}`
}
