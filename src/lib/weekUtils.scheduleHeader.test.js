import { describe, expect, it } from 'vitest'
import { formatScheduleDayHeader } from './weekUtils'

describe('formatScheduleDayHeader', () => {
  it('keeps the long weekday and a compact landscape short name', () => {
    expect(formatScheduleDayHeader('2026-07-13')).toEqual({
      weekdayLabel: 'MONDAY',
      weekdayShortLabel: 'MON',
      calendarLabel: '13 JUL',
    })
    expect(formatScheduleDayHeader('2026-07-15').weekdayShortLabel).toBe('WED')
    expect(formatScheduleDayHeader('2026-07-19').weekdayShortLabel).toBe('SUN')
  })
})
