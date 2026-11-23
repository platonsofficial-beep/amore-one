import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  acceptInvite,
  getInvitePreview,
  acceptPendingInviteForAuthenticatedUser,
  setStoredActiveWorkspaceId,
  updateUser,
} = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  getInvitePreview: vi.fn(),
  acceptPendingInviteForAuthenticatedUser: vi.fn(),
  setStoredActiveWorkspaceId: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('./inviteService', () => ({
  acceptInvite: (...args) => acceptInvite(...args),
  getInvitePreview: (...args) => getInvitePreview(...args),
  acceptPendingInviteForAuthenticatedUser: (...args) => acceptPendingInviteForAuthenticatedUser(...args),
}))

vi.mock('./membershipService', () => ({
  setStoredActiveWorkspaceId: (...args) => setStoredActiveWorkspaceId(...args),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { updateUser: (...args) => updateUser(...args) } },
}))

import { resolveWorkspaceInviteOnBootstrap } from './inviteBootstrapService'
import { clearPendingInviteToken, writePendingInviteToken } from '../lib/inviteTokenStorage'

function installWindow() {
  const memory = new Map()
  const storage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null },
    setItem(key, value) { memory.set(key, `${value}`) },
    removeItem(key) { memory.delete(key) },
  }
  vi.stubGlobal('window', {
    sessionStorage: storage,
    localStorage: storage,
    location: { href: 'https://app.onehospitality.app/', search: '', pathname: '/' },
    history: { state: null, replaceState() {} },
  })
}

describe('resolveWorkspaceInviteOnBootstrap', () => {
  beforeEach(() => {
    acceptInvite.mockReset()
    getInvitePreview.mockReset()
    acceptPendingInviteForAuthenticatedUser.mockReset()
    setStoredActiveWorkspaceId.mockReset()
    updateUser.mockReset()
    updateUser.mockResolvedValue({ data: {} })
    installWindow()
    clearPendingInviteToken()
  })

  it('joins the invited venue even when the user already owns one', async () => {
    writePendingInviteToken('invite-1')
    getInvitePreview.mockResolvedValue({ workspaceName: 'SENTIO NICOSIA' })
    acceptInvite.mockResolvedValue({ workspace_id: 'ws-sentio', role: 'manager' })

    const result = await resolveWorkspaceInviteOnBootstrap({
      user: { email: 'guest@example.com', user_metadata: {} },
      fetchMembership: async () => ({ id: 'own-member', workspaceId: 'ws-own' }),
    })

    expect(acceptInvite).toHaveBeenCalledWith('invite-1')
    expect(setStoredActiveWorkspaceId).toHaveBeenCalledWith('ws-sentio')
    expect(acceptPendingInviteForAuthenticatedUser).not.toHaveBeenCalled()
    expect(result.inviteSucceeded).toBe(true)
  })

  it('does not accept anything when there is no pending invite', async () => {
    const result = await resolveWorkspaceInviteOnBootstrap({
      user: { email: 'guest@example.com', user_metadata: {} },
      fetchMembership: async () => ({ id: 'own-member', workspaceId: 'ws-own' }),
    })

    expect(acceptInvite).not.toHaveBeenCalled()
    expect(result.inviteSucceeded).toBe(true)
  })

  it('keeps a metadata invite when the confirmation link opened a new browser', async () => {
    getInvitePreview.mockResolvedValue({ workspaceName: 'SENTIO NICOSIA' })
    acceptInvite.mockResolvedValue({ workspace_id: 'ws-sentio', role: 'manager' })

    await resolveWorkspaceInviteOnBootstrap({
      user: { email: 'guest@example.com', user_metadata: { invite_token: 'from-mail' } },
      fetchMembership: async () => null,
    })

    expect(acceptInvite).toHaveBeenCalledWith('from-mail')
    expect(setStoredActiveWorkspaceId).toHaveBeenCalledWith('ws-sentio')
  })
})
