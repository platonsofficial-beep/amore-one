const PENDING_INVITE_TOKEN_KEY = 'one.pendingInviteToken'

function normalizeToken(value) {
  const token = `${value ?? ''}`.trim()
  return token || null
}

export function readPendingInviteToken() {
  if (typeof window === 'undefined') return null

  try {
    return normalizeToken(window.sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY))
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
  } catch {
    // Ignore storage failures; invite acceptance becomes a no-op.
  }
}

export function clearPendingInviteToken() {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function captureInviteTokenFromLocation(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return null

  const params = new URLSearchParams(location.search)
  const queryToken = normalizeToken(params.get('invite'))
  if (queryToken) {
    writePendingInviteToken(queryToken)
    return queryToken
  }

  const match = `${location.pathname ?? ''}`.match(/^\/invite\/([^/]+)\/?$/i)
  const pathToken = normalizeToken(match?.[1])
  if (pathToken) {
    writePendingInviteToken(pathToken)
    return pathToken
  }

  return null
}
