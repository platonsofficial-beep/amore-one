// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/authService', () => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(), signOut: vi.fn(), signUp: vi.fn(),
}))
vi.mock('../services/inviteBootstrapService', () => ({ resolveWorkspaceInviteOnBootstrap: vi.fn() }))
vi.mock('../services/membershipService', () => ({
  createOwnerMembershipIfMissing: vi.fn(), getCurrentMembership: vi.fn(),
  getCurrentMembershipContext: vi.fn(), getCurrentMembershipContextWithRetry: vi.fn(), setStoredActiveWorkspaceId: vi.fn(),
}))
vi.mock('../services/memberPermissionService', () => ({ fetchMemberPermissionRows: vi.fn(async () => []) }))

import { getSession, onAuthStateChange } from '../services/authService'
import { resolveWorkspaceInviteOnBootstrap } from '../services/inviteBootstrapService'
import { getCurrentMembershipContext, getCurrentMembershipContextWithRetry } from '../services/membershipService'
import { AuthProvider, useAuth } from './AuthContext'

const session = { user: { id: 'user-1', email: 'a@b.c' }, access_token: 't' }
const workspaceRecord = { id: 'ws-1', name: 'Venue', slug: 'venue', created_at: '2026-01-01', updated_at: '2026-01-01' }
const context = {
  membership: { id: 'm-1', workspaceId: 'ws-1', role: 'staff', authUserId: 'user-1' },
  memberships: [], workspace: workspaceRecord, joinedWorkspaceRecord: workspaceRecord,
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let listener = null
  onAuthStateChange.mockImplementation((cb) => { listener = cb; return () => {} })
  getSession.mockResolvedValue(session)
  getCurrentMembershipContext.mockResolvedValue(context)
  getCurrentMembershipContextWithRetry.mockResolvedValue(context)
  resolveWorkspaceInviteOnBootstrap.mockImplementation(async ({ fetchMembership }) => {
    const found = await fetchMembership()
    return { inviteSucceeded: Boolean(found), inviteErrorMessage: '' }
  })
  let auth
  function Consumer() { auth = useAuth(); return null }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(AuthProvider, null, createElement(Consumer))))
  await act(async () => {})
  return { root, getAuth: () => auth, fire: (event, s) => listener(event, s) }
}

describe('startup requests', () => {
  it('reuses the invite check membership read instead of fetching workspace_members again', async () => {
    const { root, getAuth } = await mount()
    try {
      expect(getCurrentMembershipContext).toHaveBeenCalledTimes(1)
      expect(getCurrentMembershipContextWithRetry).not.toHaveBeenCalled()
      expect(getAuth().membership?.workspaceId).toBe('ws-1')
    } finally { await act(async () => root.unmount()) }
  })

  it('does not reload the workspace context on SIGNED_IN for the same, already loaded user', async () => {
    const { root, fire } = await mount()
    try {
      await act(async () => { fire('SIGNED_IN', session); fire('USER_UPDATED', session) })
      expect(getCurrentMembershipContext).toHaveBeenCalledTimes(1)
      expect(resolveWorkspaceInviteOnBootstrap).toHaveBeenCalledTimes(1)
    } finally { await act(async () => root.unmount()) }
  })

  it('still loads the context for a different user', async () => {
    const { root, fire } = await mount()
    try {
      await act(async () => { fire('SIGNED_IN', { ...session, user: { id: 'user-2' } }) })
      expect(resolveWorkspaceInviteOnBootstrap).toHaveBeenCalledTimes(2)
    } finally { await act(async () => root.unmount()) }
  })
})
