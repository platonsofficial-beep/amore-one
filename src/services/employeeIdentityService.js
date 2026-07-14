import { supabase } from '../lib/supabaseClient'
import {
  createIdentityColorRegistry,
  getAvailableIdentityColors,
} from '../lib/identity/employeeIdentityColor'
import { IDENTITY_COLOR_PALETTE, isPaletteColorId } from '../lib/identity/identityColorPalette'

const ASSIGN_IDENTITY_COLOR_RPC = 'assign_employee_identity_color'

function requireWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required for employee identity.')
  }
  return normalizedWorkspaceId
}

function requireEmployeeId(employeeId) {
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()
  if (!normalizedEmployeeId) {
    throw new Error('Employee is required for identity color assignment.')
  }
  return normalizedEmployeeId
}

function isMigrationUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
    || message.includes('could not find the function')
}

function normalizeColorIdForAssignment(colorId) {
  if (colorId === null || colorId === undefined) {
    return null
  }

  const normalized = `${colorId}`.trim()

  if (!normalized) {
    throw new Error(getFriendlyEmployeeIdentityError({ code: 'employee_identity_invalid_color' }))
  }

  if (`${colorId}` !== normalized) {
    throw new Error(getFriendlyEmployeeIdentityError({ code: 'employee_identity_invalid_color' }))
  }

  if (normalized !== normalized.toLowerCase()) {
    throw new Error(getFriendlyEmployeeIdentityError({ code: 'employee_identity_invalid_color' }))
  }

  if (normalized === 'neutral' || !isPaletteColorId(normalized)) {
    throw new Error(getFriendlyEmployeeIdentityError({ code: 'employee_identity_invalid_color' }))
  }

  return normalized
}

function mapAssignmentRow(row) {
  return {
    employeeId: row.id ?? row.employee_id ?? row.employeeId ?? '',
    employeeName: row.full_name ?? row.employeeName ?? '',
    colorId: row.identity_color ?? row.colorId ?? null,
  }
}

function mapAssignmentResult(row) {
  return {
    employeeId: row?.employee_id ?? row?.employeeId ?? '',
    workspaceId: row?.workspace_id ?? row?.workspaceId ?? '',
    identityColor: row?.identity_color ?? row?.identityColor ?? null,
  }
}

function buildRegistryFromAssignments(assignments) {
  const registryInput = {}

  assignments.forEach((assignment) => {
    const employeeId = `${assignment.employeeId ?? ''}`.trim()
    const colorId = `${assignment.colorId ?? ''}`.trim()
    if (!employeeId || !colorId) return
    registryInput[colorId] = employeeId
  })

  return createIdentityColorRegistry(registryInput)
}

export function getFriendlyEmployeeIdentityError(error) {
  const code = `${error?.code ?? ''}`.trim()
  const message = `${error?.message ?? ''}`.trim()

  if (code === '23505' || message.includes('employee_identity_color_taken')) {
    return 'This color is already being used by another employee.'
  }

  if (code === 'employee_identity_invalid_color' || message.includes('employee_identity_invalid_color')) {
    return 'This color is not available in the ONE identity palette.'
  }

  if (code === 'employee_identity_forbidden' || message.includes('employee_identity_forbidden')) {
    return 'You do not have permission to change this employee\'s identity color.'
  }

  if (code === 'employee_identity_employee_not_found' || message.includes('employee_identity_employee_not_found')) {
    return 'This employee could not be found in the current workspace.'
  }

  if (isMigrationUnavailableError(error)) {
    return 'Employee identity is not ready yet. Apply the required database migration.'
  }

  return 'Unable to update the employee color. Please try again.'
}

export async function getWorkspaceIdentityColorAssignments(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, identity_color')
    .eq('workspace_id', normalizedWorkspaceId)
    .not('identity_color', 'is', null)
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[employeeIdentityService] getWorkspaceIdentityColorAssignments error:', error)

    if (isMigrationUnavailableError(error)) {
      throw new Error(getFriendlyEmployeeIdentityError(error))
    }

    throw new Error(error.message || 'Unable to load identity color assignments right now.')
  }

  return (data ?? []).map(mapAssignmentRow)
}

export async function getAvailableIdentityColorsForWorkspace({
  workspaceId,
  exceptEmployeeId = null,
} = {}) {
  const assignments = await getWorkspaceIdentityColorAssignments(workspaceId)
  const registry = buildRegistryFromAssignments(assignments)
  const availableColors = [...getAvailableIdentityColors(registry, { exceptEmployeeId })]

  return {
    assignments,
    availableColors,
  }
}

export async function assignEmployeeIdentityColor({
  workspaceId,
  employeeId,
  colorId,
}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedEmployeeId = requireEmployeeId(employeeId)
  const normalizedColorId = normalizeColorIdForAssignment(colorId)

  const { data, error } = await supabase.rpc(ASSIGN_IDENTITY_COLOR_RPC, {
    p_workspace_id: normalizedWorkspaceId,
    p_employee_id: normalizedEmployeeId,
    p_color_id: normalizedColorId,
  })

  if (error) {
    console.error('[employeeIdentityService] assignEmployeeIdentityColor error:', error)
    throw new Error(getFriendlyEmployeeIdentityError(error))
  }

  const row = Array.isArray(data) ? data[0] : data
  const mapped = mapAssignmentResult(row)

  if (!mapped.employeeId || !mapped.workspaceId) {
    throw new Error(getFriendlyEmployeeIdentityError(new Error('Unknown assignment response.')))
  }

  return mapped
}

export const EMPLOYEE_IDENTITY_ASSIGNMENT_RPC = ASSIGN_IDENTITY_COLOR_RPC
export const EMPLOYEE_IDENTITY_PALETTE_SIZE = IDENTITY_COLOR_PALETTE.length
