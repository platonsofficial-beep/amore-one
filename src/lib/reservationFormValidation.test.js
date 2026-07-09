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
})
