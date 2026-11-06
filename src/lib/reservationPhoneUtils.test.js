import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectDefaultPhoneCountryCode } from './phoneCountries'
import {
  DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
  formatReservationPhone,
  getDefaultReservationPhoneCountryCode,
  parseReservationPhone,
  RESERVATION_PHONE_COUNTRIES,
  resolveWorkspaceDefaultPhoneCountryCode,
  setWorkspaceDefaultPhoneCountryCode,
} from './reservationPhoneUtils'

describe('parseReservationPhone', () => {
  it('returns default country for empty phone', () => {
    expect(parseReservationPhone('', { fallbackCode: DEFAULT_RESERVATION_PHONE_COUNTRY_CODE })).toEqual({
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

    expect(parseReservationPhone('+18765551234')).toEqual({
      countryCode: '+1876',
      localNumber: '5551234',
      fullPhone: '+18765551234',
    })
  })

  it('defaults to fallback when no prefix is present', () => {
    expect(parseReservationPhone('99887766', { fallbackCode: DEFAULT_RESERVATION_PHONE_COUNTRY_CODE })).toEqual({
      countryCode: DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
      localNumber: '99887766',
      fullPhone: '+35799887766',
    })
  })

  it('exposes priority countries with Cyprus first', () => {
    expect(RESERVATION_PHONE_COUNTRIES[0]).toMatchObject({ code: '+357', iso2: 'CY' })
    expect(RESERVATION_PHONE_COUNTRIES.map((entry) => entry.code)).toEqual([
      '+357', '+30', '+44', '+49', '+33', '+39', '+1', '+971', '+7', '+90', '+972', '+961',
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

describe('venue phone country default', () => {
  afterEach(() => {
    setWorkspaceDefaultPhoneCountryCode('')
    vi.unstubAllGlobals()
  })

  it('prefers the saved dial code over the venue ISO country', () => {
    expect(resolveWorkspaceDefaultPhoneCountryCode({
      default_phone_country_code: '+44',
      countryCode: 'CY',
    })).toBe('+44')
  })

  it('maps a venue ISO country to its dial code', () => {
    expect(resolveWorkspaceDefaultPhoneCountryCode({ country_code: 'cy' })).toBe('+357')
    expect(resolveWorkspaceDefaultPhoneCountryCode({ countryCode: 'GR' })).toBe('+30')
  })

  it('stays on +357 when the venue country is unset, even for en-US', () => {
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })

    expect(detectDefaultPhoneCountryCode()).toBe('+1')
    expect(resolveWorkspaceDefaultPhoneCountryCode({})).toBe(DEFAULT_RESERVATION_PHONE_COUNTRY_CODE)
    expect(resolveWorkspaceDefaultPhoneCountryCode({ countryCode: 'ZZ' })).toBe('+357')
    expect(getDefaultReservationPhoneCountryCode()).toBe('+357')
  })

  it('applies the resolved venue code for later empty phone fields', () => {
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })
    setWorkspaceDefaultPhoneCountryCode(resolveWorkspaceDefaultPhoneCountryCode({
      countryCode: 'CY',
    }))

    expect(getDefaultReservationPhoneCountryCode()).toBe('+357')
    expect(parseReservationPhone('')).toMatchObject({ countryCode: '+357', localNumber: '' })
  })
})
