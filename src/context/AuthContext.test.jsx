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
  getCurrentMembershipContext: vi.fn(), getCurrentMembershipContextWithRetry: vi.fn(),
}))

import { getCurrentMembershipContext } from '../services/membershipService'
import { AuthProvider, useAuth } from './AuthContext'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('membership refresh', () => {
  it('reloads the membership after a profile save and normalizes employee linkage', async () => {
    vi.stubEnv('VITE_AUTH_DISABLED', 'true')
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const membership = { id: 'member', role: 'staff', employee_id: 'employee', displayName: 'Updated' }
    getCurrentMembershipContext.mockResolvedValue({ membership })
    let auth
    function Consumer() {
      auth = useAuth()
      return null
    }
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => root.render(createElement(AuthProvider, null, createElement(Consumer))))
      let result
      await act(async () => { result = await auth.refreshMembership() })
      expect(getCurrentMembershipContext).toHaveBeenCalledWith('dev-local-user')
      expect(result).toMatchObject({ displayName: 'Updated', employeeId: 'employee' })
      expect(auth.membership).toEqual(result)
    } finally {
      await act(async () => root.unmount())
    }
  })
})
