// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const authState = { current: {} }
vi.mock('../../context/AuthContext', () => ({
  BOOTSTRAP_TIMEOUT_MESSAGE: 'TIMEOUT_MSG',
  useAuth: () => authState.current,
}))
vi.mock('./LoginView', () => ({ LoginView: () => null }))

import { AuthGate } from './AuthGate'

afterEach(() => vi.unstubAllGlobals())

const renderWith = (membershipLoadError) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  authState.current = { session: { user: { id: 'u' } }, isBootstrapping: false, isLoading: false,
    isJoiningWorkspace: false, isAuthDisabled: false, membership: null, membershipLoadError, signOut: vi.fn() }
  const c = document.createElement('div'); const root = createRoot(c)
  act(() => root.render(createElement(AuthGate, null, 'app')))
  const title = c.querySelector('.auth-title')?.textContent
  const buttons = [...c.querySelectorAll('button')].map((b) => b.textContent)
  act(() => root.unmount())
  return { title, buttons }
}

describe('AuthGate error title', () => {
  it('shows «Πρόβλημα σύνδεσης» with Try again for the bootstrap timeout', () => {
    const r = renderWith('TIMEOUT_MSG')
    expect(r.title).toBe('Πρόβλημα σύνδεσης')
    expect(r.buttons).toEqual(['Try again', 'Sign out'])
  })
  it('keeps the existing title for other join errors', () => {
    expect(renderWith('Invite expired').title).toBe('Unable to join workspace')
  })
})
