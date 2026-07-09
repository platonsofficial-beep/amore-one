import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
  formatReservationPhone,
  parseReservationPhone,
  RESERVATION_PHONE_COUNTRIES,
} from './reservationPhoneUtils'

describe('parseReservationPhone', () => {
  it('returns Cyprus default for empty phone', () => {
    expect(parseReservationPhone('')).toEqual({
      countryCode: DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
      localNumber: '',
      fullPhone: '',
    })
  })

  it('detects known country prefixes longest-first', () => {
    expect(parseReservationPhone('+35799887766')).toEqual({
      countryCode: '+357',
      localNumber: '99887766',
      fullPhone: '+35799887766',
    })

    expect(parseReservationPhone('+449876543210')).toEqual({
      countryCode: '+44',
      localNumber: '9876543210',
      fullPhone: '+449876543210',
    })
  })

  it('defaults to Cyprus when no prefix is present', () => {
    expect(parseReservationPhone('99887766')).toEqual({
      countryCode: DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
      localNumber: '99887766',
      fullPhone: '+35799887766',
    })
  })

  it('lists common countries with Cyprus first', () => {
    expect(RESERVATION_PHONE_COUNTRIES[0]).toMatchObject({ code: '+357', shortLabel: 'CY' })
    expect(RESERVATION_PHONE_COUNTRIES.map((entry) => entry.code)).toEqual([
      '+357', '+30', '+44', '+49', '+33', '+39', '+1',
    ])
  })
})

describe('formatReservationPhone', () => {
  it('combines country code and local digits', () => {
    expect(formatReservationPhone('+357', '99 887 766')).toBe('+35799887766')
  })

  it('returns empty string when local number is blank', () => {
    expect(formatReservationPhone('+357', '')).toBe('')
    expect(formatReservationPhone('+357', '   ')).toBe('')
  })

  it('defaults missing country code to Cyprus', () => {
    expect(formatReservationPhone(undefined, '1234567')).toBe('+3571234567')
  })
})
