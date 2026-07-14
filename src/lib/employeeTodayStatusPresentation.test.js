// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolveEmployeeTodayStatus } from './employeeTodayStatusUtils'
import {
  buildEmployeeTodayStatusCardPresentation,
  buildEmployeeTodayStatusDrawerIdentity,
  countEmployeesWorkingNow,
  formatEmployeeTodayShiftSummary,
  getEmployeeTodayStatusPillClass,
} from './employeeTodayStatusPresentation'

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

describe('employeeTodayStatusPresentation', () => {
  describe('getEmployeeTodayStatusPillClass', () => {
    it('maps resolver keys to scoped pill classes', () => {
      expect(getEmployeeTodayStatusPillClass('working_now')).toBe(
        'team-people-today-status-pill team-people-today-status-pill--working-now',
      )
      expect(getEmployeeTodayStatusPillClass('on_leave')).toBe(
        'team-people-today-status-pill team-people-today-status-pill--on-leave',
      )
    })

    it('falls back safely for unknown keys', () => {
      expect(getEmployeeTodayStatusPillClass(null)).toContain('not-scheduled')
    })
  })

  describe('buildEmployeeTodayStatusCardPresentation', () => {
    it('shows loading copy without schedule assumptions', () => {
      expect(buildEmployeeTodayStatusCardPresentation(null, { isLoading: true })).toEqual({
        primaryLabel: 'Loading today status…',
        secondaryLabel: '',
        pillLabel: 'Loading…',
        toneKey: 'not_scheduled',
      })
    })

    it('shows working now detail without duplicating the primary label', () => {
      const result = resolveStatus({
        publishedShifts: [buildShift({ startTime: '09:00', endTime: '17:00' })],
        nowMinutes: 600,
        isWeekPublished: true,
      })

      expect(buildEmployeeTodayStatusCardPresentation(result)).toEqual({
        primaryLabel: 'Working now',
        secondaryLabel: 'Until 17:00',
        pillLabel: 'Working now',
        toneKey: 'working_now',
      })
    })

    it('shows scheduled later start detail', () => {
      const result = resolveStatus({
        publishedShifts: [buildShift({ startTime: '18:00', endTime: '22:00' })],
        nowMinutes: 600,
        isWeekPublished: true,
      })

      expect(buildEmployeeTodayStatusCardPresentation(result)).toEqual({
        primaryLabel: 'Scheduled later',
        secondaryLabel: 'Starts 18:00',
        pillLabel: 'Scheduled later',
        toneKey: 'scheduled_later',
      })
    })

    it('shows completed end detail', () => {
      const result = resolveStatus({
        publishedShifts: [buildShift({ startTime: '08:30', endTime: '16:30' })],
        nowMinutes: 1000,
        isWeekPublished: true,
      })

      expect(buildEmployeeTodayStatusCardPresentation(result)).toEqual({
        primaryLabel: 'Shift completed',
        secondaryLabel: 'Ended 16:30',
        pillLabel: 'Shift completed',
        toneKey: 'shift_completed',
      })
    })

    it('shows day off secondary copy', () => {
      const result = resolveStatus({ isWeekPublished: true })

      expect(buildEmployeeTodayStatusCardPresentation(result)).toEqual({
        primaryLabel: 'Day off today',
        secondaryLabel: 'No published shift today',
        pillLabel: 'Day off today',
        toneKey: 'day_off',
      })
    })

    it('shows not scheduled secondary copy', () => {
      const result = resolveStatus({ isWeekPublished: false })

      expect(buildEmployeeTodayStatusCardPresentation(result)).toEqual({
        primaryLabel: 'Not scheduled',
        secondaryLabel: 'Schedule not published',
        pillLabel: 'Not scheduled',
        toneKey: 'not_scheduled',
      })
    })

    it('shows overnight active end detail', () => {
      const result = resolveStatus({
        publishedShifts: [buildShift({
          date: '2026-07-13',
          startTime: '22:00',
          endTime: '02:00',
        })],
        nowMinutes: 60,
        isWeekPublished: true,
      })

      expect(buildEmployeeTodayStatusCardPresentation(result)).toEqual({
        primaryLabel: 'Working now',
        secondaryLabel: 'Until 02:00',
        pillLabel: 'Working now',
        toneKey: 'working_now',
      })
    })

    it('supports on leave tone mapping', () => {
      const result = resolveStatus({
        approvedLeave: {
          employeeId: EMPLOYEE_ID,
          status: 'approved',
          startDate: TODAY_KEY,
          endDate: TODAY_KEY,
        },
        isWeekPublished: true,
      })

      expect(buildEmployeeTodayStatusCardPresentation(result)).toEqual({
        primaryLabel: 'On leave today',
        secondaryLabel: '',
        pillLabel: 'On leave today',
        toneKey: 'on_leave',
      })
    })

    it('falls back safely for malformed resolver results', () => {
      expect(buildEmployeeTodayStatusCardPresentation(undefined)).toEqual({
        primaryLabel: 'Not scheduled',
        secondaryLabel: 'Schedule not published',
        pillLabel: 'Not scheduled',
        toneKey: 'not_scheduled',
      })
    })
  })

  describe('buildEmployeeTodayStatusDrawerIdentity', () => {
    it('shows active shift range in the identity header', () => {
      const result = resolveStatus({
        publishedShifts: [buildShift({ startTime: '16:30', endTime: '00:30' })],
        nowMinutes: 1000,
        isWeekPublished: true,
      })

      expect(buildEmployeeTodayStatusDrawerIdentity(result)).toEqual({
        statusLabel: 'Working now',
        todaySubtitle: 'Today · 16:30–00:30',
        pillLabel: 'Working now',
        toneKey: 'working_now',
      })
    })

    it('shows scheduled later start in the identity header', () => {
      const result = resolveStatus({
        publishedShifts: [buildShift({ startTime: '18:00', endTime: '22:00' })],
        nowMinutes: 600,
        isWeekPublished: true,
      })

      expect(buildEmployeeTodayStatusDrawerIdentity(result)).toEqual({
        statusLabel: 'Scheduled later',
        todaySubtitle: 'Today · Starts 18:00',
        pillLabel: 'Scheduled later',
        toneKey: 'scheduled_later',
      })
    })
  })

  describe('formatEmployeeTodayShiftSummary', () => {
    it('joins split shifts for the drawer row', () => {
      const result = resolveStatus({
        publishedShifts: [
          buildShift({ id: 'shift-1', startTime: '09:00', endTime: '13:00' }),
          buildShift({ id: 'shift-2', startTime: '18:00', endTime: '22:00' }),
        ],
        nowMinutes: 600,
        isWeekPublished: true,
      })

      expect(formatEmployeeTodayShiftSummary(result)).toBe('09:00–13:00 · 18:00–22:00')
    })

    it('returns an em dash when no published shift exists', () => {
      expect(formatEmployeeTodayShiftSummary(resolveStatus({ isWeekPublished: true }))).toBe('—')
    })
  })

  describe('countEmployeesWorkingNow', () => {
    it('counts only resolver working_now results', () => {
      const workingResult = resolveStatus({
        publishedShifts: [buildShift({ employeeId: 'emp-1' })],
        nowMinutes: 600,
        isWeekPublished: true,
      })
      const laterResult = resolveStatus({
        employeeId: 'emp-2',
        publishedShifts: [buildShift({ employeeId: 'emp-2', startTime: '18:00', endTime: '22:00' })],
        nowMinutes: 600,
        isWeekPublished: true,
      })

      const employees = [
        { id: 'emp-1', status: 'Leave' },
        { id: 'emp-2', status: 'Working' },
      ]

      expect(countEmployeesWorkingNow(employees, {
        'emp-1': workingResult,
        'emp-2': laterResult,
      })).toBe(1)
    })
  })
})
