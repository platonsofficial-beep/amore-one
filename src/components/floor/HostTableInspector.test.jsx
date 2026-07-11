/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HostTableInspector } from './HostTableInspector'
import { useHostTableInspectorEscape } from './HostTableInspectorContent'

const SEATING = {
  id: 'dinner-1',
  name: 'Dinner 1',
  startTime: '19:00',
  durationMinutes: 120,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
}

function renderInspector(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(HostTableInspector, {
      isOpen: true,
      table: { id: 't102', label: 'T102', maxGuestCapacity: 2 },
      tableLabel: 'T102',
      areaLabel: 'Main Dining',
      dateLabel: 'Saturday, July 11',
      rows: [{
        seating: SEATING,
        reservation: null,
        conflicts: [],
        hasConflict: false,
        isAvailable: true,
        timeWindowLabel: '19:00–21:00',
        state: 'available',
      }],
      onClose: vi.fn(),
      onNewReservation: vi.fn(),
      ...props,
    }))
  })

  return {
    container,
    root,
    query: (selector) => document.querySelector('[data-testid="host-table-inspector"]')?.querySelector(selector) ?? document.querySelector(selector),
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
      document.querySelectorAll('[data-testid="host-table-inspector"]').forEach((node) => node.remove())
    },
  }
}

describe('HostTableInspector', () => {
  it('renders premium header and available seating action', () => {
    const { query, cleanup } = renderInspector()

    expect(document.querySelector('[data-testid="host-table-inspector"]')).not.toBeNull()
    expect(document.querySelector('#host-table-inspector-title')?.textContent).toBe('T102')
    expect(document.querySelector('.host-table-inspector-summary')?.textContent).toContain('Available now')
    expect(query('[data-testid="floor-table-day-new-reservation"]')).not.toBeNull()
    cleanup()
  })

  it('uses shared status icon-circle structure on occupied cards', () => {
    const { cleanup } = renderInspector({
      rows: [{
        seating: SEATING,
        reservation: {
          id: 'res-1',
          guestName: 'Fournie',
          guests: 2,
          time: '20:30',
          status: 'Checked In',
          seatingAssignment: {
            assignedUnits: [{ id: 't102', label: 'T102' }],
            extraChairs: 1,
            standingGuests: 0,
          },
        },
        conflicts: [],
        hasConflict: false,
        isAvailable: false,
        timeWindowLabel: '19:00–21:00',
        state: 'seated',
        statusLabel: 'Checked In',
        assignedTablesLabel: 'T102',
        quickActions: [{ id: 'complete', label: 'Complete', status: 'Checked Out', variant: 'secondary' }],
      }],
    })

    const pill = document.querySelector('.selected-reservation-status')
    expect(pill?.querySelector('.selected-reservation-status-icon')?.textContent).toBe('🍽')
    expect(pill?.querySelector('.selected-reservation-status-label')?.textContent).toBe('Seated')
    cleanup()
  })

  it('calls close callback from close button and escape hook', () => {
    const onClose = vi.fn()
    const { cleanup } = renderInspector({ onClose })

    act(() => {
      document.querySelector('[data-testid="floor-table-day-close"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    cleanup()
  })

  it('does not render a full-screen backdrop', () => {
    renderInspector()
    expect(document.querySelector('.floor-table-seating-dialog-backdrop')).toBeNull()
    expect(document.querySelector('.floor-table-seating-dialog-overlay')).toBeNull()
    document.querySelectorAll('[data-testid="host-table-inspector"]').forEach((node) => node.remove())
  })
})

describe('useHostTableInspectorEscape', () => {
  it('exports escape listener hook', () => {
    expect(typeof useHostTableInspectorEscape).toBe('function')
  })
})
