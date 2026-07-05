import {
  CUSTOM_DEPARTMENT_TYPE,
  TASK_PRESET_DEPARTMENTS,
  UNASSIGNED_CUSTOM_DEPARTMENT_NAME,
  buildCustomDepartmentBoardKey,
  getCustomDepartmentIcon,
  getTaskDepartmentBoardKey,
  isHiddenTaskDepartmentKey,
  resolveDepartmentBoardDisplay,
} from './taskDepartments'
import { formatLocalDateKey } from './weekUtils'

export function getTodayKey(date = new Date()) {
  return formatLocalDateKey(date)
}

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeTaskStatus(value) {
  const status = `${value ?? ''}`.trim().toLowerCase()
  return status === 'completed' ? 'completed' : 'active'
}

function normalizeDepartmentKey(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

function isCompletedToday(task, todayKey = getTodayKey()) {
  if (normalizeTaskStatus(task?.status) !== 'completed') return false
  const completedAt = task?.completedAt ?? task?.completed_at ?? null
  if (!completedAt) return false
  return normalizeTaskDateKey(completedAt) === todayKey
}

export function isTaskOverdue(task, todayKey = getTodayKey()) {
  if (normalizeTaskStatus(task?.status) !== 'active') return false
  const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
  if (!dueDate) return false
  return dueDate < todayKey
}

export function getTaskDepartmentLabel(task) {
  const departmentKey = normalizeDepartmentKey(task?.department)

  if (departmentKey === CUSTOM_DEPARTMENT_TYPE) {
    const customLabel = `${task?.departmentCustom ?? task?.department_custom ?? ''}`.trim()
    return customLabel || 'Custom'
  }

  const display = resolveDepartmentBoardDisplay(departmentKey)
  return display.label || departmentKey || 'Unknown'
}

export function collectCustomDepartmentNames(tasks = [], templates = []) {
  const names = new Set()

  ;[...(tasks ?? []), ...(templates ?? [])].forEach((item) => {
    if (normalizeDepartmentKey(item?.department) !== CUSTOM_DEPARTMENT_TYPE) return
    const customName = `${item?.departmentCustom ?? item?.department_custom ?? ''}`.trim()
    if (customName) names.add(customName)
  })

  return Array.from(names).sort((left, right) => left.localeCompare(right))
}

export function matchesCustomDepartmentName(item, departmentName) {
  const department = `${item?.department ?? ''}`.trim().toLowerCase()
  if (department !== CUSTOM_DEPARTMENT_TYPE) return false
  const itemName = `${item?.departmentCustom ?? item?.department_custom ?? ''}`.trim()
  return itemName.toLowerCase() === `${departmentName ?? ''}`.trim().toLowerCase()
}

export function taskMatchesDepartmentBoard(task, boardKey) {
  return getTaskDepartmentBoardKey(task) === `${boardKey ?? ''}`.trim()
}

export function buildVisibleDepartmentBoards(
  tasks = [],
  templates = [],
  savedCustomNames = [],
  iconMap = {},
) {
  const boards = []

  TASK_PRESET_DEPARTMENTS.forEach((department) => {
    boards.push({
      boardKey: department.key,
      label: department.label,
      icon: department.icon,
      isCustomBoard: false,
    })
  })

  const customNames = new Set([
    ...collectCustomDepartmentNames(tasks, templates),
    ...(savedCustomNames ?? [])
      .map((name) => `${name ?? ''}`.trim())
      .filter(Boolean)
      .filter((name) => name.toLowerCase() !== UNASSIGNED_CUSTOM_DEPARTMENT_NAME.toLowerCase()),
  ])

  customNames.forEach((name) => {
    boards.push({
      boardKey: buildCustomDepartmentBoardKey(name),
      label: name,
      icon: getCustomDepartmentIcon(name, iconMap),
      isCustomBoard: true,
    })
  })

  return boards
}

function compareTasksByDueDate(a, b) {
  const dueA = normalizeTaskDateKey(a?.dueDate ?? a?.due_date)
  const dueB = normalizeTaskDateKey(b?.dueDate ?? b?.due_date)
  if (dueA !== dueB) return dueA.localeCompare(dueB)

  const priorityOrder = { urgent: 0, important: 1, normal: 2 }
  const priorityA = priorityOrder[`${a?.priority ?? ''}`.trim().toLowerCase()] ?? 3
  const priorityB = priorityOrder[`${b?.priority ?? ''}`.trim().toLowerCase()] ?? 3
  if (priorityA !== priorityB) return priorityA - priorityB

  return `${a?.title ?? ''}`.localeCompare(`${b?.title ?? ''}`)
}

function compareCompletedTasks(a, b) {
  const completedA = `${a?.completedAt ?? a?.completed_at ?? ''}`
  const completedB = `${b?.completedAt ?? b?.completed_at ?? ''}`
  if (completedA !== completedB) return completedB.localeCompare(completedA)
  return compareTasksByDueDate(a, b)
}

export function groupTasksBySection(tasks = [], todayKey = getTodayKey()) {
  const today = []
  const upcoming = []
  const completed = []

  ;(tasks ?? []).forEach((task) => {
    const status = normalizeTaskStatus(task?.status)
    const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)

    if (status === 'completed') {
      completed.push(task)
      return
    }

    if (!dueDate || dueDate <= todayKey) {
      today.push(task)
      return
    }

    upcoming.push(task)
  })

  today.sort(compareTasksByDueDate)
  upcoming.sort(compareTasksByDueDate)
  completed.sort(compareCompletedTasks)

  return { today, upcoming, completed }
}

export function calculateDepartmentStats(tasks = [], boardKey, todayKey = getTodayKey()) {
  const departmentTasks = (tasks ?? []).filter((task) => taskMatchesDepartmentBoard(task, boardKey))

  const activeTasks = departmentTasks.filter((task) => normalizeTaskStatus(task?.status) === 'active')
  const overdue = activeTasks.filter((task) => isTaskOverdue(task, todayKey)).length
  const completedToday = departmentTasks.filter((task) => isCompletedToday(task, todayKey)).length

  const todayWorkload = departmentTasks.filter((task) => {
    const status = normalizeTaskStatus(task?.status)
    const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)

    if (status === 'completed') {
      return isCompletedToday(task, todayKey)
    }

    return Boolean(dueDate) && dueDate <= todayKey
  })

  const completedInTodayWorkload = todayWorkload.filter((task) => isCompletedToday(task, todayKey)).length
  const completionPercent = todayWorkload.length > 0
    ? Math.round((completedInTodayWorkload / todayWorkload.length) * 100)
    : 0

  return {
    active: activeTasks.length,
    overdue,
    completedToday,
    totalToday: todayWorkload.length,
    completionPercent,
  }
}

export function groupTaskTemplatesByDepartment(templates = []) {
  const grouped = new Map()

  ;(templates ?? []).forEach((template) => {
    const boardKey = getTaskDepartmentBoardKey(template)
    if (!grouped.has(boardKey)) {
      grouped.set(boardKey, [])
    }
    grouped.get(boardKey).push(template)
  })

  grouped.forEach((departmentTemplates) => {
    departmentTemplates.sort((a, b) => `${a?.title ?? ''}`.localeCompare(`${b?.title ?? ''}`))
  })

  return grouped
}

export function calculateTaskOverview(tasks = [], todayKey = getTodayKey()) {
  const allTasks = tasks ?? []
  const activeTasks = allTasks.filter((task) => normalizeTaskStatus(task?.status) === 'active')
  const active = activeTasks.length
  const overdue = activeTasks.filter((task) => isTaskOverdue(task, todayKey)).length
  const completedToday = allTasks.filter((task) => isCompletedToday(task, todayKey)).length

  const todayWorkload = allTasks.filter((task) => {
    const status = normalizeTaskStatus(task?.status)
    const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)

    if (status === 'completed') {
      return isCompletedToday(task, todayKey)
    }

    return Boolean(dueDate) && dueDate <= todayKey
  })

  const completedInTodayWorkload = todayWorkload.filter((task) => isCompletedToday(task, todayKey)).length
  const completionPercent = todayWorkload.length > 0
    ? Math.round((completedInTodayWorkload / todayWorkload.length) * 100)
    : 0

  let statusMessage = ''
  if (overdue > 0) {
    statusMessage = 'Needs attention'
  } else if (active === 0 && overdue === 0) {
    statusMessage = 'Operations clear'
  }

  const showEmptyToday = active === 0 && overdue === 0 && completedToday === 0

  return {
    active,
    overdue,
    completedToday,
    completionPercent,
    statusMessage,
    showEmptyToday,
  }
}

function normalizePersonName(value) {
  return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function resolveCurrentEmployeeId(managerName, employees = []) {
  const normalizedManagerName = normalizePersonName(managerName)
  if (!normalizedManagerName) return null

  const employeeList = employees ?? []

  const exactMatch = employeeList.find((employee) => (
    normalizePersonName(employee.full_name ?? employee.name) === normalizedManagerName
  ))
  if (exactMatch?.id) return exactMatch.id

  const partialMatches = employeeList.filter((employee) => {
    const employeeName = normalizePersonName(employee.full_name ?? employee.name)
    if (!employeeName) return false
    return employeeName.includes(normalizedManagerName)
      || normalizedManagerName.includes(employeeName)
  })

  if (partialMatches.length === 1) {
    return partialMatches[0].id
  }

  const managerFirstName = normalizedManagerName.split(' ')[0]
  if (!managerFirstName) return null

  const firstNameMatches = employeeList.filter((employee) => {
    const employeeFirstName = normalizePersonName(employee.full_name ?? employee.name).split(' ')[0]
    return employeeFirstName === managerFirstName
  })

  return firstNameMatches.length === 1 ? firstNameMatches[0].id : null
}

export function filterTasksByAssignment(tasks = [], { mode = 'all', currentEmployeeId = null } = {}) {
  if (mode !== 'mine') {
    return tasks ?? []
  }

  if (!currentEmployeeId) {
    return []
  }

  const employeeId = String(currentEmployeeId)
  return (tasks ?? []).filter((task) => String(task?.assignedEmployeeId ?? '') === employeeId)
}

export function buildTaskAlerts(tasks = [], todayKey = getTodayKey()) {
  const overdue = []
  const urgent = []
  const dueToday = []

  ;(tasks ?? []).forEach((task) => {
    if (normalizeTaskStatus(task?.status) !== 'active') return

    const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
    const priority = `${task?.priority ?? ''}`.trim().toLowerCase()

    if (isTaskOverdue(task, todayKey)) {
      overdue.push(task)
    }

    if (priority === 'urgent') {
      urgent.push(task)
    }

    if (dueDate === todayKey) {
      dueToday.push(task)
    }
  })

  overdue.sort(compareTasksByDueDate)
  urgent.sort(compareTasksByDueDate)
  dueToday.sort(compareTasksByDueDate)

  const hasAlerts = overdue.length > 0 || urgent.length > 0 || dueToday.length > 0

  return {
    overdue,
    urgent,
    dueToday,
    hasAlerts,
  }
}

export function calculateDepartmentPerformanceSummaries(
  tasks = [],
  todayKey = getTodayKey(),
  iconMap = {},
) {
  const boardKeys = new Set(
    (tasks ?? []).map((task) => getTaskDepartmentBoardKey(task)),
  )

  return Array.from(boardKeys)
    .filter((boardKey) => !isHiddenTaskDepartmentKey(boardKey))
    .map((boardKey) => {
      const display = resolveDepartmentBoardDisplay(boardKey, iconMap)
      const stats = calculateDepartmentStats(tasks, boardKey, todayKey)

      return {
        departmentKey: boardKey,
        departmentLabel: display.label,
        departmentIcon: display.icon,
        totalToday: stats.totalToday,
        completedToday: stats.completedToday,
        completionPercent: stats.completionPercent,
      }
    })
    .filter((summary) => summary.totalToday > 0)
    .sort((left, right) => left.departmentLabel.localeCompare(right.departmentLabel))
}
