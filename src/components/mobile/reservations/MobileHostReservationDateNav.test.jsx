/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationsHostView } from './MobileReservationsHostView'

const splitViewportMock = vi.hoisted(() => ({
  isSplit: true,
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
      reservations: [
        {
          id: 'res-today',
          guestName: 'Today Guest',
          guests: 2,
          time: '20:00',
          date: '2026-07-10',
          status: 'Confirmed',
        },
        {
          id: 'res-other',
          guestName: 'Other Day Guest',
          guests: 2,
          time: '20:00',
          date: '2026-07-11',
          status: 'Confirmed',
        },
      ],
      todayKey: '2026-07-10',
      workspaceTodayKey: '2026-07-10',
      nowMinutes: 720,
      renderRightPane: () => createElement('div', { 'data-testid': 'right-pane' }),
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
      document.body.querySelector('.mobile-host-date-picker-backdrop')?.remove()
    },
  }
}

describe('MobileHostReservationDateNav', () => {
  beforeEach(() => {
    splitViewportMock.isSplit = true
  })

  it('shows Today label when viewing the workspace today', () => {
    const { container, unmount } = renderHostView()

    expect(container.querySelector('[data-testid="mobile-host-date-label"]')?.textContent)
      .toMatch(/^Today · /)

    unmount()
  })

  it('opens the calendar picker from the date label and calendar button', async () => {
    const onSelectDate = vi.fn()
    const { container, unmount } = renderHostView({ onSelectDate })

    await act(async () => {
      container.querySelector('[data-testid="mobile-host-date-label"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.querySelector('[data-testid="mobile-host-date-picker"]')).not.toBeNull()

    await act(async () => {
      document.querySelector('.mobile-host-date-picker-backdrop')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.querySelector('[data-testid="mobile-host-date-picker"]')).toBeNull()

    await act(async () => {
      container.querySelector('[data-testid="mobile-host-date-calendar"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.querySelector('[data-testid="mobile-host-date-picker"]')).not.toBeNull()

    unmount()
  })

  it('updates the selected date and reservation list when a day is chosen', async () => {
    const onSelectDate = vi.fn()
    const { container, unmount } = renderHostView({ onSelectDate })

    await act(async () => {
      container.querySelector('[data-testid="mobile-host-date-calendar"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const dayButton = [...document.querySelectorAll('.host-workspace-date-picker-day')]
      .find((button) => button.getAttribute('aria-label') === '2026-07-11')

    await act(async () => {
      dayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-11')
    expect(document.querySelector('[data-testid="mobile-host-date-picker"]')).toBeNull()

    unmount()
  })

  it('shows a plain date label when viewing a non-today date', () => {
    const { container, unmount } = renderHostView({
      todayKey: '2026-07-11',
      workspaceTodayKey: '2026-07-10',
    })

    const label = container.querySelector('[data-testid="mobile-host-date-label"]')?.textContent ?? ''
    expect(label).not.toMatch(/^Today · /)
    expect(label.length).toBeGreaterThan(0)

    unmount()
  })
})
