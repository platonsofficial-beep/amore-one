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

function getActiveDayView() {
  const dialogs = document.querySelectorAll('[data-testid="floor-table-day-view"]')
  return dialogs[dialogs.length - 1] ?? null
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
    dialog: () => getActiveDayView(),
    query: (selector) => getActiveDayView()?.querySelector(selector) ?? null,
    queryAll: (selector) => getActiveDayView()?.querySelectorAll(selector) ?? [],
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
      document.querySelectorAll('[data-testid="floor-table-seating-dialog"]').forEach((node) => {
        node.remove()
      })
      document.querySelectorAll('[data-testid="host-table-inspector"]').forEach((node) => {
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
    expect(guestHeading?.textContent).toContain('Maria Rossi')
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
    expect(query('.floor-table-day-guest-count')?.textContent).toBe('4 guests')
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

    const tableLine = query('.floor-table-day-table-chip')
    expect(tableLine?.textContent).toContain('T15')
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

    const tableLine = query('.floor-table-day-table-chip')
    expect(tableLine?.textContent).toContain('T15 + T16')
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

    expect(queryAll('[data-testid="floor-table-day-edit-reservation"]').length).toBe(1)
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
      const dialog = getActiveDayView()
      Array.from(dialog?.querySelectorAll('.floor-table-day-action.is-secondary') ?? [])
        .find((button) => button.textContent === 'Arrived')
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

  it('shows assignment pending row with assign action in assignment mode', () => {
    const onConfirmAssignment = vi.fn()
    const onCancelAssignment = vi.fn()
    const onSelectSeating = vi.fn()
    const reservation = {
      id: 'res-pending',
      guestName: 'Samaridis',
      guests: 2,
      time: '20:45',
      seatingId: 'dinner-1',
    }

    const { query, cleanup } = renderDialog({
      table: { id: 't23', label: 'T23' },
      tableLabel: 'T23',
      rows: [{
        seating: SEATINGS[0],
        reservation: null,
        conflicts: [],
        hasConflict: false,
        isAvailable: true,
        timeWindowLabel: '19:00–21:00',
        state: 'available',
      }],
      assignmentContext: {
        reservation,
        seatingId: 'dinner-1',
        tableLabel: 'T23',
        draftTableLabels: 'T23',
        canAssign: true,
        onConfirmAssignment,
        onCancelAssignment,
        onSelectSeating,
      },
      onClose: () => {},
    })

    expect(document.querySelector('[data-assignment-mode="true"]')).not.toBeNull()
    expect(query('[data-testid="floor-table-day-row-assignment"]')).not.toBeNull()
    expect(query('.floor-table-day-guest-name')?.textContent).toContain('Samaridis')
    expect(query('[data-testid="floor-table-day-assign-reservation"]')?.textContent)
      .toContain('Assign T23')

    act(() => {
      query('[data-testid="floor-table-day-assign-reservation"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onConfirmAssignment).toHaveBeenCalledTimes(1)

    act(() => {
      query('[data-testid="floor-table-day-cancel-assignment"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onCancelAssignment).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('allows manual seating selection and blocks assign until a seating is chosen', () => {
    const onSelectSeating = vi.fn()
    const dinnerTwo = {
      ...SEATINGS[0],
      id: 'dinner-2',
      name: 'Dinner 2',
    }

    const { query, queryAll, cleanup } = renderDialog({
      table: { id: 't22', label: 'T22' },
      tableLabel: 'T22',
      rows: [
        {
          seating: SEATINGS[0],
          reservation: null,
          conflicts: [],
          hasConflict: false,
          isAvailable: true,
          timeWindowLabel: '19:00–21:00',
          state: 'available',
        },
        {
          seating: dinnerTwo,
          reservation: null,
          conflicts: [],
          hasConflict: false,
          isAvailable: true,
          timeWindowLabel: '21:00–23:00',
          state: 'available',
        },
      ],
      assignmentContext: {
        reservation: { id: 'res-1', guestName: 'Samaridis', guests: 2, time: '20:45' },
        seatingId: null,
        tableLabel: 'T22',
        draftTableLabels: 'T22',
        canAssign: false,
        onConfirmAssignment: vi.fn(),
        onCancelAssignment: vi.fn(),
        onSelectSeating,
      },
      onClose: () => {},
    })

    expect(query('[data-testid="floor-table-day-choose-seating"]')?.textContent).toBe('Choose a seating')
    expect(query('[data-testid="floor-table-day-assign-reservation"]')).toBeNull()

    act(() => {
      queryAll('[data-testid="floor-table-day-row-available"]')[1]
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSelectSeating).toHaveBeenCalledWith('dinner-2')
    cleanup()
  })

  it('disables assign when the selected seating is occupied or conflicted', () => {
    const { query, cleanup } = renderDialog({
      table: { id: 't22', label: 'T22' },
      tableLabel: 'T22',
      rows: [buildOccupiedRow({
        reservation: { id: 'res-1', guestName: 'Maria', guests: 2, time: '19:30' },
        assignedTablesLabel: 'T22',
      })],
      assignmentContext: {
        reservation: { id: 'res-pending', guestName: 'Samaridis', guests: 2, time: '20:45' },
        seatingId: 'dinner-1',
        tableLabel: 'T22',
        draftTableLabels: 'T22',
        canAssign: false,
        onConfirmAssignment: vi.fn(),
        onCancelAssignment: vi.fn(),
        onSelectSeating: vi.fn(),
      },
      onClose: () => {},
    })

    expect(query('[data-testid="floor-table-day-assign-reservation"]')?.disabled).toBe(true)
    expect(query('.floor-table-day-assignment-blocked')).not.toBeNull()
    cleanup()
  })

  it('shows extra-chair metadata only when assigned', () => {
    const { query, cleanup } = renderDialog({
      table: { id: 't10', label: 'T10' },
      tableLabel: 'T10',
      rows: [buildOccupiedRow({
        reservation: {
          id: 'res-1',
          guestName: 'Fournie',
          guests: 2,
          time: '20:30',
          seatingAssignment: {
            assignedUnits: [{ id: 't102', label: 'T102' }],
            extraChairs: 1,
            standingGuests: 0,
          },
        },
        assignedTablesLabel: 'T102',
      })],
      onClose: () => {},
    })

    expect(query('.floor-table-day-info-list')?.textContent).toContain('🪑')
    expect(query('.floor-table-day-info-list')?.textContent).toContain('+1')
    cleanup()
  })

  it('renders premium header metadata lines', () => {
    const { query, cleanup } = renderDialog({
      table: { id: 't102', label: 'T102', maxGuestCapacity: 2 },
      tableLabel: 'T102',
      areaLabel: 'Main Dining',
      dateLabel: 'Saturday, July 11',
      rows: [{
        seating: SEATINGS[0],
        reservation: null,
        conflicts: [],
        hasConflict: false,
        isAvailable: true,
        timeWindowLabel: '19:00–21:00',
        state: 'available',
      }],
      onClose: () => {},
    })

    const dialog = getActiveDayView()
    const metaItems = Array.from(dialog?.querySelectorAll('.floor-table-day-header-meta-item') ?? [])
      .map((node) => node.textContent?.replace(/\s+/g, '').trim())
    expect(metaItems).toEqual([
      '📍MainDining',
      '👥Capacity2',
      '📅Saturday,July11',
    ])
    expect(query('.floor-table-day-status-pill')?.textContent).toContain('Available')
    cleanup()
  })
})
