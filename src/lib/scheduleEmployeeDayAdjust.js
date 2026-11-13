import { resolveShiftTemplateId } from './shiftIntegrity'
import { isEmployeeAssignedInCell } from './scheduleDropUtils'
import { t } from '../i18n/i18n'

function dayKeyOf(shift) {
  return `${shift?.date ?? ''}`.slice(0, 10)
}

function templateKey(source) {
  if (!source || typeof source !== 'object') return ''
  const fields = ['templateId', 'shiftTemplateId', 'shift_template_id']
  for (const field of fields) {
    const normalized = resolveShiftTemplateId(source[field])
    if (normalized) return String(normalized)
    const text = `${source[field] ?? ''}`.trim().replace(/^supabase-/, '')
    if (text) return text
  }
  if (source.employeeId || source.employee_id) return ''
  const normalizedId = resolveShiftTemplateId(source.id)
  if (normalizedId) return String(normalizedId)
  return `${source.id ?? ''}`.trim().replace(/^supabase-/, '')
}

/**
 * Place one selected employee onto the shift that was tapped.
 * Creates a shift when they have none. Moves a single existing shift
 * when they already have one. Never changes two shifts at once.
 */
export function resolveEmployeeShiftAdjust({
  employeeId = '',
  dayKey = '',
  template = null,
  cell = null,
  shifts = [],
} = {}) {
  const id = `${employeeId ?? ''}`.trim()
  const day = `${dayKey ?? ''}`.slice(0, 10)
  if (!id || !day || !template || !cell) {
    return { action: 'error', message: t("Choose an employee and a shift.") }
  }

  if (isEmployeeAssignedInCell(cell, id)) {
    return { action: 'noop', message: t("This employee is already on this shift.") }
  }

  const mine = shifts.filter((shift) => `${shift?.employeeId ?? ''}` === id)
  if (mine.length === 0) {
    return { action: 'assign', template, cell, dayKey: day }
  }

  const sameService = mine.find((shift) => templateKey(shift) && templateKey(shift) === templateKey(template))
  const source = sameService
    ?? [...mine].sort((left, right) => `${left.startTime ?? ''}`.localeCompare(`${right.startTime ?? ''}`))[0]

  if (dayKeyOf(source) === day && templateKey(source) === templateKey(template)) {
    return { action: 'noop', message: t("This employee is already on this shift.") }
  }

  return {
    action: 'move',
    shiftId: source.id,
    template,
    cell,
    dayKey: day,
  }
}
