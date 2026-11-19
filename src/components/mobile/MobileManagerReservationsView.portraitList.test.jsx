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

  it('highlights Today in gold only when the selected day is not today', () => {
    render({ reservations: [], dateKey: '2026-11-07', todayKey: '2026-11-06' })
    const todayButton = () => [...container.querySelectorAll('.manager-portrait-date-nav button')]
      .find((node) => node.textContent === 'Today')
    expect(todayButton().classList.contains('is-other-day')).toBe(true)
    expect(todayButton().disabled).toBe(false)
    const css = readFileSync(resolve(process.cwd(), 'src/safeOverlay.css'), 'utf8')
    expect(css).toContain('.manager-portrait-date-nav > button.is-other-day')
    expect(css).toContain('.host-workspace-date-nav-today.is-other-day')
    expect(css).toContain('.mobile-host-sticky-date-today-btn.is-other-day')
    expect(css).toContain('background: var(--one-gold) !important')
    expect(css).toContain('color: var(--one-on-gold) !important')
    act(() => {
      root.render(createElement(MobileManagerReservationsView, {
        reservations: [],
        seatings: SEATINGS,
        dateKey: '2026-11-06',
        todayKey: '2026-11-06',
        canManage: true,
      }))
    })
    expect(todayButton().classList.contains('is-other-day')).toBe(false)
    expect(todayButton().disabled).toBe(true)
  })

  it('keeps the empty day as text only, with the header actions once', () => {
    render({ reservations: [], dateKey: '2026-11-07', todayKey: '2026-11-07' })
    expect(container.querySelector('.manager-portrait-empty')?.textContent).toContain('No bookings for this day.')
    const actionRows = container.querySelectorAll('.manager-portrait-create-actions')
    expect(actionRows).toHaveLength(1)
    expect(actionRows[0].closest('.manager-portrait-screen-header')).toBeTruthy()
    expect(container.querySelector('.manager-portrait-empty button')).toBeNull()
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

  it('lets seating chips wrap so the last seating stays fully visible', () => {
    render()
    expect(container.querySelector('[data-testid="portrait-seatings"]')).toBeTruthy()
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
    expect(css).toMatch(/\.manager-portrait-seatings \{[^}]*flex-wrap:\s*wrap/s)
    expect(css).toMatch(/\.manager-portrait-seatings \{[^}]*overflow:\s*visible/s)
    expect(css).toMatch(/\.manager-portrait-seatings button \{[^}]*flex:\s*0 0 auto/s)
  })
})
