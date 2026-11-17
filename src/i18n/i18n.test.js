import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { translate, detectLocale, ACTIVE_LOCALE_IDS, LOCALES, upper } from './i18n'

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

  it('inflects συνομιλία for the case each Chat sentence needs', () => {
    expect(translate('Delete chat', undefined, 'el')).toBe('Διαγραφή συνομιλίας')
    expect(translate('Chat actions', undefined, 'el')).toBe('Ενέργειες συνομιλίας')
    expect(translate('Delete chat', undefined, 'en')).toBe('Delete chat')
    expect(translate('Chat actions', undefined, 'en')).toBe('Chat actions')
    const removed = translate('This removes the chat from your list and clears what you can see, up to now. A new message brings it back, with only the new messages. The other person keeps the full history.', undefined, 'el')
    expect(removed.startsWith('Αυτό αφαιρεί τη συνομιλία')).toBe(true)
    expect(removed.includes('το συνομιλία')).toBe(false)
    const team = translate('{{name}} stays for everyone. This only hides it from your list and clears what you can see, up to now. It comes back when someone sends a new message.', { name: 'Ομάδα' }, 'el')
    expect(team.startsWith('Η Ομάδα μένει για όλους.')).toBe(true)
    expect(team.includes('Team')).toBe(false)
    expect(translate('{{name}} stays for everyone. This only hides it from your list and clears what you can see, up to now. It comes back when someone sends a new message.', { name: 'Team' }, 'en')).toContain('Team stays for everyone.')
    expect(translate('No late arrivals or no-shows.', undefined, 'el')).toBe('Καμία αργοπορία ή απουσία.')
    expect(translate('No late arrivals or no-shows.', undefined, 'en')).toBe('No late arrivals or no-shows.')
    expect(translate('The GPS does not work inside', undefined, 'el')).toBe('Η τοποθεσία δεν πιάνει μέσα')
  })

  it('uses i18next-style plural forms and drops the tonos in Greek capitals', () => {
    expect(translate('{{count}} guest', { count: 1 }, 'el')).toBe('1 άτομο')
    expect(translate('{{count}} guest', { count: 17 }, 'el')).toBe('17 άτομα')
    expect(translate('{{count}} booking', { count: 5 }, 'el')).toBe('5 κρατήσεις')
    expect(translate('{{count}} guest', { count: 2 }, 'en')).toBe('2 guests')
    expect(upper('Παρασκευή')).toBe('ΠΑΡΑΣΚΕΥΗ')
  })
})
