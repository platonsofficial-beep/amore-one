const PENDING_INVITE_TOKEN_KEY = 'one.pendingInviteToken'
const PENDING_INVITE_TOKEN_LOCAL_KEY = 'one.pendingInviteToken.local'

function normalizeToken(value) {
  const token = `${value ?? ''}`.trim()
  return token || null
}

export function readPendingInviteToken() {
  if (typeof window === 'undefined') return null

  try {
    return normalizeToken(window.sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY))
      || normalizeToken(window.localStorage.getItem(PENDING_INVITE_TOKEN_LOCAL_KEY))
  } catch {
    return null
  }
}

export function writePendingInviteToken(token) {
  if (typeof window === 'undefined') return

  const normalized = normalizeToken(token)
  if (!normalized) return

  try {
    window.sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, normalized)
    window.localStorage.setItem(PENDING_INVITE_TOKEN_LOCAL_KEY, normalized)
  } catch {
    // Ignore storage failures; invite acceptance becomes a no-op.
  }
}

export function clearPendingInviteToken() {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
    window.localStorage.removeItem(PENDING_INVITE_TOKEN_LOCAL_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function stripInviteTokenFromLocation(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location || typeof window === 'undefined') return false

  const url = new URL(location.href)
  let changed = false

  if (url.searchParams.has('invite')) {
    url.searchParams.delete('invite')
    changed = true
  }

  if (/^\/invite\/[^/]+\/?$/i.test(url.pathname)) {
    url.pathname = '/'
    changed = true
  }

  if (!changed) return false

  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', nextUrl)
  return true
}

export function captureInviteTokenFromLocation(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return null

  const params = new URLSearchParams(location.search)
  const queryToken = normalizeToken(params.get('invite'))
  if (queryToken) {
    writePendingInviteToken(queryToken)
    stripInviteTokenFromLocation(location)
    return queryToken
  }

  const match = `${location.pathname ?? ''}`.match(/^\/invite\/([^/]+)\/?$/i)
  const pathToken = normalizeToken(match?.[1])
  if (pathToken) {
    writePendingInviteToken(pathToken)
    stripInviteTokenFromLocation(location)
    return pathToken
  }

  return null
}
