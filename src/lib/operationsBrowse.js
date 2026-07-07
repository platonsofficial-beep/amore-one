import { normalizeOperationsPriority, normalizeOperationsStatus } from './operationsUtils'

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
  { id: 'handover', label: 'Handovers' },
  { id: 'incident', label: 'Incidents' },
  { id: 'note', label: 'Notes' },
]

export const OPERATIONS_TASK_STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Open' },
  { id: 'completed', label: 'Completed' },
  { id: 'skipped', label: 'Skipped' },
]

export function sortOperationsTasks(tasks = []) {
  const priorityWeight = { urgent: 4, high: 3, normal: 2, low: 1 }

  return [...(tasks ?? [])].sort((left, right) => {
    const leftDone = normalizeOperationsStatus(left.status) !== 'pending'
    const rightDone = normalizeOperationsStatus(right.status) !== 'pending'
    if (leftDone !== rightDone) return leftDone ? 1 : -1

    const leftPriority = priorityWeight[normalizeOperationsPriority(left.priority)] ?? 0
    const rightPriority = priorityWeight[normalizeOperationsPriority(right.priority)] ?? 0
    if (leftPriority !== rightPriority) return rightPriority - leftPriority

    const leftTime = `${left.dueTime ?? ''}`
    const rightTime = `${right.dueTime ?? ''}`
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)

    return `${left.title ?? ''}`.localeCompare(`${right.title ?? ''}`, undefined, { sensitivity: 'base' })
  })
}
