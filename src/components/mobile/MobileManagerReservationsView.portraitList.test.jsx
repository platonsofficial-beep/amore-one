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
