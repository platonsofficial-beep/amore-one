import { filterTasksExcludingAnnouncementDuplicates } from './operationsAnnouncementUtils'
import { calculateTaskOverview, isTaskOverdue } from './taskUtils'

function taskStatus(task) {
  return `${task?.status ?? ''}`.trim().toLowerCase()
}

function taskDueDate(task) {
  const raw = `${task?.dueDate ?? task?.due_date ?? ''}`.trim()
  if (!raw) return ''
  return raw.includes('T') ? raw.split('T')[0] : raw.slice(0, 10)
}

export function isSharedOpenTask(task) {
  const status = taskStatus(task)
  return status !== 'completed' && status !== 'skipped'
}

export function isSharedTaskOverdue(task, todayKey = '') {
  if (!isSharedOpenTask(task)) return false
  const dueDate = taskDueDate(task)
  const today = `${todayKey ?? ''}`.trim()
  return Boolean(dueDate && today && dueDate < today)
}

/**
 * One task set for Today and Operations.
 * Workspace tasks (the `tasks` table) and operations tasks share open /
 * past-due / completed-today. Checklist rows stay on the checklist panel
 * when they are due today; past-due checklist rows are included because
 * that panel only shows today's run.
 */
export function combineOperationalTasks(
  workspaceTasks = [],
  operationsTasks = [],
  todayKey = '',
  announcements = [],
) {
  const workspaceRows = filterTasksExcludingAnnouncementDuplicates(workspaceTasks, announcements)
    .filter((task) => taskStatus(task) !== 'skipped')
    .map((task) => ({
      ...task,
      taskSource: 'workspace',
      assignedTo: task.assignedTo ?? task.assignedEmployeeId ?? null,
      category: task.category || task.department || 'other',
      description: task.description ?? task.notes ?? '',
    }))

  const operationsRows = filterTasksExcludingAnnouncementDuplicates(operationsTasks, announcements)
    .filter((task) => taskStatus(task) !== 'skipped')
    .filter((task) => !task.checklistTemplateId || isSharedTaskOverdue(task, todayKey))
    .map((task) => ({
      ...task,
      taskSource: task.taskSource || 'operations',
    }))

  return [...workspaceRows, ...operationsRows]
}

export function buildSharedTaskWindow(tasks = [], todayKey = '') {
  const today = `${todayKey ?? ''}`.trim()
  const openTasks = []
  const pastDueTasks = []
  const dueTodayTasks = []
  let completedToday = 0

  ;(tasks ?? []).forEach((task) => {
    const status = taskStatus(task)
    if (status === 'completed') {
      const completedAt = `${task?.completedAt ?? task?.completed_at ?? ''}`.trim()
      const completedKey = completedAt.includes('T') ? completedAt.split('T')[0] : completedAt.slice(0, 10)
      if (today && completedKey === today) completedToday += 1
      return
    }

    if (!isSharedOpenTask(task)) return

    openTasks.push(task)
    const dueDate = taskDueDate(task)
    if (dueDate && today && dueDate < today) pastDueTasks.push(task)
    else if (dueDate && dueDate === today) dueTodayTasks.push(task)
  })

  pastDueTasks.sort((left, right) => taskDueDate(left).localeCompare(taskDueDate(right)))
  const undatedOpenTasks = openTasks.filter((task) => !taskDueDate(task))
  const futureDueTasks = openTasks.filter((task) => {
    const dueDate = taskDueDate(task)
    if (!dueDate) return false
    if (!today) return true
    return dueDate > today
  })

  return {
    openCount: openTasks.length,
    pastDueCount: pastDueTasks.length,
    dueTodayCount: dueTodayTasks.length,
    completedToday,
    listTasks: [...pastDueTasks, ...dueTodayTasks, ...undatedOpenTasks, ...futureDueTasks],
  }
}

/**
 * One open / past-due count for Insights, the Today chip, and Operations.
 * Board and operations rows stay labeled separately, and those two parts
 * add up to openCount.
 */
export function buildUnifiedOperationalTaskCounts({
  boardTasks = [],
  operationsTasks = [],
  todayKey = '',
  announcements = [],
} = {}) {
  const combined = combineOperationalTasks(
    boardTasks,
    operationsTasks,
    todayKey,
    announcements,
  )
  const window = buildSharedTaskWindow(combined, todayKey)
  const openTasks = combined.filter((task) => isSharedOpenTask(task))
  const boardOpenTasks = openTasks.filter((task) => task.taskSource === 'workspace')
  const boardOpen = boardOpenTasks.length
  const boardPastDue = boardOpenTasks.filter((task) => isSharedTaskOverdue(task, todayKey)).length
  const taskOverview = calculateTaskOverview(combined, todayKey)

  return {
    openCount: window.openCount,
    pastDueCount: window.pastDueCount,
    completedToday: window.completedToday,
    completionPercent: taskOverview.completionPercent,
    boardOpen,
    boardPastDue,
    opsOpen: openTasks.length - boardOpen,
    listTasks: window.listTasks,
  }
}

export function sharedWindowMatchesTaskOverview(tasks = [], todayKey = '', overview = {}) {
  const window = buildSharedTaskWindow(tasks, todayKey)
  const overdue = (tasks ?? []).filter((task) => isTaskOverdue(task, todayKey)).length
  return window.openCount === (Number(overview.active) || 0)
    && window.pastDueCount === overdue
    && window.pastDueCount === (Number(overview.overdue) || 0)
}
