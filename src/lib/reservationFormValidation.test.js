import { describe, expect, it } from 'vitest'
import { validateReservationFormFields } from './reservationFormValidation'

describe('validateReservationFormFields', () => {
  it('accepts a valid reservation form', () => {
    const result = validateReservationFormFields({
      guestName: 'Alex',
      date: '2026-07-09',
      time: '19:30',
    })

    expect(result).toEqual({
      ok: true,
      error: '',
      date: '2026-07-09',
      time: '19:30',
      guestName: 'Alex',
    })
  })

  it('requires guest name', () => {
    const result = validateReservationFormFields({
      guestName: '  ',
      date: '2026-07-09',
      time: '19:30',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Please provide the guest name.')
  })

  it('requires reservation date', () => {
    const result = validateReservationFormFields({
      guestName: 'Alex',
      date: '',
      time: '19:30',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Please select a reservation date.')
  })

  it('uses date fallback when form date is empty', () => {
    const result = validateReservationFormFields(
      { guestName: 'Alex', date: '', time: '20:00' },
      { dateFallback: '2026-07-10' },
    )

    expect(result.ok).toBe(true)
    expect(result.date).toBe('2026-07-10')
  })

  it('requires reservation time', () => {
    const result = validateReservationFormFields({
      guestName: 'Alex',
      date: '2026-07-09',
      time: '',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Please select a reservation time.')
  })

  it('blocks a date before minDateKey but allows it without one (existing past bookings)', () => {
    const form = { guestName: 'Alex', date: '2026-11-01', time: '19:30' }
    expect(validateReservationFormFields(form, { minDateKey: '2026-11-02' }).error)
      .toBe('That date has passed. Pick today or a later date.')
    expect(validateReservationFormFields(form, { minDateKey: '2026-11-01' }).ok).toBe(true)
    expect(validateReservationFormFields(form).ok).toBe(true)
  })

  it('requires a party size of at least 1 when the form has one', () => {
    const base = { guestName: 'Alex', date: '2026-11-02', time: '19:30' }
    expect(validateReservationFormFields({ ...base, guests: '0' }).error).toBe('Party size must be at least 1.')
    expect(validateReservationFormFields({ ...base, guests: '' }).ok).toBe(false)
    expect(validateReservationFormFields({ ...base, guests: '3' }).ok).toBe(true)
  })
})
