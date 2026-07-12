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

vi.mock('../../../lib/PublishedFloorPlanContext', () => ({
  usePublishedFloorPlan: () => ({
    layout: {
      zones: [{ id: 'main', label: 'Main Dining' }],
      units: [],
    },
  }),
}))

const SEATINGS = [
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    start_time: '21:00',
    duration_minutes: 120,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    sort_order: 0,
    is_active: true,
  },
]

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
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
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

  it('opens standard create from + Reservation and walk-in create from Walk-in button', async () => {
    splitViewportMock.isSplit = true
    const onCreateReservation = vi.fn(async () => true)
    const { container, unmount } = renderHostView({
      todayKey: '2026-07-10',
      nowMinutes: 728,
      reservationSeatings: SEATINGS,
      onCreateReservation,
    })

    await act(async () => {
      container.querySelector('[data-testid="host-standard-create-btn"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="host-quick-create-create-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="host-quick-create-eyebrow"]')?.textContent)
      .toBe('New reservation')

    await act(async () => {
      container.querySelector('.mobile-host-reservation-panel-header .mobile-sheet-close-btn')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      container.querySelector('[data-testid="host-walk-in-create-btn"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="host-quick-create-walk-in-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="host-quick-create-eyebrow"]')?.textContent)
      .toBe('NEW WALK-IN')
    expect(container.querySelector('[data-testid="host-quick-create-time-trigger"]')?.textContent)
      .toContain('12:15')

    fillGuestNameAndSubmitWalkIn(container, onCreateReservation)

    splitViewportMock.isSplit = false
    unmount()
  })
})

function setInputValue(input, value) {
  if (!input) return
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function fillGuestNameAndSubmitWalkIn(container, onCreateReservation) {
  act(() => {
    setInputValue(container.querySelector('input[autocomplete="given-name"]'), 'Jamie')
    setInputValue(container.querySelector('input[autocomplete="family-name"]'), 'Lee')
  })

  act(() => {
    container.querySelector('[data-testid="host-quick-create-primary-action"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

  expect(onCreateReservation).toHaveBeenCalled()
  const submitted = onCreateReservation.mock.calls.at(-1)?.[0]
  expect(submitted).toMatchObject({
    walkIn: true,
    guestName: 'Jamie Lee',
    date: '2026-07-10',
    time: '12:15',
  })
  expect(submitted.walkIn).toBe(true)
}
