/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationQuickCreateSheet } from './MobileReservationQuickCreateSheet'

vi.mock('../../../lib/PublishedFloorPlanContext', () => ({
  usePublishedFloorPlan: () => ({
    layout: {
      zones: [{ id: 'main', label: 'Main Dining' }],
      units: [
        { id: 't18', label: 'T18', zoneId: 'main', seatedCapacity: 4, maxGuestCapacity: 4 },
      ],
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

function renderSheet({ onSubmit = vi.fn(async () => true), ...props } = {}) {
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
      onSubmit,
      ...props,
    }))
  })

  return {
    container,
    onSubmit,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('MobileReservationQuickCreateSheet table picker integration', () => {
  it('does not render Recommended in the closed seating field', () => {
    const { container, unmount } = renderSheet({
      prefill: { time: '21:00' },
    })

    const seatingSelect = container.querySelector('[data-testid="host-quick-create-seating"]')
    expect(seatingSelect).toBeTruthy()
    expect(seatingSelect?.value).toBe('dinner-2')
    expect(seatingSelect?.selectedOptions[0]?.textContent).toBe('Dinner 2 · 21:00–23:00')
    expect(seatingSelect?.selectedOptions[0]?.textContent).not.toContain('Recommended')

    unmount()
  })

  it('selects a table and passes assignedUnits to Save Reservation', async () => {
    const onSubmit = vi.fn(async () => true)
    const { container, unmount } = renderSheet({
      prefill: {
        time: '21:00',
        seatingId: 'dinner-2',
        seatingAreaId: 'main',
        area: 'Main Dining',
      },
      onSubmit,
    })

    const t18Button = [...container.querySelectorAll('.mobile-host-quick-create-table-option')]
      .find((button) => button.textContent?.includes('T18'))

    await act(async () => {
      t18Button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="host-quick-create-table-status"]')?.textContent)
      .toBe('Selected table · T18')

    const saveButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Save reservation')

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].assignedUnits).toHaveLength(1)
    expect(onSubmit.mock.calls[0][0].assignedUnits[0].id).toBe('t18')

    unmount()
  })
})
