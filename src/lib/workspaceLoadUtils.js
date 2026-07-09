import {
  isCompleteWorkspace,
  resolveActiveWorkspaceId,
} from '../services/workspaceService'

export const USER_WORKSPACE_LOADING_MESSAGE = 'Workspace is still loading. Please refresh if this continues.'

const INTERNAL_WORKSPACE_ERROR_PATTERN = /public\.workspaces|add a workspace row|relation\s+"|could not find the table|workspace_members table|rls|schema cache/i

export function isWorkspaceContextHydrated({ workspace = null, membership = null } = {}) {
  return Boolean(resolveActiveWorkspaceId({ workspace, membership }))
}

export function coerceHydratedWorkspace(workspace = null, membership = null) {
  const workspaceId = resolveActiveWorkspaceId({ workspace, membership })
  if (!workspaceId) return null

  if (isCompleteWorkspace(workspace) && `${workspace.id}`.trim() === workspaceId) {
    return workspace
  }

  const name = `${workspace?.name ?? ''}`.trim()

  return {
    id: workspaceId,
    name: name || 'Workspace',
    slug: `${workspace?.slug ?? ''}`.trim(),
    createdAt: workspace?.createdAt ?? null,
    updatedAt: workspace?.updatedAt ?? null,
  }
}

export function formatWorkspaceLoadErrorForUser(message = '') {
  const normalized = `${message ?? ''}`.trim()
  if (!normalized) {
    return USER_WORKSPACE_LOADING_MESSAGE
  }

  if (INTERNAL_WORKSPACE_ERROR_PATTERN.test(normalized)) {
    return USER_WORKSPACE_LOADING_MESSAGE
  }

  if (/not ready yet|unable to load workspace/i.test(normalized)) {
    return USER_WORKSPACE_LOADING_MESSAGE
  }

  return normalized.length > 160 ? USER_WORKSPACE_LOADING_MESSAGE : normalized
}

export function resolveWorkspaceLoadError({
  membership = null,
  resolvedWorkspace = null,
  fetchErrorMessage = '',
} = {}) {
  if (isWorkspaceContextHydrated({ workspace: resolvedWorkspace, membership })) {
    return null
  }

  return formatWorkspaceLoadErrorForUser(fetchErrorMessage)
}

export function shouldShowWorkspaceLoadError({
  workspaceLoadError = '',
  workspace = null,
  membership = null,
  isAuthLoading = false,
} = {}) {
  if (isAuthLoading || !`${workspaceLoadError ?? ''}`.trim()) {
    return false
  }

  return !isWorkspaceContextHydrated({ workspace, membership })
}
