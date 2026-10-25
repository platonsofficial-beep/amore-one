import { supabase } from '../lib/supabaseClient'
import { isTaskDepartmentKey, normalizeTaskDepartmentKey } from '../lib/taskDepartments'
import { normalizeTimeValue } from '../lib/timeFormatUtils'
import {
  createWorkspaceColumnProbe,
  isMissingWorkspaceIdColumnError,
  isTableMissingError,
  payloadWithoutWorkspaceId,
  readWorkspaceId,
} from '../lib/workspaceScopedTable'

const TASKS_TABLE = 'tasks'

const TASK_PRIORITIES = new Set(['normal', 'important', 'urgent'])
const TASK_RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly'])
const TASK_STATUSES = new Set(['active', 'completed'])

function isTableUnavailableError(error) {
  return isTableMissingError(error)
}

const tasksWorkspaceColumn = createWorkspaceColumnProbe(supabase, TASKS_TABLE)

export function resetTaskWorkspaceColumnCacheForTests() {
  tasksWorkspaceColumn.reset()
}

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeTaskPriority(value, fallback = 'normal') {
  const priority = `${value ?? fallback}`.trim().toLowerCase()
  return TASK_PRIORITIES.has(priority) ? priority : fallback
}

function normalizeTaskRecurrence(value, fallback = 'none') {
  const recurrence = `${value ?? fallback}`.trim().toLowerCase()
  return TASK_RECURRENCES.has(recurrence) ? recurrence : fallback
}

function normalizeTaskStatus(value, fallback = 'active') {
  const status = `${value ?? fallback}`.trim().toLowerCase()
  return TASK_STATUSES.has(status) ? status : fallback
}

function mapTask(record) {
  return {
    id: record.id,
    title: record.title ?? '',
    department: record.department ?? '',
    departmentCustom: record.department_custom ?? record.departmentCustom ?? '',
    assignedEmployeeId: record.assigned_employee_id ?? record.assignedEmployeeId ?? null,
    priority: normalizeTaskPriority(record.priority),
    dueDate: normalizeTaskDateKey(record.due_date ?? record.dueDate),
    dueTime: normalizeTimeValue(record.due_time ?? record.dueTime) || null,
    recurrence: normalizeTaskRecurrence(record.recurrence),
    notes: record.notes ?? '',
    status: normalizeTaskStatus(record.status),
    completedAt: record.completed_at ?? record.completedAt ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
    workspaceId: record.workspace_id ?? record.workspaceId ?? null,
  }
}

function serializeTask(task, { partial = false } = {}) {
  const payload = {}

  if (!partial || task.title !== undefined) {
    payload.title = `${task.title ?? ''}`.trim()
  }

  if (!partial || task.department !== undefined) {
    const department = normalizeTaskDepartmentKey(task.department)
    if (!department) {
      throw new Error('Please choose a valid department.')
    }
    payload.department = department
  }

  if (!partial || task.departmentCustom !== undefined || task.department_custom !== undefined) {
    const departmentCustom = `${task.departmentCustom ?? task.department_custom ?? ''}`.trim()
    payload.department_custom = departmentCustom || null
  }

  if (!partial || task.assignedEmployeeId !== undefined || task.assigned_employee_id !== undefined) {
    const assignedEmployeeId = task.assignedEmployeeId ?? task.assigned_employee_id ?? null
    payload.assigned_employee_id = assignedEmployeeId ? `${assignedEmployeeId}` : null
  }

  if (!partial || task.priority !== undefined) {
    payload.priority = normalizeTaskPriority(task.priority)
  }

  if (!partial || task.dueDate !== undefined || task.due_date !== undefined) {
    payload.due_date = normalizeTaskDateKey(task.dueDate ?? task.due_date)
  }

  if (!partial || task.dueTime !== undefined || task.due_time !== undefined) {
    const dueTime = normalizeTimeValue(task.dueTime ?? task.due_time)
    payload.due_time = dueTime || null
  }

  if (!partial || task.recurrence !== undefined) {
    payload.recurrence = normalizeTaskRecurrence(task.recurrence)
  }

  if (!partial || task.notes !== undefined) {
    payload.notes = `${task.notes ?? ''}`.trim()
  }

  if (!partial || task.status !== undefined) {
    payload.status = normalizeTaskStatus(task.status)
  }

  if (!partial || task.completedAt !== undefined || task.completed_at !== undefined) {
    payload.completed_at = task.completedAt ?? task.completed_at ?? null
  }

  return payload
}

function validateTaskPayload(payload, { requireTitle = true, requireDueDate = true } = {}) {
  if (requireTitle && !`${payload.title ?? ''}`.trim()) {
    throw new Error('Task title is required.')
  }

  if (payload.department !== undefined && !isTaskDepartmentKey(payload.department)) {
    throw new Error('Please choose a valid department.')
  }

  if (payload.department === 'custom' && !`${payload.department_custom ?? ''}`.trim()) {
    throw new Error('Custom department name is required.')
  }

  if (requireDueDate && payload.due_date !== undefined && !`${payload.due_date ?? ''}`.trim()) {
    throw new Error('Due date is required.')
  }
}

function handleServiceError(error, actionLabel) {
  console.error(`[taskService] ${actionLabel} error:`, error)

  if (isTableUnavailableError(error)) {
    throw new Error('Tasks table is not ready yet.')
  }

  throw new Error(error.message || `Unable to ${actionLabel} right now.`)
}

async function loadTasks(workspaceFilter) {
  let query = supabase
    .from(TASKS_TABLE)
    .select('*')
    .order('due_date', { ascending: true })
    .order('priority', { ascending: true })
    .order('title', { ascending: true })

  if (workspaceFilter) {
    query = query.eq('workspace_id', workspaceFilter)
  }

  const { data, error } = await query
  if (error) return { data: null, error }
  return { data: (data ?? []).map(mapTask), error: null }
}

export async function getTasks(workspaceId) {
  let column
  try {
    column = await tasksWorkspaceColumn.ensure()
  } catch (error) {
    handleServiceError(error, 'load tasks')
  }

  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (column === 'present' && !normalizedWorkspaceId) return []

  let result = await loadTasks(column === 'present' ? normalizedWorkspaceId : '')
  if (result.error && isMissingWorkspaceIdColumnError(result.error)) {
    tasksWorkspaceColumn.rememberMissing()
    result = await loadTasks('')
  }

  if (result.error) {
    handleServiceError(result.error, 'load tasks')
  }

  return result.data ?? []
}

async function insertTask(payload) {
  return supabase
    .from(TASKS_TABLE)
    .insert([payload])
    .select('*')
    .single()
}

export async function createTask(task) {
  const payload = serializeTask(task)
  validateTaskPayload(payload)
  const workspaceId = readWorkspaceId(task)
  if (workspaceId) payload.workspace_id = workspaceId

  let column
  try {
    column = await tasksWorkspaceColumn.ensure()
  } catch (error) {
    handleServiceError(error, 'create task')
  }

  if (column === 'present' && !payload.workspace_id) {
    throw new Error('Workspace is required.')
  }

  let nextPayload = column === 'missing' ? payloadWithoutWorkspaceId(payload) : payload
  let { data, error } = await insertTask(nextPayload)
  if (error && nextPayload.workspace_id && isMissingWorkspaceIdColumnError(error)) {
    tasksWorkspaceColumn.rememberMissing()
    nextPayload = payloadWithoutWorkspaceId(nextPayload)
    ;({ data, error } = await insertTask(nextPayload))
  }

  if (error) {
    handleServiceError(error, 'create task')
  }

  return mapTask(data)
}

async function updateTaskRow(taskId, payload) {
  return supabase
    .from(TASKS_TABLE)
    .update(payload)
    .eq('id', taskId)
    .select('*')
    .single()
}

export async function updateTask(taskId, updates) {
  const payload = serializeTask(updates, { partial: true })
  validateTaskPayload(payload, { requireTitle: false, requireDueDate: false })
  const workspaceId = readWorkspaceId(updates)
  if (workspaceId) payload.workspace_id = workspaceId

  if (Object.keys(payloadWithoutWorkspaceId(payload)).length === 0 && !payload.workspace_id) {
    throw new Error('No task updates were provided.')
  }

  let column
  try {
    column = await tasksWorkspaceColumn.ensure()
  } catch (error) {
    handleServiceError(error, 'update task')
  }

  let nextPayload = column === 'missing' ? payloadWithoutWorkspaceId(payload) : payload
  if (Object.keys(nextPayload).length === 0) {
    throw new Error('No task updates were provided.')
  }

  let { data, error } = await updateTaskRow(taskId, nextPayload)
  if (error && nextPayload.workspace_id && isMissingWorkspaceIdColumnError(error)) {
    tasksWorkspaceColumn.rememberMissing()
    nextPayload = payloadWithoutWorkspaceId(nextPayload)
    if (Object.keys(nextPayload).length === 0) {
      throw new Error('No task updates were provided.')
    }
    ;({ data, error } = await updateTaskRow(taskId, nextPayload))
  }

  if (error) {
    handleServiceError(error, 'update task')
  }

  return mapTask(data)
}

export async function deleteTask(taskId) {
  const { error } = await supabase
    .from(TASKS_TABLE)
    .delete()
    .eq('id', taskId)

  if (error) {
    handleServiceError(error, 'delete task')
  }
}

export async function completeTask(taskId) {
  return updateTask(taskId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  })
}

export async function reopenTask(taskId) {
  return updateTask(taskId, {
    status: 'active',
    completedAt: null,
  })
}
