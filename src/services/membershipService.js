import { supabase } from '../lib/supabaseClient'
import { normalizeWorkspaceRole } from '../lib/membershipRoles'
import { getSession } from './authService'
import { getDefaultWorkspace, mapWorkspace } from './workspaceService'

const WORKSPACE_MEMBERS_TABLE = 'workspace_members'

const MEMBERSHIP_SELECT = `
  id,
  workspace_id,
  auth_user_id,
  employee_id,
  display_name,
  email,
  role,
  created_at,
  last_seen_at,
  workspaces (
    id,
    name,
    slug,
    created_at,
    updated_at
  )
`.replace(/\s+/g, ' ').trim()

const MEMBERSHIP_ROW_SELECT = [
  'id',
  'workspace_id',
  'auth_user_id',
  'employee_id',
  'display_name',
  'email',
  'role',
  'created_at',
  'last_seen_at',
].join(', ')

const ROLE_PRIORITY = {
  owner: 0,
  general_manager: 1,
  manager: 2,
  staff: 3,
}

function pickPreferredMembershipRow(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  if (rows.length === 1) return rows[0]

  return [...rows].sort((left, right) => {
    const leftRole = `${left?.role ?? ''}`.trim().toLowerCase()
    const rightRole = `${right?.role ?? ''}`.trim().toLowerCase()
    const leftPriority = ROLE_PRIORITY[leftRole] ?? 99
    const rightPriority = ROLE_PRIORITY[rightRole] ?? 99

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    const leftCreatedAt = Date.parse(left?.created_at ?? '') || 0
    const rightCreatedAt = Date.parse(right?.created_at ?? '') || 0
    return rightCreatedAt - leftCreatedAt
  })[0]
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapMembership(record) {
  if (!record) return null

  const rawRole = `${record.role ?? ''}`.trim().toLowerCase()

  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? null,
    authUserId: record.auth_user_id ?? record.authUserId ?? null,
    employeeId: record.employee_id ?? record.employeeId ?? null,
    displayName: `${record.display_name ?? record.displayName ?? ''}`.trim(),
    email: `${record.email ?? ''}`.trim(),
    role: rawRole,
    createdAt: record.created_at ?? record.createdAt ?? null,
    lastSeenAt: record.last_seen_at ?? record.lastSeenAt ?? null,
  }
}

function mapMembershipWorkspace(record) {
  const rawWorkspace = record?.workspaces ?? null
  if (!rawWorkspace) return null

  const workspaceRecord = Array.isArray(rawWorkspace) ? rawWorkspace[0] : rawWorkspace
  return mapWorkspace(workspaceRecord)
}

function pickFirstMembershipRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

async function fetchMembershipRowById(membershipId) {
  const { data, error } = await supabase
    .from(WORKSPACE_MEMBERS_TABLE)
    .select(MEMBERSHIP_ROW_SELECT)
    .eq('id', membershipId)
    .limit(1)

  if (error) {
    console.error('[membershipService] fetchMembershipRowById error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace members table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load workspace membership right now.')
  }

  return pickFirstMembershipRow(data)
}

function serializeMembershipPayload({
  workspaceId,
  authUserId,
  employeeId = null,
  displayName = '',
  email = '',
  role = 'staff',
}) {
  return {
    workspace_id: workspaceId,
    auth_user_id: authUserId,
    employee_id: employeeId,
    display_name: `${displayName ?? ''}`.trim(),
    email: `${email ?? ''}`.trim(),
    role: normalizeWorkspaceRole(role),
    last_seen_at: new Date().toISOString(),
  }
}

function resolveUserIdentity(user = {}) {
  const email = `${user.email ?? ''}`.trim()
  const metadataName = `${user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''}`.trim()
  const displayName = metadataName || email.split('@')[0] || 'Workspace member'

  return { email, displayName }
}

async function countWorkspaceMembers(workspaceId) {
  const { count, error } = await supabase
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('[membershipService] countWorkspaceMembers error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace members table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to count workspace members right now.')
  }

  return count ?? 0
}

async function fetchMembershipContext(authUserId) {
  const session = await getSession()
  const sessionUserId = `${session?.user?.id ?? ''}`.trim()
  const normalizedUserId = `${authUserId ?? sessionUserId ?? ''}`.trim()

  if (!normalizedUserId) {
    return { membership: null, workspace: null, joinedWorkspaceRecord: null }
  }

  const { data, error } = await supabase
    .from(WORKSPACE_MEMBERS_TABLE)
    .select(MEMBERSHIP_SELECT)
    .eq('auth_user_id', normalizedUserId)

  if (error) {
    console.error('[membershipService] getCurrentMembership error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace members table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load workspace membership right now.')
  }

  const rows = Array.isArray(data) ? data : (data ? [data] : [])
  const selectedRow = pickPreferredMembershipRow(rows)

  const joinedWorkspaceRecord = selectedRow?.workspaces ?? null

  return {
    membership: mapMembership(selectedRow),
    workspace: mapMembershipWorkspace(selectedRow),
    joinedWorkspaceRecord,
  }
}

export async function getCurrentMembership(authUserId) {
  const { membership } = await fetchMembershipContext(authUserId)
  return membership
}

export async function getCurrentMembershipContext(authUserId) {
  return fetchMembershipContext(authUserId)
}

export async function createOwnerMembershipIfMissing(user) {
  const authUserId = `${user?.id ?? ''}`.trim()
  if (!authUserId) {
    throw new Error('Authenticated user is required to create workspace membership.')
  }

  const existingMembership = await getCurrentMembership(authUserId)

  if (existingMembership) {
    return existingMembership
  }

  const workspace = await getDefaultWorkspace()
  if (!workspace?.id) {
    return null
  }

  const memberCount = await countWorkspaceMembers(workspace.id)
  const role = memberCount === 0 ? 'owner' : 'staff'
  const { email, displayName } = resolveUserIdentity(user)
  const payload = serializeMembershipPayload({
    workspaceId: workspace.id,
    authUserId,
    displayName,
    email,
    role,
  })

  const { data, error } = await supabase
    .from(WORKSPACE_MEMBERS_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[membershipService] createOwnerMembershipIfMissing error:', error)

    if (`${error.code ?? ''}` === '23505') {
      const existing = await getCurrentMembership(authUserId)
      if (existing) {
        return existing
      }

      throw new Error(
        'Workspace membership already exists but could not be loaded. '
        + 'Check workspace_members RLS SELECT policy for authenticated users.',
      )
    }

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace members table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to create workspace membership right now.')
  }

  return mapMembership(data)
}

export async function linkMembershipEmployee(membershipId, employeeId) {
  const normalizedMembershipId = `${membershipId ?? ''}`.trim()
  if (!normalizedMembershipId) {
    throw new Error('Membership is required to link an employee.')
  }

  const normalizedEmployeeId = employeeId ? `${employeeId}`.trim() : null

  const { data, error } = await supabase
    .from(WORKSPACE_MEMBERS_TABLE)
    .update({
      employee_id: normalizedEmployeeId,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', normalizedMembershipId)
    .select(MEMBERSHIP_ROW_SELECT)
    .maybeSingle()

  if (error) {
    console.error('[membershipService] linkMembershipEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspace members table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to link employee to workspace membership right now.')
  }

  let updatedRow = pickFirstMembershipRow(data)

  if (!updatedRow) {
    updatedRow = await fetchMembershipRowById(normalizedMembershipId)
  }

  if (!updatedRow) {
    throw new Error('Employee link saved but membership could not be reloaded.')
  }

  return mapMembership(updatedRow)
}
