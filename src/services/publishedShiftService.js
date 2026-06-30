import { supabase } from '../lib/supabaseClient'
import { validateShiftTemplateReference } from '../lib/shiftIntegrity'

const PUBLISHED_SHIFTS_TABLE = 'published_shifts'

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeTimeValue(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.length >= 5 && raw.includes(':')) return raw.slice(0, 5)
  return raw
}

const PUBLISHED_SHIFTS_SETUP_HINT = 'Run supabase/published_shifts_schema.sql in the Supabase SQL editor, then try publishing again.'

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`.toUpperCase()
  return (
    code === 'PGRST205'
    || code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
  )
}

function buildPublishedShiftsUnavailableError() {
  return new Error(`published_shifts table is not ready yet. ${PUBLISHED_SHIFTS_SETUP_HINT}`)
}

export function normalizeShiftForComparison(shift) {
  return {
    employeeId: shift?.employeeId ?? shift?.employee_id ?? null,
    date: normalizeShiftDate(shift?.date ?? shift?.shift_date),
    startTime: normalizeTimeValue(shift?.startTime ?? shift?.start_time),
    endTime: normalizeTimeValue(shift?.endTime ?? shift?.end_time),
    role: `${shift?.role ?? ''}`.trim(),
    area: `${shift?.area ?? ''}`.trim(),
    shiftTemplateId: shift?.shiftTemplateId ?? shift?.shift_template_id ?? null,
    status: `${shift?.status ?? 'Scheduled'}`.trim(),
    notes: `${shift?.notes ?? ''}`.trim(),
  }
}

function comparisonKey(shift) {
  return JSON.stringify(normalizeShiftForComparison(shift))
}

export function draftMatchesPublishedSnapshot(draftShifts = [], publishedShifts = []) {
  const draftKeys = (draftShifts ?? []).map(comparisonKey).sort()
  const publishedKeys = (publishedShifts ?? []).map(comparisonKey).sort()

  if (draftKeys.length !== publishedKeys.length) return false
  return draftKeys.every((key, index) => key === publishedKeys[index])
}

function mapPublishedShift(record) {
  const relatedEmployee = Array.isArray(record.employees) ? record.employees[0] : record.employees

  return {
    id: record.id,
    publicationId: record.publication_id ?? record.publicationId ?? null,
    weekStartDate: normalizeShiftDate(record.week_start_date ?? record.weekStartDate),
    employeeId: record.employee_id ?? record.employeeId ?? null,
    employeeName: relatedEmployee?.full_name ?? relatedEmployee?.name ?? '',
    employees: relatedEmployee ? { ...relatedEmployee } : null,
    shiftTemplateId: record.shift_template_id ?? record.shiftTemplateId ?? null,
    date: normalizeShiftDate(record.shift_date ?? record.date),
    startTime: record.start_time ?? record.startTime ?? '',
    endTime: record.end_time ?? record.endTime ?? '',
    role: record.role ?? '',
    area: record.area ?? '',
    status: record.status ?? 'Scheduled',
    notes: record.notes ?? '',
  }
}

function serializePublishedShift({ publicationId, weekStartDate, shift }, options = {}) {
  const shiftTemplateId = validateShiftTemplateReference({
    shiftTemplateId: shift.shiftTemplateId ?? shift.shift_template_id,
    knownTemplateIds: options.knownTemplateIds ?? null,
    requireTemplateId: options.requireTemplateId ?? false,
  })

  return {
    publication_id: publicationId,
    week_start_date: weekStartDate,
    employee_id: shift.employeeId ?? shift.employee_id ?? null,
    shift_template_id: shiftTemplateId,
    shift_date: normalizeShiftDate(shift.date ?? shift.shift_date),
    start_time: normalizeTimeValue(shift.startTime ?? shift.start_time),
    end_time: normalizeTimeValue(shift.endTime ?? shift.end_time),
    role: shift.role ?? '',
    area: shift.area ?? '',
    status: shift.status ?? 'Scheduled',
    notes: shift.notes ?? '',
  }
}

export async function getPublishedShifts(weekStartDate) {
  const normalizedWeekStartDate = normalizeShiftDate(weekStartDate)
  if (!normalizedWeekStartDate) return []

  const { data, error } = await supabase
    .from(PUBLISHED_SHIFTS_TABLE)
    .select(`
      *,
      employees(*)
    `)
    .eq('week_start_date', normalizedWeekStartDate)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    if (isTableUnavailableError(error)) {
      return []
    }
    throw new Error(error.message || 'Unable to load published schedule right now.')
  }

  return (data ?? []).map(mapPublishedShift)
}

export async function replacePublishedShifts({ publicationId, weekStartDate, draftShifts = [], knownTemplateIds = null }) {
  const normalizedWeekStartDate = normalizeShiftDate(weekStartDate)
  if (!publicationId || !normalizedWeekStartDate) {
    throw new Error('Publication and week start date are required to publish.')
  }

  const { error: deleteError } = await supabase
    .from(PUBLISHED_SHIFTS_TABLE)
    .delete()
    .eq('week_start_date', normalizedWeekStartDate)

  if (deleteError) {
    if (isTableUnavailableError(deleteError)) {
      throw buildPublishedShiftsUnavailableError()
    }
    throw new Error(deleteError.message || 'Unable to clear previous published schedule.')
  }

  const publishOptions = { knownTemplateIds, requireTemplateId: true }
  const payload = (draftShifts ?? [])
    .map((shift) => serializePublishedShift({ publicationId, weekStartDate: normalizedWeekStartDate, shift }, publishOptions))
    .filter((item) => item.shift_date && item.start_time && item.end_time)

  if (payload.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from(PUBLISHED_SHIFTS_TABLE)
    .insert(payload)
    .select(`
      *,
      employees(*)
    `)

  if (error) {
    if (isTableUnavailableError(error)) {
      throw buildPublishedShiftsUnavailableError()
    }
    throw new Error(error.message || 'Unable to save published schedule.')
  }

  return (data ?? []).map(mapPublishedShift)
}

export async function deletePublishedShiftsForWeek(weekStartDate) {
  const normalizedWeekStartDate = normalizeShiftDate(weekStartDate)
  if (!normalizedWeekStartDate) return

  const { error } = await supabase
    .from(PUBLISHED_SHIFTS_TABLE)
    .delete()
    .eq('week_start_date', normalizedWeekStartDate)

  if (error) {
    if (isTableUnavailableError(error)) {
      throw buildPublishedShiftsUnavailableError()
    }
    throw new Error(error.message || 'Unable to remove published schedule.')
  }
}
