import { supabase } from '../lib/supabaseClient'
import {
  BUYING_STORAGE_UNAVAILABLE_MESSAGE,
  DEPARTMENTS_UNAVAILABLE_MESSAGE,
  isBuyingStorageColumnMissing,
  isWorkspaceDepartmentSchemaMissing,
  validateWorkspaceDepartmentName,
} from '../lib/stockDepartmentGroups'

const DEPARTMENTS_TABLE = 'workspace_departments'
const STORAGES_TABLE = 'workspace_storages'

const DEPARTMENT_COLUMNS = 'id, workspace_id, name, active, sort_order'

/**
 * @param {Record<string, unknown>|null|undefined} record
 */
export function mapWorkspaceDepartment(record) {
  const id = `${record?.id ?? ''}`.trim()
  return {
    id,
    workspaceId: `${record?.workspace_id ?? record?.workspaceId ?? ''}`.trim(),
    name: `${record?.name ?? ''}`.trim(),
    active: record?.active !== false,
    sortOrder: Number(record?.sort_order ?? record?.sortOrder ?? 0) || 0,
  }
}

function requireWorkspaceId(workspaceId) {
  const normalized = `${workspaceId ?? ''}`.trim()
  if (!normalized) throw new Error('Workspace is required.')
  return normalized
}

function requireDepartmentId(departmentId) {
  const normalized = `${departmentId ?? ''}`.trim()
  if (!normalized) throw new Error('Department is required.')
  return normalized
}

function requireStorageId(storageId) {
  const normalized = `${storageId ?? ''}`.trim()
  if (!normalized) throw new Error('Storage is required.')
  return normalized
}

function mapDepartmentWriteError(error, fallbackMessage) {
  if (isBuyingStorageColumnMissing(error)) {
    return new Error(BUYING_STORAGE_UNAVAILABLE_MESSAGE)
  }
  if (isWorkspaceDepartmentSchemaMissing(error)) {
    return new Error(DEPARTMENTS_UNAVAILABLE_MESSAGE)
  }
  const message = `${error?.message ?? ''}`
  const lower = message.toLowerCase()
  const code = `${error?.code ?? ''}`
  if (
    code === '23505'
    || lower.includes('duplicate')
    || lower.includes('workspace_departments_workspace_name')
  ) {
    return new Error('A department with this name already exists in this workspace.')
  }
  if (lower.includes('workspace_storage_department_workspace_mismatch')) {
    return new Error('That department belongs to a different venue.')
  }
  if (lower.includes('workspace_departments_workspace_id_immutable')) {
    return new Error('A department cannot move to another venue.')
  }
  return new Error(message || fallbackMessage)
}

/**
 * @param {string} workspaceId
 * @returns {Promise<{ available: boolean, departments: ReturnType<typeof mapWorkspaceDepartment>[] }>}
 */
export async function listWorkspaceDepartments(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const { data, error } = await supabase
    .from(DEPARTMENTS_TABLE)
    .select(DEPARTMENT_COLUMNS)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    if (isWorkspaceDepartmentSchemaMissing(error)) {
      return { available: false, departments: [] }
    }
    console.error('[workspaceDepartmentService] listWorkspaceDepartments error:', error)
    throw new Error(error.message || 'Unable to load departments right now.')
  }

  return {
    available: true,
    departments: (data ?? []).map(mapWorkspaceDepartment).filter((department) => department.id),
  }
}

/**
 * @param {string} workspaceId
 * @param {string} name
 */
export async function createWorkspaceDepartment(workspaceId, name) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const validation = validateWorkspaceDepartmentName(name)
  if (!validation.ok) throw new Error(validation.error)

  const { data, error } = await supabase
    .from(DEPARTMENTS_TABLE)
    .insert({
      workspace_id: normalizedWorkspaceId,
      name: validation.value,
      active: true,
    })
    .select(DEPARTMENT_COLUMNS)
    .single()

  if (error) {
    console.error('[workspaceDepartmentService] createWorkspaceDepartment error:', error)
    throw mapDepartmentWriteError(error, 'Unable to create the department right now.')
  }

  return mapWorkspaceDepartment(data)
}

/**
 * @param {string} workspaceId
 * @param {string} departmentId
 * @param {string} name
 */
export async function renameWorkspaceDepartment(workspaceId, departmentId, name) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedDepartmentId = requireDepartmentId(departmentId)
  const validation = validateWorkspaceDepartmentName(name)
  if (!validation.ok) throw new Error(validation.error)

  const { data, error } = await supabase
    .from(DEPARTMENTS_TABLE)
    .update({ name: validation.value })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedDepartmentId)
    .select(DEPARTMENT_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[workspaceDepartmentService] renameWorkspaceDepartment error:', error)
    throw mapDepartmentWriteError(error, 'Unable to rename the department right now.')
  }
  if (!data) throw new Error('Department was not found in this workspace.')
  return mapWorkspaceDepartment(data)
}

/**
 * Archive (active false) or restore (active true). Does not delete.
 *
 * @param {string} workspaceId
 * @param {string} departmentId
 * @param {boolean} active
 */
export async function setWorkspaceDepartmentActive(workspaceId, departmentId, active) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedDepartmentId = requireDepartmentId(departmentId)

  const { data, error } = await supabase
    .from(DEPARTMENTS_TABLE)
    .update({ active: active === true })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedDepartmentId)
    .select(DEPARTMENT_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[workspaceDepartmentService] setWorkspaceDepartmentActive error:', error)
    throw mapDepartmentWriteError(error, 'Unable to update the department right now.')
  }
  if (!data) throw new Error('Department was not found in this workspace.')
  return mapWorkspaceDepartment(data)
}

/**
 * Assign a storage to a department, or pass null / '' for Unassigned.
 * Does not change location_key.
 *
 * @param {string} workspaceId
 * @param {string} storageId
 * @param {string|null} departmentId
 */
export async function assignWorkspaceStorageDepartment(workspaceId, storageId, departmentId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedStorageId = requireStorageId(storageId)
  const normalizedDepartmentId = `${departmentId ?? ''}`.trim() || null

  const { data, error } = await supabase
    .from(STORAGES_TABLE)
    .update({ department_id: normalizedDepartmentId })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedStorageId)
    .select('id, department_id')
    .maybeSingle()

  if (error) {
    console.error('[workspaceDepartmentService] assignWorkspaceStorageDepartment error:', error)
    throw mapDepartmentWriteError(error, 'Unable to assign the storage right now.')
  }
  if (!data) throw new Error('Storage was not found in this workspace.')
  return {
    id: data.id,
    departmentId: data.department_id ?? null,
  }
}

/**
 * Mark or clear the supply-storage flag. Many storages in one venue may be supply.
 * Does not change location_key.
 *
 * @param {string} workspaceId
 * @param {string} storageId
 * @param {boolean} isSupply
 */
export async function setWorkspaceStorageSupply(workspaceId, storageId, isSupply) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedStorageId = requireStorageId(storageId)

  const { data, error } = await supabase
    .from(STORAGES_TABLE)
    .update({ is_supply: isSupply === true })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedStorageId)
    .select('id, is_supply')
    .maybeSingle()

  if (error) {
    console.error('[workspaceDepartmentService] setWorkspaceStorageSupply error:', error)
    throw mapDepartmentWriteError(error, 'Unable to update the supply storage right now.')
  }
  if (!data) throw new Error('Storage was not found in this workspace.')
  return {
    id: data.id,
    isSupply: data.is_supply === true,
  }
}

/**
 * Mark or clear the buying-storage flag. Safe to call only after
 * workspace_storage_buying.sql is applied. A missing column raises a
 * message and does not change is_supply.
 *
 * @param {string} workspaceId
 * @param {string} storageId
 * @param {boolean} isBuying
 */
export async function setWorkspaceStorageBuying(workspaceId, storageId, isBuying) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedStorageId = requireStorageId(storageId)

  const { data, error } = await supabase
    .from(STORAGES_TABLE)
    .update({ is_buying: isBuying === true })
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedStorageId)
    .select('id, is_buying')
    .maybeSingle()

  if (error) {
    console.error('[workspaceDepartmentService] setWorkspaceStorageBuying error:', error)
    throw mapDepartmentWriteError(error, 'Unable to update the buying storage right now.')
  }
  if (!data) throw new Error('Storage was not found in this workspace.')
  return {
    id: data.id,
    isBuying: data.is_buying === true,
  }
}
