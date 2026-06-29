import { supabase } from '../lib/supabaseClient'

const EMPLOYEE_POSITIONS_TABLE = 'employee_positions'

function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd' || trimmed.toLowerCase() === 'n/a') return null

  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const mapEmployee = (record) => {
  const joinedPositions = Array.isArray(record.employee_positions)
    ? record.employee_positions
      .map((link) => link.positions)
      .filter(Boolean)
      .map((position) => ({
        id: position.id,
        name: position.name ?? position.position_name ?? '',
        department: position.department ?? 'Other',
      }))
      .filter((position) => position.name)
    : []

  const fallbackPosition = `${record.position ?? ''}`.trim()
  const effectivePositions = joinedPositions.length > 0
    ? joinedPositions
    : fallbackPosition
      ? [{ id: null, name: fallbackPosition, department: record.department ?? 'Other' }]
      : []

  return {
    id: record.id,
    name: record.full_name ?? record.name ?? '',
    position: effectivePositions.map((position) => position.name).join(', '),
    positions: effectivePositions,
    phone: record.phone ?? '',
    email: record.email ?? '',
    hireDate: record.hire_date ?? record.hireDate ?? '',
    salary: record.salary ?? '',
    emergencyContact: record.emergency_contact ?? record.emergencyContact ?? '',
    weeklyHours: record.weekly_hours ?? record.weeklyHours ?? '',
    notes: record.notes ?? '',
    shift: record.shift ?? 'Evening',
    status: record.status ?? 'Working',
    department: record.department ?? effectivePositions[0]?.department ?? 'Service',
  }
}

const serializeEmployee = (employee) => ({
  full_name: employee.name ?? employee.fullName ?? '',
  position: employee.position ?? (employee.positions ?? []).map((position) => position.name).join(', '),
  phone: employee.phone ?? '',
  email: employee.email ?? '',
  hire_date: employee.hireDate ?? employee.hire_date ?? '',
  salary: normalizeNumericValue(employee.salary),
  emergency_contact: employee.emergencyContact ?? employee.emergency_contact ?? '',
  weekly_hours: normalizeNumericValue(employee.weeklyHours ?? employee.weekly_hours),
  notes: employee.notes ?? '',
  shift: employee.shift ?? 'Evening',
  status: employee.status ?? 'Working',
  department: employee.department ?? 'Service',
})

const isTableUnavailableError = (error) => {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

async function syncEmployeePositions(employeeId, positions) {
  const positionIds = (positions ?? []).map((position) => Number(position.id)).filter(Number.isFinite)

  const { error: deleteError } = await supabase
    .from(EMPLOYEE_POSITIONS_TABLE)
    .delete()
    .eq('employee_id', employeeId)

  if (deleteError) {
    if (isTableUnavailableError(deleteError)) {
      return
    }
    throw deleteError
  }

  if (positionIds.length === 0) return

  const payload = positionIds.map((positionId) => ({
    employee_id: employeeId,
    position_id: positionId,
  }))

  const { error: insertError } = await supabase
    .from(EMPLOYEE_POSITIONS_TABLE)
    .insert(payload)

  if (insertError) {
    if (isTableUnavailableError(insertError)) {
      return
    }
    throw insertError
  }
}

export async function getEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select(`
      *,
      employee_positions(
        position_id,
        positions(id, name, department)
      )
    `)
    .order('id', { ascending: true })

  if (error) {
    console.error('[staffService] getEmployees error:', error)

    if (isTableUnavailableError(error) && error.message?.toLowerCase().includes('employee_positions')) {
      const fallback = await supabase
        .from('employees')
        .select('*')
        .order('id', { ascending: true })

      if (fallback.error) {
        throw new Error(fallback.error.message || 'Unable to load employees right now.')
      }

      return (fallback.data ?? []).map(mapEmployee)
    }

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load employees right now.')
  }

  return (data ?? []).map(mapEmployee)
}

export async function createEmployee(employee) {
  const { data, error } = await supabase
    .from('employees')
    .insert([serializeEmployee(employee)])
    .select('*')
    .single()

  if (error) {
    console.error('[staffService] createEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to create employee right now.')
  }

  try {
    await syncEmployeePositions(data.id, employee.positions)
  } catch (syncError) {
    console.error('[staffService] createEmployee syncEmployeePositions error:', syncError)
    throw new Error(syncError.message || 'Employee saved, but positions could not be synchronized.')
  }

  return mapEmployee(data)
}

export async function updateEmployee(id, employee) {
  const { data, error } = await supabase
    .from('employees')
    .update(serializeEmployee(employee))
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[staffService] updateEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to update employee right now.')
  }

  try {
    await syncEmployeePositions(id, employee.positions)
  } catch (syncError) {
    console.error('[staffService] updateEmployee syncEmployeePositions error:', syncError)
    throw new Error(syncError.message || 'Employee updated, but positions could not be synchronized.')
  }

  return mapEmployee(data)
}

export async function deleteEmployee(id) {
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[staffService] deleteEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete employee right now.')
  }
}
