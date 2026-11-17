/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SIGNUP_HANDOFF_KEY,
  applySignupHandoff,
  parseSignupHandoff,
  sanitizeSignupPlan,
  signupAuthMetadata,
  signupVenueChoice,
} from './signupHandoff'

const query = '?signup=1&email=Maria%40Example.com&name=%20%CE%9C%CE%B1%CF%81%CE%AF%CE%B1%20%CE%93%CE%B5%CF%89%CF%81%CE%B3%CE%AF%CE%BF%CF%85%20&venue=Kafeneio%20Laiki&plan=pro&lang=el&extra=ignore'

describe('signup handoff', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('keeps only email, name, venue, plan and lang from signup=1', () => {
    expect(parseSignupHandoff(query)).toEqual({
      email: 'maria@example.com',
      name: 'Μαρία Γεωργίου',
      venue: 'Kafeneio Laiki',
      plan: 'pro',
      planSpecified: true,
      lang: 'el',
    })
    expect(parseSignupHandoff('?email=maria@example.com')).toBeNull()
    expect(parseSignupHandoff('?signup=1&plan=group&lang=fr&email=not-an-email')).toEqual({
      email: '',
      name: '',
      venue: '',
      plan: 'start',
      planSpecified: true,
      lang: '',
    })
  })

  it('whitelists the plan and caps the length', () => {
    expect(sanitizeSignupPlan('pro')).toBe('pro')
    expect(sanitizeSignupPlan(' PRO ')).toBe('pro')
    expect(sanitizeSignupPlan('group')).toBe('start')
    expect(sanitizeSignupPlan('')).toBe('start')
    const long = parseSignupHandoff(`?signup=1&name=${'a'.repeat(200)}&venue=${'b'.repeat(200)}`)
    expect(long.name).toHaveLength(80)
    expect(long.venue).toHaveLength(120)
  })

  it('does not replace a saved language, then drops the query', () => {
    localStorage.setItem('one.locale', 'en')
    window.history.replaceState({}, '', `/${query}`)
    const parsed = applySignupHandoff(window)
    expect(parsed.lang).toBe('el')
    expect(localStorage.getItem('one.locale')).toBe('en')
    expect(window.location.search).toBe('?extra=ignore')
    expect(JSON.parse(sessionStorage.getItem(SIGNUP_HANDOFF_KEY)).venue).toBe('Kafeneio Laiki')
  })

  it('uses the marketing language when nothing is saved', () => {
    window.history.replaceState({}, '', '/?signup=1&lang=el&plan=start')
    applySignupHandoff(window)
    expect(localStorage.getItem('one.locale')).toBe('el')
    expect(document.documentElement.lang).toBe('el')
  })

  it('builds auth metadata and venue choice from metadata, then the stored fallback', () => {
    expect(signupAuthMetadata({
      name: 'Μαρία Γεωργίου',
      venue: 'Kafeneio Laiki',
      plan: 'nope',
    })).toEqual({
      full_name: 'Μαρία Γεωργίου',
      venue_name: 'Kafeneio Laiki',
      plan: 'start',
    })
    expect(signupVenueChoice({
      user_metadata: { full_name: 'Ana', venue_name: 'Harbour', plan: 'pro' },
    })).toEqual({ venue: 'Harbour', name: 'Ana', plan: 'pro' })
    localStorage.setItem(SIGNUP_HANDOFF_KEY, JSON.stringify({
      venue: 'Kafeneio Laiki',
      plan: 'pro',
      name: 'Μαρία',
    }))
    expect(signupVenueChoice({ user_metadata: {} })).toEqual({
      venue: 'Kafeneio Laiki',
      name: 'Μαρία',
      plan: 'pro',
    })
  })
})
