import { supabase } from '../lib/supabaseClient'

const WORKSPACES_TABLE = 'workspaces'

const WORKSPACE_SELECT_COLUMNS = [
  'id',
  'name',
  'slug',
  'created_at',
  'updated_at',
].join(', ')

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

export function mapWorkspace(record) {
  if (!record) return null

  const id = record.id ?? record.workspace_id ?? record.workspaceId ?? null
  const name = `${record.name ?? ''}`.trim()
  const slug = `${record.slug ?? ''}`.trim()

  if (!id && !name) return null

  return {
    id,
    name,
    slug,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

export function isCompleteWorkspace(workspace) {
  return Boolean(
    workspace
    && `${workspace.id ?? ''}`.trim()
    && `${workspace.name ?? ''}`.trim(),
  )
}

export function normalizeAuthWorkspace({
  membership = null,
  joinedWorkspace = null,
  fetchedWorkspace = null,
} = {}) {
  const membershipWorkspaceId = `${membership?.workspaceId ?? membership?.workspace_id ?? ''}`.trim()
  const candidates = [joinedWorkspace, fetchedWorkspace]

  for (const candidate of candidates) {
    const normalized = mapWorkspace(
      Array.isArray(candidate) ? candidate[0] : candidate,
    )

    if (isCompleteWorkspace(normalized)) {
      return normalized
    }

    if (normalized?.id && membershipWorkspaceId && normalized.id === membershipWorkspaceId && normalized.name) {
      return normalized
    }
  }

  for (const candidate of candidates) {
    const normalized = mapWorkspace(
      Array.isArray(candidate) ? candidate[0] : candidate,
    )

    if (normalized?.id) {
      return {
        ...normalized,
        id: normalized.id || membershipWorkspaceId,
      }
    }
  }

  if (membershipWorkspaceId) {
    return {
      id: membershipWorkspaceId,
      name: '',
      slug: '',
      createdAt: null,
      updatedAt: null,
    }
  }

  return null
}

export async function getDefaultWorkspace() {
  const { data, error } = await supabase
    .from(WORKSPACES_TABLE)
    .select(WORKSPACE_SELECT_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[workspaceService] getDefaultWorkspace error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspaces table is not ready yet.')
    }

    return null
  }

  return mapWorkspace(data)
}

export async function getCurrentWorkspace() {
  return getDefaultWorkspace()
}

export async function getWorkspaceById(workspaceId) {
  const normalizedId = `${workspaceId ?? ''}`.trim()
  if (!normalizedId) return null

  const { data, error } = await supabase
    .from(WORKSPACES_TABLE)
    .select(WORKSPACE_SELECT_COLUMNS)
    .eq('id', normalizedId)
    .maybeSingle()

  if (error) {
    console.error('[workspaceService] getWorkspaceById error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Workspaces table is not ready yet.')
    }

    return null
  }

  return mapWorkspace(data)
}

export async function resolveWorkspaceForMembership(workspaceId) {
  const normalizedId = `${workspaceId ?? ''}`.trim()

  if (normalizedId) {
    const workspaceById = await getWorkspaceById(normalizedId)
    if (workspaceById) {
      return workspaceById
    }
  }

  return getDefaultWorkspace()
}
