import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_TYPE_MARKER,
  encodeCustomerTypeInNotes,
  getGuestTypeLabel,
  normalizeStoredCustomerType,
  parseCustomerTypeFromNotes,
  stripCustomerTypeFromNotes,
} from './reservationCustomerType'
import { ensureWalkInNotesMarker } from './hostQuickCreateForm'

describe('reservationCustomerType', () => {
  it('maps Normal to Regular storage and displays Regular as Normal', () => {
    expect(normalizeStoredCustomerType('Normal')).toBe('Regular')
    expect(getGuestTypeLabel('Regular')).toBe('Normal')
    expect(getGuestTypeLabel('Normal')).toBe('Normal')
  })

  it('parses and encodes VIP, VVIP, and House Guest markers', () => {
    expect(parseCustomerTypeFromNotes(`Anniversary${CUSTOMER_TYPE_MARKER}VIP`)).toBe('VIP')
    expect(parseCustomerTypeFromNotes(`Anniversary${CUSTOMER_TYPE_MARKER}VVIP`)).toBe('VVIP')
    expect(parseCustomerTypeFromNotes(`Anniversary${CUSTOMER_TYPE_MARKER}House Guest`)).toBe('House Guest')

    expect(encodeCustomerTypeInNotes('Anniversary', 'VIP'))
      .toBe(`Anniversary${CUSTOMER_TYPE_MARKER}VIP`)
    expect(encodeCustomerTypeInNotes('Anniversary', 'VVIP'))
      .toBe(`Anniversary${CUSTOMER_TYPE_MARKER}VVIP`)
    expect(encodeCustomerTypeInNotes('Anniversary', 'House Guest'))
      .toBe(`Anniversary${CUSTOMER_TYPE_MARKER}House Guest`)
  })

  it('keeps Regular/Normal without a customer marker', () => {
    expect(encodeCustomerTypeInNotes('Window seat', 'Regular')).toBe('Window seat')
    expect(encodeCustomerTypeInNotes('Window seat', 'Normal')).toBe('Window seat')
    expect(parseCustomerTypeFromNotes('Window seat')).toBe('Regular')
  })

  it('preserves host notes when stripping and re-encoding customer type', () => {
    const notes = `Allergic to nuts${CUSTOMER_TYPE_MARKER}VIP`
    expect(stripCustomerTypeFromNotes(notes)).toBe('Allergic to nuts')
    expect(encodeCustomerTypeInNotes('Allergic to nuts', 'VVIP'))
      .toBe(`Allergic to nuts${CUSTOMER_TYPE_MARKER}VVIP`)
  })

  it('keeps walk-in marker and customer type marker without duplication', () => {
    const walkInNotes = ensureWalkInNotesMarker('Birthday table')
    expect(walkInNotes).toBe('Birthday table\nwalk-in')

    const encoded = encodeCustomerTypeInNotes(walkInNotes, 'VIP')
    expect(encoded).toBe(`Birthday table\nwalk-in${CUSTOMER_TYPE_MARKER}VIP`)
    expect(parseCustomerTypeFromNotes(encoded)).toBe('VIP')
    expect(stripCustomerTypeFromNotes(encoded)).toBe('Birthday table\nwalk-in')
  })

  it('parses customer type when seating metadata follows the marker', () => {
    const notes = `Window seat${CUSTOMER_TYPE_MARKER}VVIP\n@@SEATING@@{"assignedUnits":[]}`
    expect(parseCustomerTypeFromNotes(notes)).toBe('VVIP')
    expect(stripCustomerTypeFromNotes(notes)).toBe('Window seat\n@@SEATING@@{"assignedUnits":[]}')
  })
})
