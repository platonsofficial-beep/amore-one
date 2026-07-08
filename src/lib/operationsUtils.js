import {
  formatTime24,
  formatTimestampDayAndTime24,
  formatTimestampTime24,
} from './timeFormatUtils'

export const OPERATIONS_CATEGORIES = [
  'opening',
  'closing',
  'cleaning',
  'maintenance',
  'service',
  'bar',
  'kitchen',
  'other',
]

export const OPERATIONS_PRIORITIES = ['low', 'normal', 'high', 'urgent']
export const OPERATIONS_STATUSES = ['pending', 'completed', 'skipped']
export const OPERATIONS_LOG_TYPES = ['handover', 'incident', 'note']

const CATEGORY_LABELS = {
  opening: 'Opening',
  closing: 'Closing',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  service: 'Service',
  bar: 'Bar',
  kitchen: 'Kitchen',
  other: 'Other',
}

const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

const STATUS_LABELS = {
  pending: 'Pending',
  completed: 'Completed',
  skipped: 'Skipped',
}

const LOG_TYPE_LABELS = {
  handover: 'Handover',
  incident: 'Issue',
  note: 'Note',
}

const LOG_TYPE_BADGE_LABELS = {
  handover: 'HANDOVER',
  incident: 'ISSUE',
  note: 'NOTE',
}

const LOG_TYPE_ICONS = {
  handover: '🔁',
  incident: '⚠️',
  note: '📝',
}

const PRIORITY_TONES = {
  low: 'muted',
  normal: 'default',
  high: 'warning',
  urgent: 'danger',
}

const LOG_TYPE_TONES = {
  handover: 'info',
  incident: 'danger',
  note: 'gold',
}

export function normalizeOperationsCategory(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return OPERATIONS_CATEGORIES.includes(normalized) ? normalized : 'other'
}

export function normalizeOperationsPriority(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return OPERATIONS_PRIORITIES.includes(normalized) ? normalized : 'normal'
}

export function normalizeOperationsStatus(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return OPERATIONS_STATUSES.includes(normalized) ? normalized : 'pending'
}

export function normalizeOperationsLogType(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return OPERATIONS_LOG_TYPES.includes(normalized) ? normalized : 'note'
}

export function normalizeOperationsTaskDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function getOperationsCategoryLabel(category) {
  return CATEGORY_LABELS[normalizeOperationsCategory(category)] ?? 'Other'
}

export function getOperationsPriorityLabel(priority) {
  return PRIORITY_LABELS[normalizeOperationsPriority(priority)] ?? 'Normal'
}

export function getOperationsStatusLabel(status) {
  return STATUS_LABELS[normalizeOperationsStatus(status)] ?? 'Pending'
}

export function getOperationsLogTypeLabel(type) {
  return LOG_TYPE_LABELS[normalizeOperationsLogType(type)] ?? 'Note'
}

export function getOperationsLogTypeBadgeLabel(type) {
  return LOG_TYPE_BADGE_LABELS[normalizeOperationsLogType(type)] ?? 'NOTE'
}

export function getOperationsLogTypeIcon(type) {
  return LOG_TYPE_ICONS[normalizeOperationsLogType(type)] ?? '📝'
}

export function formatOperationsLogCardTime(value) {
  return formatTimestampTime24(value)
}

export function getOperationsShiftNoteHeadline(log) {
  const title = `${log?.title ?? ''}`.trim()
  const message = `${log?.message ?? ''}`.trim()
  if (title) return title
  return message
}

export function getOperationsShiftNoteDetail(log) {
  const title = `${log?.title ?? ''}`.trim()
  const message = `${log?.message ?? ''}`.trim()
  if (!message || message === title) return ''
  return message
}

export function getOperationsPriorityTone(priority) {
  return PRIORITY_TONES[normalizeOperationsPriority(priority)] ?? 'default'
}

export function getOperationsLogTypeTone(type) {
  return LOG_TYPE_TONES[normalizeOperationsLogType(type)] ?? 'default'
}

export function buildEmptyOperationsTaskForm(todayKey = '') {
  return {
    title: '',
    description: '',
    category: 'other',
    priority: 'normal',
    assignedTo: '',
    dueDate: todayKey,
    dueTime: '',
    repeatRule: '',
  }
}

export function buildOperationsDashboardSummary(tasks = [], logs = [], todayKey = '') {
  const normalizedToday = normalizeOperationsTaskDate(todayKey)
  const todayTasks = tasks.filter((task) => normalizeOperationsTaskDate(task.dueDate) === normalizedToday)
  const pendingTasks = (tasks ?? []).filter((task) => normalizeOperationsStatus(task.status) === 'pending')

  const openTasks = todayTasks.filter((task) => normalizeOperationsStatus(task.status) === 'pending').length
  const completedToday = todayTasks.filter((task) => normalizeOperationsStatus(task.status) === 'completed').length
  const overdueTasks = pendingTasks.filter((task) => {
    const dueDate = normalizeOperationsTaskDate(task.dueDate ?? task?.due_date)
    return dueDate && todayKey && dueDate < normalizedToday
  }).length
  const urgentIssues = todayTasks.filter(
    (task) => normalizeOperationsPriority(task.priority) === 'urgent'
      && normalizeOperationsStatus(task.status) === 'pending',
  ).length
  const teamNotes = logs.filter((log) => normalizeOperationsLogType(log.type) === 'note').length

  return {
    openTasks,
    completedToday,
    overdueTasks,
    urgentIssues,
    teamNotes,
  }
}

export function formatOperationsDueTime(dueTime) {
  if (!dueTime) return '—'
  return formatTime24(dueTime)
}

export function formatOperationsLogTimestamp(value) {
  return formatTimestampDayAndTime24(value, '—')
}

export function resolveEmployeeName(employeeId, employees = []) {
  if (!employeeId) return 'Unassigned'
  const match = employees.find((employee) => `${employee.id}` === `${employeeId}`)
  return match?.full_name ?? match?.name ?? 'Unassigned'
}

export function getTaskAssigneeId(task) {
  const assigneeId = task?.assignedTo
    ?? task?.assigned_to
    ?? task?.assignedEmployeeId
    ?? task?.assigned_employee_id
    ?? null

  const normalized = `${assigneeId ?? ''}`.trim()
  return normalized || null
}

export function canStaffCompleteTask(task, currentEmployeeId) {
  const assigneeId = getTaskAssigneeId(task)
  if (!assigneeId) return true
  if (!currentEmployeeId) return false
  return `${assigneeId}` === `${currentEmployeeId}`
}

export function validateOperationsTaskForm(form) {
  if (!`${form.title ?? ''}`.trim()) {
    return 'Please enter a task title.'
  }
  return ''
}

export function validateOperationsLogForm(form) {
  if (!`${form.message ?? ''}`.trim()) {
    return 'Please share what happened.'
  }
  return ''
}

export function operationsTaskToForm(task) {
  return {
    title: task.title ?? '',
    description: task.description ?? '',
    category: normalizeOperationsCategory(task.category),
    priority: normalizeOperationsPriority(task.priority),
    assignedTo: task.assignedTo ? `${task.assignedTo}` : '',
    dueDate: normalizeOperationsTaskDate(task.dueDate),
    dueTime: task.dueTime ?? '',
    repeatRule: task.repeatRule ?? '',
  }
}
