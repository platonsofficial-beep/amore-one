import { describe, expect, it } from 'vitest'
import {
  PURPOSE_MARKER,
  encodePurposeInNotes,
  getReservationPurpose,
  getReservationPurposeLabel,
  parsePurposeFromNotes,
  stripPurposeFromNotes,
} from './reservationPurpose'
import { CUSTOMER_TYPE_MARKER } from './reservationCustomerType'
import { SEATING_ASSIGNMENT_MARKER } from './seatingAssignment'

describe('reservationPurpose metadata', () => {
  it('defaults legacy reservations without a marker to dinner', () => {
    expect(parsePurposeFromNotes('Window seat')).toBe('dinner')
    expect(getReservationPurpose({ notes: 'Window seat' })).toBe('dinner')
    expect(getReservationPurposeLabel('dinner')).toBe('🍽️ Dinner')
  })

  it('encodes and parses drinks without duplicating the marker', () => {
    const encoded = encodePurposeInNotes('Birthday table', 'drinks')
    expect(encoded).toBe(`Birthday table${PURPOSE_MARKER}drinks`)
    expect(parsePurposeFromNotes(encoded)).toBe('drinks')
    expect(encodePurposeInNotes(encoded, 'drinks')).toBe(encoded)
    expect(getReservationPurposeLabel('drinks')).toBe('🍸 Drinks')
  })

  it('omits the marker when dinner is selected', () => {
    const encoded = encodePurposeInNotes(`Birthday table${PURPOSE_MARKER}drinks`, 'dinner')
    expect(encoded).toBe('Birthday table')
    expect(parsePurposeFromNotes(encoded)).toBe('dinner')
  })

  it('preserves customer type, walk-in, and seating metadata around the purpose marker', () => {
    const notes = `Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VIP${PURPOSE_MARKER}drinks${SEATING_ASSIGNMENT_MARKER}{"assignedUnits":[]}`
    expect(parsePurposeFromNotes(notes)).toBe('drinks')
    expect(stripPurposeFromNotes(notes)).toBe(`Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VIP${SEATING_ASSIGNMENT_MARKER}{"assignedUnits":[]}`)
  })
})
