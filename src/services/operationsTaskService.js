import {
  normalizeOperationsCategory,
  normalizeOperationsPriority,
  normalizeOperationsStatus,
  normalizeOperationsTaskDate,
} from '../lib/operationsUtils'
import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'
import { normalizeTimeValue } from '../lib/timeFormatUtils'

const OPERATIONS_TASKS_TABLE = 'operations_tasks'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapOperationsTask(record) {
  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    title: record.title ?? '',
    description: record.description ?? '',
    category: normalizeOperationsCategory(record.category),
    priority: normalizeOperationsPriority(record.priority),
    status: normalizeOperationsStatus(record.status),
    assignedTo: record.assigned_to ?? record.assignedTo ?? null,
    dueDate: normalizeOperationsTaskDate(record.due_date ?? record.dueDate),
    dueTime: normalizeTimeValue(record.due_time ?? record.dueTime) || null,
    completionNote: record.completion_note ?? record.completionNote ?? '',
    repeatRule: record.repeat_rule ?? record.repeatRule ?? '',
    completedAt: record.completed_at ?? record.completedAt ?? null,
    completedBy: record.completed_by ?? record.completedBy ?? null,
    createdBy: record.created_by ?? record.createdBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
    checklistTemplateId: record.checklist_template_id ?? record.checklistTemplateId ?? null,
    checklistItemId: record.checklist_item_id ?? record.checklistItemId ?? null,
    checklistOrderIndex: record.checklist_order_index ?? record.checklistOrderIndex ?? null,
  }
}

function serializeOperationsTask(task, workspaceId, { partial = false } = {}) {
  const payload = {}

  if (!partial || task.title !== undefined) {
    payload.title = `${task.title ?? ''}`.trim()
  }
  if (!partial || task.description !== undefined) {
    payload.description = `${task.description ?? ''}`.trim()
  }
  if (!partial || task.category !== undefined) {
    payload.category = normalizeOperationsCategory(task.category)
  }
  if (!partial || task.priority !== undefined) {
    payload.priority = normalizeOperationsPriority(task.priority)
  }
  if (!partial || task.status !== undefined) {
    payload.status = normalizeOperationsStatus(task.status)
  }
  if (!partial || task.assignedTo !== undefined || task.assigned_to !== undefined) {
    const assignedTo = task.assignedTo ?? task.assigned_to ?? null
    payload.assigned_to = assignedTo ? `${assignedTo}` : null
  }
  if (!partial || task.dueDate !== undefined || task.due_date !== undefined) {
    const dueDate = normalizeOperationsTaskDate(task.dueDate ?? task.due_date)
    payload.due_date = dueDate || null
  }
  if (!partial || task.dueTime !== undefined || task.due_time !== undefined) {
    const dueTime = normalizeTimeValue(task.dueTime ?? task.due_time)
    payload.due_time = dueTime || null
  }
  if (!partial || task.completionNote !== undefined || task.completion_note !== undefined) {
    payload.completion_note = `${task.completionNote ?? task.completion_note ?? ''}`.trim()
  }
  if (!partial || task.repeatRule !== undefined || task.repeat_rule !== undefined) {
    payload.repeat_rule = `${task.repeatRule ?? task.repeat_rule ?? ''}`.trim()
  }
  if (!partial || task.completedAt !== undefined || task.completed_at !== undefined) {
    payload.completed_at = task.completedAt ?? task.completed_at ?? null
  }
  if (!partial || task.completedBy !== undefined || task.completed_by !== undefined) {
    payload.completed_by = task.completedBy ?? task.completed_by ?? null
  }
  if (!partial || task.checklistTemplateId !== undefined || task.checklist_template_id !== undefined) {
    const checklistTemplateId = task.checklistTemplateId ?? task.checklist_template_id ?? null
    payload.checklist_template_id = checklistTemplateId ? `${checklistTemplateId}` : null
  }
  if (!partial || task.checklistItemId !== undefined || task.checklist_item_id !== undefined) {
    const checklistItemId = task.checklistItemId ?? task.checklist_item_id ?? null
    payload.checklist_item_id = checklistItemId ? `${checklistItemId}` : null
  }
  if (!partial || task.checklistOrderIndex !== undefined || task.checklist_order_index !== undefined) {
    const checklistOrderIndex = task.checklistOrderIndex ?? task.checklist_order_index
    payload.checklist_order_index = checklistOrderIndex === null || checklistOrderIndex === undefined
      ? null
      : Number(checklistOrderIndex)
  }

  if (!partial) {
    payload.workspace_id = workspaceId
  }

  return payload
}

async function enrichOperationsTasks(tasks = []) {
  const authUserIds = new Set()
  tasks.forEach((task) => {
    if (task.createdBy) authUserIds.add(task.createdBy)
    if (task.completedBy) authUserIds.add(task.completedBy)
  })

  const nameByAuthUserId = await getMemberDisplayNamesByAuthUserIds(Array.from(authUserIds))

  return tasks.map((task) => ({
    ...task,
    createdByName: task.createdBy ? (nameByAuthUserId[task.createdBy] ?? 'System') : 'System',
    completedByName: task.completedBy ? (nameByAuthUserId[task.completedBy] ?? 'System') : null,
  }))
}

export async function getOperationsTasks(workspaceId, { dueDate = null } = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  let query = supabase
    .from(OPERATIONS_TASKS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('checklist_order_index', { ascending: true, nullsFirst: true })
    .order('due_time', { ascending: true, nullsFirst: true })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  const normalizedDueDate = normalizeOperationsTaskDate(dueDate)
  if (normalizedDueDate) {
    query = query.eq('due_date', normalizedDueDate)
  }

  const { data, error } = await query

  if (error) {
    console.error('[operationsTaskService] getOperationsTasks error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Operations tasks table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to load operations tasks right now.')
  }

  const mapped = (data ?? []).map(mapOperationsTask)
  return enrichOperationsTasks(mapped)
}

export async function createOperationsTask(workspaceId, task, createdBy = null) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create an operations task.')
  }

  const payload = {
    ...serializeOperationsTask(task, normalizedWorkspaceId),
    created_by: createdBy,
  }

  const { data, error } = await supabase
    .from(OPERATIONS_TASKS_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[operationsTaskService] createOperationsTask error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Operations tasks table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to create task right now.')
  }

  const [enriched] = await enrichOperationsTasks([mapOperationsTask(data)])
  return enriched
}

export async function createOperationsTasksBatch(workspaceId, tasks = [], createdBy = null) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create operations tasks.')
  }
  if (!tasks.length) return []

  const payload = tasks.map((task) => ({
    ...serializeOperationsTask(task, normalizedWorkspaceId),
    created_by: createdBy,
  }))

  const { data, error } = await supabase
    .from(OPERATIONS_TASKS_TABLE)
    .insert(payload)
    .select('*')

  if (error) {
    console.error('[operationsTaskService] createOperationsTasksBatch error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Operations tasks table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to create checklist tasks right now.')
  }

  const mapped = (data ?? []).map(mapOperationsTask)
  return enrichOperationsTasks(mapped)
}

export async function updateOperationsTask(workspaceId, taskId, task) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedTaskId = `${taskId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedTaskId) {
    throw new Error('Workspace and task are required.')
  }

  const { data, error } = await supabase
    .from(OPERATIONS_TASKS_TABLE)
    .update(serializeOperationsTask(task, normalizedWorkspaceId, { partial: true }))
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedTaskId)
    .select('*')
    .single()

  if (error) {
    console.error('[operationsTaskService] updateOperationsTask error:', error)
    throw new Error(error.message || 'Unable to update task right now.')
  }

  const [enriched] = await enrichOperationsTasks([mapOperationsTask(data)])
  return enriched
}

export async function completeOperationsTask(workspaceId, taskId, {
  completedBy = null,
  completionNote = '',
  status = 'completed',
} = {}) {
  return updateOperationsTask(workspaceId, taskId, {
    status: normalizeOperationsStatus(status),
    completedAt: new Date().toISOString(),
    completedBy,
    completionNote: `${completionNote ?? ''}`.trim(),
  })
}

export async function reopenOperationsTask(workspaceId, taskId) {
  return updateOperationsTask(workspaceId, taskId, {
    status: 'pending',
    completedAt: null,
    completedBy: null,
    completionNote: '',
  })
}

export async function deleteOperationsTask(workspaceId, taskId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedTaskId = `${taskId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedTaskId) {
    throw new Error('Workspace and task are required.')
  }

  const { error } = await supabase
    .from(OPERATIONS_TASKS_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedTaskId)

  if (error) {
    console.error('[operationsTaskService] deleteOperationsTask error:', error)
    throw new Error(error.message || 'Unable to delete task right now.')
  }
}
