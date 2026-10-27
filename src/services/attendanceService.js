import { supabase } from '../lib/supabaseClient'
import { addDaysToDateKey, weekDateKeys } from '../lib/attendance'

const SETTINGS_TABLE = 'workspace_attendance_settings'
const ENTRIES_TABLE = 'attendance_entries'
const BREAKS_TABLE = 'attendance_breaks'
const EXCEPTIONS_TABLE = 'attendance_exceptions'
const AUDIT_TABLE = 'attendance_audit'
const SHIFTS_TABLE = 'shifts'

function requireWorkspaceId(workspaceId) {
  const normalized = `${workspaceId ?? ''}`.trim()
  if (!normalized) throw new Error('Workspace is required.')
  return normalized
}

function requireClient() {
  if (!supabase) throw new Error('Needs internet connection.')
  return supabase
}

function unwrap(result) {
  if (result?.error) {
    const error = new Error(result.error.message || 'Attendance request failed.')
    error.code = result.error.code
    throw error
  }
  return result?.data
}

export async function loadAttendanceSettings(workspaceId) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  return unwrap(await client
    .from(SETTINGS_TABLE)
    .select('workspace_id, venue_lat, venue_lng, radius_m, late_grace_minutes, require_location, timezone, updated_at')
    .eq('workspace_id', id)
    .maybeSingle())
}

export async function loadAttendanceEntries(workspaceId, { fromDate = '', toDate = '', memberId = '' } = {}) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  let query = client
    .from(ENTRIES_TABLE)
    .select('id, workspace_id, member_id, employee_id, shift_id, work_date, clock_in_at, clock_out_at, in_distance_m, in_accuracy_m, in_inside, out_distance_m, out_accuracy_m, out_inside, scheduled_start_at, late_minutes, is_late, status, auto_closed')
    .eq('workspace_id', id)
  if (fromDate && toDate) {
    query = query.or(`clock_out_at.is.null,and(work_date.gte.${fromDate},work_date.lte.${toDate})`)
  } else if (fromDate) {
    query = query.gte('work_date', fromDate)
  }
  if (`${memberId ?? ''}`.trim()) query = query.eq('member_id', `${memberId}`.trim())
  return unwrap(await query.order('clock_in_at', { ascending: false })) ?? []
}

export async function loadAttendanceBreaks(entryIds) {
  const ids = [...new Set((entryIds ?? []).map((id) => `${id ?? ''}`.trim()).filter(Boolean))]
  if (ids.length === 0) return []
  const client = requireClient()
  return unwrap(await client
    .from(BREAKS_TABLE)
    .select('id, entry_id, workspace_id, start_at, end_at')
    .in('entry_id', ids)) ?? []
}

export async function loadAttendanceExceptions(workspaceId, { status = 'pending', memberId = '' } = {}) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  let query = client
    .from(EXCEPTIONS_TABLE)
    .select('id, workspace_id, entry_id, member_id, kind, distance_m, accuracy_m, proposed_clock_in_at, proposed_clock_out_at, reason, status, decided_by, decided_at, decision_note, created_at')
    .eq('workspace_id', id)
  if (status) query = query.eq('status', status)
  if (`${memberId ?? ''}`.trim()) query = query.eq('member_id', `${memberId}`.trim())
  return unwrap(await query.order('created_at', { ascending: true })) ?? []
}

export async function loadAttendanceAudit(entryId) {
  const id = `${entryId ?? ''}`.trim()
  if (!id) return []
  const client = requireClient()
  return unwrap(await client
    .from(AUDIT_TABLE)
    .select('id, workspace_id, entry_id, changed_by, changed_at, field, old_value, new_value, note')
    .eq('entry_id', id)
    .order('changed_at', { ascending: false })) ?? []
}

export async function loadAttendanceShifts(workspaceId, fromDate, toDate) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  return unwrap(await client
    .from(SHIFTS_TABLE)
    .select('id, workspace_id, employee_id, role, area, shift_date, start_time, end_time')
    .eq('workspace_id', id)
    .gte('shift_date', fromDate)
    .lte('shift_date', toDate)) ?? []
}

export function attendanceRange(now = new Date(), timeZone = '') {
  const { weekStart, dates } = weekDateKeys(now, timeZone)
  const fromDate = addDaysToDateKey(weekStart, -1)
  const toDate = dates[dates.length - 1]
  return { weekStart, dates, fromDate, toDate }
}

export async function clockIn({ workspaceId, lat = null, lng = null, accuracy = null, note = null }) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  return unwrap(await client.rpc('attendance_clock_in', {
    p_workspace_id: id,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
    p_note: note,
  }))
}

export async function clockOut({ workspaceId, lat = null, lng = null, accuracy = null, note = null }) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  return unwrap(await client.rpc('attendance_clock_out', {
    p_workspace_id: id,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
    p_note: note,
  }))
}

export async function startBreak(workspaceId) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  return unwrap(await client.rpc('attendance_break_start', { p_workspace_id: id }))
}

export async function endBreak(workspaceId) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  return unwrap(await client.rpc('attendance_break_end', { p_workspace_id: id }))
}

export async function requestEdit({ entryId, clockInAt, clockOutAt, reason }) {
  const client = requireClient()
  const id = `${entryId ?? ''}`.trim()
  if (!id) throw new Error('A time entry is required.')
  return unwrap(await client.rpc('attendance_request_edit', {
    p_entry_id: id,
    p_clock_in_at: clockInAt,
    p_clock_out_at: clockOutAt,
    p_reason: reason,
  }))
}

export async function decideException({ exceptionId, approve, note = null }) {
  const client = requireClient()
  const id = `${exceptionId ?? ''}`.trim()
  if (!id) throw new Error('A request is required.')
  return unwrap(await client.rpc('attendance_decide_exception', {
    p_exception_id: id,
    p_approve: Boolean(approve),
    p_note: note,
  }))
}

export async function editEntry({ entryId, clockInAt, clockOutAt, note }) {
  const client = requireClient()
  const id = `${entryId ?? ''}`.trim()
  if (!id) throw new Error('A time entry is required.')
  return unwrap(await client.rpc('attendance_edit_entry', {
    p_entry_id: id,
    p_clock_in_at: clockInAt,
    p_clock_out_at: clockOutAt,
    p_note: note,
  }))
}

export async function setAttendanceSettings({
  workspaceId,
  lat = null,
  lng = null,
  radiusM = 50,
  lateGraceMinutes = 10,
  requireLocation = true,
  timezone = null,
}) {
  const client = requireClient()
  const id = requireWorkspaceId(workspaceId)
  return unwrap(await client.rpc('attendance_set_settings', {
    p_workspace_id: id,
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_late_grace_minutes: lateGraceMinutes,
    p_require_location: requireLocation,
    p_timezone: timezone,
  }))
}
