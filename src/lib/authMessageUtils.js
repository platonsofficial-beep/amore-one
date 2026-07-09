const SESSION_ENDED_STORAGE_KEY = 'one:session-ended'

export function markSessionEnded() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(SESSION_ENDED_STORAGE_KEY, '1')
}

export function readSessionEndedNotice() {
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(SESSION_ENDED_STORAGE_KEY) === '1'
}

export function clearSessionEndedNotice() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(SESSION_ENDED_STORAGE_KEY)
}

export function formatAuthErrorMessage(message = '') {
  const normalized = `${message ?? ''}`.trim()
  if (!normalized) {
    return 'Unable to complete this request right now.'
  }

  if (/invalid login credentials/i.test(normalized)) {
    return 'Email or password is incorrect. Try again or reset your password.'
  }

  if (/jwt expired|refresh token|session.*expired|token.*expired/i.test(normalized)) {
    return 'Your session expired. Sign in again to continue.'
  }

  if (/email not confirmed/i.test(normalized)) {
    return 'Confirm your email address before signing in.'
  }

  if (/too many requests|rate limit/i.test(normalized)) {
    return 'Too many attempts. Wait a moment and try again.'
  }

  return normalized
}
