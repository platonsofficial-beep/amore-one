import { shouldSkipOwnerMembershipBootstrap } from './inviteBootstrapUtils'

export function formatInviteErrorMessage(message = '') {
  const normalized = `${message ?? ''}`.trim()
  if (!normalized) {
    return 'This invite link is no longer valid. Ask your manager for a new invite.'
  }

  if (/expired/i.test(normalized)) {
    return 'This invite has expired. Ask your manager to send a new invite link.'
  }

  if (/revoked/i.test(normalized)) {
    return 'This invite was revoked. Ask your manager to send a new invite link.'
  }

  if (/already been accepted|already accepted/i.test(normalized)) {
    return 'This invite was already used. Sign in with the account that accepted it.'
  }

  if (/not found/i.test(normalized)) {
    return 'This invite link was not found. Check the link or request a new invite.'
  }

  if (/authentication required/i.test(normalized)) {
    return 'Sign in or create an account to accept this workspace invite.'
  }

  return normalized
}

export function isFatalInviteError(message = '') {
  return /not found|expired|revoked|already been accepted|already accepted/i.test(`${message ?? ''}`)
}

export function shouldSkipMembershipBootstrapAfterInviteAttempt({
  inviteSucceeded = false,
  resolvedMembership = null,
} = {}) {
  return shouldSkipOwnerMembershipBootstrap({ inviteSucceeded, resolvedMembership })
}

export { shouldSkipOwnerMembershipBootstrap } from './inviteBootstrapUtils'

export function shouldShowJoiningWorkspaceMessage({
  isLoading = false,
  isJoiningWorkspace = false,
  hasPendingInviteToken = false,
  membershipLoadError = null,
} = {}) {
  if (membershipLoadError) return false
  return isLoading || isJoiningWorkspace || hasPendingInviteToken
}

export function buildInvitePreviewSummary(preview = {}) {
  if (!preview?.found) {
    return {
      tone: 'error',
      title: 'Invite unavailable',
      message: 'This invite link is not valid. Ask your manager for a new link.',
      canJoin: false,
    }
  }

  if (preview.isAccepted) {
    return {
      tone: 'info',
      title: 'Invite already used',
      message: 'This invite was already accepted. Sign in with the invited account.',
      canJoin: false,
    }
  }

  if (preview.isRevoked) {
    return {
      tone: 'error',
      title: 'Invite revoked',
      message: 'This invite is no longer active. Ask your manager for a new invite.',
      canJoin: false,
    }
  }

  if (preview.isExpired) {
    return {
      tone: 'error',
      title: 'Invite expired',
      message: 'This invite has expired. Ask your manager to send a new invite link.',
      canJoin: false,
    }
  }

  const workspaceName = `${preview.workspaceName ?? ''}`.trim() || 'this workspace'
  const employeeName = `${preview.employeeName ?? ''}`.trim()
  const invitedEmail = `${preview.email ?? ''}`.trim()

  const detailParts = []
  if (employeeName) detailParts.push(employeeName)
  if (invitedEmail) detailParts.push(invitedEmail)

  return {
    tone: 'info',
    title: `Join ${workspaceName}`,
    message: detailParts.length > 0
      ? `You were invited as ${detailParts.join(' · ')}. Sign in or create an account to continue.`
      : 'Sign in or create an account to join this workspace.',
    canJoin: true,
    workspaceName,
    employeeName,
    invitedEmail,
  }
}

export function buildInviteAcceptedNotice(workspaceName = '') {
  const trimmed = `${workspaceName ?? ''}`.trim()
  return trimmed
    ? `Welcome to ${trimmed}. Your workspace invite was accepted.`
    : 'Welcome to ONE. Your workspace invite was accepted.'
}
