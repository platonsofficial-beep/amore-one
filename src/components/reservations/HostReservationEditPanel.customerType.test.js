import { describe, expect, it } from 'vitest'
import { createHostReservationEditForm } from './HostReservationEditPanel'
import { CUSTOMER_TYPE_MARKER } from '../../lib/reservationCustomerType'

const LAYOUT = {
  zones: [{ id: 'main', label: 'Main Dining' }],
  units: [],
}

describe('createHostReservationEditForm guest type hydration', () => {
  it('restores guest type from notes marker when customerType field is missing', () => {
    const form = createHostReservationEditForm({
      id: 'res-1',
      guestName: 'Dimitrid Papapetrou',
      date: '2026-07-10',
      time: '21:00',
      guests: 2,
      status: 'Confirmed',
      notes: `Chef friend${CUSTOMER_TYPE_MARKER}VVIP`,
    }, LAYOUT)

    expect(form.customerType).toBe('VVIP')
    expect(form.notes).toBe('Chef friend')
  })

  it('hides internal customer markers from editable notes', () => {
    const form = createHostReservationEditForm({
      id: 'res-2',
      guestName: 'Andreas Nicolaou',
      date: '2026-07-10',
      time: '21:00',
      guests: 2,
      status: 'Pending',
      notes: `Owner visit${CUSTOMER_TYPE_MARKER}House Guest`,
      customerType: 'House Guest',
    }, LAYOUT)

    expect(form.customerType).toBe('House Guest')
    expect(form.notes).toBe('Owner visit')
  })

  it('maps Regular storage to Normal-compatible select value', () => {
    const form = createHostReservationEditForm({
      id: 'res-3',
      guestName: 'Regular Guest',
      date: '2026-07-10',
      time: '21:00',
      guests: 2,
      status: 'Pending',
      notes: 'No markers',
      customerType: 'Regular',
    }, LAYOUT)

    expect(form.customerType).toBe('Regular')
    expect(form.notes).toBe('No markers')
  })
})
