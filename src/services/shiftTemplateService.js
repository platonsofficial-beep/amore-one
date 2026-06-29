import { supabase } from '../lib/supabaseClient'

const SHIFT_TEMPLATES_TABLE = 'shift_templates'

function mapShiftTemplate(record) {
  return {
    id: record.id,
    name: record.template_name ?? record.name ?? '',
    startTime: record.start_time ?? record.startTime ?? '',
    endTime: record.end_time ?? record.endTime ?? '',
    defaultRole: record.default_role ?? record.defaultRole ?? '',
    defaultArea: record.default_area ?? record.defaultArea ?? '',
    notes: record.notes ?? '',
  }
}

function serializeShiftTemplate(template) {
  return {
    template_name: template.name ?? template.template_name ?? '',
    start_time: template.startTime ?? template.start_time ?? '',
    end_time: template.endTime ?? template.end_time ?? '',
    default_role: template.defaultRole ?? template.default_role ?? '',
    default_area: template.defaultArea ?? template.default_area ?? '',
    notes: template.notes ?? '',
  }
}

export async function getShiftTemplates() {
  const { data, error } = await supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .select('id, template_name, start_time, end_time, default_role, default_area, notes, created_at')
    .order('template_name', { ascending: true })

  if (error) {
    console.error('[shiftTemplateService] getShiftTemplates error:', error)
    throw new Error(error.message || 'Unable to load shift templates right now.')
  }

  return (data ?? []).map(mapShiftTemplate)
}

export async function createShiftTemplate(template) {
  const { data, error } = await supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .insert([serializeShiftTemplate(template)])
    .select('*')
    .single()

  if (error) {
    console.error('[shiftTemplateService] createShiftTemplate error:', error)
    throw new Error(error.message || 'Unable to create shift template right now.')
  }

  return mapShiftTemplate(data)
}

export async function updateShiftTemplate(id, template) {
  const { data, error } = await supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .update(serializeShiftTemplate(template))
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[shiftTemplateService] updateShiftTemplate error:', error)
    throw new Error(error.message || 'Unable to update shift template right now.')
  }

  return mapShiftTemplate(data)
}

export async function deleteShiftTemplate(id) {
  const { error } = await supabase
    .from(SHIFT_TEMPLATES_TABLE)
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[shiftTemplateService] deleteShiftTemplate error:', error)
    throw new Error(error.message || 'Unable to delete shift template right now.')
  }
}
