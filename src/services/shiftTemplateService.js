import { supabase } from '../lib/supabaseClient'
import { normalizeShiftTemplateId } from '../lib/shiftIntegrity'

const SHIFT_TEMPLATES_TABLE = 'shift_templates'

export const SHIFT_TEMPLATE_SORT_ORDER_SETUP_MESSAGE = 'Run supabase/shift_templates_sort_order.sql in Supabase to enable manual shift template ordering.'

function isMissingColumnError(error, columnName) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const column = `${columnName ?? ''}`.toLowerCase()
  if (!column) return false
  return message.includes(column)
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('could not find') && message.includes(column))
}

function isExtendedSchemaError(error) {
  return isMissingColumnError(error, 'default_required_count')
    || isMissingColumnError(error, 'is_active')
}

function isSortOrderColumnError(error) {
  return isMissingColumnError(error, 'sort_order')
}

function isForeignKeyError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '23503' || message.includes('foreign key') || message.includes('violates')
}

function normalizeDefaultRequiredCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 1
  return Math.min(99, Math.floor(parsed))
}

function normalizeSortOrder(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function resolveTemplateName(template) {
  return `${template?.name ?? template?.template_name ?? ''}`.trim()
}

export function compareShiftTemplatesByOrder(left, right) {
  const sortA = Number.isFinite(Number(left?.sortOrder ?? left?.sort_order))
    ? Number(left?.sortOrder ?? left?.sort_order)
    : Number.MAX_SAFE_INTEGER
  const sortB = Number.isFinite(Number(right?.sortOrder ?? right?.sort_order))
    ? Number(right?.sortOrder ?? right?.sort_order)
    : Number.MAX_SAFE_INTEGER

  if (sortA !== sortB) return sortA - sortB

  return resolveTemplateName(left).localeCompare(resolveTemplateName(right))
}

export function sortShiftTemplates(templates = []) {
  return [...templates].sort(compareShiftTemplatesByOrder)
}

export function moveShiftTemplatesByDrag(templates = [], draggedId, targetId) {
  const draggedKey = String(resolveTemplateRecordId(draggedId) ?? draggedId ?? '')
  const targetKey = String(resolveTemplateRecordId(targetId) ?? targetId ?? '')
  if (!draggedKey || !targetKey || draggedKey === targetKey) {
    return sortShiftTemplates(templates)
  }

  const sorted = sortShiftTemplates(templates)
  const draggedIndex = sorted.findIndex((template) => (
    String(resolveTemplateRecordId(template)) === draggedKey
  ))
  const targetIndex = sorted.findIndex((template) => (
    String(resolveTemplateRecordId(template)) === targetKey
  ))
  if (draggedIndex < 0 || targetIndex < 0) return sorted

  const next = [...sorted]
  const [moved] = next.splice(draggedIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

function mapShiftTemplate(record) {
  return {
    id: record.id,
    name: record.template_name ?? record.name ?? '',
    startTime: record.start_time ?? record.startTime ?? '',
    endTime: record.end_time ?? record.endTime ?? '',
    defaultRole: record.default_role ?? record.defaultRole ?? '',
    defaultArea: record.default_area ?? record.defaultArea ?? '',
    defaultRequiredCount: normalizeDefaultRequiredCount(
      record.default_required_count ?? record.defaultRequiredCount ?? 1,
    ),
    isActive: record.is_active ?? record.isActive ?? true,
    sortOrder: normalizeSortOrder(record.sort_order ?? record.sortOrder ?? 0),
    notes: record.notes ?? '',
  }
}

function serializeShiftTemplate(template, { includeExtended = true, includeSortOrder = true } = {}) {
  const payload = {
    template_name: template.name ?? template.template_name ?? '',
    start_time: template.startTime ?? template.start_time ?? '',
    end_time: template.endTime ?? template.end_time ?? '',
    default_role: template.defaultRole ?? template.default_role ?? '',
    default_area: template.defaultArea ?? template.default_area ?? '',
    notes: template.notes ?? '',
  }

  if (includeSortOrder && (template.sortOrder !== undefined || template.sort_order !== undefined)) {
    payload.sort_order = normalizeSortOrder(template.sortOrder ?? template.sort_order)
  }

  if (includeExtended) {
    if (template.defaultRequiredCount !== undefined || template.default_required_count !== undefined) {
      payload.default_required_count = normalizeDefaultRequiredCount(
        template.defaultRequiredCount ?? template.default_required_count,
      )
    }

    if (template.isActive !== undefined || template.is_active !== undefined) {
      payload.is_active = template.isActive ?? template.is_active ?? true
    }
  }

  return payload
}

function omitExtendedTemplateFields(payload) {
  const next = { ...payload }
  delete next.default_required_count
  delete next.is_active
  return next
}

function omitSortOrderField(payload) {
  const next = { ...payload }
  delete next.sort_order
  return next
}

const TEMPLATE_SELECT = 'id, template_name, start_time, end_time, default_role, default_area, default_required_count, is_active, sort_order, notes, created_at'
const TEMPLATE_SELECT_LEGACY = 'id, template_name, start_time, end_time, default_role, default_area, notes, created_at'
const TEMPLATE_SELECT_WITHOUT_SORT = 'id, template_name, start_time, end_time, default_role, default_area, default_required_count, is_active, notes, created_at'

let usedLegacyShiftTemplateSchema = false
let usedLegacyShiftTemplateSortOrder = false

function markLegacyShiftTemplateSchema() {
  if (usedLegacyShiftTemplateSchema) return
  usedLegacyShiftTemplateSchema = true
  console.warn('[shiftTemplateService] Using legacy shift_templates schema.')
}

function markLegacyShiftTemplateSortOrder() {
  if (usedLegacyShiftTemplateSortOrder) return
  usedLegacyShiftTemplateSortOrder = true
  console.warn(`[shiftTemplateService] sort_order unavailable. ${SHIFT_TEMPLATE_SORT_ORDER_SETUP_MESSAGE}`)
}

export function didUseLegacyShiftTemplateSchema() {
  return usedLegacyShiftTemplateSchema
}

function resolveTemplateRecordId(template) {
  return normalizeShiftTemplateId(template?.id ?? template?.templateId ?? template)
}

async function resolveCreateSortOrder(template) {
  if (Number.isFinite(Number(template?.sortOrder ?? template?.sort_order))) {
    return normalizeSortOrder(template.sortOrder ?? template.sort_order)
  }

  if (usedLegacyShiftTemplateSortOrder) {
    return 0
  }

  const { data, error } = await supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isSortOrderColumnError(error)) {
      markLegacyShiftTemplateSortOrder()
      return 0
    }
    console.warn('[shiftTemplateService] resolveCreateSortOrder error:', error)
    return 0
  }

  return normalizeSortOrder(data?.sort_order) + 1
}

async function writeShiftTemplate({ id, template }) {
  const includeExtended = !usedLegacyShiftTemplateSchema
  const includeSortOrder = !usedLegacyShiftTemplateSortOrder
  const payload = serializeShiftTemplate(template, { includeExtended, includeSortOrder })
  const query = id
    ? supabase.from(SHIFT_TEMPLATES_TABLE).update(payload).eq('id', id)
    : supabase.from(SHIFT_TEMPLATES_TABLE).insert([payload])

  let { data, error } = await query.select(TEMPLATE_SELECT_LEGACY).single()

  if (error && (isExtendedSchemaError(error) || isSortOrderColumnError(error))) {
    if (isExtendedSchemaError(error)) {
      markLegacyShiftTemplateSchema()
    }
    if (isSortOrderColumnError(error)) {
      markLegacyShiftTemplateSortOrder()
    }

    const legacyPayload = omitSortOrderField(
      omitExtendedTemplateFields(
        serializeShiftTemplate(template, { includeExtended: true, includeSortOrder: true }),
      ),
    )
    const retryQuery = id
      ? supabase.from(SHIFT_TEMPLATES_TABLE).update(legacyPayload).eq('id', id)
      : supabase.from(SHIFT_TEMPLATES_TABLE).insert([legacyPayload])

    const retry = await retryQuery.select(TEMPLATE_SELECT_LEGACY).single()
    data = retry.data
    error = retry.error
  }

  return { data, error }
}

export async function getShiftTemplates({ includeInactive = false } = {}) {
  let query = supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .select(TEMPLATE_SELECT)
    .order('sort_order', { ascending: true })
    .order('template_name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  let { data, error } = await query

  if (error) {
    const sortMissing = isSortOrderColumnError(error)
    const extendedMissing = isExtendedSchemaError(error)

    if (sortMissing || extendedMissing) {
      if (sortMissing) {
        markLegacyShiftTemplateSortOrder()
      }
      if (extendedMissing) {
        markLegacyShiftTemplateSchema()
      }

      const legacySelect = extendedMissing
        ? TEMPLATE_SELECT_LEGACY
        : TEMPLATE_SELECT_WITHOUT_SORT

      let legacyQuery = supabase
        .from(SHIFT_TEMPLATES_TABLE)
        .select(legacySelect)
        .order('template_name', { ascending: true })

      if (!includeInactive && !extendedMissing) {
        legacyQuery = legacyQuery.eq('is_active', true)
      }

      const legacy = await legacyQuery
      data = legacy.data
      error = legacy.error
    }
  }

  if (error) {
    console.warn('[shiftTemplateService] getShiftTemplates error:', error)
    return []
  }

  return sortShiftTemplates((data ?? []).map(mapShiftTemplate))
}

export async function getShiftCountForTemplate(templateId) {
  if (!templateId) return 0

  const { count, error } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .eq('shift_template_id', templateId)

  if (error) {
    if (`${error.message ?? ''}`.toLowerCase().includes('does not exist')) {
      return 0
    }
    console.error('[shiftTemplateService] getShiftCountForTemplate error:', error)
    throw new Error(error.message || 'Unable to check template usage right now.')
  }

  return Number(count) || 0
}

export async function createShiftTemplate(template) {
  const sortOrder = await resolveCreateSortOrder(template)
  const { data, error } = await writeShiftTemplate({
    template: {
      ...template,
      sortOrder,
    },
  })

  if (error) {
    console.error('[shiftTemplateService] createShiftTemplate error:', error)
    throw new Error(error.message || 'Unable to create shift template right now.')
  }

  return mapShiftTemplate(data)
}

export async function updateShiftTemplate(id, template) {
  const { data, error } = await writeShiftTemplate({ id, template })

  if (error) {
    console.error('[shiftTemplateService] updateShiftTemplate error:', error)
    throw new Error(error.message || 'Unable to update shift template right now.')
  }

  return mapShiftTemplate(data)
}

export async function reorderShiftTemplates(orderedTemplates) {
  if (usedLegacyShiftTemplateSortOrder) {
    throw new Error(`Template ordering is not available yet. ${SHIFT_TEMPLATE_SORT_ORDER_SETUP_MESSAGE}`)
  }

  const updates = orderedTemplates.map((template, index) => ({
    id: resolveTemplateRecordId(template),
    sort_order: index + 1,
  })).filter((item) => item.id)

  for (const item of updates) {
    const { error } = await supabase
      .from(SHIFT_TEMPLATES_TABLE)
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)

    if (error) {
      if (isSortOrderColumnError(error)) {
        markLegacyShiftTemplateSortOrder()
        throw new Error(`Template ordering is not available yet. ${SHIFT_TEMPLATE_SORT_ORDER_SETUP_MESSAGE}`)
      }
      console.error('[shiftTemplateService] reorderShiftTemplates error:', error)
      throw new Error(error.message || 'Unable to reorder shift templates right now.')
    }
  }
}

export async function archiveShiftTemplate(id) {
  if (usedLegacyShiftTemplateSchema) {
    throw new Error('Template archive is not available with the current schema.')
  }

  const { data, error } = await supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .update({ is_active: false })
    .eq('id', id)
    .select(TEMPLATE_SELECT_LEGACY)
    .single()

  if (error) {
    if (isExtendedSchemaError(error)) {
      markLegacyShiftTemplateSchema()
      throw new Error('Template archive is not available with the current schema.')
    }
    console.error('[shiftTemplateService] archiveShiftTemplate error:', error)
    throw new Error(error.message || 'Unable to archive shift template right now.')
  }

  return mapShiftTemplate(data)
}

export async function deleteShiftTemplate(id) {
  const usageCount = await getShiftCountForTemplate(id)
  if (usageCount > 0) {
    throw new Error('This template is used by existing shifts. Remove those shifts first or archive the template.')
  }

  const { error } = await supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[shiftTemplateService] deleteShiftTemplate error:', error)
    if (isForeignKeyError(error)) {
      throw new Error('This template is used by existing shifts. Remove those shifts first or archive the template.')
    }
    throw new Error(error.message || 'Unable to delete shift template right now.')
  }
}
