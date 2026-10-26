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

function checklistTemplateName(templateId, checklistTemplates = []) {
  const match = (checklistTemplates ?? []).find((template) => (
    `${template?.id ?? ''}` === `${templateId ?? ''}`
  ))
  const name = `${match?.name ?? ''}`.trim()
  return name || 'Checklist'
}

function checklistRunKey(task) {
  const templateId = `${task?.checklistTemplateId ?? ''}`.trim()
  if (!templateId) return ''
  return `${templateId}:${taskDueDate(task) || 'undated'}`
}

/**
 * One checklist occurrence (BAR OPENING on a date) is one task.
 * The underlying step rows stay on the task as checklistSteps.
 */
export function collapseChecklistRuns(tasks = [], checklistTemplates = []) {
  const groups = new Map()
  const rest = []

  ;(tasks ?? []).forEach((task) => {
    if (task?.checklistRun) {
      if (taskStatus(task) === 'skipped') return
      rest.push(task)
      return
    }
    const key = checklistRunKey(task)
    if (!key) {
      if (taskStatus(task) === 'skipped') return
      rest.push(task)
      return
    }
    const bucket = groups.get(key) ?? []
    bucket.push(task)
    groups.set(key, bucket)
  })

  const runs = []
  groups.forEach((steps, key) => {
    const sorted = [...steps].sort((left, right) => {
      const leftIndex = Number(left.checklistOrderIndex ?? left.checklist_order_index ?? 0)
      const rightIndex = Number(right.checklistOrderIndex ?? right.checklist_order_index ?? 0)
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
      return `${left.title ?? ''}`.localeCompare(`${right.title ?? ''}`)
    })
    const openSteps = sorted.filter((step) => isSharedOpenTask(step))
    const completedSteps = sorted.filter((step) => taskStatus(step) === 'completed')
    if (openSteps.length === 0 && completedSteps.length === 0) return

    const templateId = `${sorted[0].checklistTemplateId ?? ''}`.trim()
    const dueDate = taskDueDate(sorted[0])
    const completedAt = completedSteps
      .map((step) => `${step.completedAt ?? step.completed_at ?? ''}`.trim())
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
    const dueTimes = sorted
      .map((step) => `${step.dueTime ?? step.due_time ?? ''}`.trim())
      .filter(Boolean)
      .sort()

    runs.push({
      id: `checklist-run:${key}`,
      title: checklistTemplateName(templateId, checklistTemplates),
      description: '',
      status: openSteps.length > 0 ? 'pending' : 'completed',
      dueDate,
      dueTime: dueTimes[0] ?? null,
      category: sorted[0].category || 'other',
      priority: sorted[0].priority || 'normal',
      assignedTo: null,
      taskSource: 'operations',
      checklistRun: true,
      checklistTemplateId: templateId,
      checklistSteps: sorted,
      checklistStepCount: sorted.length,
      checklistCompletedCount: completedSteps.length,
      completedAt: openSteps.length > 0 ? null : completedAt,
    })
  })

  return [...rest, ...runs]
}

/**
 * One task set for Today, Operations, and Insights.
 * A checklist run is one task with optional steps, not one task per step.
 */
export function combineOperationalTasks(
  workspaceTasks = [],
  operationsTasks = [],
  todayKey = '',
  announcements = [],
  checklistTemplates = [],
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
    .map((task) => ({
      ...task,
      taskSource: task.taskSource || 'operations',
    }))

  return collapseChecklistRuns([...workspaceRows, ...operationsRows], checklistTemplates)
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
  checklistTemplates = [],
} = {}) {
  const combined = combineOperationalTasks(
    boardTasks,
    operationsTasks,
    todayKey,
    announcements,
    checklistTemplates,
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
