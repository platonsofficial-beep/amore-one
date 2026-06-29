import { supabase } from '../lib/supabaseClient'

function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd' || trimmed.toLowerCase() === 'n/a') return null

  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const mapEmployee = (record) => ({
  id: record.id,
  name: record.full_name ?? record.name ?? '',
  position: record.position ?? '',
  phone: record.phone ?? '',
  email: record.email ?? '',
  hireDate: record.hire_date ?? record.hireDate ?? '',
  salary: record.salary ?? '',
  emergencyContact: record.emergency_contact ?? record.emergencyContact ?? '',
  weeklyHours: record.weekly_hours ?? record.weeklyHours ?? '',
  notes: record.notes ?? '',
  shift: record.shift ?? 'Evening',
  status: record.status ?? 'Working',
  department: record.department ?? 'Service',
})

const serializeEmployee = (employee) => ({
  full_name: employee.name ?? employee.fullName ?? '',
  position: employee.position ?? '',
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

export async function getEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('id', { ascending: true })

  if (error) {
    console.error('[staffService] getEmployees error:', error)

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
