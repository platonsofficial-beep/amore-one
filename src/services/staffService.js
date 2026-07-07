import { supabase } from '../lib/supabaseClient'
import { ensurePositionByName, getPositions } from './positionsService'

const EMPLOYEE_POSITIONS_TABLE = 'employee_positions'
const EMPLOYEE_SELECT = `
  *,
  employee_positions(
    position_id,
    positions(id, name)
  )
`

const EMPLOYEE_NEW_POSITION_COLUMNS = ['primary_position', 'additional_positions']

function requireWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required for employees.')
  }
  return normalizedWorkspaceId
}

function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd' || trimmed.toLowerCase() === 'n/a') return null

  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function mapJoinedPositions(record) {
  return Array.isArray(record.employee_positions)
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
}

const mapEmployee = (record) => {
  const joinedPositions = mapJoinedPositions(record)

  const normalizedPrimary = `${record.primary_position ?? ''}`.trim()
  const rawAdditional = record.additional_positions
  const normalizedAdditional = Array.isArray(rawAdditional)
    ? rawAdditional.map((item) => `${item ?? ''}`.trim()).filter(Boolean)
    : typeof rawAdditional === 'string'
      ? rawAdditional.split(',').map((item) => item.trim()).filter(Boolean)
      : []

  const explicitPositionNames = [normalizedPrimary, ...normalizedAdditional].filter(Boolean)
  const dedupedExplicitPositionNames = Array.from(new Set(explicitPositionNames.map((name) => `${name}`.trim()).filter(Boolean)))

  const joinedByName = new Map(joinedPositions.map((position) => [position.name.toLowerCase(), position]))

  const fallbackPosition = `${record.position ?? ''}`.trim()
  const legacyPositionNames = joinedPositions.length > 0
    ? []
    : fallbackPosition
      ? fallbackPosition.split(',').map((name) => name.trim()).filter(Boolean)
      : dedupedExplicitPositionNames

  const sourcePositionNames = joinedPositions.length > 0
    ? joinedPositions.map((position) => position.name)
    : legacyPositionNames

  const effectivePositions = sourcePositionNames.map((name) => {
    const joinedMatch = joinedByName.get(name.toLowerCase())
    if (joinedMatch) return joinedMatch

    return {
      id: null,
      name,
      department: record.department ?? 'Other',
    }
  })

  const primaryPosition = effectivePositions[0]?.name ?? ''
  const additionalPositions = effectivePositions.slice(1).map((position) => position.name)

  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    name: record.full_name ?? record.name ?? '',
    position: effectivePositions.map((position) => position.name).join(', '),
    positions: effectivePositions,
    primaryPosition,
    additionalPositions,
    phone: record.phone ?? '',
    email: record.email ?? '',
    hireDate: record.hire_date ?? record.hireDate ?? '',
    salary: record.salary ?? '',
    emergencyContact: record.emergency_contact ?? record.emergencyContact ?? '',
    weeklyHours: record.weekly_hours ?? record.weeklyHours ?? '',
    notes: record.notes ?? '',
    shift: record.shift ?? 'Evening',
    status: `${record.status ?? ''}`.trim() || 'Working',
    department: record.department ?? effectivePositions[0]?.department ?? 'Service',
  }
}

const serializeEmployee = (employee) => {
  const explicitPrimary = `${employee.primaryPosition ?? employee.primary_position ?? ''}`.trim()
  const explicitAdditional = Array.isArray(employee.additionalPositions ?? employee.additional_positions)
    ? (employee.additionalPositions ?? employee.additional_positions)
      .map((item) => `${item ?? ''}`.trim())
      .filter(Boolean)
    : []

  const positionNamesFromObjects = (employee.positions ?? [])
    .map((position) => `${position?.name ?? ''}`.trim())
    .filter(Boolean)

  const fallbackPositionNames = `${employee.position ?? ''}`
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  const primaryPosition = explicitPrimary || positionNamesFromObjects[0] || fallbackPositionNames[0] || ''
  const additionalPositions = Array.from(new Set([
    ...explicitAdditional,
    ...positionNamesFromObjects.filter((name) => name.toLowerCase() !== primaryPosition.toLowerCase()),
    ...fallbackPositionNames.filter((name) => name.toLowerCase() !== primaryPosition.toLowerCase()),
  ]))

  return {
    full_name: employee.name ?? employee.fullName ?? '',
    position: [primaryPosition, ...additionalPositions].filter(Boolean).join(', '),
    primary_position: primaryPosition,
    additional_positions: additionalPositions,
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
  }
}

const isMissingColumnError = (error, columns) => {
  const message = `${error?.message ?? ''}`.toLowerCase()
  if (!message) return false
  if (!message.includes('column')) return false
  return (columns ?? []).some((column) => message.includes(`${column}`.toLowerCase()))
}

function stripUnsupportedPositionColumns(payload) {
  const cleaned = { ...payload }
  delete cleaned.primary_position
  delete cleaned.additional_positions
  return cleaned
}

const isTableUnavailableError = (error) => {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

async function fetchEmployeeById(workspaceId, employeeId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const { data, error } = await supabase
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .eq('id', employeeId)
    .eq('workspace_id', normalizedWorkspaceId)
    .maybeSingle()

  if (error) {
    console.error('[staffService] fetchEmployeeById error:', error)
    throw new Error(error.message || 'Unable to load employee right now.')
  }

  if (!data) {
    throw new Error('Employee record could not be found after save.')
  }

  return mapEmployee(data)
}

async function resolvePositionsForSync(workspaceId, positions = []) {
  const catalog = await getPositions(workspaceId)
  const catalogByName = new Map(
    catalog.map((position) => [`${position.name ?? ''}`.trim().toLowerCase(), position]),
  )

  const resolved = []
  const seenIds = new Set()

  for (const position of positions ?? []) {
    const name = `${position?.name ?? ''}`.trim()
    if (!name) continue

    let resolvedPosition = null

    if (position?.id != null && Number.isFinite(Number(position.id))) {
      resolvedPosition = catalog.find((item) => String(item.id) === String(position.id)) ?? {
        id: Number(position.id),
        name,
        department: position.department ?? 'Other',
      }
    } else {
      const existing = catalogByName.get(name.toLowerCase())
      resolvedPosition = existing ?? await ensurePositionByName(
        workspaceId,
        name,
        position?.department ?? 'Other',
        catalog.length + resolved.length + 1,
      )

      if (!existing) {
        catalog.push(resolvedPosition)
        catalogByName.set(name.toLowerCase(), resolvedPosition)
      }
    }

    const positionId = Number(resolvedPosition.id)
    if (!Number.isFinite(positionId) || seenIds.has(positionId)) continue

    seenIds.add(positionId)
    resolved.push(resolvedPosition)
  }

  return resolved
}

async function syncEmployeePositions(workspaceId, employeeId, positions) {
  const resolvedPositions = await resolvePositionsForSync(workspaceId, positions)
  const positionIds = resolvedPositions
    .map((position) => Number(position.id))
    .filter(Number.isFinite)

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

export async function getEmployees(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const primary = await supabase
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('full_name', { ascending: true })

  if (!primary.error) {
    return (primary.data ?? []).map(mapEmployee)
  }

  console.warn('[staffService] getEmployees joined select failed, falling back to basic select:', primary.error)

  const fallback = await supabase
    .from('employees')
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('full_name', { ascending: true })

  if (!fallback.error) {
    return (fallback.data ?? []).map(mapEmployee)
  }

  console.error('[staffService] getEmployees fallback error:', fallback.error)

  if (isTableUnavailableError(fallback.error)) {
    throw new Error('Employees table is not ready yet.')
  }

  throw new Error(fallback.error.message || 'Unable to load employees right now.')
}

export async function createEmployee(workspaceId, employee) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const serialized = {
    ...serializeEmployee(employee),
    workspace_id: normalizedWorkspaceId,
  }

  let { data, error } = await supabase
    .from('employees')
    .insert([serialized])
    .select('*')
    .single()

  if (error && isMissingColumnError(error, EMPLOYEE_NEW_POSITION_COLUMNS)) {
    const legacySerialized = stripUnsupportedPositionColumns(serialized)
    const retry = await supabase
      .from('employees')
      .insert([legacySerialized])
      .select('*')
      .single()

    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('[staffService] createEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to create employee right now.')
  }

  try {
    await syncEmployeePositions(normalizedWorkspaceId, data.id, employee.positions)
  } catch (syncError) {
    console.error('[staffService] createEmployee syncEmployeePositions error:', syncError)
    throw new Error(syncError.message || 'Employee saved, but positions could not be synchronized.')
  }

  return fetchEmployeeById(normalizedWorkspaceId, data.id)
}

export async function updateEmployee(workspaceId, id, employee) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const serialized = serializeEmployee(employee)

  let { error } = await supabase
    .from('employees')
    .update(serialized)
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select('*')
    .single()

  if (error && isMissingColumnError(error, EMPLOYEE_NEW_POSITION_COLUMNS)) {
    const legacySerialized = stripUnsupportedPositionColumns(serialized)
    const retry = await supabase
      .from('employees')
      .update(legacySerialized)
      .eq('id', id)
      .eq('workspace_id', normalizedWorkspaceId)
      .select('*')
      .single()

    error = retry.error
  }

  if (error) {
    console.error('[staffService] updateEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to update employee right now.')
  }

  try {
    await syncEmployeePositions(normalizedWorkspaceId, id, employee.positions)
  } catch (syncError) {
    console.error('[staffService] updateEmployee syncEmployeePositions error:', syncError)
    throw new Error(syncError.message || 'Employee updated, but positions could not be synchronized.')
  }

  return fetchEmployeeById(normalizedWorkspaceId, id)
}

export async function deleteEmployee(workspaceId, id) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)

  if (error) {
    console.error('[staffService] deleteEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete employee right now.')
  }
}
