import { supabase } from '../lib/supabaseClient'
import { assertShiftsReadyForPublish, normalizeShiftTemplateId } from '../lib/shiftIntegrity'
import { mapPublishedShift, normalizeShiftForComparison } from './publishedShiftService'

function mapPublication(record) {
  return {
    id: record.id,
    weekStartDate: `${record.week_start_date}`.slice(0, 10),
    status: record.status,
    publishedAt: record.published_at ?? null,
    unpublishedAt: record.unpublished_at ?? null,
    publishedBy: record.published_by ?? null,
    createdAt: record.created_at ?? null,
    revision: Number(record.revision ?? 0),
  }
}

function mapSnapshot(data) {
  if (!data?.publication || !Array.isArray(data.published_shifts)) {
    throw new Error('The published schedule could not be verified. Refresh before trying again.')
  }
  return { publication: mapPublication(data.publication), publishedShifts: data.published_shifts.map(mapPublishedShift) }
}

function publicationError(error) {
  const message = `${error?.message ?? ''}`
  if (message.includes('stale_revision') || message.includes('draft_changed')) {
    return new Error('The schedule changed since you opened it. Refresh the week and review it before publishing again.')
  }
  if (message.includes('single_workspace_required')) {
    return new Error('Publishing requires a single-venue database. Multi-workspace scheduling must be migrated first.')
  }
  if (message.includes('invalid_assignment')) {
    return new Error('Every shift needs a valid employee and distinct start and end times. A template, when set, must match an active template. Custom shifts stay blocked until the publication database update is applied.')
  }
  if (message.includes('forbidden')) return new Error('You do not have permission to access or publish this schedule.')
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new Error('Schedule publishing is not ready. Apply the schedule publication database update.')
  }
  return new Error(message || 'Unable to update the schedule. Retry the same action or refresh to check its status.')
}

function requireContext(workspaceId, weekStartDate) {
  if (!`${workspaceId ?? ''}`.trim()) throw new Error('Workspace is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate ?? '')) throw new Error('A valid week start date is required.')
}

export async function getWeekSchedulePublicationState(weekStartDate, workspaceId) {
  requireContext(workspaceId, weekStartDate)
  const { data, error } = await supabase.rpc('get_week_schedule_snapshot', {
    p_workspace_id: workspaceId, p_week_start_date: weekStartDate,
  })
  if (error) throw publicationError(error)
  return mapSnapshot(data)
}

export function serializePublicationDraftShift(shift) {
  const value = normalizeShiftForComparison(shift)
  return {
    id: shift.id,
    employee_id: value.employeeId,
    shift_template_id: normalizeShiftTemplateId(value.shiftTemplateId),
    shift_date: value.date, start_time: value.startTime, end_time: value.endTime,
    role: value.role, area: value.area, status: value.status, notes: value.notes,
  }
}

async function setPublication({ workspaceId, weekStartDate, expectedRevision, requestId, status, shifts = [] }) {
  requireContext(workspaceId, weekStartDate)
  if (!requestId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Refresh the schedule before publishing.')
  }
  const { data, error } = await supabase.rpc('set_week_schedule_publication', {
    p_workspace_id: workspaceId, p_week_start_date: weekStartDate, p_status: status,
    p_expected_revision: expectedRevision, p_request_id: requestId, p_draft_shifts: shifts,
  })
  if (error) throw publicationError(error)
  return mapSnapshot(data)
}

export async function publishWeekSchedule({ workspaceId, weekStartDate, draftShifts = [], knownTemplateIds = null, expectedRevision, requestId }) {
  requireContext(workspaceId, weekStartDate)
  const weekEnd = new Date(`${weekStartDate}T00:00:00Z`)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
  const endKey = weekEnd.toISOString().slice(0, 10)
  const weekShifts = draftShifts.filter((shift) => {
    const date = `${shift.date ?? shift.shift_date ?? ''}`.slice(0, 10)
    return date >= weekStartDate && date < endKey
  })
  assertShiftsReadyForPublish(weekShifts, { knownTemplateIds })
  return setPublication({ workspaceId, weekStartDate, expectedRevision, requestId,
    status: 'published', shifts: weekShifts.map(serializePublicationDraftShift).sort((a, b) => a.id.localeCompare(b.id)) })
}

export async function unpublishWeekSchedule({ workspaceId, weekStartDate, expectedRevision, requestId }) {
  return setPublication({ workspaceId, weekStartDate, expectedRevision, requestId, status: 'draft' })
}
