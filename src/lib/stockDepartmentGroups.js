/** Visible supply-storage label. Greek line is the venue wording. */
export const SUPPLY_STORAGE_LABEL = 'Supply storage'
export const SUPPLY_STORAGE_LABEL_EL = 'Αποθήκη τροφοδοσίας'

export const UNASSIGNED_STORAGE_GROUP_ID = 'unassigned'

export const DEPARTMENTS_UNAVAILABLE_MESSAGE =
  'Departments are not available yet. Storages still work. Grouping appears after the departments update is applied.'

const DEPARTMENT_NAME_MAX_LENGTH = 80

/**
 * PostgREST / Postgres signals that department columns or the department
 * table are not in the schema yet.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isWorkspaceDepartmentSchemaMissing(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  const mentionsSchema = (
    message.includes('department_id')
    || message.includes('is_supply')
    || message.includes('workspace_departments')
  )
  if (!mentionsSchema) return false
  return code === '42703'
    || code === '42P01'
    || code === 'PGRST204'
    || code === 'PGRST205'
    || message.includes('schema cache')
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('could not find')
}

/**
 * @param {unknown} rawName
 * @returns {{ ok: boolean, value: string, error: string }}
 */
export function validateWorkspaceDepartmentName(rawName) {
  const trimmed = `${rawName ?? ''}`.trim()
  if (!trimmed) {
    return { ok: false, value: '', error: 'Department name is required.' }
  }
  if (trimmed.length > DEPARTMENT_NAME_MAX_LENGTH) {
    return {
      ok: false,
      value: trimmed,
      error: `Department name must be ${DEPARTMENT_NAME_MAX_LENGTH} characters or fewer.`,
    }
  }
  return { ok: true, value: trimmed, error: '' }
}

/**
 * @param {{ sortOrder?: number, name?: string }} left
 * @param {{ sortOrder?: number, name?: string }} right
 */
function compareDepartments(left, right) {
  const leftOrder = Number(left?.sortOrder ?? 0) || 0
  const rightOrder = Number(right?.sortOrder ?? 0) || 0
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  return `${left?.name ?? ''}`.localeCompare(`${right?.name ?? ''}`)
}

/**
 * Group active storages by department. Supply storages are not collapsed
 * and are not required to be unique. Unassigned is department_id null.
 * Archived departments keep their storages. Empty groups are included only
 * when includeEmptyDepartments is set (manager maintenance).
 *
 * @param {{
 *   storages?: unknown,
 *   departments?: unknown,
 *   includeEmptyDepartments?: boolean,
 * }} [input]
 */
export function groupActiveStoragesByDepartment({
  storages = [],
  departments = [],
  includeEmptyDepartments = false,
} = {}) {
  const storageList = Array.isArray(storages) ? storages : []
  const departmentList = Array.isArray(departments) ? departments : []

  /** @type {Map<string, object[]>} */
  const byDepartment = new Map()
  /** @type {object[]} */
  const unassigned = []

  for (const storage of storageList) {
    const departmentId = `${storage?.departmentId ?? storage?.department_id ?? ''}`.trim()
    if (!departmentId) {
      unassigned.push(storage)
      continue
    }
    const bucket = byDepartment.get(departmentId) ?? []
    bucket.push(storage)
    byDepartment.set(departmentId, bucket)
  }

  /** @type {Array<{ id: string, name: string, active: boolean, isUnassigned: boolean, storages: object[] }>} */
  const activeGroups = []
  /** @type {typeof activeGroups} */
  const archivedGroups = []

  const knownIds = new Set()
  const orderedDepartments = departmentList.slice().sort(compareDepartments)

  for (const department of orderedDepartments) {
    const id = `${department?.id ?? ''}`.trim()
    if (!id || knownIds.has(id)) continue
    knownIds.add(id)
    const storagesInGroup = byDepartment.get(id) ?? []
    byDepartment.delete(id)
    const active = department?.active !== false
    if (!includeEmptyDepartments && storagesInGroup.length === 0) continue
    const group = {
      id,
      name: `${department?.name ?? ''}`.trim() || 'Department',
      active,
      isUnassigned: false,
      storages: storagesInGroup,
    }
    if (active) activeGroups.push(group)
    else archivedGroups.push(group)
  }

  const unknownGroups = []
  for (const [id, storagesInGroup] of byDepartment) {
    unknownGroups.push({
      id,
      name: 'Department',
      active: true,
      isUnassigned: false,
      storages: storagesInGroup,
    })
  }
  unknownGroups.sort((left, right) => left.id.localeCompare(right.id))

  /** @type {typeof activeGroups} */
  const groups = [...activeGroups, ...unknownGroups]

  if (unassigned.length > 0 || includeEmptyDepartments) {
    groups.push({
      id: UNASSIGNED_STORAGE_GROUP_ID,
      name: 'Unassigned',
      active: true,
      isUnassigned: true,
      storages: unassigned,
    })
  }

  groups.push(...archivedGroups)
  return groups
}
