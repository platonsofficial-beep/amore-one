import { describe, expect, it } from 'vitest'
import { buildReservationUpdatePayload } from './reservationService'
import { CUSTOMER_TYPE_MARKER } from '../lib/reservationCustomerType'

const BASE_RESERVATION = {
  id: 'res-1',
  guestName: 'Maria Georgiou',
  phone: '+35799123456',
  date: '2026-07-10',
  time: '21:00',
  guests: 4,
  status: 'Confirmed',
  notes: 'Window seat',
  area: 'Main Dining',
  tableNumber: '',
  seatingAssignment: {
    assignedUnits: [],
    extraChairs: 0,
    standingGuests: 0,
  },
}

describe('buildReservationUpdatePayload guest type', () => {
  it('persists VIP through notes encoding on edit save', () => {
    const payload = buildReservationUpdatePayload(BASE_RESERVATION, {
      customerType: 'VIP',
      notes: 'Window seat',
    })

    expect(payload.customerType).toBe('VIP')
    expect(payload.notes).toBe(`Window seat${CUSTOMER_TYPE_MARKER}VIP`)
  })

  it('persists VVIP and House Guest on edit save', () => {
    const vvipPayload = buildReservationUpdatePayload(BASE_RESERVATION, {
      customerType: 'VVIP',
      notes: 'Anniversary',
    })
    expect(vvipPayload.customerType).toBe('VVIP')
    expect(vvipPayload.notes).toContain(`${CUSTOMER_TYPE_MARKER}VVIP`)

    const houseGuestPayload = buildReservationUpdatePayload(BASE_RESERVATION, {
      customerType: 'House Guest',
      notes: 'Chef table',
    })
    expect(houseGuestPayload.customerType).toBe('House Guest')
    expect(houseGuestPayload.notes).toContain(`${CUSTOMER_TYPE_MARKER}House Guest`)
  })

  it('keeps walk-in marker and customer type without duplication', () => {
    const payload = buildReservationUpdatePayload(
      {
        ...BASE_RESERVATION,
        status: 'Walk In',
        notes: `Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VIP`,
        customerType: 'VIP',
      },
      {
        customerType: 'VVIP',
        notes: 'Birthday table',
        status: 'Walk In',
      },
    )

    expect(payload.customerType).toBe('VVIP')
    expect(payload.notes).toBe(`Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VVIP`)
  })

  it('preserves host notes while replacing encoded customer type', () => {
    const payload = buildReservationUpdatePayload(
      {
        ...BASE_RESERVATION,
        notes: `Allergic to nuts${CUSTOMER_TYPE_MARKER}VIP`,
        customerType: 'VIP',
      },
      {
        customerType: 'House Guest',
        notes: 'Allergic to nuts',
      },
    )

    expect(payload.notes).toBe(`Allergic to nuts${CUSTOMER_TYPE_MARKER}House Guest`)
  })
})
