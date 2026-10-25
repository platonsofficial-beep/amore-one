/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ManagerLandscapeGate } from './ManagerLandscapeGate'

const useAuthMock = vi.hoisted(() => vi.fn())

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

function authState(overrides = {}) {
  return {
    role: 'owner',
    isLoading: false,
    isBootstrapping: false,
    membership: { role: 'owner' },
    session: { user: { id: 'user-1' } },
    isAuthDisabled: false,
    ...overrides,
  }
}

function mockViewport({
  coarsePointer = false,
  isPortrait = false,
} = {}) {
  window.matchMedia = vi.fn((query) => ({
    matches: query === '(pointer: coarse)'
      ? coarsePointer
      : query === '(orientation: portrait)'
        ? isPortrait
        : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function renderGate() {
  const rootEl = document.createElement('div')
  rootEl.id = 'root'
  document.body.appendChild(rootEl)
  const root = createRoot(rootEl)

  act(() => {
    root.render(createElement(ManagerLandscapeGate, null, createElement('main', null, 'Workspace')))
  })

  return {
    rootEl,
    cleanup: () => {
      act(() => root.unmount())
      rootEl.remove()
      document.body.querySelectorAll('.manager-landscape-gate').forEach((node) => node.remove())
    },
  }
}

describe('ManagerLandscapeGate', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('covers the app for a manager on a touch device in portrait', async () => {
    const lock = vi.fn().mockRejectedValue(new Error('NotSupportedError'))
    const unlock = vi.fn()
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: { lock, unlock },
    })
    useAuthMock.mockReturnValue(authState())
    mockViewport({ coarsePointer: true, isPortrait: true })

    const { rootEl, cleanup } = renderGate()

    const prompt = document.body.querySelector('.manager-landscape-gate')
    expect(prompt).not.toBeNull()
    expect(prompt?.getAttribute('role')).toBe('alertdialog')
    expect(prompt?.textContent).toContain('Rotate your device')
    expect(rootEl.textContent).toContain('Workspace')
    expect(rootEl.getAttribute('inert')).toBe('')
    expect(rootEl.getAttribute('aria-hidden')).toBe('true')

    await act(async () => {
      await Promise.resolve()
    })
    expect(lock).toHaveBeenCalledWith('landscape')

    cleanup()
    expect(document.body.querySelector('.manager-landscape-gate')).toBeNull()
    expect(rootEl.getAttribute('inert')).toBeNull()
  })

  it.each([
    ['staff', { role: 'staff', membership: { role: 'staff' } }],
    ['host', { role: 'host', membership: { role: 'host' } }],
  ])('leaves %s in portrait', (_label, authOverrides) => {
    useAuthMock.mockReturnValue(authState(authOverrides))
    mockViewport({ coarsePointer: true, isPortrait: true })

    const { cleanup } = renderGate()
    expect(document.body.querySelector('.manager-landscape-gate')).toBeNull()
    cleanup()
  })

  it('ignores a narrow fine-pointer window', () => {
    useAuthMock.mockReturnValue(authState())
    mockViewport({ coarsePointer: false, isPortrait: true })
    window.innerWidth = 390
    window.innerHeight = 844

    const { cleanup } = renderGate()
    expect(document.body.querySelector('.manager-landscape-gate')).toBeNull()
    cleanup()
  })

  it('lets a manager use landscape', () => {
    useAuthMock.mockReturnValue(authState({ role: 'manager', membership: { role: 'manager' } }))
    mockViewport({ coarsePointer: true, isPortrait: false })

    const { cleanup } = renderGate()
    expect(document.body.querySelector('.manager-landscape-gate')).toBeNull()
    cleanup()
  })

  it('does not block while the role is still loading', () => {
    useAuthMock.mockReturnValue(authState({ isLoading: true, role: '' }))
    mockViewport({ coarsePointer: true, isPortrait: true })

    const { rootEl, cleanup } = renderGate()
    expect(document.body.querySelector('.manager-landscape-gate')).toBeNull()
    expect(rootEl.getAttribute('inert')).toBeNull()
    cleanup()
  })
})
