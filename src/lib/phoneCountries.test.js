import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRIES,
  detectDefaultPhoneCountryCode,
  filterPhoneCountries,
  findPhoneCountryByCode,
  findPhoneCountryByIso2,
  isoToFlagEmoji,
  sortPhoneCountriesForDisplay,
} from './phoneCountries'

describe('phoneCountries', () => {
  it('includes a full country catalog', () => {
    expect(PHONE_COUNTRIES.length).toBeGreaterThanOrEqual(230)
    expect(findPhoneCountryByIso2('CY')).toMatchObject({
      name: 'Cyprus',
      code: '+357',
    })
  })

  it('builds flag emoji from ISO codes', () => {
    expect(isoToFlagEmoji('CY')).toBe('🇨🇾')
    expect(isoToFlagEmoji('GR')).toBe('🇬🇷')
    expect(isoToFlagEmoji('US')).toBe('🇺🇸')
  })

  it('filters by country name and dial code', () => {
    expect(filterPhoneCountries('gre').map((entry) => entry.iso2)).toContain('GR')
    expect(filterPhoneCountries('357').map((entry) => entry.iso2)).toContain('CY')
    expect(filterPhoneCountries('uk').map((entry) => entry.iso2)).toContain('GB')
  })

  it('detects locale region with Cyprus fallback', () => {
    vi.stubGlobal('navigator', { language: 'el-GR', languages: ['el-GR'] })
    expect(detectDefaultPhoneCountryCode()).toBe('+30')

    vi.stubGlobal('navigator', { language: 'en', languages: ['en'] })
    expect(detectDefaultPhoneCountryCode()).toBe(DEFAULT_PHONE_COUNTRY_CODE)

    vi.unstubAllGlobals()
  })

  it('sorts priority countries ahead of the full list', () => {
    const sorted = sortPhoneCountriesForDisplay(PHONE_COUNTRIES, '+357')
    expect(sorted[0]?.iso2).toBe('CY')
    expect(sorted.slice(1, 4).map((entry) => entry.iso2)).toEqual(['GR', 'GB', 'DE'])
  })

  it('finds countries by dial code longest-first', () => {
    expect(findPhoneCountryByCode('+1876')?.iso2).toBe('JM')
    expect(findPhoneCountryByCode('+1')?.iso2).toBe('US')
  })
})
