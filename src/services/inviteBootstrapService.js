import {
  buildInviteAcceptedNotice,
  formatInviteErrorMessage,
  parseInviteTokenInput,
  pastedInviteDecision,
} from '../lib/inviteFlowUtils'
import {
  buildInviteBootstrapAttemptPlan,
  resolveInviteAcceptanceError,
} from '../lib/inviteBootstrapUtils'
import { writeInviteAcceptedNotice } from '../lib/inviteNoticeStorage'
import { t } from '../i18n/i18n'
import { getWorkspaceRoleLabel } from '../lib/membershipRoles'
import {
  captureInviteTokenFromLocation,
  clearPendingInviteToken,
  readPendingInviteToken,
  writePendingInviteToken,
} from '../lib/inviteTokenStorage'
import { supabase } from '../lib/supabaseClient'
import { setStoredActiveWorkspaceId, venueSwitcherLabel } from './membershipService'
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

function acceptedWorkspaceId(record) {
  return `${record?.workspace_id ?? record?.workspaceId ?? ''}`.trim()
}

function acceptedRole(record) {
  return `${record?.role ?? ''}`.trim()
}

async function readVenueDisplayName(workspaceId, fallback = '') {
  const id = `${workspaceId ?? ''}`.trim()
  const backup = `${fallback ?? ''}`.trim()
  if (!id || typeof supabase?.from !== 'function') return backup
  try {
    const { data, error } = await supabase
      .from('workspace_profiles')
      .select('business_name')
      .eq('workspace_id', id)
      .limit(1)
    if (error) return backup
    const row = Array.isArray(data) ? data[0] : null
    return venueSwitcherLabel(row?.business_name, backup)
  } catch {
    return backup
  }
}

async function rememberAcceptedVenue(record, fallbackName = '') {
  const workspaceId = acceptedWorkspaceId(record)
  if (workspaceId) setStoredActiveWorkspaceId(workspaceId)
  const venueName = await readVenueDisplayName(workspaceId, fallbackName)
  const roleLabel = acceptedRole(record) ? getWorkspaceRoleLabel(acceptedRole(record)) : ''
  writeInviteAcceptedNotice(buildInviteAcceptedNotice(venueName, roleLabel))
  return { workspaceId, venueName, roleLabel }
}

export async function acceptPastedWorkspaceInvite({ raw, user } = {}) {
  const token = parseInviteTokenInput(raw)
  if (!token) {
    throw new Error(t("Paste an invite link or code."))
  }

  let preview
  try {
    preview = await getInvitePreview(token)
  } catch (error) {
    throw new Error(formatInviteErrorMessage(error?.message || ''))
  }

  const decision = pastedInviteDecision({ preview, userEmail: user?.email })
  if (!decision.ok) {
    throw new Error(decision.message)
  }

  const accepted = await acceptInvite(token)
  const remembered = await rememberAcceptedVenue(accepted, preview?.workspaceName)
  await clearStoredInviteToken(token)
  return remembered
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
  let workspaceId = ''

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
        const invitePreview = await getInvitePreview(attempt.token).catch(() => null)
        const accepted = await acceptInvite(attempt.token)
        const remembered = await rememberAcceptedVenue(accepted, invitePreview?.workspaceName)
        workspaceId = remembered.workspaceId
        inviteSucceeded = true
        await clearStoredInviteToken(attempt.token)
        break
      }

      if (attempt.kind === 'email') {
        const acceptedMembership = await acceptPendingInviteForAuthenticatedUser()
        if (acceptedMembership) {
          const remembered = await rememberAcceptedVenue(acceptedMembership, '')
          workspaceId = remembered.workspaceId
          inviteSucceeded = true
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
    workspaceId,
  }
}
