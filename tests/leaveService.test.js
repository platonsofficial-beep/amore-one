// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  let queryResult = { data: [], error: null }

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
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
      builder.lte.mockImplementation(() => builder)
      builder.gte.mockImplementation(() => builder)
      builder.order.mockImplementation(() => builder)
    },
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => supabaseMocks.builder),
  },
}))

import {
  fetchApprovedLeaveForWorkspace,
  fetchEmployeeLeaveHistory,
  fetchPendingLeaveForWorkspace,
} from '../src/services/leaveService'

const WORKSPACE_ID = 'ws-1'
const EMPLOYEE_ID = 'emp-1'

function buildLeaveRecord(overrides = {}) {
  return {
    id: 'leave-1',
    workspace_id: WORKSPACE_ID,
    employee_id: EMPLOYEE_ID,
    leave_type: 'vacation',
    status: 'approved',
    start_date: '2026-07-10',
    end_date: '2026-07-12',
    note: 'Family trip',
    created_by: 'member-1',
    decided_by: 'member-2',
    decided_at: '2026-07-01T10:00:00.000Z',
    decision_note: '',
    created_at: '2026-06-28T09:00:00.000Z',
    updated_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('leaveService', () => {
  beforeEach(() => {
    supabaseMocks.reset()
  })

  describe('fetchApprovedLeaveForWorkspace', () => {
    it('loads approved leave for a workspace and maps records', async () => {
      supabaseMocks.setQueryResult({
        data: [buildLeaveRecord()],
        error: null,
      })

      const result = await fetchApprovedLeaveForWorkspace(WORKSPACE_ID)

      expect(result).toEqual([{
        id: 'leave-1',
        workspaceId: WORKSPACE_ID,
        employeeId: EMPLOYEE_ID,
        leaveType: 'vacation',
        status: 'approved',
        startDate: '2026-07-10',
        endDate: '2026-07-12',
        note: 'Family trip',
        createdBy: 'member-1',
        decidedBy: 'member-2',
        decidedAt: '2026-07-01T10:00:00.000Z',
        decisionNote: '',
        createdAt: '2026-06-28T09:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      }])
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('status', 'approved')
    })

    it('applies inclusive overlap filters when a date range is provided', async () => {
      supabaseMocks.setQueryResult({ data: [], error: null })

      await fetchApprovedLeaveForWorkspace(WORKSPACE_ID, {
        startDate: '2026-07-11',
        endDate: '2026-07-20',
      })

      expect(supabaseMocks.builder.lte).toHaveBeenCalledWith('start_date', '2026-07-20')
      expect(supabaseMocks.builder.gte).toHaveBeenCalledWith('end_date', '2026-07-11')
    })

    it('requires workspace id', async () => {
      await expect(fetchApprovedLeaveForWorkspace('')).rejects.toThrow('Workspace is required for leave requests.')
    })

    it('throws a setup hint when the table is unavailable', async () => {
      supabaseMocks.setQueryResult({
        data: null,
        error: { code: '42P01', message: 'relation "leave_requests" does not exist' },
      })

      await expect(fetchApprovedLeaveForWorkspace(WORKSPACE_ID)).rejects.toThrow(
        'leave_requests table is not ready yet.',
      )
    })
  })

  describe('fetchPendingLeaveForWorkspace', () => {
    it('loads pending leave ordered for manager review', async () => {
      supabaseMocks.setQueryResult({
        data: [buildLeaveRecord({ id: 'leave-2', status: 'pending', decided_by: null, decided_at: null })],
        error: null,
      })

      const result = await fetchPendingLeaveForWorkspace(WORKSPACE_ID)

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('pending')
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('status', 'pending')
      expect(supabaseMocks.builder.order).toHaveBeenCalledWith('start_date', { ascending: true })
      expect(supabaseMocks.builder.order).toHaveBeenCalledWith('created_at', { ascending: true })
    })
  })

  describe('fetchEmployeeLeaveHistory', () => {
    it('loads all statuses for one employee', async () => {
      supabaseMocks.setQueryResult({
        data: [
          buildLeaveRecord({ id: 'leave-old', start_date: '2026-06-01', end_date: '2026-06-02', status: 'rejected' }),
          buildLeaveRecord({ id: 'leave-new', start_date: '2026-07-10', end_date: '2026-07-12', status: 'approved' }),
        ],
        error: null,
      })

      const result = await fetchEmployeeLeaveHistory(WORKSPACE_ID, EMPLOYEE_ID)

      expect(result.map((entry) => entry.id)).toEqual(['leave-new', 'leave-old'])
      expect(supabaseMocks.builder.eq).toHaveBeenCalledWith('employee_id', EMPLOYEE_ID)
    })

    it('requires employee id', async () => {
      await expect(fetchEmployeeLeaveHistory(WORKSPACE_ID, '')).rejects.toThrow(
        'Employee is required for leave history.',
      )
    })
  })
})
