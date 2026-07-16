/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileMenuView } from './MobileMenuView'

function renderMenu(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileMenuView, {
      role: 'waiter',
      roleLabel: 'Waiter',
      profileName: 'Alex Staff',
      venueName: 'Amore',
      menuVariant: 'staff',
      onOpenProfile: vi.fn(),
      onSignOut: vi.fn(),
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('MobileMenuView Request Leave entry', () => {
  it('shows Request Leave for staff when canRequestLeave is true', () => {
    const onOpenRequestLeave = vi.fn()
    const { container, unmount } = renderMenu({
      canRequestLeave: true,
      onOpenRequestLeave,
    })

    const button = Array.from(container.querySelectorAll('button.mobile-menu-btn'))
      .find((node) => node.textContent === 'Request Leave')

    expect(button).toBeTruthy()
    expect(button?.getAttribute('aria-haspopup')).toBe('dialog')

    act(() => {
      button.click()
    })

    expect(onOpenRequestLeave).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('hides Request Leave when canRequestLeave is false', () => {
    const { container, unmount } = renderMenu({
      canRequestLeave: false,
      onOpenRequestLeave: vi.fn(),
    })

    const labels = Array.from(container.querySelectorAll('button.mobile-menu-btn'))
      .map((node) => node.textContent)

    expect(labels).not.toContain('Request Leave')
    unmount()
  })

  it('does not show Request Leave on manager menu even when gated true', () => {
    const { container, unmount } = renderMenu({
      menuVariant: 'manager',
      canRequestLeave: true,
      onOpenRequestLeave: vi.fn(),
    })

    const labels = Array.from(container.querySelectorAll('button'))
      .map((node) => node.textContent)

    expect(labels.some((text) => text.includes('Request Leave'))).toBe(false)
    unmount()
  })

  it('does not show Request Leave on host menu even when gated true', () => {
    const { container, unmount } = renderMenu({
      menuVariant: 'host',
      canRequestLeave: true,
      onOpenRequestLeave: vi.fn(),
    })

    const labels = Array.from(container.querySelectorAll('button.mobile-menu-btn'))
      .map((node) => node.textContent)

    expect(labels).not.toContain('Request Leave')
    unmount()
  })
})

describe('MobileMenuView Leave inbox entry', () => {
  it('shows Leave inbox for manager when canViewLeaveInbox is true', () => {
    const onOpenLeaveInbox = vi.fn()
    const { container, unmount } = renderMenu({
      role: 'manager',
      roleLabel: 'Manager',
      menuVariant: 'manager',
      canViewLeaveInbox: true,
      onOpenLeaveInbox,
    })

    const button = Array.from(container.querySelectorAll('button.mobile-manager-menu-nav-card'))
      .find((node) => node.textContent?.includes('Leave inbox'))

    expect(button).toBeTruthy()
    expect(button?.textContent).toContain('Pending leave requests')

    act(() => {
      button.click()
    })

    expect(onOpenLeaveInbox).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('hides Leave inbox when canViewLeaveInbox is false', () => {
    const { container, unmount } = renderMenu({
      role: 'manager',
      roleLabel: 'Manager',
      menuVariant: 'manager',
      canViewLeaveInbox: false,
      onOpenLeaveInbox: vi.fn(),
    })

    const titles = Array.from(container.querySelectorAll('.mobile-manager-menu-nav-title'))
      .map((node) => node.textContent)

    expect(titles).not.toContain('Leave inbox')
    unmount()
  })

  it('does not show Leave inbox on staff menu even when gated true', () => {
    const { container, unmount } = renderMenu({
      menuVariant: 'staff',
      canViewLeaveInbox: true,
      onOpenLeaveInbox: vi.fn(),
    })

    expect(container.textContent).not.toContain('Leave inbox')
    unmount()
  })
})
