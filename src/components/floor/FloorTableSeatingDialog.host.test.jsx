/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FloorTableSeatingDialog } from './FloorTableSeatingDialog'

const SEATINGS = [{
  id: 'dinner-1',
  name: 'Dinner 1',
  startTime: '19:00',
  durationMinutes: 120,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  sortOrder: 0,
  isActive: true,
}]

function buildOccupiedRow({
  reservation,
  assignedTablesLabel,
  quickActions = [{ id: 'arrived', label: 'Arrived', status: 'Arrived', variant: 'secondary' }],
} = {}) {
  return {
    seating: SEATINGS[0],
    reservation,
    conflicts: [],
    hasConflict: false,
    isAvailable: false,
    timeWindowLabel: '19:00–21:00',
    state: 'reserved',
    statusLabel: 'Reserved',
    assignedTablesLabel,
    quickActions,
    hasNotes: false,
  }
}

function HostDayViewHarness() {
  const [scheduleCardTable, setScheduleCardTable] = useState(null)

  return createElement('div', null,
    createElement('button', {
      type: 'button',
      'data-testid': 'open-day-view',
      onClick: () => setScheduleCardTable({ id: 't10', label: 'T10', zoneId: 'main', maxGuestCapacity: 4 }),
    }, 'Open'),
    scheduleCardTable ? createElement(FloorTableSeatingDialog, {
      table: scheduleCardTable,
      tableLabel: 'T10',
      areaLabel: 'Main Dining',
      dateLabel: 'Thursday, July 10',
      rows: [{
        seating: SEATINGS[0],
        reservation: null,
        conflicts: [],
        hasConflict: false,
        isAvailable: true,
        timeWindowLabel: '19:00–21:00',
        state: 'available',
      }],
      onClose: () => setScheduleCardTable(null),
    }) : null,
  )
}

function renderDialog(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(FloorTableSeatingDialog, props))
  })

  return {
    container,
    root,
    query: (selector) => document.querySelector(selector),
    queryAll: (selector) => document.querySelectorAll(selector),
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
      document.querySelectorAll('[data-testid="floor-table-seating-dialog"]').forEach((node) => {
        node.remove()
      })
    },
  }
}

describe('FloorTableSeatingDialog host day view', () => {
  it('mounts after compact host schedule card state is set for an available table', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostDayViewHarness))
    })

    expect(document.querySelector('[data-testid="floor-table-day-view"]')).toBeNull()

    act(() => {
      container.querySelector('[data-testid="open-day-view"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.querySelector('[data-testid="floor-table-day-view"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="floor-table-day-row-available"]')).not.toBeNull()

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('mounts for occupied table rows', () => {
    const { cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({
        reservation: { id: 'res-1', guestName: 'Maria', guests: 2, time: '19:30' },
        assignedTablesLabel: 'T10',
      })],
      onClose: () => {},
    })

    expect(document.querySelector('[data-testid="floor-table-day-row-occupied"]')).not.toBeNull()
    cleanup()
  })

  it('renders guest name as the primary reservation heading', () => {
    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({
        reservation: { id: 'res-1', guestName: 'Maria Rossi', guests: 4, time: '20:30' },
        assignedTablesLabel: 'T15',
      })],
      onClose: () => {},
    })

    const guestHeading = query('.floor-table-day-guest-name')
    expect(guestHeading?.tagName).toBe('H4')
    expect(guestHeading?.textContent).toBe('Maria Rossi')
    cleanup()
  })

  it('shows reservation time and guest count', () => {
    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({
        reservation: { id: 'res-1', guestName: 'Maria', guests: 4, time: '20:30' },
        assignedTablesLabel: 'T15',
      })],
      onClose: () => {},
    })

    expect(query('.floor-table-day-guest-time')?.textContent).toBe('20:30')
    expect(query('.floor-table-day-guest-count')?.textContent).toBe(' · 4 guests')
    cleanup()
  })

  it('renders single-table label as Table · T15', () => {
    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({
        reservation: {
          id: 'res-1',
          guestName: 'Maria',
          guests: 2,
          time: '20:30',
          seatingAssignment: {
            assignedUnits: [{ id: 't15', label: 'T15' }],
          },
        },
        assignedTablesLabel: 'T15',
      })],
      onClose: () => {},
    })

    const chip = query('.floor-table-day-table-chip')
    expect(chip?.querySelector('.floor-table-day-table-chip-label')?.textContent).toBe('Table')
    expect(chip?.textContent).toContain('T15')
    cleanup()
  })

  it('renders multi-table label as Tables · T15 + T16', () => {
    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({
        reservation: {
          id: 'res-1',
          guestName: 'Maria',
          guests: 6,
          time: '20:30',
          seatingAssignment: {
            assignedUnits: [
              { id: 't15', label: 'T15' },
              { id: 't16', label: 'T16' },
            ],
          },
        },
        assignedTablesLabel: 'T15 + T16',
      })],
      onClose: () => {},
    })

    const chip = query('.floor-table-day-table-chip')
    expect(chip?.querySelector('.floor-table-day-table-chip-label')?.textContent).toBe('Tables')
    expect(chip?.querySelector('.floor-table-day-table-chip-value')?.textContent).toBe('T15 + T16')
    cleanup()
  })

  it('shows Edit only on occupied reservation cards', () => {
    const onEditReservation = vi.fn()
    const { query, queryAll, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [
        buildOccupiedRow({
          reservation: { id: 'res-1', guestName: 'Maria', guests: 2, time: '20:30' },
          assignedTablesLabel: 'T15',
        }),
        {
          seating: { ...SEATINGS[0], id: 'lunch-1', name: 'Lunch 1' },
          reservation: null,
          conflicts: [],
          hasConflict: false,
          isAvailable: true,
          timeWindowLabel: '12:00–14:00',
          state: 'available',
        },
      ],
      onEditReservation,
      onClose: () => {},
    })

    expect(queryAll('[data-testid="floor-table-day-edit-reservation"]')).toHaveLength(1)
    expect(query('[data-testid="floor-table-day-new-reservation"]')).not.toBeNull()
    cleanup()
  })

  it('invokes edit callback with the correct reservation', () => {
    const reservation = {
      id: 'res-1',
      guestName: 'Maria',
      guests: 2,
      time: '20:30',
      assignedUnits: [{ id: 't15', label: 'T15' }],
    }
    const onEditReservation = vi.fn()
    const onOpenReservation = vi.fn()
    const onQuickStatusUpdate = vi.fn()

    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({ reservation, assignedTablesLabel: 'T15' })],
      onEditReservation,
      onOpenReservation,
      onQuickStatusUpdate,
      onClose: () => {},
    })

    act(() => {
      query('[data-testid="floor-table-day-edit-reservation"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onEditReservation).toHaveBeenCalledTimes(1)
    expect(onEditReservation).toHaveBeenCalledWith(reservation)
    expect(onOpenReservation).not.toHaveBeenCalled()
    expect(onQuickStatusUpdate).not.toHaveBeenCalled()
    cleanup()
  })

  it('preserves existing open, quick status, and release actions', () => {
    const reservation = { id: 'res-1', guestName: 'Maria', guests: 2, time: '20:30' }
    const onOpenReservation = vi.fn()
    const onQuickStatusUpdate = vi.fn()
    const onReleaseTable = vi.fn()

    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({ reservation, assignedTablesLabel: 'T10' })],
      onOpenReservation,
      onQuickStatusUpdate,
      onReleaseTable,
      onEditReservation: vi.fn(),
      onClose: () => {},
    })

    act(() => {
      query('[data-testid="floor-table-day-open-reservation"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenReservation).toHaveBeenCalledWith(reservation)

    act(() => {
      query('.floor-table-day-quick-action')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onQuickStatusUpdate).toHaveBeenCalledWith(reservation, 'Arrived')

    act(() => {
      query('[data-testid="floor-table-day-release-table"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onReleaseTable).toHaveBeenCalledWith(reservation)
    cleanup()
  })

  it('available seating card still shows New reservation', () => {
    const onNewReservation = vi.fn()
    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [{
        seating: SEATINGS[0],
        reservation: null,
        conflicts: [],
        hasConflict: false,
        isAvailable: true,
        timeWindowLabel: '19:00–21:00',
        state: 'available',
      }],
      onNewReservation,
      onClose: () => {},
    })

    const newButton = query('[data-testid="floor-table-day-new-reservation"]')
    expect(newButton?.textContent).toContain('New reservation')

    act(() => {
      newButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onNewReservation).toHaveBeenCalledWith(SEATINGS[0])
    cleanup()
  })
})
