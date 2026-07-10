/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act, useState } from 'react'
import { describe, expect, it } from 'vitest'
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
        timeWindowLabel: '7:00 PM – 9:00 PM',
        state: 'available',
      }],
      onClose: () => setScheduleCardTable(null),
    }) : null,
  )
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
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(FloorTableSeatingDialog, {
        table: { id: 't10', label: 'T10' },
        tableLabel: 'T10',
        rows: [{
          seating: SEATINGS[0],
          reservation: { id: 'res-1', guestName: 'Maria', guests: 2, time: '19:30' },
          conflicts: [],
          hasConflict: false,
          isAvailable: false,
          timeWindowLabel: '7:00 PM – 9:00 PM',
          state: 'reserved',
          statusLabel: 'Reserved',
        }],
        onClose: () => {},
      }))
    })

    expect(document.querySelector('[data-testid="floor-table-day-row-occupied"]')).not.toBeNull()

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
