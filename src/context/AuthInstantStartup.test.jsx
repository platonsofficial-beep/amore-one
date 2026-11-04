// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/authService', () => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(), signOut: vi.fn(async () => {}), signUp: vi.fn(),
}))
vi.mock('../services/inviteBootstrapService', () => ({ resolveWorkspaceInviteOnBootstrap: vi.fn() }))
vi.mock('../services/membershipService', () => ({
  createOwnerMembershipIfMissing: vi.fn(async () => null), getCurrentMembership: vi.fn(),
  getCurrentMembershipContext: vi.fn(), getCurrentMembershipContextWithRetry: vi.fn(),
  setStoredActiveWorkspaceId: vi.fn(),
}))
vi.mock('../services/memberPermissionService', () => ({ fetchMemberPermissionRows: vi.fn(async () => []) }))

import { getSession, onAuthStateChange } from '../services/authService'
import { resolveWorkspaceInviteOnBootstrap } from '../services/inviteBootstrapService'
import { getCurrentMembershipContext, getCurrentMembershipContextWithRetry } from '../services/membershipService'
import { AuthProvider, BOOTSTRAP_TIMEOUT_MESSAGE, BOOTSTRAP_TIMEOUT_MS, MEMBERSHIP_LOST_MESSAGE, useAuth } from './AuthContext'
import { BOOT_CACHE_KEY, readBootCache, writeBootCache } from '../lib/bootCache'

const user = { id: 'user-1', email: 'owner@example.com' }
const storedSession = { access_token: 'expired', refresh_token: 'r', expires_at: 1, user }
const ws = { id: 'ws-1', name: 'Venue', slug: 'venue', createdAt: null, updatedAt: null }
const wsRecord = { id: 'ws-1', name: 'Venue', slug: 'venue', created_at: '2026-01-01', updated_at: '2026-01-01' }
const ownerMembership = { id: 'm-1', workspaceId: 'ws-1', role: 'owner', authUserId: 'user-1' }
const never = () => new Promise(() => {})

function seedCache() {
  localStorage.setItem('sb-testref-auth-token', JSON.stringify(storedSession))
  writeBootCache({ userId: 'user-1', membership: ownerMembership, memberships: [], workspace: ws })
}

let listener = null
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  onAuthStateChange.mockImplementation((cb) => { listener = cb; return () => {} })
  resolveWorkspaceInviteOnBootstrap.mockImplementation(async ({ fetchMembership }) => {
    const found = await fetchMembership()
    return { inviteSucceeded: Boolean(found), inviteErrorMessage: '' }
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear() })

async function mount() {
  let auth
  function Consumer() { auth = useAuth(); return null }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(AuthProvider, null, createElement(Consumer))))
  return { root, get: () => auth }
}

describe('instant startup from the boot cache', () => {
  it('renders from cache without waiting for the network', async () => {
    seedCache()
    getSession.mockImplementation(never)
    const { root, get } = await mount()
    try {
      expect(get().isBootstrapping).toBe(false)
      expect(get().session?.user?.id).toBe('user-1')
      expect(get().membership?.role).toBe('owner')
      expect(get().workspace?.id).toBe('ws-1')
    } finally { await act(async () => root.unmount()) }
  })

  it('background revalidation updates a changed role and the cache', async () => {
    seedCache()
    getSession.mockResolvedValue({ ...storedSession, access_token: 'fresh' })
    getCurrentMembershipContext.mockResolvedValue({
      membership: { ...ownerMembership, role: 'manager' }, memberships: [], workspace: wsRecord, joinedWorkspaceRecord: wsRecord,
    })
    const { root, get } = await mount()
    try {
      await act(async () => {})
      expect(get().membership?.role).toBe('manager')
      expect(readBootCache('user-1')?.membership?.role).toBe('manager')
    } finally { await act(async () => root.unmount()) }
  })

  it('keeps the cached context when revalidation fails on the network', async () => {
    seedCache()
    getSession.mockResolvedValue(storedSession)
    getCurrentMembershipContext.mockRejectedValue(new Error('timeout'))
    const { root, get } = await mount()
    try {
      await act(async () => {})
      expect(get().membership?.role).toBe('owner')
      expect(get().membershipLoadError).toBeNull()
    } finally { await act(async () => root.unmount()) }
  })

  it('lost membership clears the context and shows the error flow', async () => {
    seedCache()
    getSession.mockResolvedValue(storedSession)
    const empty = { membership: null, memberships: [], workspace: null, joinedWorkspaceRecord: null }
    getCurrentMembershipContext.mockResolvedValue(empty)
    getCurrentMembershipContextWithRetry.mockResolvedValue(empty)
    const { root, get } = await mount()
    try {
      await act(async () => {})
      expect(get().membership).toBeNull()
      expect(get().membershipLoadError).toBe(MEMBERSHIP_LOST_MESSAGE)
      expect(localStorage.getItem(BOOT_CACHE_KEY)).toBeNull()
    } finally { await act(async () => root.unmount()) }
  })

  it('sign-out clears the cache', async () => {
    seedCache()
    getSession.mockImplementation(never)
    const { root, get } = await mount()
    try {
      await act(async () => { await get().signOut() })
      expect(localStorage.getItem(BOOT_CACHE_KEY)).toBeNull()
      expect(get().session).toBeNull()
    } finally { await act(async () => root.unmount()) }
  })

  it('a user switch clears the cache and never shows the old context', async () => {
    seedCache()
    getSession.mockImplementation(never)
    getCurrentMembershipContext.mockImplementation(never)
    const { root, get } = await mount()
    try {
      await act(async () => { listener('SIGNED_IN', { ...storedSession, user: { id: 'user-2' } }) })
      expect(readBootCache('user-1')).toBeNull()
      expect(get().user?.id).toBe('user-2')
      // a cache for another user is ignored
      writeBootCache({ userId: 'user-1', membership: ownerMembership, workspace: ws })
      expect(readBootCache('user-2')).toBeNull()
    } finally { await act(async () => root.unmount()) }
  })

  it('without a cache it waits and falls back to the 15s timeout', async () => {
    vi.useFakeTimers()
    localStorage.setItem('sb-testref-auth-token', JSON.stringify(storedSession))
    getSession.mockImplementation(never)
    const { root, get } = await mount()
    try {
      expect(get().isBootstrapping).toBe(true)
      await act(async () => { vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 10) })
      expect(get().isBootstrapping).toBe(false)
      expect(get().membershipLoadError).toBe(BOOTSTRAP_TIMEOUT_MESSAGE)
    } finally { await act(async () => root.unmount()) }
  })
})
