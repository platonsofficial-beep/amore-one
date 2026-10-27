import { describe, expect, it } from 'vitest'
import { resolveMemberAccess } from './memberAccess'
import { canManageAttendance, resolvePermittedActiveView } from './permissions'
import {
  LOCATION_OFF_MESSAGE,
  NO_VENUE_LOCATION_MESSAGE,
  OFFLINE_MESSAGE,
  POOR_ACCURACY_MESSAGE,
  actualWorkedMinutes,
  breakMinutes,
  canDecideOwnAttendance,
  classifyUnclockedShift,
  countsForLateToday,
  clockInMessage,
  clockOutMessage,
  describeTodayShift,
  failureMessage,
  formatSignedHours,
  formatWorkingLabel,
  isOvernightShift,
  lateTodayDetail,
  minutesAfterShiftStart,
  needsManagerRequest,
  shiftDurationMinutes,
  summarizeHours,
  venueLocationIsSet,
} from './attendance'

describe('attendance messages', () => {
  it('maps each clock reason to plain English', () => {
    expect(failureMessage({ ok: false, reason: 'outside', distance_m: 350 }))
      .toBe("You're not at the venue (about 350 m away).")
    expect(failureMessage({ ok: false, reason: 'poor_accuracy' })).toBe(POOR_ACCURACY_MESSAGE)
    expect(failureMessage({ ok: false, reason: 'no_location' })).toBe(LOCATION_OFF_MESSAGE)
    expect(failureMessage({ ok: false, reason: 'already_clocked_in' })).toBe('You are already clocked in.')
    expect(failureMessage({ ok: false, reason: 'not_clocked_in' })).toBe('Clock in before you clock out.')
    expect(OFFLINE_MESSAGE).toBe('Needs internet connection.')
    expect(NO_VENUE_LOCATION_MESSAGE).toContain('Venue location is not set yet')
  })

  it('offers a manager request only for location problems', () => {
    expect(needsManagerRequest({ ok: false, reason: 'outside', distance_m: 350 })).toBe(true)
    expect(needsManagerRequest({ ok: false, reason: 'poor_accuracy' })).toBe(true)
    expect(needsManagerRequest({ ok: false, reason: 'no_location' })).toBe(true)
    expect(needsManagerRequest({ ok: false, reason: 'already_clocked_in' })).toBe(false)
    expect(needsManagerRequest({ ok: true })).toBe(false)
  })

  it('says the clock-in time and late minutes', () => {
    const clockedAt = new Date('2026-10-27T16:04:00Z')
    expect(clockInMessage({ ok: true, is_late: false }, clockedAt, 'UTC'))
      .toBe('You are clocked in at 16:04.')
    expect(clockInMessage({ ok: true, is_late: true, late_minutes: 14 }, clockedAt, 'UTC'))
      .toBe('You are clocked in at 16:04. Late by 14 min.')
    expect(clockOutMessage({ ok: true, pending_approval: true }))
      .toBe('You are clocked out. Sent to your manager for approval.')
  })

  it('treats a missing venue pin as not set', () => {
    expect(venueLocationIsSet(null)).toBe(false)
    expect(venueLocationIsSet({ venue_lat: null, venue_lng: null })).toBe(false)
    expect(venueLocationIsSet({ venue_lat: 35.18, venue_lng: 33.38 })).toBe(true)
  })
})

describe('attendance hours and overnight shifts', () => {
  it('counts an overnight shift on the day it starts and subtracts breaks', () => {
    expect(isOvernightShift('18:00', '02:00')).toBe(true)
    expect(isOvernightShift('09:00', '17:00')).toBe(false)
    expect(shiftDurationMinutes('18:00', '02:00')).toBe(8 * 60)

    const entry = {
      id: 'entry-1',
      clock_in_at: '2026-10-27T18:04:00Z',
      clock_out_at: '2026-10-28T02:00:00Z',
      work_date: '2026-10-27',
    }
    const breaks = [{
      entry_id: 'entry-1',
      start_at: '2026-10-27T20:00:00Z',
      end_at: '2026-10-27T20:20:00Z',
    }]
    expect(breakMinutes(breaks)).toBe(20)
    expect(actualWorkedMinutes(entry, breaks)).toBe((7 * 60 + 56) - 20)

    const summary = summarizeHours({
      shifts: [{ start_time: '18:00', end_time: '02:00' }],
      entries: [entry],
      breaksByEntryId: { 'entry-1': breaks },
    })
    expect(summary.scheduled).toBe(480)
    expect(summary.actual).toBe(456)
    expect(summary.difference).toBe(-24)
    expect(formatSignedHours(80)).toBe('+1h 20m')
    expect(formatWorkingLabel(135)).toBe('Working 2h 15m')
  })

  it('keeps an open break running until now', () => {
    const now = new Date('2026-10-27T18:30:00Z')
    const minutes = breakMinutes([{
      start_at: '2026-10-27T18:00:00Z',
      end_at: null,
    }], now)
    expect(minutes).toBe(30)
  })

  it('labels today’s shift, including Bar, or unscheduled', () => {
    const shifts = [{
      employee_id: 'emp-1',
      shift_date: '2026-10-27',
      start_time: '18:00',
      end_time: '02:00',
      area: 'Bar',
    }]
    expect(describeTodayShift(shifts, {
      employeeId: 'emp-1',
      todayKey: '2026-10-27',
      now: new Date('2026-10-27T19:00:00Z'),
      timeZone: 'UTC',
    }).label).toBe('18:00–02:00, Bar')
    expect(describeTodayShift([], {
      employeeId: 'emp-1',
      todayKey: '2026-10-27',
    }).label).toBe('No shift today (Unscheduled)')
  })
})

describe('late today with a fixed clock', () => {
  const evening = {
    id: 'shift-evening',
    shift_date: '2026-10-27',
    start_time: '16:30',
    end_time: '00:30',
    area: 'Bar',
  }

  it('does not flag a 16:30 shift at 12:21, or one still inside the grace', () => {
    const beforeStart = new Date('2026-10-27T12:21:00Z')
    expect(classifyUnclockedShift(evening, {
      now: beforeStart,
      graceMinutes: 10,
      timeZone: 'UTC',
    })).toBe('upcoming')
    expect(lateTodayDetail(evening, 'upcoming', 0)).toBe('')

    const insideGrace = new Date('2026-10-27T16:40:00Z')
    expect(classifyUnclockedShift(evening, {
      now: insideGrace,
      graceMinutes: 10,
      timeZone: 'UTC',
    })).toBe('within-grace')

    expect(classifyUnclockedShift(evening, {
      now: new Date('2026-10-27T10:21:00Z'),
      graceMinutes: 10,
      timeZone: 'Europe/Nicosia',
    })).toBe('upcoming')
  })

  it('says not clocked in while the shift is running past grace, and no-show only after it ends', () => {
    const running = new Date('2026-10-27T16:41:00Z')
    expect(classifyUnclockedShift(evening, {
      now: running,
      graceMinutes: 10,
      timeZone: 'UTC',
    })).toBe('not-clocked-in')
    expect(minutesAfterShiftStart(evening, running, 'UTC')).toBe(11)
    expect(lateTodayDetail(evening, 'not-clocked-in', 11)).toBe('Not clocked in (late by 11 min) · 16:30–00:30, Bar')

    const stillRunning = new Date('2026-10-28T00:29:00Z')
    expect(classifyUnclockedShift(evening, {
      now: stillRunning,
      graceMinutes: 10,
      timeZone: 'UTC',
    })).toBe('not-clocked-in')

    const ended = new Date('2026-10-28T00:30:00Z')
    expect(classifyUnclockedShift(evening, {
      now: ended,
      graceMinutes: 10,
      timeZone: 'UTC',
    })).toBe('no-show')
    expect(lateTodayDetail(evening, 'no-show', 0)).toBe('No-show · 16:30–00:30, Bar')
  })

  it('keeps late today to today and yesterday’s overnight shift', () => {
    expect(countsForLateToday(evening, '2026-10-27')).toBe(true)
    expect(countsForLateToday({
      shift_date: '2026-10-26',
      start_time: '16:30',
      end_time: '00:30',
    }, '2026-10-27')).toBe(true)
    expect(countsForLateToday({
      shift_date: '2026-10-28',
      start_time: '16:30',
      end_time: '00:30',
    }, '2026-10-27')).toBe(false)
    expect(countsForLateToday({
      shift_date: '2026-10-26',
      start_time: '09:00',
      end_time: '17:00',
    }, '2026-10-27')).toBe(false)
  })
})

describe('attendance permission gate', () => {
  it('lets owner, GM, and manager manage, and never a host', () => {
    expect(canManageAttendance('owner')).toBe(true)
    expect(canManageAttendance('general_manager')).toBe(true)
    expect(canManageAttendance('manager')).toBe(true)
    expect(canManageAttendance('host')).toBe(false)
    expect(canManageAttendance('staff')).toBe(false)
    expect(resolvePermittedActiveView('manager', 'attendance')).toBe('attendance')
    expect(resolvePermittedActiveView('host', 'attendance')).toBe('reservations')
    expect(resolvePermittedActiveView('staff', 'attendance')).toBe('today')
  })

  it('follows a stored attendance level and still blocks host', () => {
    const staffManage = resolveMemberAccess('staff', [{ module: 'attendance', level: 2 }])
    const managerView = resolveMemberAccess('manager', [{ module: 'attendance', level: 1 }])
    const hostManage = resolveMemberAccess('host', [{ module: 'attendance', level: 2 }])

    expect(canManageAttendance(staffManage)).toBe(true)
    expect(resolvePermittedActiveView(staffManage, 'attendance')).toBe('attendance')
    expect(canManageAttendance(managerView)).toBe(false)
    expect(canManageAttendance(hostManage)).toBe(false)
    expect(resolvePermittedActiveView(hostManage, 'attendance')).toBe('reservations')
  })

  it('blocks a manager from deciding or fixing their own entry', () => {
    expect(canDecideOwnAttendance({
      isOwner: false,
      actorMemberId: 'member-1',
      targetMemberId: 'member-1',
    })).toBe(false)
    expect(canDecideOwnAttendance({
      isOwner: true,
      actorMemberId: 'member-1',
      targetMemberId: 'member-1',
    })).toBe(true)
    expect(canDecideOwnAttendance({
      isOwner: false,
      actorMemberId: 'member-1',
      targetMemberId: 'member-2',
    })).toBe(true)
  })
})
