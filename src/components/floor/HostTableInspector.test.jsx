/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { HostTableInspector } from './HostTableInspector'
import { useHostTableInspectorEscape } from './HostTableInspectorContent'

const SEATING = {
  id: 'dinner-1',
  name: 'Dinner 1',
  startTime: '19:00',
  durationMinutes: 120,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
}

const ALL_AVAILABLE_SEATINGS = [
  {
    seating: { id: 'brunch', name: 'Brunch', startTime: '10:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    reservation: null,
    conflicts: [],
    hasConflict: false,
    isAvailable: true,
    timeWindowLabel: '10:00–12:00',
    state: 'available',
  },
  {
    seating: { id: 'lunch', name: 'Lunch', startTime: '12:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    reservation: null,
    conflicts: [],
    hasConflict: false,
    isAvailable: true,
    timeWindowLabel: '12:00–14:00',
    state: 'available',
  },
  {
    seating: { id: 'dinner-1', name: 'Dinner 1', startTime: '19:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    reservation: null,
    conflicts: [],
    hasConflict: false,
    isAvailable: true,
    timeWindowLabel: '19:00–21:00',
    state: 'available',
  },
  {
    seating: { id: 'dinner-2', name: 'Dinner 2', startTime: '21:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    reservation: null,
    conflicts: [],
    hasConflict: false,
    isAvailable: true,
    timeWindowLabel: '21:00–23:00',
    state: 'available',
  },
]

function renderInspector(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let renderedProps = {
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
  }

  act(() => {
    root.render(createElement(HostTableInspector, renderedProps))
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
  afterEach(() => {
    document.querySelectorAll('[data-testid="host-table-inspector"]').forEach((node) => node.remove())
  })
  it('renders premium header and compact available context strip', () => {
    const { query, cleanup } = renderInspector()

    expect(document.querySelector('[data-testid="host-table-inspector"]')).not.toBeNull()
    expect(document.querySelector('#host-table-inspector-title')?.textContent).toBe('T102')
    expect(document.querySelector('[data-testid="host-table-inspector-context"]')?.textContent)
      .toContain('Available now')
    expect(document.querySelector('.host-table-inspector-summary')).toBeNull()
    expect(query('[data-testid="floor-table-day-new-reservation"]')).not.toBeNull()
    cleanup()
  })

  it('renders occupied context strip without large uppercase summary block', () => {
    const { cleanup } = renderInspector({
      rows: [{
        seating: SEATING,
        reservation: { guestName: 'Fournie', time: '20:30', status: 'Checked In', guests: 2 },
        conflicts: [],
        hasConflict: false,
        isAvailable: false,
        timeWindowLabel: '19:00–21:00',
        state: 'seated',
        statusLabel: 'Checked In',
        assignedTablesLabel: 'T102',
      }],
    })

    const context = document.querySelector('[data-testid="host-table-inspector-context"]')
    expect(context?.textContent).toContain('🟢 Occupied · Since 20:30')
    expect(context?.querySelector('.host-table-inspector-context-guest')?.textContent).toBe('Fournie')
    expect(context?.textContent).not.toMatch(/OCCUPIED/)
    cleanup()
  })

  it('uses shared status icon-circle structure on hero occupied cards', () => {
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

    const hero = document.querySelector('.floor-table-day-row.is-hero-primary')
    expect(hero).not.toBeNull()
    const pill = hero?.querySelector('.selected-reservation-status')
    expect(pill?.querySelector('.selected-reservation-status-icon')?.textContent).toBe('🍽')
    expect(pill?.querySelector('.selected-reservation-status-label')?.textContent).toBe('Seated')
    expect(hero?.querySelectorAll('.selected-reservation-status')).toHaveLength(1)
    expect(hero?.textContent).toContain('+1 extra chair')
    cleanup()
  })

  it('hides extra-chair row when count is zero', () => {
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
            extraChairs: 0,
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
      }],
    })

    expect(document.querySelector('.floor-table-day-row.is-hero-primary')?.textContent)
      .not.toContain('extra chair')
    cleanup()
  })

  it('renders available seatings as compact timeline rows instead of large cards', () => {
    const { cleanup } = renderInspector({ rows: ALL_AVAILABLE_SEATINGS })

    expect(document.querySelector('[data-testid="host-table-inspector-available-timeline"]')).not.toBeNull()
    expect(document.querySelectorAll('.table-inspector-seating-row.is-available')).toHaveLength(4)
    expect(document.querySelector('.host-table-inspector .floor-table-day-row.is-available')).toBeNull()

    const firstRow = document.querySelector('.table-inspector-seating-row.is-available')
    expect(firstRow?.querySelector('.table-inspector-seating-heading strong')?.textContent).toBe('Brunch')
    expect(firstRow?.querySelector('.table-inspector-seating-heading time')?.textContent).toBe('10:00–12:00')
    expect(firstRow?.querySelector('.availability-state')?.textContent).toContain('Available')
    cleanup()
  })

  it('keeps New reservation button inside the seating row without clipping classes', () => {
    const { query, cleanup } = renderInspector({ rows: ALL_AVAILABLE_SEATINGS })

    const row = document.querySelector('.table-inspector-seating-row.is-available')
    const button = query('[data-testid="floor-table-day-new-reservation"]')
    expect(row?.contains(button)).toBe(true)
    expect(row?.classList.contains('is-compact-available-row')).toBe(false)
    expect(document.querySelector('.host-table-inspector-seating-timeline')?.className).not.toContain('overflow-hidden')
    cleanup()
  })

  it('keeps available seating compact and retains New reservation callback', () => {
    const onNewReservation = vi.fn()
    const { query, cleanup } = renderInspector({ onNewReservation })

    const availableRow = document.querySelector('.table-inspector-seating-row.is-available')
    expect(availableRow).not.toBeNull()
    expect(availableRow?.classList.contains('floor-table-day-row')).toBe(false)

    act(() => {
      query('[data-testid="floor-table-day-new-reservation"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onNewReservation).toHaveBeenCalledWith(SEATING)
    cleanup()
  })

  it('keeps occupied seating as hero card and not compact available layout', () => {
    const { cleanup } = renderInspector({
      rows: [{
        seating: SEATING,
        reservation: {
          id: 'res-1',
          guestName: 'Fournie',
          guests: 2,
          time: '20:30',
          status: 'Checked In',
        },
        conflicts: [],
        hasConflict: false,
        isAvailable: false,
        timeWindowLabel: '19:00–21:00',
        state: 'seated',
        statusLabel: 'Checked In',
        assignedTablesLabel: 'T102',
      }, ...ALL_AVAILABLE_SEATINGS.slice(0, 1)],
    })

    expect(document.querySelector('.floor-table-day-row.is-hero-primary')).not.toBeNull()
    expect(document.querySelector('.floor-table-day-row.is-hero-primary.table-inspector-seating-row')).toBeNull()
    expect(document.querySelectorAll('.table-inspector-seating-row.is-available')).toHaveLength(1)
    cleanup()
  })

  it('uses stacked action layout class hook for narrow inspector widths', () => {
    const { cleanup } = renderInspector({ rows: ALL_AVAILABLE_SEATINGS.slice(0, 1) })

    expect(document.querySelector('.table-inspector-seating-body')).not.toBeNull()
    expect(document.querySelector('.table-inspector-new-reservation-action')).not.toBeNull()
    cleanup()
  })

  it('keeps inspector list scrollable with the final available row inside it', () => {
    const { cleanup } = renderInspector({ rows: ALL_AVAILABLE_SEATINGS })

    const list = document.querySelector('.host-table-inspector-list')
    const finalRow = document.querySelectorAll('.table-inspector-seating-row.is-available')[3]
    expect(list?.contains(finalRow)).toBe(true)
    expect(list?.className).toContain('host-table-inspector-list')
    cleanup()
  })

  it('uses hierarchical actions on hero card without changing callbacks', () => {
    const onOpenReservation = vi.fn()
    const onEditReservation = vi.fn()
    const onQuickStatusUpdate = vi.fn()
    const onReleaseTable = vi.fn()
    const reservation = {
      id: 'res-1',
      guestName: 'Fournie',
      guests: 2,
      time: '20:30',
      status: 'Checked In',
      seatingAssignment: {
        assignedUnits: [{ id: 't102', label: 'T102' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }

    const { query, cleanup } = renderInspector({
      rows: [{
        seating: SEATING,
        reservation,
        conflicts: [],
        hasConflict: false,
        isAvailable: false,
        timeWindowLabel: '19:00–21:00',
        state: 'seated',
        statusLabel: 'Checked In',
        assignedTablesLabel: 'T102',
        quickActions: [{ id: 'complete', label: 'Complete', status: 'Checked Out', variant: 'secondary' }],
      }],
      onOpenReservation,
      onEditReservation,
      onQuickStatusUpdate,
      onReleaseTable,
      canManageAssignment: true,
    })

    const hierarchy = document.querySelector('.floor-table-day-row-actions.is-hierarchy')
    expect(hierarchy).not.toBeNull()
    expect(hierarchy?.querySelector('.floor-table-day-action.is-primary.is-full-width')).not.toBeNull()
    expect(hierarchy?.querySelector('.floor-table-day-action.is-release-muted')).not.toBeNull()

    act(() => {
      query('[data-testid="floor-table-day-open-reservation"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenReservation).toHaveBeenCalledWith(reservation)

    act(() => {
      query('[data-testid="floor-table-day-edit-reservation"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onEditReservation).toHaveBeenCalledWith(reservation)

    act(() => {
      const completeButton = [...document.querySelectorAll('.floor-table-day-row-actions-secondary .floor-table-day-action')]
        .find((button) => button.textContent?.includes('Complete'))
      completeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onQuickStatusUpdate).toHaveBeenCalledWith(reservation, 'Checked Out')

    act(() => {
      query('[data-testid="floor-table-day-release-table"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onReleaseTable).toHaveBeenCalledWith(reservation)
    cleanup()
  })

  it('does not duplicate reservations across seating cards', () => {
    const BRUNCH = {
      id: 'brunch-1',
      name: 'Brunch',
      startTime: '10:00',
      durationMinutes: 120,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    }
    const { cleanup } = renderInspector({
      rows: [{
        seating: SEATING,
        reservation: {
          id: 'res-1',
          guestName: 'Fournie',
          guests: 2,
          time: '20:30',
          status: 'Checked In',
        },
        conflicts: [],
        hasConflict: false,
        isAvailable: false,
        timeWindowLabel: '19:00–21:00',
        state: 'seated',
        statusLabel: 'Checked In',
        assignedTablesLabel: 'T102',
      }, {
        seating: BRUNCH,
        reservation: null,
        conflicts: [],
        hasConflict: false,
        isAvailable: true,
        timeWindowLabel: '10:00–12:00',
        state: 'available',
      }],
    })

    expect(document.querySelectorAll('[data-testid="floor-table-day-row-occupied"]')).toHaveLength(1)
    expect(document.querySelectorAll('.table-inspector-seating-row.is-available')).toHaveLength(1)
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
