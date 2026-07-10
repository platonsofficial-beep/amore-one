import { describe, expect, it, vi } from 'vitest'
import {
  BROWSER_DEFAULT_TIMEZONE_VALUE,
  buildTimezonePickerSections,
  formatTimezoneOffsetLabel,
  getTimezonePickerValueForSelection,
  inferVenueTimezone,
  resolveTimezoneClosedDisplay,
  resolveTimezoneDisplay,
  searchTimezoneOptions,
} from './workspaceTimezoneUtils'

describe('workspaceTimezoneUtils', () => {
  const winterDate = new Date('2026-01-15T12:00:00Z')
  const summerDate = new Date('2026-07-15T12:00:00Z')

  it('renders an existing saved Europe/Nicosia value correctly', () => {
    const display = resolveTimezoneDisplay('Europe/Nicosia', winterDate)

    expect(display.cityLabel).toBe('Nicosia')
    expect(display.iana).toBe('Europe/Nicosia')
    expect(display.secondaryLabel).toContain('Europe/Nicosia')
    expect(display.isValid).toBe(true)
  })

  it('hides IANA in the closed picker when country_name exists', () => {
    const display = resolveTimezoneClosedDisplay('Europe/Nicosia', {
      countryName: 'cyprus',
      date: winterDate,
    })

    expect(display.cityLabel).toBe('Nicosia')
    expect(display.secondaryLabel).toContain('Cyprus')
    expect(display.secondaryLabel).toContain('GMT')
    expect(display.secondaryLabel).not.toContain('Europe/Nicosia')
  })

  it('falls back to IANA in the closed picker when country is missing', () => {
    const display = resolveTimezoneClosedDisplay('America/New_York', {
      countryName: '',
      date: winterDate,
    })

    expect(display.secondaryLabel).toContain('America/New_York')
    expect(display.secondaryLabel).toContain('GMT')
  })

  it('keeps stored timezone as Europe/Nicosia when selecting Nicosia', () => {
    const sections = buildTimezonePickerSections({ savedValue: '', date: winterDate })
    const europe = sections.find((section) => section.id === 'europe')
    const nicosia = europe?.options.find((option) => option.cityLabel === 'Nicosia')

    expect(getTimezonePickerValueForSelection(nicosia)).toBe('Europe/Nicosia')
  })

  it('preserves browser default empty-string storage semantics', () => {
    const display = resolveTimezoneDisplay(BROWSER_DEFAULT_TIMEZONE_VALUE, winterDate)
    const sections = buildTimezonePickerSections({ savedValue: '', date: winterDate })
    const recommended = sections.find((section) => section.id === 'recommended')
    const browserDefault = recommended?.options.find((option) => option.kind === 'browser-default')

    expect(display.isBrowserDefault).toBe(true)
    expect(display.cityLabel).toBe('Browser default')
    expect(getTimezonePickerValueForSelection(browserDefault)).toBe('')
  })

  it('recommends Europe/Nicosia for Cyprus/Nicosia venue location', () => {
    expect(inferVenueTimezone({
      countryCode: 'CY',
      countryName: 'Cyprus',
      city: 'Nicosia',
    })).toBe('Europe/Nicosia')

    const sections = buildTimezonePickerSections({
      savedValue: '',
      countryCode: 'CY',
      countryName: 'Cyprus',
      city: 'Nicosia',
      date: winterDate,
    })

    const recommended = sections.find((section) => section.id === 'recommended')
    expect(recommended?.options.some((option) => (
      option.kind === 'venue' && option.value === 'Europe/Nicosia'
    ))).toBe(true)
  })

  it('recommends Europe/Athens for Greece/Athens venue location', () => {
    expect(inferVenueTimezone({
      countryCode: 'GR',
      countryName: 'Greece',
      city: 'Athens',
    })).toBe('Europe/Athens')
  })

  it('does not add venue recommendation when a timezone is already saved', () => {
    const sections = buildTimezonePickerSections({
      savedValue: 'Europe/London',
      countryCode: 'CY',
      countryName: 'Cyprus',
      city: 'Nicosia',
      date: winterDate,
    })

    const recommended = sections.find((section) => section.id === 'recommended')
    expect(recommended?.options.some((option) => option.kind === 'venue')).toBe(false)
  })

  it('searches by city, IANA value, country, and alias', () => {
    expect(searchTimezoneOptions('nicosia', winterDate).some((option) => option.value === 'Europe/Nicosia')).toBe(true)
    expect(searchTimezoneOptions('Europe/Athens', winterDate).some((option) => option.value === 'Europe/Athens')).toBe(true)
    expect(searchTimezoneOptions('cyprus', winterDate).some((option) => option.value === 'Europe/Nicosia')).toBe(true)
    expect(searchTimezoneOptions('pacific', winterDate).some((option) => option.value === 'America/Los_Angeles')).toBe(true)
  })

  it('generates current offsets dynamically', () => {
    const winterOffset = formatTimezoneOffsetLabel('Europe/Nicosia', winterDate)
    const summerOffset = formatTimezoneOffsetLabel('Europe/Nicosia', summerDate)

    expect(winterOffset).toMatch(/^GMT[+-]\d/)
    expect(summerOffset).toMatch(/^GMT[+-]\d/)
    expect(winterOffset).not.toBe('')
    expect(summerOffset).not.toBe('')
  })

  it('renders unknown valid IANA timezones safely', () => {
    const display = resolveTimezoneDisplay('Pacific/Honolulu', winterDate)

    expect(display.cityLabel).toBe('Honolulu')
    expect(display.iana).toBe('Pacific/Honolulu')
    expect(display.isValid).toBe(true)
    expect(display.secondaryLabel).toContain('Pacific/Honolulu')
  })

  it('does not crash for invalid timezone values', () => {
    const display = resolveTimezoneDisplay('Not/A_Real_Zone', winterDate)

    expect(display.iana).toBe('Not/A_Real_Zone')
    expect(display.isValid).toBe(false)
    expect(display.cityLabel).toBe('A Real Zone')
    expect(display.secondaryLabel).toBe('Not/A_Real_Zone')
  })
})

describe('getDefaultWorkspaceTimezone browser integration', () => {
  it('uses resolved browser timezone in browser-default display', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'Europe/Nicosia',
    })

    const { resolveTimezoneDisplay: resolveDisplay } = await import('./workspaceTimezoneUtils')
    const display = resolveDisplay('', new Date('2026-01-15T12:00:00Z'))

    expect(display.secondaryLabel).toContain('Europe/Nicosia')

    vi.restoreAllMocks()
  })
})
