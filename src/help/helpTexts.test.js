import { describe, expect, it } from 'vitest'
import { getHelpCopy, listHelpEntries, resolveHelpCopy } from './helpTexts'

describe('help texts', () => {
  it('returns the English copy for a registered control', () => {
    expect(getHelpCopy('reservations.lock')).toMatchObject({
      title: 'Lock the map',
    })
  })

  it('falls back without throwing when a control has no id', () => {
    expect(resolveHelpCopy('', { label: 'Save draft' })).toEqual({
      id: '',
      title: 'Save draft',
      body: 'No help text yet',
    })
    expect(resolveHelpCopy('missing.control', { label: '' }).body).toBe('No help text yet')
  })

  it('lists every entry for a future assistant', () => {
    const entries = listHelpEntries()
    expect(entries.length).toBeGreaterThan(20)
    expect(entries.every((entry) => entry.title && entry.body)).toBe(true)
  })
})
