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

import { acceptPastedWorkspaceInvite, resolveWorkspaceInviteOnBootstrap } from './inviteBootstrapService'
import { clearPendingInviteToken, writePendingInviteToken } from '../lib/inviteTokenStorage'
import { readAndClearInviteAcceptedNotice } from '../lib/inviteNoticeStorage'

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

const openPreview = {
  found: true,
  workspaceName: 'SENTIO NICOSIA',
  email: 'guest@example.com',
  isExpired: false,
  isRevoked: false,
  isAccepted: false,
}

describe('acceptPastedWorkspaceInvite', () => {
  beforeEach(() => {
    acceptInvite.mockReset()
    getInvitePreview.mockReset()
    setStoredActiveWorkspaceId.mockReset()
    updateUser.mockReset()
    updateUser.mockResolvedValue({ data: {} })
    installWindow()
    clearPendingInviteToken()
  })

  it('asks for the invite link when the paste is empty, and still accepts a bare token', async () => {
    await expect(acceptPastedWorkspaceInvite({
      raw: '   ',
      user: { email: 'guest@example.com' },
    })).rejects.toThrow('Paste the link you received to join the venue.')
    expect(acceptInvite).not.toHaveBeenCalled()

    getInvitePreview.mockResolvedValue(openPreview)
    acceptInvite.mockResolvedValue({ workspace_id: 'ws-sentio', role: 'manager' })
    await acceptPastedWorkspaceInvite({
      raw: 'paste-1',
      user: { email: 'guest@example.com' },
    })
    expect(acceptInvite).toHaveBeenCalledWith('paste-1')
  })

  it('accepts a pasted link, switches to that venue, and stores the joined notice', async () => {
    getInvitePreview.mockResolvedValue(openPreview)
    acceptInvite.mockResolvedValue({ workspace_id: 'ws-sentio', role: 'manager' })

    const result = await acceptPastedWorkspaceInvite({
      raw: 'https://app.onehospitality.app/?invite=paste-1',
      user: { email: 'guest@example.com' },
    })

    expect(acceptInvite).toHaveBeenCalledWith('paste-1')
    expect(setStoredActiveWorkspaceId).toHaveBeenCalledWith('ws-sentio')
    expect(result.workspaceId).toBe('ws-sentio')
    expect(readAndClearInviteAcceptedNotice()).toBe('You joined SENTIO NICOSIA as Manager.')
  })

  it('does not accept an invite sent to a different email', async () => {
    getInvitePreview.mockResolvedValue(openPreview)

    await expect(acceptPastedWorkspaceInvite({
      raw: 'paste-1',
      user: { email: 'other@example.com' },
    })).rejects.toThrow(/guest@example.com/)
    expect(acceptInvite).not.toHaveBeenCalled()
  })

  it('does not accept an expired, revoked, used, or unknown invite', async () => {
    getInvitePreview.mockResolvedValue({ ...openPreview, isRevoked: true })
    await expect(acceptPastedWorkspaceInvite({
      raw: 'paste-1',
      user: { email: 'guest@example.com' },
    })).rejects.toThrow(/no longer active|cancelled/i)

    getInvitePreview.mockResolvedValue({ found: false })
    await expect(acceptPastedWorkspaceInvite({
      raw: 'missing',
      user: { email: 'guest@example.com' },
    })).rejects.toThrow(/not valid|not found/i)
    expect(acceptInvite).not.toHaveBeenCalled()
  })
})
