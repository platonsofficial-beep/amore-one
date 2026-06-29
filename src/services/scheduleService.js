import { supabase } from '../lib/supabaseClient'

function mapShift(record) {
  const relatedEmployee = Array.isArray(record.employees) ? record.employees[0] : record.employees

  return {
    id: record.id,
    employeeId: record.employee_id ?? record.employeeId ?? null,
    employeeName: relatedEmployee?.full_name ?? relatedEmployee?.name ?? record.employee_name ?? record.employeeName ?? '',
    employees: relatedEmployee ? { ...relatedEmployee } : null,
    role: record.role ?? '',
    area: record.area ?? '',
    date: record.shift_date ?? record.date ?? '',
    startTime: record.start_time ?? record.startTime ?? '',
    endTime: record.end_time ?? record.endTime ?? '',
    status: record.status ?? 'Scheduled',
    notes: record.notes ?? '',
  }
}

function serializeShift(shift) {
  return {
    employee_id: shift.employee_id ?? shift.employeeId ?? null,
    role: shift.role ?? '',
    area: shift.area ?? '',
    shift_date: shift.date ?? '',
    start_time: shift.startTime ?? '',
    end_time: shift.endTime ?? '',
    status: shift.status ?? 'Scheduled',
    notes: shift.notes ?? '',
  }
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

export async function getShifts() {
  const { data, error } = await supabase
    .from('shifts')
    .select(`
      *,
      employees(*)
    `)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[scheduleService] getShifts error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Shifts table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load shifts right now.')
  }

  return (data ?? []).map(mapShift)
}

export async function createShift(shift) {
  const payload = serializeShift(shift)
  console.log('[scheduleService] createShift payload', payload)

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

export async function updateShift(id, shift) {
  const { data, error } = await supabase
    .from('shifts')
    .update(serializeShift(shift))
    .eq('id', id)
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

export async function deleteShift(id) {
  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[scheduleService] deleteShift error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Shifts table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete shift right now.')
  }
}
