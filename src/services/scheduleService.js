import { supabase } from '../lib/supabaseClient'
import { validateShiftTemplateReference } from '../lib/shiftIntegrity'

function mapShift(record) {
  const relatedEmployee = Array.isArray(record.employees) ? record.employees[0] : record.employees

  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    employeeId: record.employee_id ?? record.employeeId ?? null,
    employeeName: relatedEmployee?.full_name ?? relatedEmployee?.name ?? record.employee_name ?? record.employeeName ?? '',
    employees: relatedEmployee ? { ...relatedEmployee } : null,
    role: record.role ?? '',
    area: record.area ?? '',
    date: record.shift_date ?? record.date ?? '',
    startTime: record.start_time ?? record.startTime ?? '',
    endTime: record.end_time ?? record.endTime ?? '',
    shiftTemplateId: record.shift_template_id ?? record.shiftTemplateId ?? null,
    status: record.status ?? 'Scheduled',
    notes: record.notes ?? '',
  }
}

function serializeShift(shift, options = {}) {
  const shiftTemplateId = validateShiftTemplateReference({
    shiftTemplateId: shift.shift_template_id ?? shift.shiftTemplateId,
    knownTemplateIds: options.knownTemplateIds ?? null,
    requireTemplateId: options.requireTemplateId ?? false,
  })

  return {
    employee_id: shift.employee_id ?? shift.employeeId ?? null,
    role: shift.role ?? '',
    area: shift.area ?? '',
    shift_date: shift.date ?? shift.shift_date ?? '',
    start_time: shift.startTime ?? shift.start_time ?? '',
    end_time: shift.endTime ?? shift.end_time ?? '',
    shift_template_id: shiftTemplateId,
    status: shift.status ?? 'Scheduled',
    notes: shift.notes ?? '',
  }
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function requireWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required for shifts.')
  }
  return normalizedWorkspaceId
}

export async function getShifts(workspaceId, options = {}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const startDate = normalizeShiftDate(options.startDate)
  const endDate = normalizeShiftDate(options.endDate)

  let query = supabase
    .from('shifts')
    .select(`
      *,
      employees(*)
    `)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (startDate && endDate) {
    query = query.gte('shift_date', startDate).lte('shift_date', endDate)
  } else if (startDate) {
    query = query.eq('shift_date', startDate)
  }

  const { data, error } = await query

  if (error) {
    console.error('[scheduleService] getShifts error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Shifts table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load shifts right now.')
  }

  return (data ?? []).map(mapShift)
}

export async function createShift(workspaceId, shift, options = {}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const payload = {
    ...serializeShift(shift, options),
    workspace_id: normalizedWorkspaceId,
  }

  const { data, error } = await supabase
    .from('shifts')
    .insert([payload])
    .select(`
      *,
      employees(*)
    `)
    .single()

  if (error) {
    console.error('[scheduleService] createShift error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Shifts table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to create shift right now.')
  }

  return mapShift(data)
}

export async function updateShift(workspaceId, id, shift, options = {}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const payload = serializeShift(shift, options)

  const { data, error } = await supabase
    .from('shifts')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select(`
      *,
      employees(*)
    `)
    .single()

  if (error) {
    console.error('[scheduleService] updateShift error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Shifts table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to update shift right now.')
  }

  return mapShift(data)
}

export async function deleteShift(workspaceId, id) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)

  if (error) {
    console.error('[scheduleService] deleteShift error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Shifts table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete shift right now.')
  }
}
