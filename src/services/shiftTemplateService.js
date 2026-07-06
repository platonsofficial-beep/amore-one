import { supabase } from '../lib/supabaseClient'

const SHIFT_TEMPLATES_TABLE = 'shift_templates'

export const SHIFT_TEMPLATE_LEGACY_SETUP_MESSAGE = 'Run supabase/shift_templates_default_required_staff.sql in Supabase to enable per-template default required staff and template archive.'

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
    notes: record.notes ?? '',
  }
}

function serializeShiftTemplate(template, { includeExtended = true } = {}) {
  const payload = {
    template_name: template.name ?? template.template_name ?? '',
    start_time: template.startTime ?? template.start_time ?? '',
    end_time: template.endTime ?? template.end_time ?? '',
    default_role: template.defaultRole ?? template.default_role ?? '',
    default_area: template.defaultArea ?? template.default_area ?? '',
    notes: template.notes ?? '',
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

const TEMPLATE_SELECT = 'id, template_name, start_time, end_time, default_role, default_area, default_required_count, is_active, notes, created_at'
const TEMPLATE_SELECT_LEGACY = 'id, template_name, start_time, end_time, default_role, default_area, notes, created_at'

let usedLegacyShiftTemplateSchema = false

function markLegacyShiftTemplateSchema() {
  if (usedLegacyShiftTemplateSchema) return
  usedLegacyShiftTemplateSchema = true
  console.warn(`[shiftTemplateService] Using legacy shift_templates schema. ${SHIFT_TEMPLATE_LEGACY_SETUP_MESSAGE}`)
}

export function didUseLegacyShiftTemplateSchema() {
  return usedLegacyShiftTemplateSchema
}

async function writeShiftTemplate({ id, template }) {
  const includeExtended = !usedLegacyShiftTemplateSchema
  const payload = serializeShiftTemplate(template, { includeExtended })
  const query = id
    ? supabase.from(SHIFT_TEMPLATES_TABLE).update(payload).eq('id', id)
    : supabase.from(SHIFT_TEMPLATES_TABLE).insert([payload])

  let { data, error } = await query.select(TEMPLATE_SELECT_LEGACY).single()

  if (error && isExtendedSchemaError(error)) {
    markLegacyShiftTemplateSchema()
    const legacyPayload = omitExtendedTemplateFields(serializeShiftTemplate(template, { includeExtended: true }))
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
    .order('template_name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  let { data, error } = await query

  if (error && isExtendedSchemaError(error)) {
    const legacy = await supabase
      .from(SHIFT_TEMPLATES_TABLE)
      .select(TEMPLATE_SELECT_LEGACY)
      .order('template_name', { ascending: true })

    data = legacy.data
    error = legacy.error
    if (!error) {
      markLegacyShiftTemplateSchema()
    }
  }

  if (error) {
    console.warn('[shiftTemplateService] getShiftTemplates error:', error)
    return []
  }

  return (data ?? []).map(mapShiftTemplate)
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
  const { data, error } = await writeShiftTemplate({ template })

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

export async function archiveShiftTemplate(id) {
  if (usedLegacyShiftTemplateSchema) {
    throw new Error('Template archive is not available yet. Run shift_templates_default_required_staff.sql in Supabase.')
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
      throw new Error('Template archive is not available yet. Run shift_templates_default_required_staff.sql in Supabase.')
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
