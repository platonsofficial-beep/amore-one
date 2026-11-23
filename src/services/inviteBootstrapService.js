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
  writePendingInviteToken,
} from '../lib/inviteTokenStorage'
import { supabase } from '../lib/supabaseClient'
import { setStoredActiveWorkspaceId } from './membershipService'
import { acceptInvite, acceptPendingInviteForAuthenticatedUser, getInvitePreview } from './inviteService'

function inviteTokenFromUser(user) {
  return `${user?.user_metadata?.invite_token ?? ''}`.trim()
}

async function clearStoredInviteToken(token) {
  clearPendingInviteToken()
  if (!token) return
  try {
    await supabase.auth.updateUser({ data: { invite_token: '' } })
  } catch {
    // The local token is already cleared. A leftover metadata copy is ignored after accept.
  }
}

async function tryAcceptInviteToken(token) {
  const invitePreview = await getInvitePreview(token).catch(() => null)
  const accepted = await acceptInvite(token)
  const workspaceId = `${accepted?.workspace_id ?? accepted?.workspaceId ?? ''}`.trim()
  if (workspaceId) setStoredActiveWorkspaceId(workspaceId)
  return {
    workspaceName: invitePreview?.workspaceName ?? '',
    workspaceId,
  }
}

export async function resolveWorkspaceInviteOnBootstrap({
  user,
  fetchMembership,
} = {}) {
  captureInviteTokenFromLocation()
  const metadataToken = inviteTokenFromUser(user)
  if (metadataToken && !readPendingInviteToken()) {
    writePendingInviteToken(metadataToken)
  }

  const pendingToken = readPendingInviteToken()
  let inviteSucceeded = false
  let inviteErrorMessage = ''

  const membershipBeforeAttempts = await fetchMembership().catch(() => null)
  if (membershipBeforeAttempts && !pendingToken) {
    return {
      inviteSucceeded: true,
      inviteErrorMessage: '',
    }
  }

  const attempts = buildInviteBootstrapAttemptPlan({
    pendingToken,
    userEmail: user?.email,
    hasMembership: Boolean(membershipBeforeAttempts),
  })

  for (const attempt of attempts) {
    try {
      if (attempt.kind === 'token') {
        const acceptedInvite = await tryAcceptInviteToken(attempt.token)
        inviteSucceeded = true
        await clearStoredInviteToken(attempt.token)
        writeInviteAcceptedNotice(buildInviteAcceptedNotice(acceptedInvite.workspaceName))
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
