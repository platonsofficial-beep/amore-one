import { describe, expect, it } from 'vitest'
import { demoServiceInstant, venueClock, venueTimeLabel } from './demoMediaClock'
import { buildDemoLiveReservations } from './demoMediaSchedule'

describe('demo service clock', () => {
  it('keeps a real dinner-time clock', () => {
    const duringService = new Date('2026-11-15T18:10:00Z')
    const clock = venueClock(duringService)
    expect(clock.minutes).toBeGreaterThanOrEqual(17 * 60)
    expect(clock.minutes).toBeLessThanOrEqual(22 * 60 + 30)
    expect(demoServiceInstant(duringService).getTime()).toBe(duringService.getTime())
  })

  it('moves a midnight capture to 20:30 venue time', () => {
    const midnight = new Date('2026-11-15T22:18:00Z')
    const instant = demoServiceInstant(midnight)
    const clock = venueClock(instant)
    expect(clock.minutes).toBe(20 * 60 + 30)
    expect(clock.dateKey).toBe(venueClock(midnight).dateKey)
  })
})

describe('demo reservation times', () => {
  it('keeps lateness within 15 minutes and seated time within 75', () => {
    const rows = buildDemoLiveReservations(new Date('2026-11-15T22:18:00Z'))
    const now = venueClock(demoServiceInstant(new Date('2026-11-15T22:18:00Z'))).minutes
    const toMinutes = (time) => {
      const [hour, minute] = time.split(':').map(Number)
      return hour * 60 + minute
    }
    const late = rows.find((row) => row.id === 'res-e')
    expect(now - toMinutes(late.time)).toBe(12)
    const seated = rows.filter((row) => row.seatedDelta != null)
    expect(seated.map((row) => row.seatedDelta).sort((a, b) => a - b)).toEqual([-68, -45, -35, -25])
    seated.forEach((row) => {
      const minutes = -row.seatedDelta
      expect(minutes).toBeGreaterThanOrEqual(20)
      expect(minutes).toBeLessThanOrEqual(75)
    })
    expect(venueTimeLabel(demoServiceInstant(new Date('2026-11-15T22:18:00Z')))).toBe('20:30')
  })
})
