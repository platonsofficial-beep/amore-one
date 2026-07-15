import { supabase } from '../lib/supabaseClient'
import { isValidLeaveType, LEAVE_STATUS } from '../lib/leave/leaveConstants'
import { normalizeLeaveDateKey } from '../lib/leave/leaveDateUtils'
import { validateLeaveDates } from '../lib/leave/leaveValidation'

const LEAVE_REQUESTS_TABLE = 'leave_requests'
const REQUEST_LEAVE_RPC = 'request_leave'

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

function requireRequestWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to request leave.')
  }
  return normalizedWorkspaceId
}

const REQUEST_LEAVE_RPC_ERROR_MESSAGES = {
  leave_request_unauthenticated: 'Sign in is required to request leave.',
  leave_request_workspace_required: 'Workspace is required to request leave.',
  leave_request_workspace_not_found: 'This workspace could not be found.',
  leave_request_membership_not_found: 'You are not a member of this workspace.',
  leave_request_duplicate_workspace_membership: 'Your workspace membership could not be resolved.',
  leave_request_employee_not_linked: 'Your employee profile is not linked to this account.',
  leave_request_employee_not_found: 'Your employee profile could not be found in this workspace.',
  leave_request_workspace_mismatch: 'This leave request does not match the selected workspace.',
  leave_request_invalid_leave_type: 'A valid leave type is required.',
  leave_request_invalid_date_range: 'Start and end dates must form a valid leave range.',
  leave_request_duration_exceeds_limit: 'Leave duration exceeds the maximum allowed range.',
  leave_request_workspace_timezone_missing: 'Workspace timezone is not configured.',
  leave_request_workspace_timezone_invalid: 'Workspace timezone configuration is invalid.',
  leave_request_past_date_range: 'Leave cannot be requested for past dates.',
  leave_request_overlap: 'You already have a pending or approved leave request for this date range.',
}

function extractRequestLeaveRpcCode(error) {
  const haystack = `${error?.message ?? ''} ${error?.code ?? ''}`.trim()
  const match = haystack.match(/leave_request_[a-z_]+/)
  return match?.[0] ?? ''
}

function getFriendlyRequestLeaveError(error) {
  const rpcCode = extractRequestLeaveRpcCode(error)
  if (rpcCode && REQUEST_LEAVE_RPC_ERROR_MESSAGES[rpcCode]) {
    return REQUEST_LEAVE_RPC_ERROR_MESSAGES[rpcCode]
  }

  const message = `${error?.message ?? ''}`.trim()
  if (message) {
    return message
  }

  return 'Unable to submit the leave request right now.'
}

function normalizeLeaveTypeForRequest(leaveType) {
  const normalizedLeaveType = `${leaveType ?? ''}`.trim().toLowerCase()
  if (!isValidLeaveType(normalizedLeaveType)) {
    throw new Error('A valid leave type is required.')
  }
  return normalizedLeaveType
}

function normalizeNoteForRequest(note) {
  return `${note ?? ''}`.trim()
}

function mapLeaveRequestRpcResult(record) {
  const mapped = mapLeaveRequest(record)
  if (!mapped?.id) return null

  return {
    id: mapped.id,
    workspaceId: mapped.workspaceId,
    employeeId: mapped.employeeId,
    status: mapped.status,
    leaveType: mapped.leaveType,
    startDate: mapped.startDate,
    endDate: mapped.endDate,
  }
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

export async function requestLeave(workspaceId, {
  leaveType,
  startDate,
  endDate,
  note,
} = {}) {
  const normalizedWorkspaceId = requireRequestWorkspaceId(workspaceId)
  const normalizedLeaveType = normalizeLeaveTypeForRequest(leaveType)

  const dateValidation = validateLeaveDates({ startDate, endDate })
  if (!dateValidation.ok) {
    throw new Error(dateValidation.error)
  }

  const normalizedNote = normalizeNoteForRequest(note)

  const { data, error } = await supabase.rpc(REQUEST_LEAVE_RPC, {
    p_workspace_id: normalizedWorkspaceId,
    p_leave_type: normalizedLeaveType,
    p_start_date: dateValidation.startDate,
    p_end_date: dateValidation.endDate,
    p_note: normalizedNote,
  })

  if (error) {
    console.error('[leaveService] requestLeave error:', error)
    throw new Error(getFriendlyRequestLeaveError(error))
  }

  const row = Array.isArray(data) ? data[0] : data
  const mapped = mapLeaveRequestRpcResult(row)

  if (!mapped) {
    throw new Error('Leave request could not be created.')
  }

  return mapped
}
