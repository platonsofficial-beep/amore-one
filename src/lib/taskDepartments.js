export const TASK_PRESET_DEPARTMENTS = [
  {
    key: 'service',
    label: 'Service',
    icon: '🍽️',
    description: 'Front-of-house service, hosts, and guest-facing operations.',
  },
  {
    key: 'bar',
    label: 'Bar',
    icon: '🍸',
    description: 'Bar prep, service, and beverage execution.',
  },
  {
    key: 'bar_manager',
    label: 'Bar Manager',
    icon: '🥃',
    description: 'Bar leadership, standards, and shift oversight.',
  },
  {
    key: 'floor_manager',
    label: 'Floor Manager',
    icon: '🧭',
    description: 'Floor flow, section coverage, and service coordination.',
  },
  {
    key: 'fb',
    label: 'F&B',
    icon: '🏢',
    description: 'Food and beverage coordination across service and kitchen.',
  },
  {
    key: 'logistics',
    label: 'Logistics',
    icon: '📦',
    description: 'Deliveries, storage, prep flow, and back-of-house supply.',
  },
]

const LEGACY_TASK_DEPARTMENTS = [
  {
    key: 'customers',
    label: 'Customers',
    icon: '💬',
    description: 'Legacy customer-facing department.',
    hidden: true,
  },
]

export const CUSTOM_DEPARTMENT_TYPE = 'custom'
export const CUSTOM_DEPARTMENT_BOARD_PREFIX = 'custom:'
export const CUSTOM_DEPARTMENT_NEW_OPTION = '__custom_new__'
export const CUSTOM_DEPARTMENT_OPTION_PREFIX = 'custom::'
export const CUSTOM_DEPARTMENT_ICON = '✨'
export const UNASSIGNED_CUSTOM_DEPARTMENT_NAME = 'Unassigned Department'
export const TASK_DEPARTMENT_ICONS_STORAGE_KEY = 'taskDepartmentIcons'

export const CUSTOM_DEPARTMENT_EMOJI_PRESETS = [
  { emoji: '🍽️', label: 'Service-style' },
  { emoji: '🍸', label: 'Bar-style' },
  { emoji: '🍳', label: 'Kitchen' },
  { emoji: '🧽', label: 'Cleaning' },
  { emoji: '📦', label: 'Logistics' },
  { emoji: '🚚', label: 'Delivery' },
  { emoji: '🧾', label: 'Admin' },
  { emoji: '👔', label: 'Manager' },
  { emoji: '✨', label: 'Custom' },
]

export function normalizeDepartmentIcon(value, fallback = CUSTOM_DEPARTMENT_ICON) {
  const trimmed = `${value ?? ''}`.trim()
  return trimmed || fallback
}

export function loadCustomDepartmentIcons() {
  try {
    const stored = window.localStorage.getItem(TASK_DEPARTMENT_ICONS_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function persistCustomDepartmentIcons(iconMap) {
  try {
    window.localStorage.setItem(
      TASK_DEPARTMENT_ICONS_STORAGE_KEY,
      JSON.stringify(iconMap ?? {}),
    )
  } catch {
    // Ignore storage failures in private browsing.
  }
}

export function getCustomDepartmentIcon(name, iconMap = {}, fallback = CUSTOM_DEPARTMENT_ICON) {
  const key = `${name ?? ''}`.trim()
  if (!key) return fallback
  return normalizeDepartmentIcon(iconMap[key], fallback)
}

export function isDeletableCustomDepartmentName(name) {
  const trimmed = `${name ?? ''}`.trim()
  if (!trimmed) return false
  return trimmed.toLowerCase() !== UNASSIGNED_CUSTOM_DEPARTMENT_NAME.toLowerCase()
}

const CUSTOM_DEPARTMENT_META = {
  key: CUSTOM_DEPARTMENT_TYPE,
  label: 'Custom',
  icon: CUSTOM_DEPARTMENT_ICON,
  description: 'User-created department board.',
  isCustomType: true,
}

/** @deprecated Use TASK_PRESET_DEPARTMENTS for UI lists. Includes legacy + custom type for lookups. */
export const TASK_DEPARTMENTS = [
  ...TASK_PRESET_DEPARTMENTS,
  ...LEGACY_TASK_DEPARTMENTS,
  CUSTOM_DEPARTMENT_META,
]

const departmentByKey = new Map(TASK_DEPARTMENTS.map((department) => [department.key, department]))

export function isTaskDepartmentKey(value) {
  const key = `${value ?? ''}`.trim().toLowerCase()
  return key === CUSTOM_DEPARTMENT_TYPE || departmentByKey.has(key)
}

export function isHiddenTaskDepartmentKey(value) {
  const key = `${value ?? ''}`.trim().toLowerCase()
  const department = departmentByKey.get(key)
  return Boolean(department?.hidden)
}

export function getTaskDepartmentByKey(value) {
  const key = `${value ?? ''}`.trim().toLowerCase()
  return departmentByKey.get(key) ?? null
}

export function normalizeTaskDepartmentKey(value) {
  const key = `${value ?? ''}`.trim().toLowerCase()
  return isTaskDepartmentKey(key) ? key : null
}

export function buildCustomDepartmentBoardKey(name) {
  const trimmed = `${name ?? ''}`.trim()
  return `${CUSTOM_DEPARTMENT_BOARD_PREFIX}${trimmed}`
}

export function isCustomDepartmentBoardKey(value) {
  return `${value ?? ''}`.startsWith(CUSTOM_DEPARTMENT_BOARD_PREFIX)
}

export function parseDepartmentBoardKey(boardKey) {
  const raw = `${boardKey ?? ''}`.trim()
  if (isCustomDepartmentBoardKey(raw)) {
    return {
      boardKey: raw,
      department: CUSTOM_DEPARTMENT_TYPE,
      departmentCustom: raw.slice(CUSTOM_DEPARTMENT_BOARD_PREFIX.length).trim(),
    }
  }

  return {
    boardKey: raw,
    department: raw,
    departmentCustom: '',
  }
}

export function getTaskDepartmentBoardKey(item) {
  const department = `${item?.department ?? ''}`.trim().toLowerCase()
  if (department === CUSTOM_DEPARTMENT_TYPE) {
    const customName = `${item?.departmentCustom ?? item?.department_custom ?? ''}`.trim()
    return customName ? buildCustomDepartmentBoardKey(customName) : buildCustomDepartmentBoardKey('Custom')
  }

  return department
}

export function resolveDepartmentBoardDisplay(boardKey, iconMap = {}) {
  if (isCustomDepartmentBoardKey(boardKey)) {
    const { departmentCustom } = parseDepartmentBoardKey(boardKey)
    return {
      key: boardKey,
      label: departmentCustom || 'Custom',
      icon: getCustomDepartmentIcon(departmentCustom, iconMap),
      isCustomBoard: true,
    }
  }

  const preset = getTaskDepartmentByKey(boardKey)
  if (preset && !preset.hidden) {
    return {
      key: boardKey,
      label: preset.label,
      icon: preset.icon,
      isCustomBoard: false,
    }
  }

  if (preset?.hidden) {
    return {
      key: boardKey,
      label: preset.label,
      icon: preset.icon,
      isCustomBoard: false,
      isLegacy: true,
    }
  }

  return {
    key: boardKey,
    label: boardKey || 'Department',
    icon: '📋',
    isCustomBoard: false,
  }
}

export function buildCustomDepartmentOptionValue(name) {
  return `${CUSTOM_DEPARTMENT_OPTION_PREFIX}${`${name ?? ''}`.trim()}`
}

export function parseCustomDepartmentOptionValue(value) {
  if (!`${value ?? ''}`.startsWith(CUSTOM_DEPARTMENT_OPTION_PREFIX)) {
    return null
  }

  return `${value}`.slice(CUSTOM_DEPARTMENT_OPTION_PREFIX.length).trim()
}

export function resolveDepartmentFormSelectValue(department, departmentCustom) {
  const normalizedDepartment = `${department ?? ''}`.trim().toLowerCase()
  const customName = `${departmentCustom ?? ''}`.trim()

  if (normalizedDepartment === CUSTOM_DEPARTMENT_TYPE && customName) {
    return buildCustomDepartmentOptionValue(customName)
  }

  if (normalizedDepartment === CUSTOM_DEPARTMENT_TYPE) {
    return CUSTOM_DEPARTMENT_NEW_OPTION
  }

  return normalizedDepartment || 'service'
}
