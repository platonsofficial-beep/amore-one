/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationsHostView } from './MobileReservationsHostView'

const splitViewportMock = vi.hoisted(() => ({
  isSplit: false,
}))

vi.mock('../../../lib/mobileHostReservationUtils', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isMobileHostSplitViewport: () => splitViewportMock.isSplit,
  }
})

function renderHostView(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationsHostView, {
      reservations: [],
      todayKey: '2026-07-10',
      nowMinutes: 720,
      canEditFloorPlan: true,
      hasLayout: false,
      onOpenFloorPlanLayout: vi.fn(),
      onExitHostMode: vi.fn(),
      renderRightPane: () => createElement('div', { 'data-testid': 'right-pane' }),
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

describe('MobileReservationsHostView header actions', () => {
  beforeEach(() => {
    splitViewportMock.isSplit = false
  })

  it('keeps portrait filter tabs outside split layout', () => {
    const { container, unmount } = renderHostView()

    expect(container.querySelector('.mobile-host-reservations-tabs')).not.toBeNull()
    expect(container.querySelector('.host-reservation-list-sections')).toBeNull()

    unmount()
  })

  it('hides the header layout action when no published layout exists', () => {
    const { container, unmount } = renderHostView({ hasLayout: false })

    expect(container.querySelector('.mobile-host-layout-btn')).toBeNull()
    expect(container.querySelector('.mobile-host-floor-empty-action')).toBeNull()

    unmount()
  })

  it('shows Settings in the header when host settings are available', () => {
    const { container, unmount } = renderHostView({
      hasLayout: true,
      hostSettingsProps: {
        profile: { name: 'Host User' },
        workspaceProfile: { businessName: 'Amore' },
        onSignOut: vi.fn(),
      },
    })

    const settingsButton = container.querySelector('.mobile-host-settings-btn')
    expect(settingsButton?.textContent).toBe('⚙ Settings')
    expect(container.querySelector('.mobile-host-layout-btn')).toBeNull()

    unmount()
  })

  it('shows Exit for manager-style host mode but not for dedicated host station', () => {
    const withExit = renderHostView({ onExitHostMode: vi.fn() })
    expect(withExit.container.querySelector('.mobile-host-mode-exit-btn')?.textContent).toBe('Exit')
    withExit.unmount()

    const withoutExit = renderHostView({ onExitHostMode: undefined })
    expect(withoutExit.container.querySelector('.mobile-host-mode-exit-btn')).toBeNull()
    withoutExit.unmount()
  })
})
