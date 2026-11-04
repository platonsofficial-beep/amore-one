// @vitest-environment jsdom
// Cold open with the instant-start boot cache: the ONE logo intro still plays
// once at its normal length, then the cached app shows; it never waits on the
// network behind the splash, and does not replay after a background return.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/authService', () => ({
  getSession: vi.fn(() => new Promise(() => {})), onAuthStateChange: vi.fn(() => () => {}),
  resetPasswordForEmail: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), signUp: vi.fn(),
}))
vi.mock('../../services/memberPermissionService', () => ({ fetchMemberPermissionRows: vi.fn(() => new Promise(() => {})) }))

import { AuthProvider, useAuth } from '../../context/AuthContext'
import { writeBootCache } from '../../lib/bootCache'
import { ColdStartSplash, resetColdStartSplashForTests } from './ColdStartSplash'

const user = { id: 'user-1', email: 'o@example.com' }
const splash = (c) => c.querySelector('[data-testid="cold-start-splash"]')

let container
let root
let auth
function Consumer() { auth = useAuth(); return null }
function mount() {
  act(() => root.render(createElement(AuthProvider, null, createElement(Consumer), createElement(ColdStartSplash))))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })
  resetColdStartSplashForTests()
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('cold-start splash with the boot cache', () => {
  it('plays the full 2.6s intro, then the cached app shows while the network still hangs', () => {
    localStorage.setItem('sb-ref-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'r', expires_at: 1, user }))
    writeBootCache({ userId: 'user-1', membership: { id: 'm', workspaceId: 'ws', role: 'owner' }, workspace: { id: 'ws', name: 'V' } })
    mount()
    expect(splash(container)).toBeTruthy()
    expect(auth.isBootstrapping).toBe(false) // cached app is ready behind the logo
    act(() => { vi.advanceTimersByTime(2599) })
    expect(splash(container).classList.contains('is-fading')).toBe(false)
    act(() => { vi.advanceTimersByTime(1) })
    expect(splash(container).classList.contains('is-fading')).toBe(true)
    act(() => { vi.advanceTimersByTime(150) })
    expect(splash(container)).toBeNull()
    expect(auth.membership?.role).toBe('owner')
  })

  it('does not replay after returning from the background', () => {
    localStorage.setItem('sb-ref-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'r', expires_at: 1, user }))
    writeBootCache({ userId: 'user-1', membership: { id: 'm', workspaceId: 'ws', role: 'owner' }, workspace: { id: 'ws', name: 'V' } })
    mount()
    act(() => { vi.advanceTimersByTime(2600) })
    act(() => { vi.advanceTimersByTime(150) })
    expect(splash(container)).toBeNull()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
    mount()
    expect(splash(container)).toBeNull()
  })

  it('without a cache keeps the existing behaviour (hold to the 4s cap; 15s session timeout continues)', () => {
    mount()
    expect(auth.isBootstrapping).toBe(true)
    act(() => { vi.advanceTimersByTime(2600) })
    expect(splash(container).classList.contains('is-fading')).toBe(false)
    act(() => { vi.advanceTimersByTime(1400) })
    expect(splash(container).classList.contains('is-fading')).toBe(true)
    expect(auth.isBootstrapping).toBe(true)
  })
})
