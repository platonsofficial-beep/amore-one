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
import { replaceTaskChecklist } from './taskChecklistService'
import { getTemplateChecklistItems } from './taskTemplateChecklistService'
import { createTask, getTasks } from './taskService'

const TASK_TEMPLATES_TABLE = 'task_templates'

const TEMPLATE_PRIORITIES = new Set(['normal', 'important', 'urgent'])
const TEMPLATE_RECURRENCES = new Set(['daily', 'weekly', 'monthly'])

function isTableUnavailableError(error) {
  return isTableMissingError(error)
}

const taskTemplatesWorkspaceColumn = createWorkspaceColumnProbe(supabase, TASK_TEMPLATES_TABLE)

export function resetTaskTemplateWorkspaceColumnCacheForTests() {
  taskTemplatesWorkspaceColumn.reset()
}

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeTemplatePriority(value, fallback = 'normal') {
  const priority = `${value ?? fallback}`.trim().toLowerCase()
  return TEMPLATE_PRIORITIES.has(priority) ? priority : fallback
}

function normalizeTemplateRecurrence(value, fallback = 'daily') {
  const recurrence = `${value ?? fallback}`.trim().toLowerCase()
  return TEMPLATE_RECURRENCES.has(recurrence) ? recurrence : fallback
}

function mapTaskTemplate(record) {
  return {
    id: record.id,
    title: record.title ?? '',
    department: record.department ?? '',
    departmentCustom: record.department_custom ?? record.departmentCustom ?? '',
    priority: normalizeTemplatePriority(record.priority),
    defaultTime: normalizeTimeValue(record.default_time ?? record.defaultTime) || null,
    recurrence: normalizeTemplateRecurrence(record.recurrence),
    notes: record.notes ?? '',
    isActive: record.is_active ?? record.isActive ?? true,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
    workspaceId: record.workspace_id ?? record.workspaceId ?? null,
  }
}

function serializeTaskTemplate(template, { partial = false } = {}) {
  const payload = {}

  if (!partial || template.title !== undefined) {
    payload.title = `${template.title ?? ''}`.trim()
  }

  if (!partial || template.department !== undefined) {
    const department = normalizeTaskDepartmentKey(template.department)
    if (!department) {
      throw new Error('Please choose a valid department.')
    }
    payload.department = department
  }

  if (!partial || template.departmentCustom !== undefined || template.department_custom !== undefined) {
    const departmentCustom = `${template.departmentCustom ?? template.department_custom ?? ''}`.trim()
    payload.department_custom = departmentCustom || null
  }

  if (!partial || template.priority !== undefined) {
    payload.priority = normalizeTemplatePriority(template.priority)
  }

  if (!partial || template.defaultTime !== undefined || template.default_time !== undefined) {
    const defaultTime = normalizeTimeValue(template.defaultTime ?? template.default_time)
    payload.default_time = defaultTime || null
  }

  if (!partial || template.recurrence !== undefined) {
    payload.recurrence = normalizeTemplateRecurrence(template.recurrence)
  }

  if (!partial || template.notes !== undefined) {
    payload.notes = `${template.notes ?? ''}`.trim()
  }

  if (!partial || template.isActive !== undefined || template.is_active !== undefined) {
    payload.is_active = template.isActive ?? template.is_active ?? true
  }

  return payload
}

function validateTaskTemplatePayload(payload, { requireTitle = true } = {}) {
  if (requireTitle && !`${payload.title ?? ''}`.trim()) {
    throw new Error('Template title is required.')
  }

  if (payload.department !== undefined && !isTaskDepartmentKey(payload.department)) {
    throw new Error('Please choose a valid department.')
  }

  if (payload.department === 'custom' && !`${payload.department_custom ?? ''}`.trim()) {
    throw new Error('Custom department name is required.')
  }
}

function handleServiceError(error, actionLabel) {
  console.error(`[taskTemplateService] ${actionLabel} error:`, error)

  if (isTableUnavailableError(error)) {
    throw new Error('Task templates table is not ready yet.')
  }

  throw new Error(error.message || `Unable to ${actionLabel} right now.`)
}

function buildTaskDuplicateKey(title, department, dueDate) {
  return [
    `${title ?? ''}`.trim().toLowerCase(),
    `${department ?? ''}`.trim().toLowerCase(),
    normalizeTaskDateKey(dueDate),
  ].join('::')
}

async function loadTaskTemplates(workspaceFilter) {
  let query = supabase
    .from(TASK_TEMPLATES_TABLE)
    .select('*')
    .order('department', { ascending: true })
    .order('title', { ascending: true })

  if (workspaceFilter) {
    query = query.eq('workspace_id', workspaceFilter)
  }

  const { data, error } = await query
  if (error) return { data: null, error }
  return { data: (data ?? []).map(mapTaskTemplate), error: null }
}

export async function getTaskTemplates(workspaceId) {
  let column
  try {
    column = await taskTemplatesWorkspaceColumn.ensure()
  } catch (error) {
    handleServiceError(error, 'load task templates')
  }

  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (column === 'present' && !normalizedWorkspaceId) return []

  let result = await loadTaskTemplates(column === 'present' ? normalizedWorkspaceId : '')
  if (result.error && isMissingWorkspaceIdColumnError(result.error)) {
    taskTemplatesWorkspaceColumn.rememberMissing()
    result = await loadTaskTemplates('')
  }

  if (result.error) {
    handleServiceError(result.error, 'load task templates')
  }

  return result.data ?? []
}

async function insertTaskTemplate(payload) {
  return supabase
    .from(TASK_TEMPLATES_TABLE)
    .insert([payload])
    .select('*')
    .single()
}

export async function createTaskTemplate(template) {
  const payload = serializeTaskTemplate(template)
  validateTaskTemplatePayload(payload)
  const workspaceId = readWorkspaceId(template)
  if (workspaceId) payload.workspace_id = workspaceId

  let column
  try {
    column = await taskTemplatesWorkspaceColumn.ensure()
  } catch (error) {
    handleServiceError(error, 'create task template')
  }

  if (column === 'present' && !payload.workspace_id) {
    throw new Error('Workspace is required.')
  }

  let nextPayload = column === 'missing' ? payloadWithoutWorkspaceId(payload) : payload
  let { data, error } = await insertTaskTemplate(nextPayload)
  if (error && nextPayload.workspace_id && isMissingWorkspaceIdColumnError(error)) {
    taskTemplatesWorkspaceColumn.rememberMissing()
    nextPayload = payloadWithoutWorkspaceId(nextPayload)
    ;({ data, error } = await insertTaskTemplate(nextPayload))
  }

  if (error) {
    handleServiceError(error, 'create task template')
  }

  return mapTaskTemplate(data)
}

async function updateTaskTemplateRow(templateId, payload) {
  return supabase
    .from(TASK_TEMPLATES_TABLE)
    .update(payload)
    .eq('id', templateId)
    .select('*')
    .single()
}

export async function updateTaskTemplate(templateId, updates) {
  const payload = serializeTaskTemplate(updates, { partial: true })
  const workspaceId = readWorkspaceId(updates)
  if (workspaceId) payload.workspace_id = workspaceId
  validateTaskTemplatePayload(payload, { requireTitle: false })

  if (Object.keys(payloadWithoutWorkspaceId(payload)).length === 0 && !payload.workspace_id) {
    throw new Error('No template updates were provided.')
  }

  let column
  try {
    column = await taskTemplatesWorkspaceColumn.ensure()
  } catch (error) {
    handleServiceError(error, 'update task template')
  }

  let nextPayload = column === 'missing' ? payloadWithoutWorkspaceId(payload) : payload
  if (Object.keys(nextPayload).length === 0) {
    throw new Error('No template updates were provided.')
  }

  let { data, error } = await updateTaskTemplateRow(templateId, nextPayload)
  if (error && nextPayload.workspace_id && isMissingWorkspaceIdColumnError(error)) {
    taskTemplatesWorkspaceColumn.rememberMissing()
    nextPayload = payloadWithoutWorkspaceId(nextPayload)
    if (Object.keys(nextPayload).length === 0) {
      throw new Error('No template updates were provided.')
    }
    ;({ data, error } = await updateTaskTemplateRow(templateId, nextPayload))
  }

  if (error) {
    handleServiceError(error, 'update task template')
  }

  return mapTaskTemplate(data)
}

export async function deleteTaskTemplate(templateId) {
  const { error } = await supabase
    .from(TASK_TEMPLATES_TABLE)
    .delete()
    .eq('id', templateId)

  if (error) {
    handleServiceError(error, 'delete task template')
  }
}

export async function generateTasksFromTemplates({ templates, selectedDate, workspaceId = '' }) {
  const dueDate = normalizeTaskDateKey(selectedDate)
  if (!dueDate) {
    throw new Error('A valid date is required to generate tasks.')
  }

  const activeTemplates = (templates ?? []).filter((template) => template?.isActive !== false)
  if (activeTemplates.length === 0) {
    return { createdCount: 0, skippedCount: 0 }
  }

  const existingTasks = await getTasks(workspaceId)
  const existingKeys = new Set(
    existingTasks.map((task) => buildTaskDuplicateKey(task.title, task.department, task.dueDate)),
  )

  const templateChecklistsById = await getTemplateChecklistItems(
    activeTemplates.map((template) => template.id),
  ).catch(() => ({}))

  let createdCount = 0
  let skippedCount = 0

  for (const template of activeTemplates) {
    const duplicateKey = buildTaskDuplicateKey(template.title, template.department, dueDate)
    if (existingKeys.has(duplicateKey)) {
      skippedCount += 1
      continue
    }

    const createdTask = await createTask({
      title: template.title,
      department: template.department,
      departmentCustom: template.departmentCustom,
      priority: template.priority,
      dueDate,
      dueTime: template.defaultTime,
      recurrence: template.recurrence,
      notes: template.notes,
      status: 'active',
      workspaceId: workspaceId || template.workspaceId || '',
    })

    const templateChecklistItems = templateChecklistsById[String(template.id)] ?? []
    if (templateChecklistItems.length > 0) {
      try {
        await replaceTaskChecklist(
          createdTask.id,
          templateChecklistItems.map((item) => ({ title: item.title })),
        )
      } catch (checklistError) {
        console.error('[taskTemplateService] copy template checklist error:', checklistError)
      }
    }

    existingKeys.add(duplicateKey)
    createdCount += 1
  }

  return { createdCount, skippedCount }
}
