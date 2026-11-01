import { isPaletteColorId } from '../lib/identity/identityColorPalette'
import { formatProfileSaveError } from '../lib/profileSaveError'
import { supabase } from '../lib/supabaseClient'
import { EMPLOYEE_PUBLIC_COLUMNS } from './employeeReadColumns'
import { ensurePositionByName, getPositions } from './positionsService'

const EMPLOYEE_POSITIONS_TABLE = 'employee_positions'
const EMPLOYEE_SELECT = `
  ${EMPLOYEE_PUBLIC_COLUMNS},
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
    active: record.active !== false,
    department: record.department ?? effectivePositions[0]?.department ?? 'Service',
    identityColor: record.identity_color ?? null,
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

  const payload = {
    full_name: employee.name ?? employee.fullName ?? '',
    position: [primaryPosition, ...additionalPositions].filter(Boolean).join(', '),
    primary_position: primaryPosition,
    additional_positions: additionalPositions,
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    hire_date: employee.hireDate ?? employee.hire_date ?? '',
    emergency_contact: employee.emergencyContact ?? employee.emergency_contact ?? '',
    weekly_hours: normalizeNumericValue(employee.weeklyHours ?? employee.weekly_hours),
    notes: employee.notes ?? '',
    shift: employee.shift ?? 'Evening',
    status: employee.status ?? 'Working',
    department: employee.department ?? 'Service',
  }

  if (employee.salary !== undefined) {
    payload.salary = normalizeNumericValue(employee.salary)
  }

  if (Object.prototype.hasOwnProperty.call(employee, 'identityColor')) {
    const identityColor = employee.identityColor

    if (identityColor === null || identityColor === undefined || identityColor === '') {
      payload.identity_color = null
    } else if (isPaletteColorId(identityColor)) {
      payload.identity_color = `${identityColor}`.trim()
    } else {
      throw new Error('Invalid employee identity color.')
    }
  }

  return payload
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

async function hydratePrivateEmployeeFields(workspaceId, rows) {
  if (rows.length === 0) return []
  const { data, error } = await supabase.rpc('get_employee_private_fields', {
    p_workspace_id: workspaceId,
    p_employee_ids: rows.map((row) => row.id),
  })
  if (error) {
    throw new Error(error.message || 'Unable to load employee details. Apply the employee access hardening migration.')
  }
  const privateById = new Map((data ?? []).map((row) => [row.id, row]))
  return rows.map((row) => mapEmployee({
    ...row,
    // Never fall back to sensitive values from an older unrestricted response.
    salary: privateById.get(row.id)?.salary ?? null,
    emergency_contact: privateById.get(row.id)?.emergency_contact ?? '',
    notes: privateById.get(row.id)?.notes ?? '',
  }))
}

async function resolvePositionsForSync(workspaceId, positions = []) {
  const incoming = (positions ?? []).filter((position) => `${position?.name ?? ''}`.trim())
  const allHaveIds = incoming.length > 0 && incoming.every((position) => Number.isFinite(Number(position?.id)))
  if (allHaveIds) {
    const resolved = []
    const seenIds = new Set()
    incoming.forEach((position) => {
      const positionId = Number(position.id)
      if (!Number.isFinite(positionId) || seenIds.has(positionId)) return
      seenIds.add(positionId)
      resolved.push({
        id: positionId,
        name: `${position.name}`.trim(),
        department: position.department ?? 'Other',
      })
    })
    return resolved
  }

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
    return hydratePrivateEmployeeFields(normalizedWorkspaceId, primary.data ?? [])
  }

  console.warn('[staffService] getEmployees joined select failed, falling back to basic select:', primary.error)

  const fallback = await supabase
    .from('employees')
    .select(EMPLOYEE_PUBLIC_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('full_name', { ascending: true })

  if (!fallback.error) {
    return hydratePrivateEmployeeFields(normalizedWorkspaceId, fallback.data ?? [])
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
    .select(EMPLOYEE_PUBLIC_COLUMNS)
    .single()

  if (error && isMissingColumnError(error, EMPLOYEE_NEW_POSITION_COLUMNS)) {
    const legacySerialized = stripUnsupportedPositionColumns(serialized)
    const retry = await supabase
      .from('employees')
      .insert([legacySerialized])
      .select(EMPLOYEE_PUBLIC_COLUMNS)
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

  return { id: data.id }
}

export async function updateEmployee(workspaceId, id, employee) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const serialized = serializeEmployee(employee)

  let { data, error } = await supabase
    .from('employees')
    .update(serialized)
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select(EMPLOYEE_PUBLIC_COLUMNS)
    .single()

  if (error && isMissingColumnError(error, EMPLOYEE_NEW_POSITION_COLUMNS)) {
    const legacySerialized = stripUnsupportedPositionColumns(serialized)
    const retry = await supabase
      .from('employees')
      .update(legacySerialized)
      .eq('id', id)
      .eq('workspace_id', normalizedWorkspaceId)
      .select(EMPLOYEE_PUBLIC_COLUMNS)
      .single()

    data = retry.data
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

  return { id: data?.id ?? id }
}

export async function updateLinkedEmployeePhone(workspaceId, employeeId, phone) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()
  const normalizedPhone = `${phone ?? ''}`.trim()

  if (!normalizedEmployeeId) {
    throw new Error('Linked employee is required to update phone.')
  }

  const { data, error } = await supabase
    .from('employees')
    .update({ phone: normalizedPhone })
    .eq('id', normalizedEmployeeId)
    .eq('workspace_id', normalizedWorkspaceId)
    .select(EMPLOYEE_PUBLIC_COLUMNS)
    .single()

  if (error) {
    console.error('[staffService] updateLinkedEmployeePhone error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(formatProfileSaveError(error, 'Unable to update phone right now.'))
  }

  return mapEmployee(data)
}

export const EMPLOYEE_DISABLED_STATUS = 'Disabled'

export function isEmployeeDisabled(employee) {
  if (!employee) return false
  return employee.active === false
    || `${employee.status ?? ''}`.trim().toLowerCase() === EMPLOYEE_DISABLED_STATUS.toLowerCase()
}

function isMissingRpcError(error) {
  const code = `${error?.code ?? ''}`
  return code === 'PGRST202' || code === '42883'
}

// Plain-language message for a failed delete. Before this, the error only
// went to the console and to a notice hidden behind the confirm dialog.
export function formatEmployeeDeleteError(error) {
  const code = `${error?.code ?? ''}`
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`
  if (code === '23503' || /foreign key/i.test(text)) {
    if (/leave_requests/i.test(text)) {
      return 'This person still has leave requests, so they cannot be deleted yet. Use Disable for now — full delete needs the database update.'
    }
    return 'This person is still linked to other records, so they cannot be deleted yet. Use Disable for now.'
  }
  if (code === '42501' || /permission|row-level security/i.test(text)) {
    return 'You do not have permission to delete team members.'
  }
  if (/owner/i.test(text)) return 'The venue owner cannot be deleted.'
  return error?.message || 'Unable to delete employee right now.'
}

export async function deleteEmployee(workspaceId, id) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  // Preferred: one server call that removes the employee, closes their venue
  // access and anonymises the membership while keeping hours history.
  const rpc = await supabase.rpc('remove_employee_from_venue', { p_employee_id: id })
  if (!rpc.error) return rpc.data ?? { removed: true }
  if (!isMissingRpcError(rpc.error)) {
    console.error('[staffService] remove_employee_from_venue error:', rpc.error)
    throw new Error(formatEmployeeDeleteError(rpc.error))
  }

  // Fallback until the database update is applied: plain row delete.
  const { data, error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select('id')

  if (error) {
    console.error('[staffService] deleteEmployee error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Employees table is not ready yet.')
    }

    throw new Error(formatEmployeeDeleteError(error))
  }

  if (Array.isArray(data) && data.length === 0) {
    // RLS hides a denied delete as "0 rows"; never report that as success.
    throw new Error('Nothing was deleted. You may not have permission to delete this person.')
  }
  return { removed: true }
}

export async function setEmployeeEnabled(workspaceId, id, enabled) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const rpc = await supabase.rpc('set_employee_access', { p_employee_id: id, p_enabled: Boolean(enabled) })
  if (!rpc.error) return rpc.data ?? { enabled: Boolean(enabled) }
  if (!isMissingRpcError(rpc.error)) {
    console.error('[staffService] set_employee_access error:', rpc.error)
    throw new Error(rpc.error.message || 'Unable to change access right now.')
  }

  // Fallback until the database update is applied: mark the employee only.
  // The app hides them and blocks their screens, but the server does not
  // yet refuse their login.
  const { data, error } = await supabase
    .from('employees')
    .update({ active: Boolean(enabled), status: enabled ? 'Working' : EMPLOYEE_DISABLED_STATUS })
    .eq('id', id)
    .eq('workspace_id', normalizedWorkspaceId)
    .select('id')

  if (error) {
    console.error('[staffService] setEmployeeEnabled error:', error)
    throw new Error(error.message || 'Unable to change access right now.')
  }
  if (Array.isArray(data) && data.length === 0) {
    throw new Error('Nothing changed. You may not have permission to manage this person.')
  }
  return { enabled: Boolean(enabled), serverEnforced: false }
}
