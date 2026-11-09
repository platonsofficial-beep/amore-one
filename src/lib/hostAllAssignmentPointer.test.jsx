/**
 * @vitest-environment jsdom
 */
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canAssignReservationToFloorTable,
  canToggleTableInHostMultiTableSelection,
  resolveAllAssignmentFloorSeating,
} from './hostAssignmentPanelUtils'
import { HostMultiTableSelectionBar } from '../components/floor/HostMultiTableSelectionBar'

const DATE = '2026-11-09'
const SEATINGS = [
  { id: 'brunch', name: 'Brunch', startTime: '10:00', durationMinutes: 120, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true },
  { id: 'dinner-1', name: 'Dinner 1', startTime: '19:00', durationMinutes: 150, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true },
]
const DINNER_BOOKING = {
  id: 'res-dinner',
  guestName: 'Kalamarou Kalamaras',
  date: DATE,
  time: '20:30',
  guests: 4,
  status: 'Pending',
  seatingId: 'dinner-1',
}
const LAYOUT = {
  units: [
    { id: 't12', label: 'T12', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 4 },
    { id: 't13', label: 'T13', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 2 },
  ],
}

function pointer(type, target) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  Object.defineProperty(event, 'pointerType', { value: 'touch' })
  target.dispatchEvent(event)
}

function FloorAssignHarness({ tables, missingService = false, serviceName = 'Dinner 1' }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [open, setOpen] = useState(true)
  const toggle = (table) => {
    const canAssign = canAssignReservationToFloorTable(table)
    if (!canToggleTableInHostMultiTableSelection({
      tableId: table.table.id,
      selectedUnitIds: selectedIds,
      canAssign,
    })) return
    setSelectedIds((current) => (
      current.includes(table.table.id)
        ? current.filter((id) => id !== table.table.id)
        : [...current, table.table.id]
    ))
  }
  if (!open) {
    return createElement('p', { 'data-testid': 'assignment-closed' }, 'closed')
  }
  return createElement('div', null,
    tables.map((table) => createElement('button', {
      key: table.table.id,
      type: 'button',
      'data-testid': `table-${table.table.label}`,
      onPointerUp: () => toggle(table),
    }, table.table.label)),
    createElement(HostMultiTableSelectionBar, {
      selectedUnitIds: selectedIds,
      reservation: DINNER_BOOKING,
      layout: LAYOUT,
      serviceName,
      missingService,
      onCancel: () => {
        setSelectedIds([])
        setOpen(false)
      },
      onContinue: () => {},
    }),
  )
}

describe('All assignment uses the booking service', () => {
  let container
  let root
  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
  })

  it('keeps All neutral until assignment, then uses Dinner 1', () => {
    expect(resolveAllAssignmentFloorSeating({
      reservation: DINNER_BOOKING,
      seatings: SEATINGS,
      dateKey: DATE,
      assignmentActive: false,
    })).toMatchObject({ source: 'all', missingService: false, seating: null })

    const dinner = SEATINGS[1]
    expect(resolveAllAssignmentFloorSeating({
      chipSeating: dinner,
      reservation: DINNER_BOOKING,
      seatings: SEATINGS,
      dateKey: DATE,
      assignmentActive: true,
    }).seating.id).toBe('dinner-1')

    expect(resolveAllAssignmentFloorSeating({
      reservation: DINNER_BOOKING,
      seatings: SEATINGS,
      dateKey: DATE,
      assignmentActive: true,
    })).toMatchObject({ source: 'reservation', missingService: false })

    expect(resolveAllAssignmentFloorSeating({
      reservation: { id: 'none', date: DATE, time: '', status: 'Pending' },
      seatings: SEATINGS,
      dateKey: DATE,
      assignmentActive: true,
    })).toMatchObject({ source: 'missing', missingService: true, seating: null })
  })

  it('blocks All-neutral tables and allows Dinner availability, including deselect and conflict', () => {
    const neutral = { table: { id: 't12', label: 'T12' }, status: 'all-services', reservation: null, operational: { hostIndicator: 'all-services', phase: 'all-services' } }
    const free = { table: { id: 't12', label: 'T12' }, status: 'available', reservation: null, operational: { hostIndicator: 'empty', phase: 'available' } }
    const other = { table: { id: 't13', label: 'T13' }, status: 'available', reservation: null, operational: { hostIndicator: 'empty', phase: 'available' } }
    const occupied = { table: { id: 't10', label: 'T10' }, status: 'seated', reservation: { id: 'other' }, operational: { hostIndicator: 'seated', phase: 'seated' } }
    const conflict = { table: { id: 't11', label: 'T11' }, status: 'problem', reservation: { id: 'other' }, operational: { hostIndicator: 'problem', phase: 'upcoming', hasSeatingConflict: true } }

    expect(canAssignReservationToFloorTable(neutral)).toBe(false)
    expect(canAssignReservationToFloorTable(free)).toBe(true)
    expect(canAssignReservationToFloorTable(occupied)).toBe(false)
    expect(canAssignReservationToFloorTable(conflict)).toBe(false)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(FloorAssignHarness, { tables: [free, other, occupied, conflict] }))
    })

    const tap = (label) => {
      const button = container.querySelector(`[data-testid="table-${label}"]`)
      act(() => {
        pointer('pointerdown', button)
        pointer('pointerup', button)
      })
    }

    tap('T12')
    expect(container.textContent).toContain('1 table selected')
    tap('T13')
    expect(container.textContent).toContain('2 tables selected')
    expect(container.textContent).toContain('Capacity 6')
    expect(container.textContent).toContain('Guests 4')
    expect(container.textContent).toContain('Availability uses Dinner 1.')
    expect(container.querySelector('[data-testid="host-multi-table-continue"]').disabled).toBe(false)

    tap('T10')
    tap('T11')
    expect(container.textContent).toContain('2 tables selected')

    tap('T13')
    expect(container.textContent).toContain('1 table selected')
    expect(container.querySelector('[data-testid="host-multi-table-continue"]').disabled).toBe(false)

    act(() => {
      container.querySelector('[data-testid="host-multi-table-cancel"]').click()
    })
    expect(container.querySelector('[data-testid="assignment-closed"]')).toBeTruthy()
  })

  it('explains a booking with no service instead of a silent dead mode', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const neutral = { table: { id: 't12', label: 'T12' }, status: 'all-services', reservation: null, operational: { hostIndicator: 'all-services', phase: 'all-services' } }
    act(() => {
      root.render(createElement(FloorAssignHarness, {
        tables: [neutral],
        missingService: true,
        serviceName: '',
      }))
    })
    const button = container.querySelector('[data-testid="table-T12"]')
    act(() => {
      pointer('pointerdown', button)
      pointer('pointerup', button)
    })
    expect(container.textContent).toContain('0 tables selected')
    expect(container.textContent).toContain('Choose a service before assigning tables.')
    expect(container.querySelector('[data-testid="host-multi-table-continue"]').disabled).toBe(true)
  })
})
