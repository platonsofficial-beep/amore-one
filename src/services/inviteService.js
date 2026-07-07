import { supabase } from '../lib/supabaseClient'
import { normalizeWorkspaceRole } from '../lib/membershipRoles'
import { getSession } from './authService'

const WORKSPACE_INVITES_TABLE = 'workspace_invites'
const WORKSPACE_MEMBERS_TABLE = 'workspace_members'
const DEFAULT_INVITE_TTL_DAYS = 7

const INVITE_MANAGER_SELECT = [
  'id',
  'workspace_id',
  'employee_id',
  'email',
  'role',
  'token',
  'invited_by',
  'created_at',
  'expires_at',
  'accepted_at',
  'accepted_by',
  'revoked_at',
].join(', ')

const INVITE_STATUS_SELECT = [
  'id',
  'email',
  'role',
  'accepted_at',
  'accepted_by',
  'expires_at',
  'revoked_at',
].join(', ')

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
    || message.includes('could not find the function')
}

function generateInviteToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, '')}`
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function buildInviteExpiryDate(days = DEFAULT_INVITE_TTL_DAYS) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)
  return expiresAt.toISOString()
}

function mapInvitePreview(record) {
  if (!record || record.found === false) {
    return {
      found: false,
      workspaceName: '',
      employeeName: '',
      email: '',
      isExpired: false,
      isRevoked: false,
      isAccepted: false,
    }
  }

  return {
    found: Boolean(record.found),
    workspaceName: `${record.workspace_name ?? ''}`.trim(),
    employeeName: `${record.employee_name ?? ''}`.trim(),
    email: `${record.email ?? ''}`.trim(),
    isExpired: Boolean(record.is_expired),
    isRevoked: Boolean(record.is_revoked),
    isAccepted: Boolean(record.is_accepted),
  }
}

function mapInvite(record) {
  if (!record) return null

  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? null,
    employeeId: record.employee_id ?? record.employeeId ?? null,
    email: `${record.email ?? ''}`.trim(),
    role: normalizeWorkspaceRole(record.role),
    token: `${record.token ?? ''}`.trim(),
    invitedBy: record.invited_by ?? record.invitedBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    expiresAt: record.expires_at ?? record.expiresAt ?? null,
    acceptedAt: record.accepted_at ?? record.acceptedAt ?? null,
    acceptedBy: record.accepted_by ?? record.acceptedBy ?? null,
    revokedAt: record.revoked_at ?? record.revokedAt ?? null,
  }
}

async function revokeActiveInvitesForEmployee(workspaceId, employeeId) {
  const { error } = await supabase
    .from(WORKSPACE_INVITES_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('employee_id', employeeId)
    .is('accepted_at', null)
    .is('revoked_at', null)

  if (error) {
    console.warn('[inviteService] revokeActiveInvitesForEmployee error:', error)
    throw new Error(error.message || 'Unable to revoke existing invite.')
  }
}

export async function createEmployeeInvite({
  workspaceId,
  employeeId,
  email = '',
  role = 'staff',
  expiresInDays = DEFAULT_INVITE_TTL_DAYS,
} = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()
  const normalizedEmail = `${email ?? ''}`.trim()

  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create an invite.')
  }

  if (!normalizedEmployeeId) {
    throw new Error('Employee is required to create an invite.')
  }

  const session = await getSession()
  const invitedBy = `${session?.user?.id ?? ''}`.trim()
  if (!invitedBy) {
    throw new Error('Authenticated user is required to create an invite.')
  }

  await revokeActiveInvitesForEmployee(normalizedWorkspaceId, normalizedEmployeeId)

  const payload = {
    workspace_id: normalizedWorkspaceId,
    employee_id: normalizedEmployeeId,
    email: normalizedEmail,
    role: normalizeWorkspaceRole(role),
    token: generateInviteToken(),
    invited_by: invitedBy,
    expires_at: buildInviteExpiryDate(expiresInDays),
  }

  const { data, error } = await supabase
    .from(WORKSPACE_INVITES_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[inviteService] createEmployeeInvite error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace invites are not ready yet.')
    }

    throw new Error(error.message || 'Unable to create invite right now.')
  }

  return mapInvite(data)
}

export async function getInvitePreview(token) {
  const normalizedToken = `${token ?? ''}`.trim()
  if (!normalizedToken) {
    throw new Error('Invite token is required.')
  }

  const { data, error } = await supabase.rpc('get_workspace_invite_preview', {
    p_token: normalizedToken,
  })

  if (error) {
    console.error('[inviteService] getInvitePreview error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace invites are not ready yet.')
    }

    throw new Error(error.message || 'Unable to load invite preview right now.')
  }

  return mapInvitePreview(data)
}

export async function acceptInvite(token) {
  const normalizedToken = `${token ?? ''}`.trim()
  if (!normalizedToken) {
    throw new Error('Invite token is required.')
  }

  const session = await getSession()
  if (!session?.user?.id) {
    throw new Error('Authentication required to accept an invite.')
  }

  const { data, error } = await supabase.rpc('accept_workspace_invite', {
    p_token: normalizedToken,
  })

  if (error) {
    console.error('[inviteService] acceptInvite error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace invites are not ready yet.')
    }

    throw new Error(error.message || 'Unable to accept invite right now.')
  }

  return data
}

export function buildInviteUrl(token) {
  const normalizedToken = `${token ?? ''}`.trim()
  if (!normalizedToken) return ''

  if (typeof window === 'undefined') {
    return `?invite=${encodeURIComponent(normalizedToken)}`
  }

  const url = new URL(window.location.origin)
  url.searchParams.set('invite', normalizedToken)
  return url.toString()
}

export async function getPendingEmployeeInvite(workspaceId, employeeId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()

  if (!normalizedWorkspaceId || !normalizedEmployeeId) {
    return null
  }

  const { data, error } = await supabase
    .from(WORKSPACE_INVITES_TABLE)
    .select(INVITE_MANAGER_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('employee_id', normalizedEmployeeId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[inviteService] getPendingEmployeeInvite error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace invites are not ready yet.')
    }

    throw new Error(error.message || 'Unable to load pending invite right now.')
  }

  return mapInvite(data)
}

export async function getLatestAcceptedEmployeeInvite(workspaceId, employeeId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()

  if (!normalizedWorkspaceId || !normalizedEmployeeId) {
    return null
  }

  const { data, error } = await supabase
    .from(WORKSPACE_INVITES_TABLE)
    .select(INVITE_STATUS_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('employee_id', normalizedEmployeeId)
    .not('accepted_at', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[inviteService] getLatestAcceptedEmployeeInvite error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace invites are not ready yet.')
    }

    throw new Error(error.message || 'Unable to load invite history right now.')
  }

  return data ? mapInvite(data) : null
}

export async function getEmployeeLinkedMembership(workspaceId, employeeId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()

  if (!normalizedWorkspaceId || !normalizedEmployeeId) {
    return null
  }

  const { data, error } = await supabase
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id, workspace_id, auth_user_id, employee_id, display_name, email, role')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('employee_id', normalizedEmployeeId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[inviteService] getEmployeeLinkedMembership error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace members are not ready yet.')
    }

    throw new Error(error.message || 'Unable to load linked account right now.')
  }

  if (!data) return null

  return {
    id: data.id,
    workspaceId: data.workspace_id ?? null,
    authUserId: data.auth_user_id ?? null,
    employeeId: data.employee_id ?? null,
    displayName: `${data.display_name ?? ''}`.trim(),
    email: `${data.email ?? ''}`.trim(),
    role: normalizeWorkspaceRole(data.role),
  }
}

export async function getEmployeeAccountConnectionStatus(workspaceId, employeeId) {
  const [pendingInvite, linkedMembership, acceptedInvite] = await Promise.all([
    getPendingEmployeeInvite(workspaceId, employeeId),
    getEmployeeLinkedMembership(workspaceId, employeeId),
    getLatestAcceptedEmployeeInvite(workspaceId, employeeId),
  ])

  const isConnected = Boolean(linkedMembership?.authUserId) || Boolean(acceptedInvite?.acceptedAt)

  return {
    pendingInvite,
    linkedMembership,
    acceptedInvite,
    isConnected,
  }
}

export async function revokeInvite(inviteId) {
  const normalizedInviteId = `${inviteId ?? ''}`.trim()
  if (!normalizedInviteId) {
    throw new Error('Invite id is required.')
  }

  const { data, error } = await supabase
    .from(WORKSPACE_INVITES_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', normalizedInviteId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[inviteService] revokeInvite error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace invites are not ready yet.')
    }

    throw new Error(error.message || 'Unable to revoke invite right now.')
  }

  if (!data) {
    throw new Error('Invite could not be revoked.')
  }

  return mapInvite(data)
}
