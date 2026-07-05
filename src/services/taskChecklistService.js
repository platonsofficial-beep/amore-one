import { supabase } from '../lib/supabaseClient'

const TASK_CHECKLIST_TABLE = 'task_checklist_items'

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function mapChecklistItem(record) {
  return {
    id: record.id,
    taskId: record.task_id ?? record.taskId,
    title: record.title ?? '',
    isCompleted: Boolean(record.is_completed ?? record.isCompleted),
    sortOrder: record.sort_order ?? record.sortOrder ?? 0,
    completedAt: record.completed_at ?? record.completedAt ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function groupChecklistItemsByTaskId(items = []) {
  const grouped = {}

  items.forEach((item) => {
    const key = String(item.taskId)
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(item)
  })

  Object.values(grouped).forEach((taskItems) => {
    taskItems.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.id - b.id
    })
  })

  return grouped
}

function handleServiceError(error, actionLabel) {
  console.error(`[taskChecklistService] ${actionLabel} error:`, error)

  if (isTableUnavailableError(error)) {
    throw new Error('Task checklists table is not ready yet.')
  }

  throw new Error(error.message || `Unable to ${actionLabel} right now.`)
}

function normalizeChecklistItemPayload(item, taskId, index) {
  const title = `${item?.title ?? ''}`.trim()
  if (!title) return null

  return {
    task_id: taskId,
    title,
    sort_order: item?.sortOrder ?? index,
    is_completed: Boolean(item?.isCompleted),
    completed_at: item?.completedAt ?? (item?.isCompleted ? new Date().toISOString() : null),
  }
}

export async function getChecklistItemsForTasks(taskIds = []) {
  const normalizedIds = [...new Set((taskIds ?? []).filter(Boolean))]
  if (normalizedIds.length === 0) {
    return {}
  }

  const { data, error } = await supabase
    .from(TASK_CHECKLIST_TABLE)
    .select('*')
    .in('task_id', normalizedIds)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    handleServiceError(error, 'load task checklists')
  }

  return groupChecklistItemsByTaskId((data ?? []).map(mapChecklistItem))
}

export async function createChecklistItem(taskId, item) {
  const payload = normalizeChecklistItemPayload(item, taskId, item?.sortOrder ?? 0)
  if (!payload) {
    throw new Error('Checklist item title is required.')
  }

  const { data, error } = await supabase
    .from(TASK_CHECKLIST_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    handleServiceError(error, 'create checklist item')
  }

  return mapChecklistItem(data)
}

export async function updateChecklistItem(itemId, updates = {}) {
  const payload = {}

  if (updates.title !== undefined) {
    payload.title = `${updates.title ?? ''}`.trim()
  }

  if (updates.isCompleted !== undefined || updates.is_completed !== undefined) {
    const isCompleted = Boolean(updates.isCompleted ?? updates.is_completed)
    payload.is_completed = isCompleted
    payload.completed_at = isCompleted
      ? (updates.completedAt ?? updates.completed_at ?? new Date().toISOString())
      : null
  }

  if (updates.sortOrder !== undefined || updates.sort_order !== undefined) {
    payload.sort_order = updates.sortOrder ?? updates.sort_order ?? 0
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('No checklist item updates were provided.')
  }

  const { data, error } = await supabase
    .from(TASK_CHECKLIST_TABLE)
    .update(payload)
    .eq('id', itemId)
    .select('*')
    .single()

  if (error) {
    handleServiceError(error, 'update checklist item')
  }

  return mapChecklistItem(data)
}

export async function deleteChecklistItem(itemId) {
  const { error } = await supabase
    .from(TASK_CHECKLIST_TABLE)
    .delete()
    .eq('id', itemId)

  if (error) {
    handleServiceError(error, 'delete checklist item')
  }
}

export async function toggleChecklistItem(itemId, isCompleted) {
  return updateChecklistItem(itemId, {
    isCompleted: Boolean(isCompleted),
    completedAt: isCompleted ? new Date().toISOString() : null,
  })
}

export async function replaceTaskChecklist(taskId, items = []) {
  const { error: deleteError } = await supabase
    .from(TASK_CHECKLIST_TABLE)
    .delete()
    .eq('task_id', taskId)

  if (deleteError) {
    handleServiceError(deleteError, 'replace task checklist')
  }

  const payload = (items ?? [])
    .map((item, index) => normalizeChecklistItemPayload({ ...item, isCompleted: false, completedAt: null }, taskId, index))
    .filter(Boolean)

  if (payload.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from(TASK_CHECKLIST_TABLE)
    .insert(payload)
    .select('*')

  if (error) {
    handleServiceError(error, 'replace task checklist')
  }

  return (data ?? []).map(mapChecklistItem)
}
