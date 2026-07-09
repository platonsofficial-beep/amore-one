const INVITE_ACCEPTED_NOTICE_KEY = 'one.inviteAcceptedNotice'

export function writeInviteAcceptedNotice(message = '') {
  if (typeof window === 'undefined') return

  const normalized = `${message ?? ''}`.trim()
  if (!normalized) return

  try {
    window.sessionStorage.setItem(INVITE_ACCEPTED_NOTICE_KEY, normalized)
  } catch {
    // Ignore storage failures.
  }
}

export function readAndClearInviteAcceptedNotice() {
  if (typeof window === 'undefined') return ''

  try {
    const message = `${window.sessionStorage.getItem(INVITE_ACCEPTED_NOTICE_KEY) ?? ''}`.trim()
    window.sessionStorage.removeItem(INVITE_ACCEPTED_NOTICE_KEY)
    return message
  } catch {
    return ''
  }
}
