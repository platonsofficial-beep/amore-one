/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/PublishedFloorPlanContext', () => ({
  usePublishedFloorPlan: () => ({ layout: { tables: [{ id: 't1', label: 'T1', zoneId: 'main' }] } }),
}))

import { MobileManagerReservationsView } from './MobileManagerReservationsView'

const SEATINGS = [
  { id: 'brunch', name: 'Brunch', startTime: '10:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true, sortOrder: 0 },
  { id: 'lunch', name: 'Lunch', startTime: '12:30', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true, sortOrder: 1 },
  { id: 'dinner', name: 'Dinner', startTime: '19:00', durationMinutes: 150, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true, sortOrder: 2 },
]

const RESERVATIONS = [
  { id: 'b1', date: '2026-11-06', time: '10:30', guestName: 'Nikos', guests: 2, status: 'Confirmed' },
  { id: 'd1', date: '2026-11-06', time: '19:30', guestName: 'Maria', guests: 4, status: 'Pending' },
]

describe('portrait reservations list', () => {
  let container
  let root

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
  })

  function render(props = {}) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(MobileManagerReservationsView, {
        reservations: RESERVATIONS,
        seatings: SEATINGS,
        dateKey: '2026-11-06',
        todayKey: '2026-11-06',
        canManage: true,
        canEditFloorPlan: true,
        ...props,
      }))
    })
  }

  it('shows the guest list, Add, and selectable seatings without a floor or Edit layout', () => {
    render()
    const text = container.textContent
    expect(text).toContain('Nikos')
    expect(text).toContain('Maria')
    expect(container.querySelector('.manager-portrait-add')?.textContent).toBe('Walk-in')
    expect([...container.querySelectorAll('.manager-portrait-add')].map((node) => node.textContent)).toContain('Add')
    const chips = [...container.querySelectorAll('[data-testid="portrait-seatings"] button')].map((node) => node.textContent)
    expect(chips[0]).toContain('All')
    expect(chips.join(' ')).toContain('Brunch')
    expect(chips.join(' ')).toContain('Lunch')
    expect(chips.join(' ')).toContain('Dinner')
    expect(text).not.toContain('Edit layout')
    expect(text).not.toContain('Floor plan')
    expect(container.querySelector('[aria-label="Tables"]')).toBeNull()
    expect(container.querySelector('.manager-portrait-floor-editor')).toBeNull()
    expect(container.querySelector('.manager-portrait-banner')).toBeNull()
  })

  it('filters the list when a seating chip is tapped', () => {
    render()
    const dinner = [...container.querySelectorAll('[data-testid="portrait-seatings"] button')]
      .find((node) => node.textContent.includes('Dinner'))
    act(() => dinner.click())
    expect(container.textContent).toContain('Maria')
    expect(container.textContent).not.toContain('Nikos')
  })

  it('keeps a controlled seating and date, and stays truthful when the load failed', () => {
    const onSelectedSeatingChange = vi.fn()
    const onDateChange = vi.fn()
    render({
      reservations: [
        { id: 'brunch-guest', date: '2026-11-09', time: '10:30', guestName: 'Brunch Guest', guests: 2, status: 'Confirmed', seatingId: 'brunch' },
        { id: 'dinner-guest', date: '2026-11-09', time: '20:30', guestName: 'Kalamarou Kalamaras', guests: 2, status: 'Pending', seatingId: 'dinner' },
        { id: 'no-service', date: '2026-11-09', time: '', guestName: 'No Service', guests: 1, status: 'Pending' },
      ],
      dateKey: '2026-11-09',
      todayKey: '2026-11-09',
      selectedSeatingId: 'dinner',
      onSelectedSeatingChange,
      onDateChange,
    })
    expect(container.textContent).toContain('Kalamarou Kalamaras')
    expect(container.textContent).not.toContain('Brunch Guest')
    expect(container.textContent).not.toContain('No Service')
    const all = [...container.querySelectorAll('[data-testid="portrait-seatings"] button')]
      .find((node) => node.textContent.trim() === 'All')
    act(() => all.click())
    expect(onSelectedSeatingChange).toHaveBeenCalledWith('')
    act(() => {
      root.render(createElement(MobileManagerReservationsView, {
        reservations: [
          { id: 'brunch-guest', date: '2026-11-09', time: '10:30', guestName: 'Brunch Guest', guests: 2, status: 'Confirmed', seatingId: 'brunch' },
          { id: 'dinner-guest', date: '2026-11-09', time: '20:30', guestName: 'Kalamarou Kalamaras', guests: 2, status: 'Pending', seatingId: 'dinner' },
          { id: 'no-service', date: '2026-11-09', time: '', guestName: 'No Service', guests: 1, status: 'Pending' },
        ],
        seatings: SEATINGS,
        dateKey: '2026-11-09',
        todayKey: '2026-11-09',
        canManage: true,
        selectedSeatingId: null,
        onSelectedSeatingChange,
        onDateChange,
        noticeMessage: "Couldn't load",
      }))
    })
    expect(container.textContent).toContain("Couldn't load")
    expect(container.textContent).not.toContain('No bookings for this day.')
    const next = container.querySelector('[aria-label="Next day"]')
    act(() => next.click())
    expect(onDateChange).toHaveBeenCalled()
  })

  it('lets seating chips scroll sideways instead of clipping the row', () => {
    render()
    expect(container.querySelector('[data-testid="portrait-seatings"]')).toBeTruthy()
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
    expect(css).toMatch(/\.manager-portrait-seatings \{[^}]*overflow-x:\s*auto/s)
    expect(css).toMatch(/\.manager-portrait-seatings \{[^}]*padding-bottom:\s*12px/s)
    expect(css).not.toMatch(/\.manager-portrait-seatings \{[^}]*scrollbar-width:\s*none/s)
    expect(css).toMatch(/\.manager-portrait-seatings button \{[^}]*flex:\s*0 0 auto/s)
  })
})
