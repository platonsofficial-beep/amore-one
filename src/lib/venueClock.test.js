import { describe, expect, it } from 'vitest'
import { formatStockOrderDateTime } from './stockOrderUtils'
import { formatStockMovementRelativeTime } from './stockUtils'
import { formatTimestampTime24, formatVenueDateTime } from './timeFormatUtils'

const INSTANT = '2026-10-26T14:18:00.000Z'

describe('venue clock for stock timestamps', () => {
  it('shows Nicosia time when the device clock is hours behind', () => {
    expect(formatTimestampTime24(INSTANT, '—', 'Europe/Nicosia')).toBe('16:18')
    expect(formatTimestampTime24(INSTANT, '—', 'America/Los_Angeles')).toBe('07:18')
    expect(formatVenueDateTime(INSTANT, 'Europe/Nicosia')).toContain('16:18')
    expect(formatStockOrderDateTime(INSTANT, 'Europe/Nicosia')).toContain('16:18')
    expect(formatStockMovementRelativeTime(
      INSTANT,
      new Date(INSTANT),
      'Europe/Nicosia',
    )).toBe('Today 16:18')
  })
})
