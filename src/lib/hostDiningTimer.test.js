/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { createElement, act } from 'react'
import { resolveFloorTableOperationalState } from './floorTableOperationalState'
import { buildHostTableInspectorContextStrip } from './hostTableInspectorUtils'
import { applyHostFloorSelectedSeatingContext } from './hostFloorTableVisualState'
import { buildSeatingsById } from './reservationSeatings'
import {
  HOST_DINING_TIMER_DURATION_POLICY_MINUTES,
  HOST_DINING_TIMER_REFRESH_MS,
  HOST_DINING_TIMER_URGENCY_LEVELS,
  buildHostFloorDiningTimerLabel,
  buildHostFloorDiningTimerPresentation,
  formatHostDiningTimerEstimatedFreeLabel,
  formatHostDiningTimerLabel,
  formatServiceDayMinutesAsTime24,
  getHostDiningTimerExpectedDurationMinutes,
  getNowMinutesFromDate,
  getReservationEstimatedFreeServiceDayMinutes,
  getReservationInServiceElapsedMinutes,
  getReservationInServiceSinceTimeLabel,
  resolveHostDiningTimerUrgency,
  useHostDiningTimerClock,
} from './hostDiningTimer'

function buildReservation(overrides = {}) {
  return {
    id: 'res-1',
    guestName: 'Guest',
    date: '2026-07-09',
    time: '21:00',
    guests: 2,
    status: 'Checked In',
    ...overrides,
  }
}

describe('hostDiningTimer', () => {
  describe('getReservationInServiceSinceTimeLabel', () => {
    it('reuses reservation.time as the authoritative seating-start source', () => {
      const reservation = buildReservation({ time: '20:30' })
      expect(getReservationInServiceSinceTimeLabel(reservation)).toBe('20:30')
    })

    it('matches the Table Inspector Since label source', () => {
      const reservation = buildReservation({ time: '20:30' })
      const inspector = buildHostTableInspectorContextStrip([{
        reservation,
        seating: { name: 'Dinner 2' },
        hasConflict: false,
      }])

      expect(inspector.contextLine).toContain(getReservationInServiceSinceTimeLabel(reservation))
    })
  })

  describe('getReservationInServiceElapsedMinutes', () => {
    it('returns elapsed minutes for in-house reservations on the service day', () => {
      const reservation = buildReservation({ status: 'Checked In', time: '21:00' })
      expect(getReservationInServiceElapsedMinutes(reservation, 22 * 60 + 18, '2026-07-09')).toBe(78)
    })

    it('returns null for reserved but not seated reservations', () => {
      const reservation = buildReservation({ status: 'Confirmed', time: '21:00' })
      expect(getReservationInServiceElapsedMinutes(reservation, 22 * 60, '2026-07-09')).toBeNull()
    })

    it('returns null when the reservation date does not match today', () => {
      const reservation = buildReservation({ date: '2026-07-08', time: '21:00' })
      expect(getReservationInServiceElapsedMinutes(reservation, 22 * 60, '2026-07-09')).toBeNull()
    })

    it('matches reservation_date when date is stored on the alternate field', () => {
      const reservation = buildReservation({
        date: '',
        reservation_date: '2026-07-09',
        time: '21:00',
      })
      expect(getReservationInServiceElapsedMinutes(reservation, 22 * 60, '2026-07-09')).toBe(60)
    })

    it('returns null when a stale nowMinutes is before the reservation time', () => {
      const reservation = buildReservation({ status: 'Checked In', time: '21:00' })
      expect(getReservationInServiceElapsedMinutes(reservation, 20 * 60, '2026-07-09')).toBeNull()
      expect(getReservationInServiceElapsedMinutes(reservation, 22 * 60, '2026-07-09')).toBe(60)
    })

    it('returns null before the reservation time on the service day', () => {
      const reservation = buildReservation({ time: '21:00' })
      expect(getReservationInServiceElapsedMinutes(reservation, 20 * 60 + 30, '2026-07-09')).toBeNull()
    })

    it('supports Walk In reservations', () => {
      const reservation = buildReservation({ status: 'Walk In', time: '20:00' })
      expect(getReservationInServiceElapsedMinutes(reservation, 21 * 60 + 12, '2026-07-09')).toBe(72)
    })

    it('uses service-day minutes after midnight for late service', () => {
      const reservation = buildReservation({ status: 'Checked In', time: '23:00' })
      expect(getReservationInServiceElapsedMinutes(reservation, 1 * 60 + 30, '2026-07-09')).toBe(150)
    })
  })

  describe('formatHostDiningTimerLabel', () => {
    it('formats under one hour as minutes', () => {
      expect(formatHostDiningTimerLabel(18)).toBe('⏱ 18m')
    })

    it('formats over one hour as hours and minutes', () => {
      expect(formatHostDiningTimerLabel(72)).toBe('⏱ 1h 12m')
    })

    it('formats exact hours cleanly', () => {
      expect(formatHostDiningTimerLabel(120)).toBe('⏱ 2h')
    })

    it('returns null for zero elapsed minutes', () => {
      expect(formatHostDiningTimerLabel(0)).toBeNull()
    })
  })

  describe('duration policies', () => {
    it('resolves dinner to 150 minutes', () => {
      expect(HOST_DINING_TIMER_DURATION_POLICY_MINUTES.dinner).toBe(150)
      expect(getHostDiningTimerExpectedDurationMinutes(buildReservation({
        reservationPurpose: 'dinner',
      }))).toBe(150)
    })

    it('resolves drinks to 90 minutes', () => {
      expect(HOST_DINING_TIMER_DURATION_POLICY_MINUTES.drinks).toBe(90)
      expect(getHostDiningTimerExpectedDurationMinutes(buildReservation({
        reservationPurpose: 'drinks',
      }))).toBe(90)
    })

    it('resolves legacy/no-purpose reservations to dinner', () => {
      expect(getHostDiningTimerExpectedDurationMinutes(buildReservation())).toBe(150)
      expect(getHostDiningTimerExpectedDurationMinutes(buildReservation({ notes: '' }))).toBe(150)
    })
  })

  describe('resolveHostDiningTimerUrgency', () => {
    it('marks dinner below 70% as normal', () => {
      expect(resolveHostDiningTimerUrgency(104, 150)).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.NORMAL)
    })

    it('marks dinner at 70% as approaching', () => {
      expect(resolveHostDiningTimerUrgency(105, 150)).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.APPROACHING)
    })

    it('marks dinner at 100% as approaching', () => {
      expect(resolveHostDiningTimerUrgency(150, 150)).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.APPROACHING)
    })

    it('marks dinner above 100% as overdue', () => {
      expect(resolveHostDiningTimerUrgency(151, 150)).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.OVERDUE)
    })

    it('marks drinks below 70% as normal', () => {
      expect(resolveHostDiningTimerUrgency(62, 90)).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.NORMAL)
    })

    it('marks drinks at 70% as approaching', () => {
      expect(resolveHostDiningTimerUrgency(63, 90)).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.APPROACHING)
    })

    it('marks drinks above expected duration as overdue', () => {
      expect(resolveHostDiningTimerUrgency(91, 90)).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.OVERDUE)
    })
  })

  describe('estimated free time', () => {
    it('formats dinner start 21:00 as estimated free 23:30', () => {
      const reservation = buildReservation({ time: '21:00', reservationPurpose: 'dinner' })
      expect(formatHostDiningTimerEstimatedFreeLabel(
        getReservationEstimatedFreeServiceDayMinutes(reservation),
      )).toBe('Est. free 23:30')
    })

    it('formats drinks start 21:00 as estimated free 22:30', () => {
      const reservation = buildReservation({ time: '21:00', reservationPurpose: 'drinks' })
      expect(formatHostDiningTimerEstimatedFreeLabel(
        getReservationEstimatedFreeServiceDayMinutes(reservation),
      )).toBe('Est. free 22:30')
    })

    it('formats drinks start 23:30 as estimated free 01:00', () => {
      const reservation = buildReservation({ time: '23:30', reservationPurpose: 'drinks' })
      expect(formatHostDiningTimerEstimatedFreeLabel(
        getReservationEstimatedFreeServiceDayMinutes(reservation),
      )).toBe('Est. free 01:00')
    })

    it('formats dinner start 23:00 as estimated free 01:30', () => {
      const reservation = buildReservation({ time: '23:00', reservationPurpose: 'dinner' })
      expect(formatHostDiningTimerEstimatedFreeLabel(
        getReservationEstimatedFreeServiceDayMinutes(reservation),
      )).toBe('Est. free 01:30')
    })

    it('keeps service-day midnight formatting correct', () => {
      expect(formatServiceDayMinutesAsTime24(1500)).toBe('01:00')
      expect(formatServiceDayMinutesAsTime24(1530)).toBe('01:30')
    })
  })

  describe('buildHostFloorDiningTimerPresentation', () => {
    it('returns elapsed, estimated free, and urgency for seated dinner', () => {
      const reservation = buildReservation({ status: 'Checked In', time: '21:00' })
      const presentation = buildHostFloorDiningTimerPresentation(reservation, {
        phase: 'seated',
        nowMinutes: 22 * 60 + 48,
        todayKey: '2026-07-09',
      })

      expect(presentation).toEqual({
        elapsedLabel: '⏱ 1h 48m',
        estimatedFreeLabel: 'Est. free 23:30',
        urgency: HOST_DINING_TIMER_URGENCY_LEVELS.APPROACHING,
        compactLine: null,
      })
    })

    it('uses drinks duration policy for purpose-aware intelligence', () => {
      const reservation = buildReservation({
        status: 'Checked In',
        time: '21:00',
        reservationPurpose: 'drinks',
      })
      const presentation = buildHostFloorDiningTimerPresentation(reservation, {
        phase: 'seated',
        nowMinutes: 21 * 60 + 48,
        todayKey: '2026-07-09',
      })

      expect(presentation?.estimatedFreeLabel).toBe('Est. free 22:30')
      expect(presentation?.urgency).toBe(HOST_DINING_TIMER_URGENCY_LEVELS.NORMAL)
    })

    it('returns compact line for very small tables', () => {
      const reservation = buildReservation({ status: 'Checked In', time: '21:00' })
      const presentation = buildHostFloorDiningTimerPresentation(reservation, {
        phase: 'seated',
        nowMinutes: 21 * 60 + 48,
        todayKey: '2026-07-09',
        isCompact: true,
      })

      expect(presentation?.compactLine).toBe('⏱ 48m · 23:30')
    })
  })

  describe('buildHostFloorDiningTimerLabel', () => {
    it('shows elapsed time only for seated phase tables', () => {
      const reservation = buildReservation({ status: 'Checked In', time: '21:00' })
      const operational = resolveFloorTableOperationalState([reservation], 22 * 60 + 18, '2026-07-09')

      expect(buildHostFloorDiningTimerLabel(reservation, {
        phase: operational.phase,
        nowMinutes: 22 * 60 + 18,
        todayKey: '2026-07-09',
      })).toBe('⏱ 1h 18m')
    })

    it('hides timers for available tables', () => {
      const operational = resolveFloorTableOperationalState([], 22 * 60, '2026-07-09')

      expect(buildHostFloorDiningTimerLabel(null, {
        phase: operational.phase,
        nowMinutes: 22 * 60,
        todayKey: '2026-07-09',
      })).toBeNull()
    })

    it('hides timers for reserved but not seated tables', () => {
      const reservation = buildReservation({ status: 'Confirmed', time: '21:00' })
      const operational = resolveFloorTableOperationalState([reservation], 20 * 60, '2026-07-09')

      expect(buildHostFloorDiningTimerLabel(reservation, {
        phase: operational.phase,
        nowMinutes: 20 * 60,
        todayKey: '2026-07-09',
      })).toBeNull()
    })

    it('shows elapsed time for checked-in reservations through selected seating context', () => {
      const seatingsById = buildSeatingsById([{
        id: 'dinner-1',
        name: 'Dinner 1',
        startTime: '19:00',
        durationMinutes: 180,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        sortOrder: 0,
        isActive: true,
      }])
      const table = { id: 't10', label: '10', zoneId: 'main' }
      const reservation = buildReservation({
        status: 'Checked In',
        time: '21:00',
        seatingId: 'dinner-1',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
        },
      })
      const nowMinutes = 22 * 60 + 8
      const todayKey = '2026-07-09'
      const operational = resolveFloorTableOperationalState([reservation], nowMinutes, todayKey)
      const [tableState] = applyHostFloorSelectedSeatingContext([{
        table,
        reservation,
        status: operational.floorStatus,
        operational,
        meta: {},
      }], {
        selectedSeating: seatingsById.get('dinner-1'),
        enrichedReservations: [reservation],
        todayKey,
        seatingsById,
        layout: { tables: [table] },
      })

      expect(buildHostFloorDiningTimerLabel(tableState.operational.displayReservation, {
        phase: tableState.operational.phase,
        hostIndicator: tableState.operational.hostIndicator,
        nowMinutes,
        todayKey,
      })).toBe('⏱ 1h 8m')
    })

    it('shows elapsed time for legacy Seated status through selected seating context', () => {
      const seatingsById = buildSeatingsById([{
        id: 'dinner-1',
        name: 'Dinner 1',
        startTime: '19:00',
        durationMinutes: 180,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        sortOrder: 0,
        isActive: true,
      }])
      const table = { id: 't10', label: '10', zoneId: 'main' }
      const reservation = buildReservation({
        status: 'Seated',
        time: '21:00',
        seatingId: 'dinner-1',
        seatingAssignment: {
          assignedUnits: [{ id: 't10', label: 'T10' }],
        },
      })
      const nowMinutes = 22 * 60 + 15
      const todayKey = '2026-07-09'
      const operational = resolveFloorTableOperationalState([reservation], nowMinutes, todayKey)
      const [tableState] = applyHostFloorSelectedSeatingContext([{
        table,
        reservation,
        status: operational.floorStatus,
        operational,
        meta: {},
      }], {
        selectedSeating: seatingsById.get('dinner-1'),
        enrichedReservations: [reservation],
        todayKey,
        seatingsById,
        layout: { tables: [table] },
      })

      expect(tableState.operational.phase).toBe('seated')
      expect(buildHostFloorDiningTimerLabel(tableState.operational.displayReservation, {
        phase: tableState.operational.phase,
        hostIndicator: tableState.operational.hostIndicator,
        nowMinutes,
        todayKey,
      })).toBe('⏱ 1h 15m')
    })

    it('shows the same elapsed time for multi-table seated reservations', () => {
      const reservation = buildReservation({
        status: 'Checked In',
        time: '20:30',
        seatingAssignment: {
          assignedUnits: [
            { id: 't10', label: 'T10' },
            { id: 't11', label: 'T11' },
          ],
        },
      })
      const nowMinutes = 21 * 60 + 42
      const options = {
        phase: 'seated',
        nowMinutes,
        todayKey: '2026-07-09',
      }

      expect(buildHostFloorDiningTimerLabel(reservation, options)).toBe('⏱ 1h 12m')
      expect(buildHostFloorDiningTimerLabel(reservation, options)).toBe('⏱ 1h 12m')
    })
  })

  describe('getNowMinutesFromDate', () => {
    it('derives minute-of-day from a reference date', () => {
      expect(getNowMinutesFromDate(new Date(2026, 6, 9, 22, 18, 0))).toBe(22 * 60 + 18)
    })
  })

  describe('useHostDiningTimerClock', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function renderClockHarness(enabled) {
      let latestDate = null
      const container = document.createElement('div')
      const root = createRoot(container)

      function ClockHarness({ isEnabled }) {
        latestDate = useHostDiningTimerClock(isEnabled)
        return null
      }

      act(() => {
        root.render(createElement(ClockHarness, { isEnabled: enabled }))
      })

      return {
        getLatestDate: () => latestDate,
        rerender: (isEnabled) => {
          act(() => {
            root.render(createElement(ClockHarness, { isEnabled }))
          })
        },
        unmount: () => {
          act(() => {
            root.unmount()
          })
        },
      }
    }

    it('does not create an interval when disabled', () => {
      const setIntervalSpy = vi.spyOn(window, 'setInterval')
      const harness = renderClockHarness(false)

      expect(harness.getLatestDate()).toBeInstanceOf(Date)
      expect(setIntervalSpy).not.toHaveBeenCalled()

      harness.unmount()
      setIntervalSpy.mockRestore()
    })

    it('creates one shared interval when enabled and cleans up on unmount', () => {
      const setIntervalSpy = vi.spyOn(window, 'setInterval')
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
      const harness = renderClockHarness(true)

      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), HOST_DINING_TIMER_REFRESH_MS)

      const initialDate = harness.getLatestDate()
      act(() => {
        vi.advanceTimersByTime(HOST_DINING_TIMER_REFRESH_MS)
      })
      expect(harness.getLatestDate().getTime()).toBeGreaterThan(initialDate.getTime())

      harness.unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()

      setIntervalSpy.mockRestore()
      clearIntervalSpy.mockRestore()
    })

    it('syncs the reference date immediately when enabled', () => {
      vi.setSystemTime(new Date(2026, 6, 9, 22, 18, 0))
      const harness = renderClockHarness(true)

      expect(getNowMinutesFromDate(harness.getLatestDate())).toBe(22 * 60 + 18)

      harness.unmount()
    })

    it('clears the interval when disabled after being enabled', () => {
      const setIntervalSpy = vi.spyOn(window, 'setInterval')
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
      const harness = renderClockHarness(true)

      expect(setIntervalSpy).toHaveBeenCalledTimes(1)

      harness.rerender(false)
      expect(clearIntervalSpy).toHaveBeenCalled()

      setIntervalSpy.mockRestore()
      clearIntervalSpy.mockRestore()
    })
  })
})
