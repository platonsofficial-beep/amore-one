/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationQuickCreateSheet } from './MobileReservationQuickCreateSheet'
import { buildHostQuickCreateTimeTabSlots } from './HostQuickCreateTimePicker'

vi.mock('../../../lib/PublishedFloorPlanContext', () => ({
  usePublishedFloorPlan: () => ({
    layout: {
      zones: [{ id: 'main', label: 'Main Dining' }],
      units: [],
    },
  }),
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

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

function renderSheet(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationQuickCreateSheet, {
      isOpen: true,
      variant: 'inline',
      todayKey: '2026-07-10',
      seatings: SEATINGS,
      reservations: [],
      onClose: vi.fn(),
      onSubmit: vi.fn(async () => true),
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
      document.body.querySelector('.host-quick-create-time-picker-backdrop')?.remove()
    },
  }
}

describe('HostQuickCreateTimePicker slot ranges', () => {
  it('builds 15-minute slots for each tab range', () => {
    expect(buildHostQuickCreateTimeTabSlots('morning')).toEqual([
      '07:00', '07:15', '07:30', '07:45',
      '08:00', '08:15', '08:30', '08:45',
      '09:00', '09:15', '09:30', '09:45',
      '10:00', '10:15', '10:30', '10:45',
      '11:00', '11:15', '11:30', '11:45',
      '12:00', '12:15', '12:30', '12:45',
      '13:00', '13:15', '13:30', '13:45',
    ])
    expect(buildHostQuickCreateTimeTabSlots('afternoon')[0]).toBe('15:00')
    expect(buildHostQuickCreateTimeTabSlots('afternoon').at(-1)).toBe('19:45')
    expect(buildHostQuickCreateTimeTabSlots('night')[0]).toBe('20:00')
    expect(buildHostQuickCreateTimeTabSlots('night').at(-1)).toBe('00:45')
    expect(buildHostQuickCreateTimeTabSlots('all-day')[0]).toBe('07:00')
    expect(buildHostQuickCreateTimeTabSlots('all-day').at(-1)).toBe('00:45')
  })
})

describe('MobileReservationQuickCreateSheet time picker', () => {
  it('opens the tabbed time picker from the Time field', async () => {
    const { container, unmount } = renderSheet()

    expect(document.querySelector('[data-testid="host-quick-create-time-picker"]')).toBeNull()

    await act(async () => {
      container.querySelector('[data-testid="host-quick-create-time-trigger"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.querySelector('[data-testid="host-quick-create-time-picker"]')).not.toBeNull()
    expect(document.querySelector('.host-quick-create-time-picker-tab.is-active')?.textContent)
      .toBe('All Day')

    unmount()
  })

  it('updates the Time field and closes after selecting a slot', async () => {
    const { container, unmount } = renderSheet({ prefill: { time: '21:00' } })

    const trigger = container.querySelector('[data-testid="host-quick-create-time-trigger"]')
    expect(trigger?.textContent).toContain('21:00')

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      [...document.querySelectorAll('[data-testid="host-quick-create-time-slot"]')]
        .find((button) => button.textContent === '20:30')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.querySelector('[data-testid="host-quick-create-time-picker"]')).toBeNull()
    expect(container.querySelector('[data-testid="host-quick-create-time-trigger"]')?.textContent)
      .toContain('20:30')

    unmount()
  })

  it('closes without changing the selected time when Cancel is tapped', async () => {
    const { container, unmount } = renderSheet({ prefill: { time: '21:00' } })

    await act(async () => {
      container.querySelector('[data-testid="host-quick-create-time-trigger"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      document.querySelector('[data-testid="host-quick-create-time-cancel"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.querySelector('[data-testid="host-quick-create-time-picker"]')).toBeNull()
    expect(container.querySelector('[data-testid="host-quick-create-time-trigger"]')?.textContent)
      .toContain('21:00')

    unmount()
  })
})
