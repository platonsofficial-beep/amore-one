import {
  buildInviteAcceptedNotice,
  formatInviteErrorMessage,
} from '../lib/inviteFlowUtils'
import {
  buildInviteBootstrapAttemptPlan,
  resolveInviteAcceptanceError,
} from '../lib/inviteBootstrapUtils'
import { writeInviteAcceptedNotice } from '../lib/inviteNoticeStorage'
import {
  captureInviteTokenFromLocation,
  clearPendingInviteToken,
  readPendingInviteToken,
} from '../lib/inviteTokenStorage'
import { acceptInvite, acceptPendingInviteForAuthenticatedUser, getInvitePreview } from './inviteService'

async function tryAcceptInviteToken(token) {
  const invitePreview = await getInvitePreview(token).catch(() => null)
  await acceptInvite(token)
  return invitePreview?.workspaceName ?? ''
}

export async function resolveWorkspaceInviteOnBootstrap({
  user,
  fetchMembership,
} = {}) {
  captureInviteTokenFromLocation()

  const pendingToken = readPendingInviteToken()
  let inviteSucceeded = false
  let inviteErrorMessage = ''

  const membershipBeforeAttempts = await fetchMembership().catch(() => null)
  if (membershipBeforeAttempts) {
    if (pendingToken) {
      clearPendingInviteToken()
    }
    return {
      inviteSucceeded: true,
      inviteErrorMessage: '',
    }
  }

  const attempts = buildInviteBootstrapAttemptPlan({
    pendingToken,
    userEmail: user?.email,
    hasMembership: false,
  })

  for (const attempt of attempts) {
    try {
      if (attempt.kind === 'token') {
        const workspaceName = await tryAcceptInviteToken(attempt.token)
        inviteSucceeded = true
        clearPendingInviteToken()
        writeInviteAcceptedNotice(buildInviteAcceptedNotice(workspaceName))
        break
      }

      if (attempt.kind === 'email') {
        const acceptedMembership = await acceptPendingInviteForAuthenticatedUser()
        if (acceptedMembership) {
          inviteSucceeded = true
          writeInviteAcceptedNotice(buildInviteAcceptedNotice(''))
          break
        }
      }
    } catch (error) {
      const message = error?.message || 'Unable to accept workspace invite.'
      const membership = await fetchMembership().catch(() => null)
      const resolution = resolveInviteAcceptanceError({
        errorMessage: message,
        hasMembership: Boolean(membership),
      })

      if (resolution.shouldClearToken) {
        clearPendingInviteToken()
      }

      if (resolution.recovered || membership) {
        inviteSucceeded = true
        inviteErrorMessage = ''
        break
      }

      if (resolution.shouldSurfaceError) {
        inviteErrorMessage = formatInviteErrorMessage(message)
      }
    }
  }

  return {
    inviteSucceeded,
    inviteErrorMessage,
  }
}
