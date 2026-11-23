function isFatalInviteAcceptanceError(message = '') {
  return /not found|expired|revoked|already been accepted|already accepted/i.test(`${message ?? ''}`)
}

export function normalizeInviteEmail(email = '') {
  return `${email ?? ''}`.trim().toLowerCase()
}

export function shouldSkipOwnerMembershipBootstrap({
  inviteSucceeded = false,
  resolvedMembership = null,
  hasPendingInvite = false,
} = {}) {
  if (resolvedMembership) return true
  if (inviteSucceeded) return true
  return Boolean(hasPendingInvite)
}

export function resolveInviteAcceptanceError({
  errorMessage = '',
  hasMembership = false,
} = {}) {
  const normalized = `${errorMessage ?? ''}`.trim()

  if (hasMembership && /already been accepted|already accepted/i.test(normalized)) {
    return {
      shouldClearToken: true,
      shouldSurfaceError: false,
      recovered: true,
    }
  }

  if (isFatalInviteAcceptanceError(normalized)) {
    return {
      shouldClearToken: true,
      shouldSurfaceError: !hasMembership,
      recovered: hasMembership,
    }
  }

  return {
    shouldClearToken: false,
    shouldSurfaceError: Boolean(normalized),
    recovered: false,
  }
}

export function buildInviteBootstrapAttemptPlan({
  pendingToken = '',
  userEmail = '',
  hasMembership = false,
} = {}) {
  const attempts = []
  const normalizedToken = `${pendingToken ?? ''}`.trim()
  const normalizedEmail = normalizeInviteEmail(userEmail)

  if (normalizedToken) {
    attempts.push({ kind: 'token', token: normalizedToken })
  }

  // The email RPC returns the current membership and does not join a second venue.
  if (!hasMembership && normalizedEmail) {
    attempts.push({ kind: 'email', email: normalizedEmail })
  }

  return attempts
}

export async function sleep(ms = 0) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
