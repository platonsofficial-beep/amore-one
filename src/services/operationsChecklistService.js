import {
  inferChecklistCategory,
  normalizeChecklistDepartment,
  sortChecklistItems,
} from '../lib/operationsChecklistUtils'
import { normalizeOperationsTaskDate } from '../lib/operationsUtils'
import { supabase } from '../lib/supabaseClient'
import { createOperationsTasksBatch, getOperationsTasks } from './operationsTaskService'

const TEMPLATES_TABLE = 'operations_checklist_templates'
const ITEMS_TABLE = 'operations_checklist_items'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapChecklistItem(record) {
  return {
    id: record.id,
    templateId: record.template_id ?? record.templateId ?? '',
    title: record.title ?? '',
    description: record.description ?? '',
    orderIndex: Number(record.order_index ?? record.orderIndex ?? 0),
    required: record.required !== false,
    estimatedMinutes: record.estimated_minutes ?? record.estimatedMinutes ?? null,
  }
}

function mapChecklistTemplate(record, items = []) {
  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    name: record.name ?? '',
    department: normalizeChecklistDepartment(record.department),
    active: record.active !== false,
    createdBy: record.created_by ?? record.createdBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
    items: sortChecklistItems(items.map(mapChecklistItem)),
  }
}

export async function getOperationsChecklistTemplates(workspaceId, { includeInactive = true } = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  let query = supabase
    .from(TEMPLATES_TABLE)
    .select(`
      *,
      items:operations_checklist_items(*)
    `)
    .eq('workspace_id', normalizedWorkspaceId)
    .order('name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('[operationsChecklistService] getOperationsChecklistTemplates error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Operations checklist tables are not ready yet.')
    }
    throw new Error(error.message || 'Unable to load checklist templates right now.')
  }

  return (data ?? []).map((record) => mapChecklistTemplate(record, record.items ?? []))
}

export async function createOperationsChecklistTemplate(workspaceId, template, createdBy = null) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create a checklist template.')
  }

  const { data, error } = await supabase
    .from(TEMPLATES_TABLE)
    .insert([{
      workspace_id: normalizedWorkspaceId,
      name: `${template.name ?? ''}`.trim(),
      department: normalizeChecklistDepartment(template.department),
      active: template.active !== false,
      created_by: createdBy,
    }])
    .select('*')
    .single()

  if (error) {
    console.error('[operationsChecklistService] createOperationsChecklistTemplate error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Operations checklist tables are not ready yet.')
    }
    throw new Error(error.message || 'Unable to create checklist template right now.')
  }

  return mapChecklistTemplate(data, [])
}

export async function updateOperationsChecklistTemplate(workspaceId, templateId, template) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedTemplateId) {
    throw new Error('Workspace and template are required.')
  }

  const payload = {}
  if (template.name !== undefined) payload.name = `${template.name ?? ''}`.trim()
  if (template.department !== undefined) payload.department = normalizeChecklistDepartment(template.department)
  if (template.active !== undefined) payload.active = template.active !== false

  const { data, error } = await supabase
    .from(TEMPLATES_TABLE)
    .update(payload)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedTemplateId)
    .select(`
      *,
      items:operations_checklist_items(*)
    `)
    .single()

  if (error) {
    console.error('[operationsChecklistService] updateOperationsChecklistTemplate error:', error)
    throw new Error(error.message || 'Unable to update checklist template right now.')
  }

  return mapChecklistTemplate(data, data.items ?? [])
}

export async function deleteOperationsChecklistTemplate(workspaceId, templateId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedTemplateId) {
    throw new Error('Workspace and template are required.')
  }

  const { error } = await supabase
    .from(TEMPLATES_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedTemplateId)

  if (error) {
    console.error('[operationsChecklistService] deleteOperationsChecklistTemplate error:', error)
    throw new Error(error.message || 'Unable to delete checklist template right now.')
  }
}

export async function createOperationsChecklistItem(templateId, item) {
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  if (!normalizedTemplateId) {
    throw new Error('Template is required to add a checklist item.')
  }

  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .insert([{
      template_id: normalizedTemplateId,
      title: `${item.title ?? ''}`.trim(),
      description: `${item.description ?? ''}`.trim(),
      order_index: Number(item.orderIndex ?? 0),
      required: item.required !== false,
      estimated_minutes: item.estimatedMinutes ? Number(item.estimatedMinutes) : null,
    }])
    .select('*')
    .single()

  if (error) {
    console.error('[operationsChecklistService] createOperationsChecklistItem error:', error)
    throw new Error(error.message || 'Unable to add checklist item right now.')
  }

  return mapChecklistItem(data)
}

export async function updateOperationsChecklistItem(itemId, item) {
  const normalizedItemId = `${itemId ?? ''}`.trim()
  if (!normalizedItemId) {
    throw new Error('Checklist item is required.')
  }

  const payload = {}
  if (item.title !== undefined) payload.title = `${item.title ?? ''}`.trim()
  if (item.description !== undefined) payload.description = `${item.description ?? ''}`.trim()
  if (item.orderIndex !== undefined) payload.order_index = Number(item.orderIndex ?? 0)
  if (item.required !== undefined) payload.required = item.required !== false
  if (item.estimatedMinutes !== undefined) {
    payload.estimated_minutes = item.estimatedMinutes ? Number(item.estimatedMinutes) : null
  }

  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .update(payload)
    .eq('id', normalizedItemId)
    .select('*')
    .single()

  if (error) {
    console.error('[operationsChecklistService] updateOperationsChecklistItem error:', error)
    throw new Error(error.message || 'Unable to update checklist item right now.')
  }

  return mapChecklistItem(data)
}

export async function deleteOperationsChecklistItem(itemId) {
  const normalizedItemId = `${itemId ?? ''}`.trim()
  if (!normalizedItemId) {
    throw new Error('Checklist item is required.')
  }

  const { error } = await supabase
    .from(ITEMS_TABLE)
    .delete()
    .eq('id', normalizedItemId)

  if (error) {
    console.error('[operationsChecklistService] deleteOperationsChecklistItem error:', error)
    throw new Error(error.message || 'Unable to delete checklist item right now.')
  }
}

export async function saveOperationsChecklistItemOrder(items = []) {
  await Promise.all(
    (items ?? []).map((item, index) => updateOperationsChecklistItem(item.id, {
      orderIndex: item.orderIndex ?? index,
    })),
  )
}

export async function generateDailyChecklistTasks(workspaceId, templateId, dueDate, createdBy = null) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedTemplateId = `${templateId ?? ''}`.trim()
  const normalizedDueDate = normalizeOperationsTaskDate(dueDate)
  if (!normalizedWorkspaceId || !normalizedTemplateId || !normalizedDueDate) {
    throw new Error('Workspace, template, and date are required.')
  }

  const templates = await getOperationsChecklistTemplates(normalizedWorkspaceId)
  const template = templates.find((entry) => `${entry.id}` === normalizedTemplateId)
  if (!template) {
    throw new Error('Checklist template not found.')
  }
  if (template.active === false) {
    throw new Error('This checklist template is inactive.')
  }
  if (!template.items.length) {
    throw new Error('Add checklist items before starting this checklist.')
  }

  const existingTasks = await getOperationsTasks(normalizedWorkspaceId, { dueDate: normalizedDueDate })
  const existingRun = existingTasks.filter(
    (task) => `${task.checklistTemplateId ?? ''}` === normalizedTemplateId,
  )

  if (existingRun.length > 0) {
    return {
      tasks: existingRun,
      alreadyExists: true,
      template,
    }
  }

  const category = inferChecklistCategory(template.name, template.department)
  const payloads = sortChecklistItems(template.items).map((item, index) => ({
    title: item.title,
    description: item.description,
    category,
    priority: 'normal',
    status: 'pending',
    dueDate: normalizedDueDate,
    checklistTemplateId: template.id,
    checklistItemId: item.id,
    checklistOrderIndex: item.orderIndex ?? index,
  }))

  const createdTasks = await createOperationsTasksBatch(normalizedWorkspaceId, payloads, createdBy)

  return {
    tasks: createdTasks,
    alreadyExists: false,
    template,
  }
}
