import { describe, expect, it } from 'vitest'
import { getFloorTableSeatingDialogOverlayClass } from '../components/floor/FloorTableSeatingDialog'
import { canConfigureReservationSeatings, canManageReservations } from './permissions'

describe('floor table seating dialog render state', () => {
  it('uses centered tablet overlay class on non-phone breakpoints', () => {
    expect(getFloorTableSeatingDialogOverlayClass(false)).toBe('floor-table-seating-dialog-overlay is-tablet')
    expect(getFloorTableSeatingDialogOverlayClass(true)).toBe('floor-table-seating-dialog-overlay is-phone')
  })
})

describe('reservation seating permissions', () => {
  it('allows hosts to manage reservations but not configure seatings', () => {
    expect(canManageReservations('host')).toBe(true)
    expect(canConfigureReservationSeatings('host')).toBe(false)
    expect(canConfigureReservationSeatings('manager')).toBe(true)
    expect(canConfigureReservationSeatings('owner')).toBe(true)
  })
})

describe('table + seating reservation prefill', () => {
  it('prefills table, date, and seating values for quick reservation handoff', () => {
    const prefill = {
      table: { id: 't3', label: 'T3', zoneId: 'main' },
      date: '2026-07-09',
      seating: { id: 'dinner-1', startTime: '19:00' },
      seatingId: 'dinner-1',
      time: '19:00',
    }

    expect(prefill.seatingId).toBe('dinner-1')
    expect(prefill.table.id).toBe('t3')
    expect(prefill.time).toBe('19:00')
    expect(prefill.date).toBe('2026-07-09')
  })
})
