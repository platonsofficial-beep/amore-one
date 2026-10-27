import {
  normalizeOperationsCategory,
  normalizeOperationsPriority,
  normalizeOperationsStatus,
  OPERATIONS_CATEGORIES,
} from './operationsUtils'

const FORM_PRIORITY_TO_OPERATIONS = {
  low: 'low',
  normal: 'normal',
  important: 'high',
  high: 'high',
  urgent: 'urgent',
}

const OPERATIONS_PRIORITY_TO_FORM = {
  low: 'normal',
  normal: 'normal',
  high: 'important',
  urgent: 'urgent',
}

const FORM_RECURRENCES = new Set(['daily', 'weekly', 'monthly'])

function readAssignedEmployeeId(form = {}) {
  const assigned = form.assignedEmployeeId
    ?? form.assigned_employee_id
    ?? form.assignedTo
    ?? form.assigned_to
    ?? null
  const normalized = `${assigned ?? ''}`.trim()
  return normalized || null
}

function resolveOperationsCategory(form = {}) {
  const department = `${form.department ?? ''}`.trim().toLowerCase()
  if (OPERATIONS_CATEGORIES.includes(department)) return department

  const existingCategory = normalizeOperationsCategory(form.category)
  if (`${form.category ?? ''}`.trim() && department === 'custom') return existingCategory

  return 'other'
}

function resolveRepeatRule(form = {}) {
  const recurrence = `${form.recurrence ?? ''}`.trim().toLowerCase()
  if (FORM_RECURRENCES.has(recurrence)) return recurrence

  const existing = `${form.repeatRule ?? ''}`.trim()
  if ((recurrence === 'none' || recurrence === '') && existing && !FORM_RECURRENCES.has(existing.toLowerCase()) && existing.toLowerCase() !== 'none') {
    return existing
  }

  return ''
}

/**
 * Tasks board form -> operations_tasks row.
 * assigned employee id becomes assigned_to, department becomes category,
 * notes become description. Priority "important" is stored as "high"
 * because operations_tasks only allows low, normal, high, and urgent.
 */
export function mapTaskFormToOperationsTask(form = {}) {
  const priorityKey = `${form.priority ?? ''}`.trim().toLowerCase()

  return {
    title: `${form.title ?? ''}`.trim(),
    description: `${form.notes ?? form.description ?? ''}`.trim(),
    category: resolveOperationsCategory(form),
    priority: FORM_PRIORITY_TO_OPERATIONS[priorityKey] || 'normal',
    assignedTo: readAssignedEmployeeId(form),
    dueDate: form.dueDate ?? form.due_date ?? null,
    dueTime: form.dueTime ?? form.due_time ?? null,
    repeatRule: resolveRepeatRule(form),
  }
}

function formRecurrence(repeatRule) {
  const repeat = `${repeatRule ?? ''}`.trim().toLowerCase()
  return FORM_RECURRENCES.has(repeat) ? repeat : 'none'
}

/**
 * Shape an operations task so the existing Tasks form can edit it.
 * Checklist rows stay off the department boards.
 */
export function presentOperationsTaskForTaskBoard(task) {
  if (!task?.id || task.checklistRun || task.checklistTemplateId || task.checklistItemId) return null
  if (normalizeOperationsStatus(task.status) === 'skipped') return null

  const category = normalizeOperationsCategory(task.category)
  const priority = OPERATIONS_PRIORITY_TO_FORM[normalizeOperationsPriority(task.priority)] ?? 'normal'

  return {
    ...task,
    taskSource: 'operations',
    category,
    department: category,
    departmentCustom: '',
    assignedEmployeeId: task.assignedTo ?? null,
    notes: task.description ?? '',
    recurrence: formRecurrence(task.repeatRule),
    priority,
    status: normalizeOperationsStatus(task.status) === 'completed' ? 'completed' : 'active',
  }
}
