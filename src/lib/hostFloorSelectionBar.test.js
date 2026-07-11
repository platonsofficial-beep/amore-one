import { describe, expect, it } from 'vitest'
import {
  buildHostFloorSelectionMetaLine,
  resolveHostFloorSelectionSeatingLabel,
} from './hostFloorSelectionBar'

const SEATINGS = [
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    startTime: '21:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
]

describe('hostFloorSelectionBar', () => {
  it('appends seating badge when seating resolves', () => {
    const reservation = {
      guestName: 'Fournie',
      guests: 2,
      time: '20:30',
      date: '2026-07-10',
      seatingId: 'dinner-2',
      seatingAssignment: {
        assignedUnits: [{ id: 't102', label: 'T102' }],
        extraChairs: 1,
        standingGuests: 0,
      },
    }

    expect(resolveHostFloorSelectionSeatingLabel(reservation, SEATINGS, '2026-07-10'))
      .toBe('Dinner 2')

    const presentation = buildHostFloorSelectionMetaLine(reservation, {
      seatings: SEATINGS,
      dateKey: '2026-07-10',
    })

    expect(presentation.metaLine).toContain('👤 2 guests')
    expect(presentation.metaLine).toContain('🍽 T102')
    expect(presentation.metaLine).toContain('🪑 +1')
    expect(presentation.metaLine).toContain('🍷 Dinner 2')
  })

  it('omits seating badge when seating cannot be resolved', () => {
    const presentation = buildHostFloorSelectionMetaLine({
      guests: 2,
      seatingAssignment: {
        assignedUnits: [{ id: 't102', label: 'T102' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }, {
      seatings: [],
      dateKey: '2026-07-10',
    })

    expect(presentation.metaLine).not.toContain('🍷')
  })

  it('omits extra-chair badge when none are assigned', () => {
    const presentation = buildHostFloorSelectionMetaLine({
      guests: 2,
      seatingAssignment: {
        assignedUnits: [{ id: 't102', label: 'T102' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    })

    expect(presentation.metaLine).not.toContain('🪑')
  })
})
