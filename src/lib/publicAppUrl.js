export const CANONICAL_APP_ORIGIN = 'https://app.onehospitality.app'

function stripTrailingSlash(value) {
  return `${value ?? ''}`.trim().replace(/\/$/, '')
}

function configuredFromVite() {
  if (!import.meta.env) return ''
  return stripTrailingSlash(import.meta.env.VITE_PUBLIC_APP_URL)
}

function configuredFromProcess() {
  if (typeof process === 'undefined') return ''
  return stripTrailingSlash(process.env.VITE_PUBLIC_APP_URL || process.env.INVITE_APP_URL)
}

export function configuredPublicAppUrl() {
  return configuredFromVite() || configuredFromProcess()
}

/** Host used in emails and any link that must not follow the browser address. */
export function canonicalPublicAppUrl() {
  return configuredPublicAppUrl() || CANONICAL_APP_ORIGIN
}

function isViteDev() {
  return Boolean(import.meta.env?.DEV)
}

function isLocalDevHost(hostname) {
  const host = `${hostname ?? ''}`.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '0.0.0.0'
}

/**
 * Origin for a link a person will open later (invite, booking share).
 * Local Vite dev may keep localhost. Every deployed host, including the
 * vercel.app install and preview deployments, uses the canonical app URL.
 */
export function publicShareOrigin(location, { dev = isViteDev() } = {}) {
  const configured = configuredPublicAppUrl()
  if (configured) return configured
  const loc = location ?? (typeof window !== 'undefined' ? window.location : null)
  if (dev && loc?.origin && isLocalDevHost(loc.hostname)) {
    return stripTrailingSlash(loc.origin)
  }
  return CANONICAL_APP_ORIGIN
}
