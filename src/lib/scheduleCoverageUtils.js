import { resolveShiftTemplateId } from './shiftIntegrity'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { normalizeTimeValue } from './timeFormatUtils'

function normalizeShiftDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeScheduleArea(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

function getShiftSegments(startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return []
  if (startMinutes === endMinutes) return []

  if (endMinutes > startMinutes) {
    return [[startMinutes, endMinutes]]
  }

  return [
    [startMinutes, 1440],
    [0, endMinutes],
  ]
}

export function shiftTimesOverlap(startTimeA, endTimeA, startTimeB, endTimeB) {
  const startA = parseTimeToMinutes(normalizeTimeValue(startTimeA))
  const endA = parseTimeToMinutes(normalizeTimeValue(endTimeA))
  const startB = parseTimeToMinutes(normalizeTimeValue(startTimeB))
  const endB = parseTimeToMinutes(normalizeTimeValue(endTimeB))

  const segmentsA = getShiftSegments(startA, endA)
  const segmentsB = getShiftSegments(startB, endB)

  if (segmentsA.length === 0 || segmentsB.length === 0) {
    return false
  }

  return segmentsA.some(([segmentStartA, segmentEndA]) => (
    segmentsB.some(([segmentStartB, segmentEndB]) => (
      segmentStartA < segmentEndB && segmentEndA > segmentStartB
    ))
  ))
}

export function shiftMatchesTemplateCoverage(shift, template, dayKey) {
  if (!shift || !template) return false

  const normalizedDay = normalizeShiftDate(dayKey)
  if (!normalizedDay || normalizeShiftDate(shift.date) !== normalizedDay) {
    return false
  }

  const templateId = resolveShiftTemplateId(template)
  const shiftTemplateId = resolveShiftTemplateId(shift)
  if (templateId && shiftTemplateId && String(templateId) === String(shiftTemplateId)) {
    return true
  }

  const shiftArea = normalizeScheduleArea(shift.area)
  const templateArea = normalizeScheduleArea(template.defaultArea ?? template.default_area)
  if (!shiftArea || !templateArea || shiftArea !== templateArea) {
    return false
  }

  const templateRole = `${template.defaultRole ?? template.default_role ?? ''}`.trim()
  const shiftRole = `${shift.role ?? ''}`.trim()
  if (templateRole) {
    if (!shiftRole) return false
    if (templateRole.toLowerCase() !== shiftRole.toLowerCase()) {
      return false
    }
  }

  return shiftTimesOverlap(
    shift.startTime,
    shift.endTime,
    template.startTime,
    template.endTime,
  )
}

export function getShiftsCoveringTemplateCell(template, dayKey, shifts = []) {
  return (shifts ?? []).filter((shift) => shiftMatchesTemplateCoverage(shift, template, dayKey))
}

export function countShiftsCoveringTemplateCell(template, dayKey, shifts = []) {
  const seen = new Set()
  let count = 0

  getShiftsCoveringTemplateCell(template, dayKey, shifts).forEach((shift) => {
    const shiftId = String(shift.id ?? '')
    if (shiftId) {
      if (seen.has(shiftId)) return
      seen.add(shiftId)
    }
    count += 1
  })

  return count
}

export function formatScheduleCoverageStatusLabel({ requiredCount = 0, assignedCount = 0, hasConflict = false } = {}) {
  const needed = Number(requiredCount) || 0
  const assigned = Number(assignedCount) || 0

  if (hasConflict) {
    return { label: 'Conflict', tone: 'conflict', show: true }
  }

  if (needed > 0 && assigned < needed) {
    return { label: `Missing ${needed - assigned}`, tone: 'understaffed', show: true }
  }

  if (needed > 0 && assigned > needed) {
    return { label: `✓ Covered +${assigned - needed} extra`, tone: 'covered', show: true }
  }

  if (needed > 0 && assigned === needed) {
    return { label: '✓ Covered', tone: 'covered', show: true }
  }

  return { label: '', tone: 'empty', show: false }
}
