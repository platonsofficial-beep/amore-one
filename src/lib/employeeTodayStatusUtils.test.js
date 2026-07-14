// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  EMPLOYEE_TODAY_STATUS,
  formatEmployeeTodayStatusDetail,
  getWorkspaceNowMinutes,
  resolveEmployeeTodayStatus,
} from './employeeTodayStatusUtils'

const EMPLOYEE_ID = 'emp-1'
const TODAY_KEY = '2026-07-14'

function buildShift(overrides = {}) {
  return {
    id: 'shift-1',
    employeeId: EMPLOYEE_ID,
    date: TODAY_KEY,
    startTime: '09:00',
    endTime: '17:00',
    role: 'Server',
    area: 'Service',
    ...overrides,
  }
}

function resolveStatus(overrides = {}) {
  return resolveEmployeeTodayStatus({
    employeeId: EMPLOYEE_ID,
    publishedShifts: [],
    todayKey: TODAY_KEY,
    nowMinutes: 600,
    isWeekPublished: false,
    ...overrides,
  })
}

describe('employeeTodayStatusUtils', () => {
  describe('EMPLOYEE_TODAY_STATUS', () => {
    it('includes required keys with unique labels', () => {
      expect(Object.keys(EMPLOYEE_TODAY_STATUS)).toEqual([
        'on_leave',
        'working_now',
        'scheduled_later',
        'shift_completed',
        'day_off',
        'not_scheduled',
        'unavailable',
      ])

      const labels = Object.values(EMPLOYEE_TODAY_STATUS).map((entry) => entry.label)
      expect(new Set(labels).size).toBe(labels.length)
    })

    it('freezes canonical status definitions', () => {
      expect(Object.isFrozen(EMPLOYEE_TODAY_STATUS)).toBe(true)
      expect(Object.isFrozen(EMPLOYEE_TODAY_STATUS.working_now)).toBe(true)

      expect(() => {
        EMPLOYEE_TODAY_STATUS.working_now.label = 'Changed'
      }).toThrow()
    })
  })

  describe('getWorkspaceNowMinutes', () => {
    it('returns workspace-local minutes for a named timezone', () => {
      const date = new Date('2026-07-14T11:35:00.000Z')

      expect(getWorkspaceNowMinutes(date, 'Europe/Nicosia')).toEqual({
        minutes: 875,
        usedTimeZone: 'Europe/Nicosia',
        usedFallback: false,
      })
    })

    it('returns different minutes for a different timezone', () => {
      const date = new Date('2026-07-14T11:35:00.000Z')

      const nicosia = getWorkspaceNowMinutes(date, 'Europe/Nicosia')
      const utc = getWorkspaceNowMinutes(date, 'UTC')

      expect(nicosia.minutes).not.toBe(utc.minutes)
      expect(utc).toEqual({
        minutes: 695,
        usedTimeZone: 'UTC',
        usedFallback: false,
      })
    })

    it('falls back to the provided Date local clock when timezone is empty', () => {
      const date = new Date(2026, 6, 14, 14, 35, 0)

      expect(getWorkspaceNowMinutes(date, '')).toEqual({
        minutes: 875,
        usedTimeZone: null,
        usedFallback: true,
      })
    })

    it('falls back safely for invalid timezone values', () => {
      const date = new Date(2026, 6, 14, 8, 15, 0)

      expect(getWorkspaceNowMinutes(date, 'Invalid/Timezone')).toEqual({
        minutes: 495,
        usedTimeZone: 'Invalid/Timezone',
        usedFallback: true,
      })
    })

    it('does not mutate the input Date', () => {
      const date = new Date('2026-07-14T11:35:00.000Z')
      const clone = date.getTime()

      getWorkspaceNowMinutes(date, 'Europe/Nicosia')

      expect(date.getTime()).toBe(clone)
    })
  })

  describe('resolveEmployeeTodayStatus basics', () => {
    it('returns not_scheduled for missing essential context', () => {
      expect(resolveEmployeeTodayStatus(null)).toMatchObject({
        key: 'not_scheduled',
        label: 'Not scheduled',
        shiftsToday: [],
      })

      expect(resolveEmployeeTodayStatus({
        employeeId: EMPLOYEE_ID,
        todayKey: '',
        nowMinutes: 600,
      })).toMatchObject({
        key: 'not_scheduled',
        reason: 'Missing employee or workspace date context',
      })
    })

    it('returns not_scheduled when the week is unpublished and there are no shifts', () => {
      expect(resolveStatus()).toMatchObject({
        key: 'not_scheduled',
        reason: 'No published schedule for this week',
      })
    })

    it('returns day_off when the week is published and there are no shifts', () => {
      expect(resolveStatus({ isWeekPublished: true })).toMatchObject({
        key: 'day_off',
        reason: 'Published schedule exists with no shift today',
      })
    })

    it('ignores non-matching employees and dates', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        publishedShifts: [
          buildShift({ employeeId: 'other-employee' }),
          buildShift({ date: '2026-07-15' }),
        ],
      })

      expect(result.key).toBe('day_off')
      expect(result.shiftsToday).toEqual([])
    })

    it('clamps malformed nowMinutes safely', () => {
      const active = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 9999,
        publishedShifts: [buildShift()],
      })

      expect(active.key).toBe('shift_completed')
    })
  })

  describe('active shift boundaries', () => {
    it('treats start as inclusive and end as exclusive', () => {
      const shift = buildShift({ startTime: '09:00', endTime: '17:00' })

      expect(resolveStatus({
        isWeekPublished: true,
        nowMinutes: 540,
        publishedShifts: [shift],
      }).key).toBe('working_now')

      expect(resolveStatus({
        isWeekPublished: true,
        nowMinutes: 1019,
        publishedShifts: [shift],
      }).key).toBe('working_now')

      expect(resolveStatus({
        isWeekPublished: true,
        nowMinutes: 1020,
        publishedShifts: [shift],
      }).key).toBe('shift_completed')
    })

    it('returns the current shift while active', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 600,
        publishedShifts: [buildShift()],
      })

      expect(result).toMatchObject({
        key: 'working_now',
        currentShift: {
          date: TODAY_KEY,
          startTime: '09:00',
          endTime: '17:00',
        },
        startsAt: '09:00',
        endsAt: '17:00',
      })
    })
  })

  describe('scheduled later', () => {
    it('selects the earliest future shift', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 480,
        publishedShifts: [
          buildShift({ id: 'late', startTime: '18:00', endTime: '22:00' }),
          buildShift({ id: 'early', startTime: '09:00', endTime: '13:00' }),
        ],
      })

      expect(result.key).toBe('scheduled_later')
      expect(result.nextShift?.startTime).toBe('09:00')
      expect(result.startsAt).toBe('09:00')
      expect(result.endsAt).toBe('13:00')
    })
  })

  describe('completed shifts', () => {
    it('recognizes a completed shift after end time', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 1100,
        publishedShifts: [buildShift()],
      })

      expect(result).toMatchObject({
        key: 'shift_completed',
        completedShift: {
          startTime: '09:00',
          endTime: '17:00',
        },
        endsAt: '17:00',
      })
    })
  })

  describe('multiple shifts', () => {
    it('returns working_now with a later next shift during a split day', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 660,
        publishedShifts: [
          buildShift({ id: 'morning', startTime: '09:00', endTime: '13:00' }),
          buildShift({ id: 'evening', startTime: '18:00', endTime: '22:00' }),
        ],
      })

      expect(result.key).toBe('working_now')
      expect(result.currentShift?.startTime).toBe('09:00')
      expect(result.nextShift?.startTime).toBe('18:00')
    })

    it('returns scheduled_later in the gap between shifts', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 900,
        publishedShifts: [
          buildShift({ id: 'morning', startTime: '09:00', endTime: '13:00' }),
          buildShift({ id: 'evening', startTime: '18:00', endTime: '22:00' }),
        ],
      })

      expect(result.key).toBe('scheduled_later')
      expect(result.completedShift?.startTime).toBe('09:00')
      expect(result.nextShift?.startTime).toBe('18:00')
    })

    it('returns shift_completed after all shifts finish regardless of input order', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 1400,
        publishedShifts: [
          buildShift({ id: 'evening', startTime: '18:00', endTime: '22:00' }),
          buildShift({ id: 'morning', startTime: '09:00', endTime: '13:00' }),
        ],
      })

      expect(result.key).toBe('shift_completed')
      expect(result.completedShift?.startTime).toBe('18:00')
    })
  })

  describe('overnight shifts', () => {
    it('treats an overnight shift on the same date as active before midnight', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 1380,
        publishedShifts: [buildShift({ startTime: '22:00', endTime: '02:00' })],
      })

      expect(result.key).toBe('working_now')
      expect(result.currentShift?.startTime).toBe('22:00')
    })

    it('activates a previous-day overnight shift after midnight', () => {
      const result = resolveEmployeeTodayStatus({
        employeeId: EMPLOYEE_ID,
        todayKey: '2026-07-15',
        nowMinutes: 60,
        isWeekPublished: true,
        publishedShifts: [
          buildShift({
            date: '2026-07-14',
            startTime: '22:00',
            endTime: '02:00',
          }),
        ],
      })

      expect(result.key).toBe('working_now')
      expect(result.currentShift?.date).toBe('2026-07-14')
      expect(result.reason).toBe('Active overnight shift from previous day')
    })

    it('completes a previous-day overnight shift after its end time', () => {
      const result = resolveEmployeeTodayStatus({
        employeeId: EMPLOYEE_ID,
        todayKey: '2026-07-15',
        nowMinutes: 180,
        isWeekPublished: true,
        publishedShifts: [
          buildShift({
            date: '2026-07-14',
            startTime: '22:00',
            endTime: '02:00',
          }),
        ],
      })

      expect(result.key).toBe('day_off')
    })

    it('ignores a non-overnight previous-day shift after midnight', () => {
      const result = resolveEmployeeTodayStatus({
        employeeId: EMPLOYEE_ID,
        todayKey: '2026-07-15',
        nowMinutes: 60,
        isWeekPublished: true,
        publishedShifts: [
          buildShift({
            date: '2026-07-14',
            startTime: '09:00',
            endTime: '17:00',
          }),
        ],
      })

      expect(result.key).toBe('day_off')
    })
  })

  describe('approved leave overlay', () => {
    it('returns on_leave for approved all-day leave covering today', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 600,
        publishedShifts: [buildShift()],
        approvedLeave: {
          id: 'leave-1',
          employeeId: EMPLOYEE_ID,
          startDate: '2026-07-13',
          endDate: '2026-07-16',
          status: 'approved',
        },
      })

      expect(result).toMatchObject({
        key: 'on_leave',
        label: 'On leave today',
        leave: { id: 'leave-1' },
      })
      expect(result.shiftsToday).toHaveLength(1)
    })

    it('does not override for pending or rejected leave', () => {
      const pending = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 600,
        publishedShifts: [buildShift()],
        approvedLeave: {
          employeeId: EMPLOYEE_ID,
          startDate: TODAY_KEY,
          endDate: TODAY_KEY,
          status: 'pending',
        },
      })

      const rejected = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 600,
        publishedShifts: [buildShift()],
        approvedLeave: {
          employeeId: EMPLOYEE_ID,
          startDate: TODAY_KEY,
          endDate: TODAY_KEY,
          status: 'rejected',
        },
      })

      expect(pending.key).toBe('working_now')
      expect(rejected.key).toBe('working_now')
    })

    it('ignores leave outside today or for another employee', () => {
      const outside = resolveStatus({
        isWeekPublished: true,
        publishedShifts: [buildShift()],
        approvedLeave: {
          employeeId: EMPLOYEE_ID,
          startDate: '2026-07-01',
          endDate: '2026-07-10',
          status: 'approved',
        },
      })

      const otherEmployee = resolveStatus({
        isWeekPublished: true,
        publishedShifts: [buildShift()],
        approvedLeave: {
          employeeId: 'emp-2',
          startDate: TODAY_KEY,
          endDate: TODAY_KEY,
          status: 'approved',
        },
      })

      expect(outside.key).toBe('working_now')
      expect(otherEmployee.key).toBe('working_now')
    })
  })

  describe('time formats and malformed shift rows', () => {
    it('supports HH:MM:SS and single-digit hour values', () => {
      const withSeconds = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 600,
        publishedShifts: [buildShift({ startTime: '09:00:00', endTime: '17:00:00' })],
      })

      const singleDigit = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 600,
        publishedShifts: [buildShift({ startTime: '9:00', endTime: '17:00' })],
      })

      expect(withSeconds.key).toBe('working_now')
      expect(singleDigit.key).toBe('working_now')
    })

    it('supports snake_case published shift fields', () => {
      const result = resolveEmployeeTodayStatus({
        employeeId: EMPLOYEE_ID,
        todayKey: TODAY_KEY,
        nowMinutes: 600,
        isWeekPublished: true,
        publishedShifts: [{
          employee_id: EMPLOYEE_ID,
          shift_date: TODAY_KEY,
          start_time: '09:00',
          end_time: '17:00',
        }],
      })

      expect(result.key).toBe('working_now')
      expect(result.shiftsToday).toHaveLength(1)
    })

    it('ignores malformed shift rows without throwing', () => {
      const result = resolveStatus({
        isWeekPublished: true,
        nowMinutes: 600,
        publishedShifts: [
          null,
          { employeeId: EMPLOYEE_ID, date: TODAY_KEY, startTime: 'bad', endTime: '17:00' },
          buildShift(),
        ],
      })

      expect(result.key).toBe('working_now')
      expect(result.shiftsToday).toHaveLength(1)
    })
  })

  describe('formatEmployeeTodayStatusDetail', () => {
    it('formats detail strings without locale-specific dates', () => {
      expect(formatEmployeeTodayStatusDetail({
        key: 'working_now',
        endsAt: '17:00',
      })).toBe('Working now · Until 17:00')

      expect(formatEmployeeTodayStatusDetail({
        key: 'scheduled_later',
        startsAt: '18:00',
      })).toBe('Scheduled at 18:00')

      expect(formatEmployeeTodayStatusDetail({
        key: 'day_off',
      })).toBe('Day off today')
    })
  })

  describe('immutability', () => {
    it('does not mutate published shift input or leave input', () => {
      const publishedShifts = [buildShift()]
      const approvedLeave = {
        id: 'leave-1',
        employeeId: EMPLOYEE_ID,
        startDate: TODAY_KEY,
        endDate: TODAY_KEY,
        status: 'approved',
      }
      const shiftsClone = publishedShifts.map((shift) => ({ ...shift }))
      const leaveClone = { ...approvedLeave }

      resolveEmployeeTodayStatus({
        employeeId: EMPLOYEE_ID,
        todayKey: TODAY_KEY,
        nowMinutes: 600,
        isWeekPublished: true,
        publishedShifts,
        approvedLeave,
      })

      expect(publishedShifts).toEqual(shiftsClone)
      expect(approvedLeave).toEqual(leaveClone)
    })

    it('returns a new shiftsToday array each time', () => {
      const publishedShifts = [buildShift()]

      const first = resolveStatus({
        isWeekPublished: true,
        publishedShifts,
      })
      const second = resolveStatus({
        isWeekPublished: true,
        publishedShifts,
      })

      expect(first.shiftsToday).not.toBe(second.shiftsToday)
      expect(first.shiftsToday[0].shift).toBe(publishedShifts[0])
    })
  })
})
