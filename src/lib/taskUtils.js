import { getTaskDepartmentByKey } from './taskDepartments'
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
  const preset = getTaskDepartmentByKey(departmentKey)

  if (departmentKey === 'custom') {
    const customLabel = `${task?.departmentCustom ?? task?.department_custom ?? ''}`.trim()
    return customLabel || preset?.label || 'Custom'
  }

  return preset?.label || departmentKey || 'Unknown'
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

export function calculateDepartmentStats(tasks = [], departmentKey, todayKey = getTodayKey()) {
  const normalizedDepartmentKey = normalizeDepartmentKey(departmentKey)
  const departmentTasks = (tasks ?? []).filter((task) => (
    normalizeDepartmentKey(task?.department) === normalizedDepartmentKey
  ))

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
    completionPercent,
  }
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
