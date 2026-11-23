import { describe, expect, it } from 'vitest'
import { venueContactEmailError, venueContactLines, venueContactPhoneError } from './venueContact'

describe('venue contact', () => {
  it('accepts an empty phone and email and rejects a bad format', () => {
    expect(venueContactPhoneError('')).toBe('')
    expect(venueContactPhoneError('+357 99 111222')).toBe('')
    expect(venueContactPhoneError('+357 12')).toBe('Enter a valid phone number.')
    expect(venueContactEmailError('')).toBe('')
    expect(venueContactEmailError('desk@harbour.example')).toBe('')
    expect(venueContactEmailError('desk@harbour')).toBe('Enter a valid email address.')
  })

  it('hides empty contact lines and links the ones that are set', () => {
    expect(venueContactLines({})).toEqual({
      phone: '',
      email: '',
      address: '',
      telHref: '',
      mailHref: '',
      mapHref: '',
    })
    const lines = venueContactLines({
      phone: '+357 99 111222',
      email: 'desk@harbour.example',
      address: '12 Harbour Street',
      city: 'Nicosia',
    })
    expect(lines.telHref).toBe('tel:+35799111222')
    expect(lines.mailHref).toBe('mailto:desk@harbour.example')
    expect(lines.mapHref).toContain('12%20Harbour%20Street')
    expect(lines.mapHref).toContain('Nicosia')
    expect(lines.address).toBe('12 Harbour Street, Nicosia')
    expect(venueContactLines({ city: 'Nicosia' }).address).toBe('')
  })
})
