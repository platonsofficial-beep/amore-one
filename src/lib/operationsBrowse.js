import { normalizeOperationsPriority, normalizeOperationsStatus } from './operationsUtils'

const OPERATIONS_PRIORITY_WEIGHT = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
}

function normalizeOperationsTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function isOperationsTaskOverdue(task, todayKey = '') {
  if (normalizeOperationsStatus(task?.status) !== 'pending') return false
  const dueDate = normalizeOperationsTaskDateKey(task?.dueDate ?? task?.due_date)
  if (!dueDate || !todayKey) return false
  return dueDate < todayKey
}

export function compareOperationsTasksByWorkflow(left, right, todayKey = '') {
  if (todayKey) {
    const leftOverdue = isOperationsTaskOverdue(left, todayKey) ? 0 : 1
    const rightOverdue = isOperationsTaskOverdue(right, todayKey) ? 0 : 1
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue
  }

  const leftPriority = OPERATIONS_PRIORITY_WEIGHT[normalizeOperationsPriority(left?.priority)] ?? 0
  const rightPriority = OPERATIONS_PRIORITY_WEIGHT[normalizeOperationsPriority(right?.priority)] ?? 0
  if (leftPriority !== rightPriority) return rightPriority - leftPriority

  const leftDate = normalizeOperationsTaskDateKey(left?.dueDate ?? left?.due_date) || '9999-12-31'
  const rightDate = normalizeOperationsTaskDateKey(right?.dueDate ?? right?.due_date) || '9999-12-31'
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)

  const leftTime = `${left?.dueTime ?? left?.due_time ?? ''}`
  const rightTime = `${right?.dueTime ?? right?.due_time ?? ''}`
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)

  return `${left?.title ?? ''}`.localeCompare(`${right?.title ?? ''}`, undefined, { sensitivity: 'base' })
}

function getTaskSearchHaystack(task, assigneeName = '') {
  return [
    task.title ?? '',
    task.description ?? '',
    task.category ?? '',
    assigneeName,
    task.completionNote ?? '',
  ].join(' ').toLowerCase()
}

function getLogSearchHaystack(log) {
  return [
    log.title ?? '',
    log.message ?? '',
    log.type ?? '',
    log.createdByName ?? '',
  ].join(' ').toLowerCase()
}

export function filterOperationsTasks(
  tasks = [],
  {
    searchTerm = '',
    statusFilter = 'all',
    assigneeNameById = () => '',
  } = {},
) {
  const normalizedSearch = `${searchTerm ?? ''}`.trim().toLowerCase()

  return (tasks ?? []).filter((task) => {
    const status = normalizeOperationsStatus(task.status)
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    const haystack = getTaskSearchHaystack(task, assigneeNameById(task.assignedTo))
    const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch)
    return matchesStatus && matchesSearch
  })
}

export function filterOperationsLogs(logs = [], { searchTerm = '', typeFilter = 'all' } = {}) {
  const normalizedSearch = `${searchTerm ?? ''}`.trim().toLowerCase()

  return (logs ?? []).filter((log) => {
    const matchesType = typeFilter === 'all' || log.type === typeFilter
    const matchesSearch = !normalizedSearch || getLogSearchHaystack(log).includes(normalizedSearch)
    return matchesType && matchesSearch
  })
}

export const OPERATIONS_LOG_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Note' },
  { id: 'incident', label: 'Issue' },
  { id: 'handover', label: 'Handover' },
]

export const OPERATIONS_TASK_STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Open' },
  { id: 'completed', label: 'Completed' },
  { id: 'skipped', label: 'Skipped' },
]

export function sortOperationsTasks(tasks = []) {
  return [...(tasks ?? [])].sort((left, right) => {
    const leftDone = normalizeOperationsStatus(left.status) !== 'pending'
    const rightDone = normalizeOperationsStatus(right.status) !== 'pending'
    if (leftDone !== rightDone) return leftDone ? 1 : -1

    return compareOperationsTasksByWorkflow(left, right)
  })
}
