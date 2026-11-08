import { describe, expect, it } from 'vitest'
import { formatHostLoadError, isHostLoadFailureMessage } from './hostLoadNotice'
import { formatReservationDayMonth } from './timeFormatUtils'
import { computeHostFloorServiceFit, computeHostFloorWholeAreaFit } from './hostFloorPlanViewport'
import {
  normalizeHostDiningTimerDurationPolicy,
  readHostDiningTimerDurationPolicy,
  writeHostDiningTimerDurationPolicy,
  getHostDiningTimerExpectedDurationMinutes,
} from './hostDiningTimer'
import { buildHostQuickCreateTableOptions } from './hostQuickCreateForm'
import { listPortraitSeatingLeftovers } from './managerPortrait'
import { getHostListCompactStatusLabel } from './reservationHostStatus'

describe('reservations product-ready helpers', () => {
  it('turns a fetch TypeError into a short retry message', () => {
    expect(formatHostLoadError('TypeError: Failed to fetch')).toBe("Couldn't load")
    expect(formatHostLoadError("Cannot read properties of null (reading 'from')")).toBe("Couldn't load")
    expect(isHostLoadFailureMessage('Failed to fetch')).toBe(true)
    expect(isHostLoadFailureMessage("Cannot read properties of null (reading 'from')")).toBe(true)
    expect(formatHostLoadError('Reservation updated.')).toBe('Reservation updated.')
  })

  it('shows a Cyprus day-month date, not a US month/day field', () => {
    expect(formatReservationDayMonth('2026-11-06', { year: true })).toBe('6 Nov 2026')
    expect(formatReservationDayMonth('2026-11-06')).toBe('6 Nov')
  })

  it('fits the whole floor inside the viewport with padding when tables stay readable', () => {
    const fit = computeHostFloorWholeAreaFit({
      viewportWidth: 640,
      viewportHeight: 200,
      aspectWidth: 1000,
      aspectHeight: 700,
      paddingPx: 16,
    })
    expect(fit.width).toBeLessThanOrEqual(640 - 32)
    expect(fit.height).toBeLessThanOrEqual(200 - 32)
    expect(fit.scrollLeft).toBe(0)
    expect(fit.scrollTop).toBe(0)
    expect(fit.width / fit.height).toBeCloseTo(1000 / 700, 1)
  })

  it('does not shrink a table under 44px to force the whole floor on screen', () => {
    const fit = computeHostFloorServiceFit({
      tables: [{ id: 'a', x: 10, y: 10, widthPercent: 4, heightPercent: 6 }],
      viewportWidth: 320,
      viewportHeight: 140,
      aspectWidth: 2200,
      aspectHeight: 1400,
      minTablePx: 44,
    })
    expect(fit.contained).toBe(false)
    expect(fit.width * 0.04).toBeGreaterThanOrEqual(44)
  })

  it('keeps timer minutes in the existing policy without a schema change', () => {
    expect(writeHostDiningTimerDurationPolicy({ dinner: 120, drinks: 45 })).toEqual({
      dinner: 120,
      drinks: 45,
    })
    expect(normalizeHostDiningTimerDurationPolicy({ dinner: 1, drinks: 9999 })).toEqual({
      dinner: 15,
      drinks: 1440,
    })
    expect(readHostDiningTimerDurationPolicy().dinner).toBeGreaterThan(0)
    expect(getHostDiningTimerExpectedDurationMinutes({ reservationPurpose: 'dinner' })).toBeGreaterThan(0)
  })

  it('lets an after-hours walk-in pick a table when the day has no seating', () => {
    const options = buildHostQuickCreateTableOptions({
      layout: {
        zones: [{ id: 'main', label: 'Main Dining' }],
        units: [{ id: 't1', label: 'T1', zoneId: 'main', seatedCapacity: 4 }],
      },
      reservations: [],
      dateKey: '2026-11-06',
      time: '03:30',
      seatingId: null,
      areaId: 'main',
      partySize: 2,
      seatings: [],
    })
    expect(options.canSelect).toBe(true)
    expect(options.options).toHaveLength(1)
  })

  it('lists yesterday’s arrived guests separately from today’s bookings', () => {
    const leftovers = listPortraitSeatingLeftovers([
      { id: 'a', status: 'Waiting', date: '2026-11-05', guestName: 'Nikos' },
      { id: 'b', status: 'Confirmed', date: '2026-11-06', guestName: 'Today' },
    ], '2026-11-06')
    expect(leftovers.map((entry) => entry.id)).toEqual(['a'])
  })

  it('uses Finished for a checked-out party', () => {
    expect(getHostListCompactStatusLabel('Checked Out')).toBe('Finished')
  })
})
