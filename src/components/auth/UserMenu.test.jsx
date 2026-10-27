/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { AvatarDirectoryContext } from '../../context/AvatarDirectoryContext'
import { UserMenu } from './UserMenu'

const useAuthMock = vi.hoisted(() => vi.fn())

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

function renderMenu(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onAccountAction = vi.fn()
  act(() => {
    root.render(createElement(UserMenu, {
      profileChipDisplay: { name: 'Test Host', isConfigured: true },
      onOpenWorkspaceProfile: vi.fn(),
      canOpenWorkspaceProfile: true,
      onOpenNotifications: vi.fn(),
      accountActions: [
        { id: 'my-week', label: 'My week' },
        { id: 'account', label: 'Profile' },
        { id: 'clock', label: 'Clock in/out' },
        { id: 'leave', label: 'Request Leave' },
      ],
      onAccountAction,
      ...props,
    }))
  })
  return {
    container,
    root,
    onAccountAction,
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('UserMenu', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('portals every entry, including Request Leave and Logout, onto the body', () => {
    useAuthMock.mockReturnValue({
      user: { email: 'host@example.com' },
      membership: { email: 'host@example.com', role: 'host' },
      role: 'host',
      roleLabel: 'Host',
      isAuthDisabled: false,
      signOut: vi.fn(),
    })
    window.innerWidth = 844
    window.innerHeight = 390

    const { container, unmount } = renderMenu()
    const trigger = container.querySelector('.user-menu-trigger')
    trigger.getBoundingClientRect = () => ({
      top: 200,
      bottom: 244,
      left: 760,
      right: 820,
      width: 60,
      height: 44,
    })

    act(() => {
      trigger.click()
    })

    const panel = document.querySelector('.user-menu-panel')
    expect(panel).toBeTruthy()
    expect(panel.parentElement).toBe(document.body)
    expect(container.querySelector('.user-menu-panel')).toBeNull()
    expect(panel.className).toContain('user-menu-panel-portaled')
    expect(Number.parseFloat(panel.style.maxHeight)).toBeGreaterThan(0)
    expect(Number.parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(390 - 16)

    for (const label of [
      'Open Workspace Profile',
      'Notifications',
      'My week',
      'Profile',
      'Clock in/out',
      'Request Leave',
      'Logout',
    ]) {
      expect(panel.textContent).toContain(label)
    }
    unmount()
  })

  it('keeps a menu click and closes on an outside pointer', () => {
    const signOut = vi.fn()
    useAuthMock.mockReturnValue({
      user: { email: 'host@example.com' },
      membership: { role: 'host' },
      role: 'host',
      roleLabel: 'Host',
      isAuthDisabled: false,
      signOut,
    })

    const { container, onAccountAction, unmount } = renderMenu()
    const trigger = container.querySelector('.user-menu-trigger')
    trigger.getBoundingClientRect = () => ({
      top: 20,
      bottom: 64,
      left: 400,
      right: 480,
      width: 80,
      height: 44,
    })

    act(() => {
      trigger.click()
    })

    const leave = [...document.querySelectorAll('.user-menu-item')].find((button) => button.textContent === 'Request Leave')
    act(() => {
      leave.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      leave.click()
    })
    expect(onAccountAction).toHaveBeenCalledWith('leave')
    expect(document.querySelector('.user-menu-panel')).toBeNull()

    act(() => {
      trigger.click()
    })
    expect(document.querySelector('.user-menu-panel')).toBeTruthy()
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(document.querySelector('.user-menu-panel')).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
    unmount()
  })

  it('shows a profile photo in the avatar and keeps initials when there is none', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', email: 'host@example.com' },
      membership: { id: 'member-1', email: 'host@example.com', role: 'host', authUserId: 'user-1' },
      role: 'host',
      roleLabel: 'Host',
      isAuthDisabled: false,
      signOut: vi.fn(),
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const directory = {
      lookup: ({ authUserId }) => (
        authUserId === 'user-1'
          ? { url: 'https://signed.example/host.jpg', updatedAt: '4', path: 'user-1/host.jpg' }
          : null
      ),
      setOptimistic() {},
      refresh: async () => {},
    }
    act(() => {
      root.render(createElement(AvatarDirectoryContext.Provider, { value: directory },
        createElement(UserMenu, {
          profileChipDisplay: { name: 'Test Host', isConfigured: true },
          onOpenWorkspaceProfile: vi.fn(),
          canOpenWorkspaceProfile: true,
          onOpenNotifications: vi.fn(),
          accountActions: [],
          onAccountAction: vi.fn(),
        }),
      ))
    })
    expect(container.querySelector('.profile-avatar img')?.getAttribute('src')).toBe('https://signed.example/host.jpg?v=4')
    act(() => root.unmount())
    container.remove()
  })
})
