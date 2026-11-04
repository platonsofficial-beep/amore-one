// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/authService', () => ({
  getSession: vi.fn(() => new Promise(() => {})), onAuthStateChange: vi.fn(() => () => {}),
  resetPasswordForEmail: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), signUp: vi.fn(),
}))

import { AuthProvider, BOOTSTRAP_TIMEOUT_MS, useAuth } from './AuthContext'
import { AuthGate } from '../components/auth/AuthGate'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('auth bootstrap timeout', () => {
  it('stops "Loading session…" when getSession never resolves', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    let auth
    function Consumer() { auth = useAuth(); return null }
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(createElement(AuthProvider, null, createElement(Consumer), createElement(AuthGate, null, 'app'))))
    expect(auth.isBootstrapping).toBe(true)
    expect(container.textContent).toContain('Loading session…')
    await act(async () => { vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 10) })
    expect(auth.isBootstrapping).toBe(false)
    expect(auth.session).toBeNull()
    expect(container.textContent).not.toContain('Loading session…')
    act(() => root.unmount())
  })
})
