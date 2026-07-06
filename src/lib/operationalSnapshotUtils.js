import { resolveShiftTemplateId } from './shiftIntegrity'
import { normalizeTimeValue } from './timeFormatUtils'
import {
  calculateShiftDurationHours,
  formatHoursLabel,
  getAssignmentOvertimeHours,
  getEmployeeHoursTrackerState,
  parseWeeklyHoursTarget,
  buildEmployeeWeeklyHoursMap,
} from './shiftHoursUtils'
import { getCurrentDateKey, getTimeGreeting } from './currentDateUtils'
import { getWeekDateKeys, getWeekStartDate } from './weekUtils'

function normalizeDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function resolveTemplateCapacityId(template) {
  const rawId = template?.templateId ?? template?.id
  if (typeof rawId === 'string' && rawId.startsWith('supabase-')) {
    return rawId.replace('supabase-', '')
  }
  return rawId
}

function getTemplateDefaultRequiredCount(template) {
  const parsed = Number(template?.defaultRequiredCount ?? template?.default_required_count)
  if (!Number.isFinite(parsed) || parsed < 0) return 1
  return Math.min(99, Math.floor(parsed))
}

function buildCapacityKey(templateId, shiftDate) {
  return `${String(templateId)}:${normalizeDate(shiftDate)}`
}

function getPrimaryCellKey({ shiftTemplateId, shiftDate }) {
  const normalizedDate = normalizeDate(shiftDate)
  if (!shiftTemplateId || !normalizedDate) return ''
  return `${String(shiftTemplateId)}:${normalizedDate}`
}

function buildLegacyCellKey({ shiftDate, startTime, endTime, area }) {
  return [
    normalizeDate(shiftDate),
    normalizeTimeValue(startTime),
    normalizeTimeValue(endTime),
    `${area ?? ''}`.trim().toLowerCase(),
  ].join(':')
}

function getShiftCellKeys(shift) {
  const primary = getPrimaryCellKey({
    shiftTemplateId: shift?.shiftTemplateId,
    shiftDate: shift?.date,
  })

  if (primary) return [primary]

  const legacy = buildLegacyCellKey({
    shiftDate: shift?.date,
    startTime: shift?.startTime,
    endTime: shift?.endTime,
    area: shift?.area,
  })

  return legacy ? [legacy] : []
}

function getTemplateCellKeys(template, dayKey) {
  const normalizedDay = normalizeDate(dayKey)
  const templateId = resolveTemplateCapacityId(template)
  const primary = getPrimaryCellKey({ shiftTemplateId: templateId, shiftDate: normalizedDay })
  if (primary) return [primary]

  const legacy = buildLegacyCellKey({
    shiftDate: normalizedDay,
    startTime: template?.startTime,
    endTime: template?.endTime,
    area: template?.defaultArea,
  })

  return legacy ? [legacy] : []
}

function buildCapacityLookup(scheduleCapacities = []) {
  const lookup = {}
  scheduleCapacities.forEach((item) => {
    const key = buildCapacityKey(item.shiftTemplateId, item.shiftDate)
    const parsed = Number(item.requiredCount)
    if (Number.isFinite(parsed) && parsed >= 0) {
      lookup[key] = parsed
    }
  })
  return lookup
}

function getRequiredCountForCell(template, dayKey, capacityLookup) {
  const key = buildCapacityKey(resolveTemplateCapacityId(template), dayKey)
  if (Object.prototype.hasOwnProperty.call(capacityLookup, key)) {
    return capacityLookup[key]
  }
  return getTemplateDefaultRequiredCount(template)
}

function buildAssignmentsByCell(shifts = []) {
  const map = {}

  shifts.forEach((shift) => {
    getShiftCellKeys(shift).forEach((cellKey) => {
      if (!cellKey) return
      if (!Array.isArray(map[cellKey])) {
        map[cellKey] = []
      }
      map[cellKey].push(shift)
    })
  })

  return map
}

function resolveTemplateForShift(shift, shiftTemplates) {
  const templateId = resolveShiftTemplateId(shift)
  if (!templateId) return null
  return shiftTemplates.find((template) => resolveShiftTemplateId(template) === templateId) ?? null
}

export function resolveWorkspaceBusinessName(name) {
  return `${name ?? ''}`.trim()
}

export function resolveUserFirstName(name) {
  const trimmed = `${name ?? ''}`.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0]
}

export function buildOperationalSnapshot({
  shifts = [],
  shiftTemplates = [],
  scheduleCapacities = [],
  employees = [],
  todayKey = getCurrentDateKey(),
  todayDateLabel = '',
  timeGreeting = getTimeGreeting(),
  businessName = '',
  userName = '',
} = {}) {
  const todayShifts = shifts.filter((shift) => normalizeDate(shift.date) === todayKey)
  const seenShiftIds = new Set()
  const uniqueEmployeeIds = new Set()
  let labourHours = 0

  todayShifts.forEach((shift) => {
    const shiftId = String(shift.id)
    if (seenShiftIds.has(shiftId)) return
    seenShiftIds.add(shiftId)

    if (shift.employeeId) {
      uniqueEmployeeIds.add(String(shift.employeeId))
    }

    labourHours += calculateShiftDurationHours(shift.startTime, shift.endTime)
  })

  const capacityLookup = buildCapacityLookup(scheduleCapacities)
  const assignmentsByCell = buildAssignmentsByCell(todayShifts)

  let issues = 0
  const countedOvertimeShiftIds = new Set()

  shiftTemplates.forEach((template) => {
    const requiredCount = getRequiredCountForCell(template, todayKey, capacityLookup)
    const cellKeys = getTemplateCellKeys(template, todayKey)
    const seen = new Set()
    let assignedCount = 0

    cellKeys.forEach((cellKey) => {
      ;(assignmentsByCell[cellKey] ?? []).forEach((shift) => {
        const shiftId = String(shift.id)
        if (seen.has(shiftId)) return
        seen.add(shiftId)
        assignedCount += 1
      })
    })

    if (requiredCount > 0 && assignedCount === 0) {
      issues += 1
    } else if (assignedCount > 0 && assignedCount < requiredCount) {
      issues += 1
    } else if (assignedCount > requiredCount) {
      issues += 1
    }
  })

  todayShifts.forEach((shift) => {
    const shiftId = String(shift.id)
    if (countedOvertimeShiftIds.has(shiftId)) return

    const template = resolveTemplateForShift(shift, shiftTemplates)
    if (template && getAssignmentOvertimeHours(shift, template) > 0) {
      countedOvertimeShiftIds.add(shiftId)
      issues += 1
    }
  })

  const weekStartDate = getWeekStartDate(parseLocalDateFromKey(todayKey))
  const weekDateKeys = new Set(getWeekDateKeys(weekStartDate))
  const weekShifts = shifts.filter((shift) => weekDateKeys.has(normalizeDate(shift.date)))
  const weeklyHoursMap = buildEmployeeWeeklyHoursMap(weekShifts)
  const employeesById = new Map(employees.map((employee) => [String(employee.id), employee]))
  const weeklyOvertimeEmployees = new Set()

  todayShifts.forEach((shift) => {
    const employeeId = shift.employeeId ? String(shift.employeeId) : ''
    if (!employeeId || weeklyOvertimeEmployees.has(employeeId)) return

    const employee = employeesById.get(employeeId)
    const weeklyTarget = parseWeeklyHoursTarget(employee?.weeklyHours ?? employee?.weekly_hours)
    const tracker = getEmployeeHoursTrackerState(weeklyHoursMap.get(employeeId) ?? 0, weeklyTarget)

    if (tracker.status === 'over') {
      weeklyOvertimeEmployees.add(employeeId)
      issues += 1
    }
  })

  const resolvedBusinessName = resolveWorkspaceBusinessName(businessName)
  const resolvedUserName = resolveUserFirstName(userName)
  const greeting = resolvedUserName
    ? `${timeGreeting}, ${resolvedUserName}.`
    : `${timeGreeting}.`

  return {
    greeting,
    businessName: resolvedBusinessName,
    todayLabel: todayDateLabel,
    scheduledStaff: uniqueEmployeeIds.size,
    labourHours,
    labourHoursLabel: formatHoursLabel(labourHours),
    issues,
    statusMessage: issues === 0 ? 'Everything is ready.' : 'Needs attention.',
    closingMessage: issues === 0 ? 'Have a great service!' : '',
  }
}

function parseLocalDateFromKey(dateKey) {
  const [year, month, day] = `${dateKey ?? ''}`.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date()
  }
  return new Date(year, month - 1, day)
}
