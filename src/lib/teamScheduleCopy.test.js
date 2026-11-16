import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { setLocale, translate } from '../i18n/i18n'
import { translateKnownLabel, translatePlaceLabel } from './areaLabels'
import { dayMonthYearToIso, isoToDayMonthYear } from './localeDate'

const GREEK = /[Α-ωΆ-ώ]/

describe('team and schedule copy', () => {
  beforeEach(() => {
    setLocale('en')
  })

  it('keeps the English directory line and translates it in Greek', () => {
    const vars = [
      ['{{count}} Employee', 8],
      ['{{count}} working now', 3],
      ['{{count}} department', 4],
    ]
    const english = vars.map(([key, count]) => translate(key, { count }, 'en')).join(' • ')
    const greek = vars.map(([key, count]) => translate(key, { count }, 'el')).join(' • ')
    expect(english).toBe('8 Employees • 3 Working now • 4 Departments')
    expect(greek).toBe('8 άτομα • 3 δουλεύουν τώρα • 4 τμήματα')
    expect(translate('+ Add Employee', {}, 'en')).toBe('+ Add Employee')
    expect(translate('+ Add Employee', {}, 'el')).toMatch(GREEK)
  })

  it('translates areas, today lines, and leave types without changing English', () => {
    expect(translateKnownLabel('Kitchen')).toBe('Kitchen')
    expect(translate('Kitchen', {}, 'el')).toBe('Κουζίνα')
    expect(translatePlaceLabel('Bar / Beverage')).toBe('Bar / Beverage')
    expect(translate('Bar / Beverage', {}, 'el')).toBe('Μπαρ / Ποτά')
    expect(translate('Until {{time}}', { time: '00:30' }, 'en')).toBe('Until 00:30')
    expect(translate('Until {{time}}', { time: '00:30' }, 'el')).toBe('Έως 00:30')
    expect(translate('{{count}} team members on shift', { count: 3 }, 'en')).toBe('3 team members on shift')
    expect(translate('{{count}} team members on shift', { count: 1 }, 'en')).toBe('1 team member on shift')
    expect(translate('Vacation', {}, 'en')).toBe('Vacation')
    expect(translate('Vacation', {}, 'el')).toMatch(GREEK)
    expect(translate('Off', {}, 'en')).toBe('Off')
    expect(translate('Off', {}, 'el')).toBe('Ρεπό')
    expect(translate('Access off', {}, 'en')).toBe('Off')
    expect(translate('Access off', {}, 'el')).toBe('Όχι')
  })

  it('uses dd/mm/yyyy for Greek date fields', () => {
    expect(isoToDayMonthYear('2026-11-16')).toBe('16/11/2026')
    expect(dayMonthYearToIso('16/11/2026')).toBe('2026-11-16')
    expect(dayMonthYearToIso('11/16/2026')).toBe('')
    expect(dayMonthYearToIso('31/02/2026')).toBe('')
  })

  it('lets iPad portrait week titles wrap instead of ellipsizing', () => {
    const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
    const start = css.indexOf('iPad portrait week cards')
    const block = css.slice(start, start + 900)
    expect(block).toContain('orientation: portrait')
    expect(block).toContain('overflow-wrap: normal')
    expect(block).toContain('word-break: normal')
    expect(block).toContain('text-overflow: unset')
    expect(block).not.toContain('text-overflow: ellipsis')
  })
})
