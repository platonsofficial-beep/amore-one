import { describe, expect, it } from 'vitest'
import {
  getCurrentWeekStartDate,
  getDateKeyInTimeZone,
  getWeekStartDate,
  isCurrentWeek,
} from './weekUtils'

const NICOSIA = 'Asia/Nicosia'
const NICOSIA_ALIAS = 'Europe/Nicosia'

function zonedInstant(year, month, day, hour, minute, timeZone) {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  const guess = new Date(desiredUtc)
  const seen = getDateKeyInTimeZone(guess, timeZone)
  const seenParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess)
  const read = (type) => Number(seenParts.find((part) => part.type === type)?.value)
  const seenAsUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'))
  const instant = new Date(guess.getTime() - (seenAsUtc - desiredUtc))
  expect(getDateKeyInTimeZone(instant, timeZone)).toBe(seen.length ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : seen)
  return instant
}

describe('Nicosia Monday week start', () => {
  it('starts the week on Monday 26 Oct 2026 at local midnight', () => {
    const mondayMidnight = zonedInstant(2026, 10, 26, 0, 0, NICOSIA)
    expect(getWeekStartDate(mondayMidnight, NICOSIA)).toBe('2026-10-26')
    expect(getWeekStartDate(mondayMidnight, NICOSIA_ALIAS)).toBe('2026-10-26')
  })

  it('keeps Sunday 25 Oct 2026 in the previous Monday week', () => {
    const sundayLate = zonedInstant(2026, 10, 25, 23, 59, NICOSIA)
    expect(getDateKeyInTimeZone(sundayLate, NICOSIA)).toBe('2026-10-25')
    expect(getWeekStartDate(sundayLate, NICOSIA)).toBe('2026-10-19')
  })

  it('does not treat a Nicosia Monday morning as the previous UTC Sunday week', () => {
    const mondayMorning = zonedInstant(2026, 10, 26, 0, 30, NICOSIA)
    expect(mondayMorning.toISOString().startsWith('2026-10-25')).toBe(true)
    expect(getWeekStartDate(mondayMorning, NICOSIA)).toBe('2026-10-26')
    expect(getWeekStartDate('2026-10-26')).toBe('2026-10-26')
    expect(getWeekStartDate('2026-10-25')).toBe('2026-10-19')
  })

  it('treats the Nicosia date as the current week', () => {
    const mondayMorning = zonedInstant(2026, 10, 26, 0, 30, NICOSIA)
    const realNow = Date.now
    Date.now = () => mondayMorning.getTime()
    const RealDate = Date
    globalThis.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(mondayMorning.getTime())
          return
        }
        super(...args)
      }

      static now() {
        return mondayMorning.getTime()
      }
    }

    try {
      expect(getCurrentWeekStartDate(NICOSIA)).toBe('2026-10-26')
      expect(isCurrentWeek('2026-10-26', NICOSIA)).toBe(true)
      expect(isCurrentWeek('2026-10-19', NICOSIA)).toBe(false)
    } finally {
      globalThis.Date = RealDate
      Date.now = realNow
    }
  })
})
