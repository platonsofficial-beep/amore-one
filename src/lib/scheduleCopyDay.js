import {
  buildKnownShiftTemplateIdSet,
  prepareShiftForSave,
  resolveShiftTemplateId,
} from './shiftIntegrity'
import { normalizeTimeValue } from './timeFormatUtils'

export function buildCopyDayPayloads({ sourceShifts = [], targetDate = '', shiftTemplates = [] } = {}) {
  const normalizedTarget = `${targetDate ?? ''}`.trim()
  if (!normalizedTarget) {
    throw new Error('Select a target day first.')
  }
  if (!Array.isArray(sourceShifts) || sourceShifts.length === 0) {
    throw new Error('No assignments found on the source day.')
  }

  const knownTemplateIds = buildKnownShiftTemplateIdSet(shiftTemplates)

  return sourceShifts.map((shift) => {
    const templateId = resolveShiftTemplateId(shift)
    const startTime = normalizeTimeValue(shift?.startTime ?? shift?.start_time)
    const endTime = normalizeTimeValue(shift?.endTime ?? shift?.end_time)
    if (!`${shift?.employeeId ?? shift?.employee_id ?? ''}`.trim() || !startTime || !endTime) {
      throw new Error('A source shift is missing an employee or time.')
    }

    return prepareShiftForSave({
      employee_id: shift.employeeId ?? shift.employee_id ?? null,
      date: normalizedTarget,
      startTime,
      endTime,
      role: shift.role ?? '',
      area: shift.area ?? '',
      status: shift.status || 'Scheduled',
      notes: shift.notes ?? '',
      shiftTemplateId: templateId,
    }, {
      knownTemplateIds,
      requireTemplateId: Boolean(templateId),
      inferTemplateId: Boolean(templateId),
      shiftTemplatesForInference: templateId ? shiftTemplates : [],
    })
  })
}
