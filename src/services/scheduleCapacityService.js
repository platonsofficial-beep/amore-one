import { supabase } from '../lib/supabaseClient'

const SCHEDULE_CAPACITY_TABLE = 'schedule_capacity'

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) {
    return raw.split('T')[0]
  }
  return raw.slice(0, 10)
}

function mapCapacity(record) {
  const requiredCount = Number(record.required_count)
  const shiftDate = normalizeShiftDate(record.shift_date)
  if (!Number.isFinite(requiredCount) || requiredCount < 0) {
    return null
  }

  if (!shiftDate) {
    return null
  }

  return {
    id: record.id,
    shiftTemplateId: record.shift_template_id,
    shiftDate,
    requiredCount: Math.floor(requiredCount),
  }
}

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

export async function getScheduleCapacities(options = {}) {
  const shiftDates = Array.isArray(options.shiftDates)
    ? options.shiftDates.map((item) => normalizeShiftDate(item)).filter(Boolean)
    : []

  let query = supabase
    .from(SCHEDULE_CAPACITY_TABLE)
    .select('id, shift_template_id, shift_date, required_count')
    .order('shift_date', { ascending: true })

  if (shiftDates.length > 0) {
    query = query.in('shift_date', shiftDates)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[scheduleCapacityService] getScheduleCapacities error:', error)
    return []
  }

  const capacities = (data ?? [])
    .map((record) => {
      const mapped = mapCapacity(record)
      if (!mapped) {
        console.warn('Ignoring invalid schedule capacity row', record)
      }
      return mapped
    })
    .filter(Boolean)

  console.log("Loaded capacities", capacities)
  return capacities
}

export async function upsertScheduleCapacity({ shiftTemplateId, shiftDate, requiredCount }) {
  const normalizedCount = Number(requiredCount)
  const normalizedShiftDate = normalizeShiftDate(shiftDate)
  if (!Number.isFinite(normalizedCount) || normalizedCount < 0 || normalizedCount > 99) {
    throw new Error('Required staffing must be between 0 and 99.')
  }

  if (!normalizedShiftDate) {
    throw new Error('Shift date is required to save schedule capacity.')
  }

  const payload = {
    shift_template_id: shiftTemplateId,
    shift_date: normalizedShiftDate,
    required_count: Math.floor(normalizedCount),
  }

  console.log("Saving capacity", {
    shift_template_id: payload.shift_template_id,
    shift_date: payload.shift_date,
    required_count: payload.required_count,
  })

  const { data, error } = await supabase
    .from("schedule_capacity")
    .upsert(payload, { onConflict: 'shift_template_id,shift_date' })
    .select('id, shift_template_id, shift_date, required_count')
    .single()

  if (error) {
    if (isTableUnavailableError(error)) {
      throw new Error('schedule_capacity table is not ready yet.')
    }
    throw new Error(error.message || 'Unable to save schedule capacity right now.')
  }

  const result = mapCapacity(data)
  if (!result) {
    throw new Error('Saved schedule capacity returned invalid required_count.')
  }

  console.log("Capacity save result", result)
  return result
}

export async function deleteScheduleCapacitiesForDates(shiftDates = []) {
  const normalizedDates = [...new Set(
    (shiftDates ?? []).map((item) => normalizeShiftDate(item)).filter(Boolean),
  )]

  if (normalizedDates.length === 0) {
    return
  }

  const { error } = await supabase
    .from(SCHEDULE_CAPACITY_TABLE)
    .delete()
    .in('shift_date', normalizedDates)

  if (error) {
    if (isTableUnavailableError(error)) {
      return
    }
    throw new Error(error.message || 'Unable to clear schedule capacity right now.')
  }
}

export async function copyScheduleCapacitiesForWeek({ sourceDateKeys = [], targetDateKeys = [] }) {
  const sourceKeys = (sourceDateKeys ?? []).map((item) => normalizeShiftDate(item)).filter(Boolean)
  const targetKeys = (targetDateKeys ?? []).map((item) => normalizeShiftDate(item)).filter(Boolean)

  if (sourceKeys.length === 0 || targetKeys.length === 0 || sourceKeys.length !== targetKeys.length) {
    return []
  }

  const sourceCapacities = await getScheduleCapacities({ shiftDates: sourceKeys })
  const saved = []

  for (const capacity of sourceCapacities) {
    const dayIndex = sourceKeys.indexOf(capacity.shiftDate)
    if (dayIndex < 0 || !targetKeys[dayIndex]) continue

    const result = await upsertScheduleCapacity({
      shiftTemplateId: capacity.shiftTemplateId,
      shiftDate: targetKeys[dayIndex],
      requiredCount: capacity.requiredCount,
    })
    saved.push(result)
  }

  return saved
}

export async function applyScheduleCapacitiesForWeek({ weekDays = [], capacities = [] }) {
  const dayKeyToIndex = new Map((weekDays ?? []).map((day, index) => [normalizeShiftDate(day.key), index]))
  const saved = []

  for (const capacity of capacities ?? []) {
    const dayIndex = dayKeyToIndex.get(normalizeShiftDate(capacity.shiftDate))
    const targetDate = dayIndex === undefined ? '' : normalizeShiftDate(weekDays[dayIndex]?.key)
    const shiftTemplateId = capacity.shiftTemplateId

    if (!targetDate || !shiftTemplateId) continue

    const result = await upsertScheduleCapacity({
      shiftTemplateId,
      shiftDate: targetDate,
      requiredCount: capacity.requiredCount,
    })
    saved.push(result)
  }

  return saved
}

export async function applyMinimumCapacitiesFromShifts(shifts = []) {
  const countsByCell = new Map()

  ;(shifts ?? []).forEach((shift) => {
    const shiftTemplateId = shift?.shiftTemplateId
    const shiftDate = normalizeShiftDate(shift?.date)
    if (!shiftTemplateId || !shiftDate) return

    const key = `${String(shiftTemplateId)}|${shiftDate}`
    countsByCell.set(key, (countsByCell.get(key) ?? 0) + 1)
  })

  const saved = []

  for (const [key, assignedCount] of countsByCell.entries()) {
    const [shiftTemplateId, shiftDate] = key.split('|')
    if (!shiftTemplateId || !shiftDate || assignedCount <= 0) continue

    const result = await upsertScheduleCapacity({
      shiftTemplateId,
      shiftDate,
      requiredCount: assignedCount,
    })
    saved.push(result)
  }

  return saved
}
