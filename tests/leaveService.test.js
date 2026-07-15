// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  let queryResult = { data: [], error: null }
  let rpcResult = { data: null, error: null }

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

  const rpc = vi.fn(async () => rpcResult)

  return {
    builder,
    setQueryResult(result) {
      queryResult = result
    },
    setRpcResult(result) {
      rpcResult = result
    },
    reset() {
      queryResult = { data: [], error: null }
      rpcResult = { data: null, error: null }
      Object.values(builder).forEach((mock) => {
        if (typeof mock?.mockReset === 'function') mock.mockReset()
      })
      builder.select.mockImplementation(() => builder)
      builder.eq.mockImplementation(() => builder)
      builder.lte.mockImplementation(() => builder)
      builder.gte.mockImplementation(() => builder)
      builder.order.mockImplementation(() => builder)
      rpc.mockReset()
      rpc.mockImplementation(async () => rpcResult)
    },
    rpc,
  }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => supabaseMocks.builder),
    rpc: supabaseMocks.rpc,
  },
}))

import {
  fetchApprovedLeaveForWorkspace,
  fetchEmployeeLeaveHistory,
  fetchPendingLeaveForWorkspace,
  requestLeave,
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

function buildLeaveRpcRecord(overrides = {}) {
  return {
    id: 'leave-new',
    workspace_id: WORKSPACE_ID,
    employee_id: EMPLOYEE_ID,
    leave_type: 'vacation',
    status: 'pending',
    start_date: '2026-08-01',
    end_date: '2026-08-05',
    ...overrides,
  }
}

const EXPECTED_LEAVE_RPC_RESULT = {
  id: 'leave-new',
  workspaceId: WORKSPACE_ID,
  employeeId: EMPLOYEE_ID,
  status: 'pending',
  leaveType: 'vacation',
  startDate: '2026-08-01',
  endDate: '2026-08-05',
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

  describe('requestLeave', () => {
    it('calls request_leave with the exact RPC name', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      await requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        note: 'Trip',
      })

      expect(supabaseMocks.rpc).toHaveBeenCalledWith('request_leave', expect.any(Object))
    })

    it('sends exact RPC parameter names', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      await requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        note: 'Trip',
      })

      expect(supabaseMocks.rpc).toHaveBeenCalledWith('request_leave', {
        p_workspace_id: WORKSPACE_ID,
        p_leave_type: 'vacation',
        p_start_date: '2026-08-01',
        p_end_date: '2026-08-05',
        p_note: 'Trip',
      })
    })

    it('does not send employee, creator, status, or decision fields', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      await requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        note: '',
      })

      const [, rpcParams] = supabaseMocks.rpc.mock.calls[0]
      expect(rpcParams).toEqual({
        p_workspace_id: WORKSPACE_ID,
        p_leave_type: 'vacation',
        p_start_date: '2026-08-01',
        p_end_date: '2026-08-05',
        p_note: '',
      })
      expect(Object.keys(rpcParams)).toEqual([
        'p_workspace_id',
        'p_leave_type',
        'p_start_date',
        'p_end_date',
        'p_note',
      ])
    })

    it('trims workspace id', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      await requestLeave(`  ${WORKSPACE_ID}  `, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })

      expect(supabaseMocks.rpc).toHaveBeenCalledWith('request_leave', expect.objectContaining({
        p_workspace_id: WORKSPACE_ID,
      }))
    })

    it('normalizes leave type to lowercase', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      await requestLeave(WORKSPACE_ID, {
        leaveType: '  VACATION ',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })

      expect(supabaseMocks.rpc).toHaveBeenCalledWith('request_leave', expect.objectContaining({
        p_leave_type: 'vacation',
      }))
    })

    it('trims note', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      await requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        note: '  Family trip  ',
      })

      expect(supabaseMocks.rpc).toHaveBeenCalledWith('request_leave', expect.objectContaining({
        p_note: 'Family trip',
      }))
    })

    it('converts null note to an empty string', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      await requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        note: null,
      })

      expect(supabaseMocks.rpc).toHaveBeenCalledWith('request_leave', expect.objectContaining({
        p_note: '',
      }))
    })

    it('maps a one-row array response to camelCase', async () => {
      supabaseMocks.setRpcResult({ data: [buildLeaveRpcRecord()], error: null })

      const result = await requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })

      expect(result).toEqual(EXPECTED_LEAVE_RPC_RESULT)
      expect(result).not.toHaveProperty('note')
      expect(result).not.toHaveProperty('createdBy')
    })

    it('maps a single-object response to camelCase', async () => {
      supabaseMocks.setRpcResult({ data: buildLeaveRpcRecord(), error: null })

      const result = await requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })

      expect(result).toEqual(EXPECTED_LEAVE_RPC_RESULT)
    })

    it('rejects missing workspace before RPC', async () => {
      await expect(requestLeave('', {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('Workspace is required to request leave.')

      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('rejects invalid leave type before RPC', async () => {
      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'sabbatical',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('A valid leave type is required.')

      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('rejects missing start date before RPC', async () => {
      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        endDate: '2026-08-05',
      })).rejects.toThrow('Start date is required.')

      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('rejects missing end date before RPC', async () => {
      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
      })).rejects.toThrow('End date is required.')

      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('rejects end date before start date before RPC', async () => {
      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-10',
        endDate: '2026-08-05',
      })).rejects.toThrow('End date must be on or after start date.')

      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('rejects invalid calendar date before RPC', async () => {
      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-02-30',
        endDate: '2026-08-05',
      })).rejects.toThrow('Start date is required.')

      expect(supabaseMocks.rpc).not.toHaveBeenCalled()
    })

    it('throws when RPC returns no row', async () => {
      supabaseMocks.setRpcResult({ data: [], error: null })

      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('Leave request could not be created.')
    })

    it('maps leave_request_overlap to a clear service error', async () => {
      supabaseMocks.setRpcResult({
        data: null,
        error: { message: 'leave_request_overlap' },
      })

      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('You already have a pending or approved leave request for this date range.')
    })

    it('maps leave_request_past_date_range correctly', async () => {
      supabaseMocks.setRpcResult({
        data: null,
        error: { message: 'leave_request_past_date_range' },
      })

      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('Leave cannot be requested for past dates.')
    })

    it('maps leave_request_employee_not_linked correctly', async () => {
      supabaseMocks.setRpcResult({
        data: null,
        error: { message: 'leave_request_employee_not_linked' },
      })

      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('Your employee profile is not linked to this account.')
    })

    it('maps timezone configuration errors correctly', async () => {
      supabaseMocks.setRpcResult({
        data: null,
        error: { message: 'leave_request_workspace_timezone_missing' },
      })

      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('Workspace timezone is not configured.')

      supabaseMocks.setRpcResult({
        data: null,
        error: { message: 'leave_request_workspace_timezone_invalid' },
      })

      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('Workspace timezone configuration is invalid.')
    })

    it('logs and throws unknown Supabase RPC errors', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      supabaseMocks.setRpcResult({
        data: null,
        error: { message: 'unexpected database failure' },
      })

      await expect(requestLeave(WORKSPACE_ID, {
        leaveType: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      })).rejects.toThrow('unexpected database failure')

      expect(consoleError).toHaveBeenCalledWith(
        '[leaveService] requestLeave error:',
        expect.objectContaining({ message: 'unexpected database failure' }),
      )

      consoleError.mockRestore()
    })
  })
})
