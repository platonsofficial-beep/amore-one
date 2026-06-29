import { supabase } from '../lib/supabaseClient'

const WEEKLY_TEMPLATES_TABLE = 'weekly_schedule_templates'
const WEEKLY_TEMPLATE_SHIFTS_TABLE = 'weekly_schedule_template_shifts'

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function mapTemplate(record) {
  return {
    id: record.id,
    name: record.name ?? '',
    createdAt: record.created_at ?? record.createdAt ?? '',
    updatedAt: record.updated_at ?? record.updatedAt ?? '',
  }
}

function mapTemplateShift(record) {
  return {
    id: record.id,
    templateId: record.template_id ?? record.templateId,
    dayIndex: Number(record.day_index ?? record.dayIndex ?? 0),
    employeeId: record.employee_id ?? record.employeeId ?? null,
    role: record.role ?? '',
    area: record.area ?? '',
    startTime: record.start_time ?? record.startTime ?? '',
    endTime: record.end_time ?? record.endTime ?? '',
    status: record.status ?? 'Scheduled',
    notes: record.notes ?? '',
  }
}

export async function getWeeklyScheduleTemplates() {
  const { data, error } = await supabase
    .from(WEEKLY_TEMPLATES_TABLE)
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[weeklyScheduleTemplateService] getWeeklyScheduleTemplates error:', error)
    if (isTableUnavailableError(error)) {
      return []
    }
    throw new Error(error.message || 'Unable to load weekly templates right now.')
  }

  return (data ?? []).map(mapTemplate)
}

export async function getWeeklyTemplateShifts(templateId) {
  const { data, error } = await supabase
    .from(WEEKLY_TEMPLATE_SHIFTS_TABLE)
    .select('*')
    .eq('template_id', templateId)
    .order('day_index', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[weeklyScheduleTemplateService] getWeeklyTemplateShifts error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Weekly template shifts table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to load weekly template shifts right now.')
  }

  return (data ?? []).map(mapTemplateShift)
}

export async function createWeeklyScheduleTemplate({ name, shifts }) {
  const { data: templateData, error: templateError } = await supabase
    .from(WEEKLY_TEMPLATES_TABLE)
    .insert([{ name }])
    .select('*')
    .single()

  if (templateError) {
    console.error('[weeklyScheduleTemplateService] createWeeklyScheduleTemplate template insert error:', templateError)
    if (isTableUnavailableError(templateError)) {
      throw new Error('Weekly templates table is not ready yet.')
    }
    throw new Error(templateError.message || 'Unable to create weekly template right now.')
  }

  const template = mapTemplate(templateData)
  const normalizedShifts = (shifts ?? []).map((shift) => ({
    template_id: template.id,
    day_index: shift.dayIndex,
    employee_id: shift.employeeId ?? null,
    role: shift.role ?? '',
    area: shift.area ?? '',
    start_time: shift.startTime ?? '',
    end_time: shift.endTime ?? '',
    status: shift.status ?? 'Scheduled',
    notes: shift.notes ?? '',
  }))

  if (normalizedShifts.length > 0) {
    const { error: shiftError } = await supabase
      .from(WEEKLY_TEMPLATE_SHIFTS_TABLE)
      .insert(normalizedShifts)

    if (shiftError) {
      console.error('[weeklyScheduleTemplateService] createWeeklyScheduleTemplate shift insert error:', shiftError)
      throw new Error(shiftError.message || 'Template created, but shifts could not be saved.')
    }
  }

  return template
}

export async function renameWeeklyScheduleTemplate(templateId, name) {
  const { data, error } = await supabase
    .from(WEEKLY_TEMPLATES_TABLE)
    .update({ name })
    .eq('id', templateId)
    .select('*')
    .single()

  if (error) {
    console.error('[weeklyScheduleTemplateService] renameWeeklyScheduleTemplate error:', error)
    throw new Error(error.message || 'Unable to rename weekly template right now.')
  }

  return mapTemplate(data)
}

export async function deleteWeeklyScheduleTemplate(templateId) {
  const { error: deleteShiftsError } = await supabase
    .from(WEEKLY_TEMPLATE_SHIFTS_TABLE)
    .delete()
    .eq('template_id', templateId)

  if (deleteShiftsError) {
    console.error('[weeklyScheduleTemplateService] deleteWeeklyScheduleTemplate shift delete error:', deleteShiftsError)
    throw new Error(deleteShiftsError.message || 'Unable to remove template shifts right now.')
  }

  const { error: deleteTemplateError } = await supabase
    .from(WEEKLY_TEMPLATES_TABLE)
    .delete()
    .eq('id', templateId)

  if (deleteTemplateError) {
    console.error('[weeklyScheduleTemplateService] deleteWeeklyScheduleTemplate template delete error:', deleteTemplateError)
    throw new Error(deleteTemplateError.message || 'Unable to delete weekly template right now.')
  }
}
