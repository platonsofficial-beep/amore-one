import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { translate, detectLocale, ACTIVE_LOCALE_IDS, LOCALES } from './i18n'

const en = JSON.parse(readFileSync(new URL('./locales/en.json', import.meta.url), 'utf8'))
const el = JSON.parse(readFileSync(new URL('./locales/el.json', import.meta.url), 'utf8'))

describe('i18n', () => {
  it('keeps English and Greek on the same keys and leaves room for more languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(el).sort())
    expect(LOCALES.map((item) => item.id)).toEqual(['en', 'el', 'it', 'fr', 'de', 'ru'])
    expect(ACTIVE_LOCALE_IDS).toEqual(['en', 'el'])
  })

  it('falls back to English and interpolates', () => {
    expect(translate('Sign in', undefined, 'el')).toBe('Σύνδεση')
    expect(translate('Not a real key', undefined, 'el')).toBe('Not a real key')
    expect(translate("Couldn't load {{name}}. Check your connection and try again.", { name: 'το πρόγραμμα' }, 'el'))
      .toContain('το πρόγραμμα')
  })

  it('defaults to English when nothing is stored', () => {
    expect(['en', 'el']).toContain(detectLocale())
  })
})
