import { describe, expect, it } from 'vitest'
import { createHostReservationEditForm } from './HostReservationEditPanel'
import { CUSTOMER_TYPE_MARKER } from '../../lib/reservationCustomerType'
import { PURPOSE_MARKER } from '../../lib/reservationPurpose'

const LAYOUT = {
  zones: [{ id: 'main', label: 'Main Dining' }],
  units: [],
}

describe('createHostReservationEditForm reservation purpose hydration', () => {
  it('defaults legacy reservations without a marker to dinner', () => {
    const form = createHostReservationEditForm({
      id: 'res-1',
      guestName: 'Maria Georgiou',
      date: '2026-07-10',
      time: '21:00',
      guests: 2,
      status: 'Pending',
      notes: 'Window seat',
    }, LAYOUT)

    expect(form.reservationPurpose).toBe('dinner')
    expect(form.notes).toBe('Window seat')
  })

  it('restores drinks from notes marker when reservationPurpose field is missing', () => {
    const form = createHostReservationEditForm({
      id: 'res-2',
      guestName: 'Andreas Nicolaou',
      date: '2026-07-10',
      time: '21:00',
      guests: 2,
      status: 'Pending',
      notes: `Bar seating${PURPOSE_MARKER}drinks`,
    }, LAYOUT)

    expect(form.reservationPurpose).toBe('drinks')
    expect(form.notes).toBe('Bar seating')
  })

  it('hides internal purpose markers from editable notes while preserving guest type metadata', () => {
    const form = createHostReservationEditForm({
      id: 'res-3',
      guestName: 'VIP Guest',
      date: '2026-07-10',
      time: '21:00',
      guests: 2,
      status: 'Pending',
      notes: `Owner visit${CUSTOMER_TYPE_MARKER}VIP${PURPOSE_MARKER}drinks`,
      customerType: 'VIP',
      reservationPurpose: 'drinks',
    }, LAYOUT)

    expect(form.customerType).toBe('VIP')
    expect(form.reservationPurpose).toBe('drinks')
    expect(form.notes).toBe('Owner visit')
    expect(form.notes).not.toContain('@@PURPOSE@@')
    expect(form.notes).not.toContain('@@CUSTOMER@@')
  })
})
