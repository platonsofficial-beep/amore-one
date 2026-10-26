import { shiftHasSchedulingConflict } from './scheduleConflictUtils'
import { resolveShiftTemplateId } from './shiftIntegrity'

export const CUSTOM_SCHEDULE_ROW_ID = 'custom-shifts'

export function normalizeScheduleDateKey(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function isCustomScheduleShift(shift) {
  return !resolveShiftTemplateId(shift)
}

export function isCustomScheduleRow(row) {
  return Boolean(row?.isCustomRow || row?.template?.isCustomRow)
}

function collectPlacedShiftIds(rows = []) {
  const placed = new Set()
  rows.forEach((row) => {
    ;(row?.dayCells ?? []).forEach((cell) => {
      ;(cell?.shifts ?? []).forEach((shift) => {
        const id = `${shift?.id ?? ''}`.trim()
        if (id) placed.add(id)
      })
    })
  })
  return placed
}

export function appendUnplacedScheduleShifts(rows = [], { weekDays = [], shifts = [], employees = [] } = {}) {
  const placed = collectPlacedShiftIds(rows)
  const unplaced = (shifts ?? []).filter((shift) => {
    const id = `${shift?.id ?? ''}`.trim()
    return id && !placed.has(id)
  })
  if (unplaced.length === 0) return rows

  const employeeById = new Map((employees ?? []).map((employee) => [String(employee.id), employee]))
  const template = {
    id: CUSTOM_SCHEDULE_ROW_ID,
    templateId: null,
    name: 'Custom',
    startTime: '',
    endTime: '',
    defaultRole: '',
    defaultArea: 'Custom',
    defaultRequiredCount: 0,
    notes: '',
    isBuiltIn: false,
    isCustomRow: true,
  }

  const dayCells = (weekDays ?? []).map((day) => {
    const dayKey = normalizeScheduleDateKey(day?.key)
    const dayShifts = unplaced
      .filter((shift) => normalizeScheduleDateKey(shift?.date) === dayKey)
      .map((shift) => ({
        ...shift,
        employeeRecord: employeeById.get(String(shift.employeeId)) ?? shift.employeeRecord ?? null,
      }))
    const hasRealConflict = dayShifts.some((shift) => shiftHasSchedulingConflict(shift, {
      employees,
      dayShifts: unplaced.filter((item) => normalizeScheduleDateKey(item?.date) === dayKey),
    }))

    return {
      day,
      shifts: dayShifts,
      assignedCount: dayShifts.length,
      requiredCount: 0,
      hasRealConflict,
      staffingState: dayShifts.length > 0 ? 'staffed' : 'empty',
    }
  })

  return [
    ...rows,
    {
      template,
      requiredCount: 0,
      isCustomRow: true,
      dayCells,
    },
  ]
}
