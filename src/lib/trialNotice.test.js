import { describe, expect, it } from 'vitest'
import { dismissTrialNotice, isTrialNoticeDismissed, trialNoticeStorageKey } from './trialNotice'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  }
}

describe('trial notice dismissal', () => {
  it('remembers a dismissal for that user, venue, and day only', () => {
    const storage = memoryStorage()
    expect(isTrialNoticeDismissed('user', 'venue', '2026-11-23', storage)).toBe(false)
    dismissTrialNotice('user', 'venue', '2026-11-23', storage)
    expect(isTrialNoticeDismissed('user', 'venue', '2026-11-23', storage)).toBe(true)
    expect(isTrialNoticeDismissed('user', 'venue', '2026-11-24', storage)).toBe(false)
    expect(isTrialNoticeDismissed('other', 'venue', '2026-11-23', storage)).toBe(false)
    expect(isTrialNoticeDismissed('user', 'other', '2026-11-23', storage)).toBe(false)
    expect(trialNoticeStorageKey('user', 'venue', '2026-11-23')).toBe('one.trialNotice.v1:user:venue:2026-11-23')
  })
})
