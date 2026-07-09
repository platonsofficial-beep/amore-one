import { describe, expect, it } from 'vitest'
import {
  USER_WORKSPACE_LOADING_MESSAGE,
  coerceHydratedWorkspace,
  formatWorkspaceLoadErrorForUser,
  isWorkspaceContextHydrated,
  resolveWorkspaceLoadError,
  shouldShowWorkspaceLoadError,
} from './workspaceLoadUtils'

describe('workspaceLoadUtils', () => {
  it('treats membership workspace id as hydrated context', () => {
    expect(isWorkspaceContextHydrated({
      workspace: null,
      membership: { workspaceId: 'ws-1' },
    })).toBe(true)
  })

  it('coerces a membership-backed workspace when workspaces row is unreadable', () => {
    expect(coerceHydratedWorkspace(null, { workspaceId: 'ws-1' })).toEqual({
      id: 'ws-1',
      name: 'Workspace',
      slug: '',
      createdAt: null,
      updatedAt: null,
    })
  })

  it('replaces internal setup copy with a user-safe loading message', () => {
    expect(formatWorkspaceLoadErrorForUser(
      'No workspace found in public.workspaces. Add a workspace row to continue.',
    )).toBe(USER_WORKSPACE_LOADING_MESSAGE)
  })

  it('suppresses workspace load errors once context is hydrated', () => {
    expect(resolveWorkspaceLoadError({
      membership: { workspaceId: 'ws-1' },
      resolvedWorkspace: null,
      fetchErrorMessage: 'No workspace found in public.workspaces. Add a workspace row to continue.',
    })).toBeNull()
  })

  it('shows a safe message only when workspace context is missing', () => {
    expect(resolveWorkspaceLoadError({
      membership: null,
      resolvedWorkspace: null,
      fetchErrorMessage: 'No workspace found in public.workspaces. Add a workspace row to continue.',
    })).toBe(USER_WORKSPACE_LOADING_MESSAGE)
  })

  it('hides stale workspace errors when membership context is valid', () => {
    expect(shouldShowWorkspaceLoadError({
      workspaceLoadError: 'No workspace found in public.workspaces. Add a workspace row to continue.',
      workspace: null,
      membership: { workspaceId: 'ws-1' },
      isAuthLoading: false,
    })).toBe(false)
  })
})
