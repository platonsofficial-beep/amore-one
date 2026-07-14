// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPLOYEE_AVAILABILITY_DAYS } from '../src/lib/employeeAvailabilityUtils'

const supabaseMocks = vi.hoisted(() => {
  let queryResult = { data: [], error: null }

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then(onFulfilled, onRejected) {
      return Promise.resolve(queryResult).then(onFulfilled, onRejected)
    },
  }

  return {
    builder,
    setQueryResult(result) {
      queryResult = result
    },
    reset() {
      queryResult = { data: [], error: null }
      Object.values(builder).forEach((mock) => {
        if (typeof mock?.mockReset === 'function') mock.mockReset()
      })
      builder.select.mockImplementation(() => builder)
      builder.eq.mockImplementation(() => builder)
      builder.upsert.mockImplementation(() => builder)
      builder.delete.mockImplementation(() => builder)
      builder.single.mockImplementation(() => builder)
      builder.maybeSingle.mockImplementation(() => builder)
    },
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => supabaseMocks.builder),
  },
}))

import {
  deleteAvailabilityWeek,
  getEmployeeAvailabilityWeek,
  normalizeBeforeSave,
  resolveEmployeeWorkspaceId,
  saveEmployeeAvailabilityWeek,
  upsertAvailabilityDay,
} from '../src/services/availabilityService'

const WORKSPACE_ID = 'ws-1'
const EMPLOYEE_ID = 'emp-1'
const WEEK_START = '2026-07-13'

function resetSupabaseMocks() {
  supabaseMocks.reset()
}

function buildRecord(dayOfWeek, overrides = {}) {
  return {
    id: `row-${dayOfWeek}`,
    workspace_id: WORKSPACE_ID,
    employee_id: EMPLOYEE_ID,
    week_start_date: WEEK_START,
    day_of_week: dayOfWeek,
    status: 'AVAILABLE',
    start_time: null,
    end_time: null,
    note: null,
    created_at: '2026-07-13T09:00:00.000Z',
    updated_at: '2026-07-13T09:00:00.000Z',
    ...overrides,
  }
}

describe('availabilityService', () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe('normalizeBeforeSave', () => {
    it('normalizes a partial week into exactly seven save rows', () => {
      const prepared = normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: {
          days: [{ dayOfWeek: 'tuesday', status: 'UNAVAILABLE' }],
        },
      })

      expect(prepared.rows).toHaveLength(7)
      expect(prepared.rows.map((row) => row.day_of_week)).toEqual([...EMPLOYEE_AVAILABILITY_DAYS])
      expect(prepared.rows.find((row) => row.day_of_week === 'tuesday')?.status).toBe('UNAVAILABLE')
      expect(prepared.rows.find((row) => row.day_of_week === 'monday')?.status).toBe('AVAILABLE')
    })

    it('rejects unknown statuses by normalizing them to AVAILABLE in the payload', () => {
      const prepared = normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: {
          days: [{ dayOfWeek: 'wednesday', status: 'MAYBE' }],
        },
      })

      expect(prepared.rows.find((row) => row.day_of_week === 'wednesday')?.status).toBe('AVAILABLE')
    })

    it('ignores invalid times while preserving the day entry', () => {
      const prepared = normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: {
          days: [{
            dayOfWeek: 'friday',
            status: 'PREFERRED',
            startTime: '99:99',
            endTime: 'bad',
          }],
        },
      })

      const friday = prepared.rows.find((row) => row.day_of_week === 'friday')
      expect(friday?.status).toBe('PREFERRED')
      expect(friday?.start_time).toBeNull()
      expect(friday?.end_time).toBeNull()
    })

    it('deduplicates days before save so only the first entry wins', () => {
      const prepared = normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: {
          days: [
            { dayOfWeek: 'monday', status: 'UNAVAILABLE' },
            { dayOfWeek: 'monday', status: 'PREFERRED' },
          ],
        },
      })

      expect(prepared.rows.filter((row) => row.day_of_week === 'monday')).toHaveLength(1)
      expect(prepared.rows.find((row) => row.day_of_week === 'monday')?.status).toBe('UNAVAILABLE')
    })

    it('requires workspace, employee, and week start date', () => {
      expect(() => normalizeBeforeSave({
        workspaceId: '',
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: { days: [] },
      })).toThrow('Workspace is required.')

      expect(() => normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: '',
        weekStartDate: WEEK_START,
        week: { days: [] },
      })).toThrow('Employee is required.')

      expect(() => normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: '',
        week: { days: [] },
      })).toThrow('Week start date is required.')
    })

    it('handles malformed week input safely', () => {
      const prepared = normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: null,
      })

      expect(prepared.rows).toHaveLength(7)
      expect(prepared.week.days.every((entry) => entry.status === 'AVAILABLE')).toBe(true)
    })

    it('builds snake_case payloads for persistence', () => {
      const prepared = normalizeBeforeSave({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: {
          days: [{
            dayOfWeek: 'saturday',
            status: 'PREFERRED',
            startTime: '18:00',
            endTime: '22:00',
            note: 'Evenings only',
          }],
        },
      })

      expect(prepared.rows.find((row) => row.day_of_week === 'saturday')).toEqual({
        workspace_id: WORKSPACE_ID,
        employee_id: EMPLOYEE_ID,
        week_start_date: WEEK_START,
        day_of_week: 'saturday',
        status: 'PREFERRED',
        start_time: '18:00',
        end_time: '22:00',
        note: 'Evenings only',
      })
    })
  })

  describe('getEmployeeAvailabilityWeek', () => {
    it('maps persisted rows into a Monday-first week', async () => {
      supabaseMocks.setQueryResult({
        data: [
          buildRecord('wednesday', { status: 'UNAVAILABLE' }),
          buildRecord('monday', { status: 'AVAILABLE' }),
        ],
        error: null,
      })

      const week = await getEmployeeAvailabilityWeek({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
      })

      expect(week.days).toHaveLength(7)
      expect(week.days.map((entry) => entry.dayOfWeek)).toEqual([...EMPLOYEE_AVAILABILITY_DAYS])
      expect(week.days.find((entry) => entry.dayOfWeek === 'wednesday')?.status).toBe('UNAVAILABLE')
    })

    it('returns an empty normalized week when the table is unavailable', async () => {
      supabaseMocks.setQueryResult({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      })

      const week = await getEmployeeAvailabilityWeek({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
      })

      expect(week.days).toHaveLength(7)
      expect(week.days.every((entry) => entry.status === 'AVAILABLE')).toBe(true)
    })
  })

  describe('saveEmployeeAvailabilityWeek', () => {
    it('upserts exactly seven rows using the unique week/day key', async () => {
      const savedRows = EMPLOYEE_AVAILABILITY_DAYS.map((dayOfWeek) => buildRecord(dayOfWeek))

      supabaseMocks.setQueryResult({
        data: savedRows,
        error: null,
      })

      const week = await saveEmployeeAvailabilityWeek({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: {
          days: [{ dayOfWeek: 'tuesday', status: 'UNAVAILABLE' }],
        },
      })

      expect(supabaseMocks.builder.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            workspace_id: WORKSPACE_ID,
            employee_id: EMPLOYEE_ID,
            week_start_date: WEEK_START,
            day_of_week: 'tuesday',
            status: 'UNAVAILABLE',
          }),
        ]),
        { onConflict: 'workspace_id,employee_id,week_start_date,day_of_week' },
      )
      expect(week.days).toHaveLength(7)
    })

    it('surfaces table setup errors on save', async () => {
      supabaseMocks.setQueryResult({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      })

      await expect(saveEmployeeAvailabilityWeek({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        week: { days: [] },
      })).rejects.toThrow('employee_availability table is not ready yet.')
    })
  })

  describe('upsertAvailabilityDay', () => {
    it('upserts a single normalized day row', async () => {
      supabaseMocks.setQueryResult({
        data: buildRecord('friday', {
          status: 'PREFERRED',
          start_time: '18:00',
          end_time: '22:00',
        }),
        error: null,
      })

      const record = await upsertAvailabilityDay({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        day: {
          dayOfWeek: 'friday',
          status: 'PREFERRED',
          startTime: '18:00',
          endTime: '22:00',
        },
      })

      expect(supabaseMocks.builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          day_of_week: 'friday',
          status: 'PREFERRED',
          start_time: '18:00',
          end_time: '22:00',
        }),
        { onConflict: 'workspace_id,employee_id,week_start_date,day_of_week' },
      )
      expect(record.dayOfWeek).toBe('friday')
      expect(record.status).toBe('PREFERRED')
    })

    it('requires a valid availability day', async () => {
      await expect(upsertAvailabilityDay({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
        day: { dayOfWeek: 'notaday', status: 'UNAVAILABLE' },
      })).rejects.toThrow('Availability day is required.')
    })
  })

  describe('resolveEmployeeWorkspaceId', () => {
    it('returns the workspace id for a linked employee', async () => {
      supabaseMocks.setQueryResult({
        data: { workspace_id: WORKSPACE_ID },
        error: null,
      })

      await expect(resolveEmployeeWorkspaceId(EMPLOYEE_ID)).resolves.toBe(WORKSPACE_ID)
    })

    it('requires a linked employee id', async () => {
      await expect(resolveEmployeeWorkspaceId('')).rejects.toThrow('Employee is required.')
    })
  })

  describe('deleteAvailabilityWeek', () => {
    it('deletes all rows for the employee week', async () => {
      supabaseMocks.setQueryResult({ error: null })

      await deleteAvailabilityWeek({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: WEEK_START,
      })

      expect(supabaseMocks.builder.delete).toHaveBeenCalled()
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('employee_id', EMPLOYEE_ID)
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('week_start_date', WEEK_START)
    })

    it('requires a week start date before delete', async () => {
      await expect(deleteAvailabilityWeek({
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        weekStartDate: '',
      })).rejects.toThrow('Week start date is required.')
    })
  })
})
