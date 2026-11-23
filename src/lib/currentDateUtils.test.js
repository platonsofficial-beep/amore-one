import { describe, expect, it } from 'vitest'
import { setLocale } from '../i18n/i18n'
import { getTimeGreeting } from './currentDateUtils'
import { buildDashboardGreeting } from './workspaceProfileUtils'

describe('getTimeGreeting', () => {
  it('uses hospitality hours in the venue time zone', () => {
    setLocale('en')
    const at = (hour, minute = 0) => new Date(Date.UTC(2026, 10, 22, hour, minute))
    expect(getTimeGreeting(at(3, 46), 'UTC')).toBe('Good evening')
    expect(getTimeGreeting(at(4, 59), 'UTC')).toBe('Good evening')
    expect(getTimeGreeting(at(5, 0), 'UTC')).toBe('Good morning')
    expect(getTimeGreeting(at(11, 59), 'UTC')).toBe('Good morning')
    expect(getTimeGreeting(at(12, 0), 'UTC')).toBe('Good afternoon')
    expect(getTimeGreeting(at(17, 59), 'UTC')).toBe('Good afternoon')
    expect(getTimeGreeting(at(18, 0), 'UTC')).toBe('Good evening')
    expect(getTimeGreeting(at(0, 10), 'UTC')).toBe('Good evening')
  })

  it('greets with the first name in sentence case', () => {
    setLocale('en')
    const greeting = buildDashboardGreeting(getTimeGreeting(new Date(Date.UTC(2026, 10, 22, 3, 46)), 'UTC'), 'Platon Sachinis')
    expect(greeting).toBe('Good evening, Platon.')
  })

  it('does not invent a name', () => {
    setLocale('en')
    expect(buildDashboardGreeting('Good evening', '')).toBe('Good evening.')
  })
})
