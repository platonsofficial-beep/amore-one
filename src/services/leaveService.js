import { supabase } from '../lib/supabaseClient'
import { LEAVE_STATUS } from '../lib/leave/leaveConstants'
import { normalizeLeaveDateKey } from '../lib/leave/leaveDateUtils'

const LEAVE_REQUESTS_TABLE = 'leave_requests'

const LEAVE_REQUEST_SELECT = `
  id,
  workspace_id,
  employee_id,
  leave_type,
  status,
  start_date,
  end_date,
  note,
  created_by,
  decided_by,
  decided_at,
  decision_note,
  created_at,
  updated_at
`

const LEAVE_SETUP_HINT = 'Run supabase/leave_requests_schema.sql in the Supabase SQL editor, then try again.'

function requireWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required for leave requests.')
  }
  return normalizedWorkspaceId
}

function requireEmployeeId(employeeId) {
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()
  if (!normalizedEmployeeId) {
    throw new Error('Employee is required for leave history.')
  }
  return normalizedEmployeeId
}

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`.toUpperCase()
  return (
    code === 'PGRST205'
    || code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
  )
}

function buildLeaveUnavailableError() {
  return new Error(`leave_requests table is not ready yet. ${LEAVE_SETUP_HINT}`)
}

function mapLeaveRequest(record) {
  if (!record) return null

  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? null,
    employeeId: record.employee_id ?? record.employeeId ?? null,
    leaveType: `${record.leave_type ?? record.leaveType ?? ''}`.trim().toLowerCase(),
    status: `${record.status ?? ''}`.trim().toLowerCase(),
    startDate: normalizeLeaveDateKey(record.start_date ?? record.startDate),
    endDate: normalizeLeaveDateKey(record.end_date ?? record.endDate),
    note: `${record.note ?? ''}`.trim(),
    createdBy: record.created_by ?? record.createdBy ?? null,
    decidedBy: record.decided_by ?? record.decidedBy ?? null,
    decidedAt: record.decided_at ?? record.decidedAt ?? null,
    decisionNote: `${record.decision_note ?? record.decisionNote ?? ''}`.trim(),
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function sortLeaveRequestsByStartDateDesc(records = []) {
  return [...records].sort((left, right) => {
    const leftStart = normalizeLeaveDateKey(left?.startDate)
    const rightStart = normalizeLeaveDateKey(right?.startDate)
    if (leftStart === rightStart) {
      return `${left?.id ?? ''}`.localeCompare(`${right?.id ?? ''}`)
    }
    return rightStart.localeCompare(leftStart)
  })
}

async function runLeaveQuery(queryFactory) {
  const { data, error } = await queryFactory()

  if (error) {
    console.error('[leaveService] query error:', error)

    if (isTableUnavailableError(error)) {
      throw buildLeaveUnavailableError()
    }

    throw new Error(error.message || 'Unable to load leave requests right now.')
  }

  return (data ?? []).map(mapLeaveRequest).filter(Boolean)
}

export async function fetchApprovedLeaveForWorkspace(workspaceId, {
  startDate = '',
  endDate = '',
} = {}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedStartDate = normalizeLeaveDateKey(startDate)
  const normalizedEndDate = normalizeLeaveDateKey(endDate)

  return runLeaveQuery(() => {
    let query = supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select(LEAVE_REQUEST_SELECT)
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('status', LEAVE_STATUS.APPROVED)
      .order('start_date', { ascending: true })
      .order('end_date', { ascending: true })

    if (normalizedStartDate && normalizedEndDate) {
      query = query
        .lte('start_date', normalizedEndDate)
        .gte('end_date', normalizedStartDate)
    } else if (normalizedStartDate) {
      query = query.gte('end_date', normalizedStartDate)
    } else if (normalizedEndDate) {
      query = query.lte('start_date', normalizedEndDate)
    }

    return query
  })
}

export async function fetchPendingLeaveForWorkspace(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  return runLeaveQuery(() => (
    supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select(LEAVE_REQUEST_SELECT)
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('status', LEAVE_STATUS.PENDING)
      .order('start_date', { ascending: true })
      .order('created_at', { ascending: true })
  ))
}

export async function fetchEmployeeLeaveHistory(workspaceId, employeeId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedEmployeeId = requireEmployeeId(employeeId)

  const records = await runLeaveQuery(() => (
    supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select(LEAVE_REQUEST_SELECT)
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('employee_id', normalizedEmployeeId)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false })
  ))

  return sortLeaveRequestsByStartDateDesc(records)
}
