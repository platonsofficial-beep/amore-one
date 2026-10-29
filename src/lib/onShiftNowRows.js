import {
  DEFAULT_LATE_GRACE_MINUTES,
  actualWorkedMinutes,
  breakMinutes,
  dateKeyInZone,
  formatClockTime,
  formatHoursMinutes,
  indexBreaksByEntry,
  isOpenBreak,
  isOpenEntry,
} from './attendance'
import { getWorkspaceNowMinutes } from './employeeTodayStatusUtils'
import { buildShiftDisplayNames, lookupShiftDisplayName } from './shiftDisplayName'

export const ON_SHIFT_SORTS = ['shift', 'department', 'name']

// ONE's own muted jewel tones, picked by a stable hash of the group name.
const GROUP_TONES = ['gold', 'teal', 'rose', 'violet', 'copper', 'sage', 'sky', 'amber']

function clean(value) {
  return `${value ?? ''}`.trim()
}

function hhmm(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
}

function toMinutes(label) {
  const match = `${label ?? ''}`.match(/^(\d{2}):(\d{2})$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function onShiftGroupTone(name = '') {
  const text = clean(name).toLowerCase()
  if (!text) return 'muted'
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0
  return GROUP_TONES[hash % GROUP_TONES.length]
}

function employeePosition(employee, shift) {
  const direct = clean(employee?.position)
  if (direct) return direct
  if (Array.isArray(employee?.positions)) {
    const first = employee.positions.map((item) => clean(item?.name ?? item)).find(Boolean)
    if (first) return first
  }
  return clean(shift?.role)
}

function shiftTimes(shift) {
  const start = hhmm(shift?.startTime ?? shift?.start_time)
  const end = hhmm(shift?.endTime ?? shift?.end_time)
  return { start, end, label: start ? (end ? `${start}–${end}` : start) : '' }
}

function minutesOfDayInZone(isoValue, timeZone) {
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return null
  return getWorkspaceNowMinutes(date, timeZone).minutes ?? (date.getHours() * 60 + date.getMinutes())
}

function personBase(employee, employeeId, labels, shift) {
  const fullName = clean(employee?.name ?? employee?.full_name ?? employee?.fullName)
  const times = shiftTimes(shift)
  return {
    employeeId,
    name: fullName ? lookupShiftDisplayName(labels, employeeId, fullName) : 'Μέλος ομάδας',
    fullName: fullName || 'Μέλος ομάδας',
    department: clean(employee?.department) || clean(shift?.area),
    position: employeePosition(employee, shift),
    shiftStart: times.start,
    shiftEnd: times.end,
    scheduledLabel: times.label || 'Χωρίς βάρδια',
    isScheduled: Boolean(times.start),
  }
}

/**
 * Data for the Today "On shift" sheet. Uses only rows the viewer already
 * loaded (attendance entries pass through RLS; employees and published
 * shifts are the viewer's existing lists).
 */
export function buildOnShiftBoard({
  entries = [],
  breaks = [],
  employees = [],
  todayShifts = [],
  now = new Date(),
  timeZone = '',
  graceMinutes = DEFAULT_LATE_GRACE_MINUTES,
} = {}) {
  const employeesById = new Map((employees ?? []).map((employee) => [clean(employee?.id), employee]))
  const labels = buildShiftDisplayNames(employees ?? [])
  const breaksByEntry = indexBreaksByEntry(breaks ?? [])
  const todayKey = dateKeyInZone(now, timeZone)
  const nowMinutes = getWorkspaceNowMinutes(now, timeZone).minutes ?? (now.getHours() * 60 + now.getMinutes())

  const shiftsByEmployee = new Map()
  for (const shift of todayShifts ?? []) {
    const key = clean(shift?.employeeId ?? shift?.employee_id)
    if (!key) continue
    const list = shiftsByEmployee.get(key) ?? []
    list.push(shift)
    shiftsByEmployee.set(key, list)
  }

  const inNow = []
  const seenIn = new Set()
  const touchedToday = new Set()
  for (const entry of entries ?? []) {
    const employeeId = clean(entry?.employee_id)
    if (employeeId && (isOpenEntry(entry) || clean(entry?.work_date).slice(0, 10) === todayKey)) {
      touchedToday.add(employeeId)
    }
    if (!isOpenEntry(entry) || !entry?.clock_in_at) continue
    const personKey = employeeId || clean(entry.member_id) || clean(entry.id)
    if (seenIn.has(personKey)) continue
    seenIn.add(personKey)

    const shifts = shiftsByEmployee.get(employeeId) ?? []
    const shift = shifts.find((item) => clean(item?.id) === clean(entry.shift_id)) ?? shifts[0] ?? null
    const entryBreaks = breaksByEntry[entry.id] ?? []
    const base = personBase(employeesById.get(employeeId), employeeId, labels, shift)
    const startMin = toMinutes(base.shiftStart)
    const inMin = minutesOfDayInZone(entry.clock_in_at, timeZone)
    let arrival = null
    if (entry.is_late && Number(entry.late_minutes) > 0) {
      arrival = { kind: 'late', minutes: Number(entry.late_minutes) }
    } else if (startMin !== null && inMin !== null && startMin - inMin >= 5 && startMin - inMin < 6 * 60) {
      arrival = { kind: 'early', minutes: startMin - inMin }
    }

    inNow.push({
      ...base,
      id: clean(entry.id),
      memberId: clean(entry.member_id),
      status: 'in',
      clockInAt: entry.clock_in_at,
      clockInLabel: formatClockTime(entry.clock_in_at, timeZone),
      workedMinutes: actualWorkedMinutes(entry, entryBreaks, now),
      workedLabel: formatHoursMinutes(actualWorkedMinutes(entry, entryBreaks, now)),
      breakCount: entryBreaks.length,
      breakLabel: formatHoursMinutes(breakMinutes(entryBreaks, now)),
      onBreak: entryBreaks.some((item) => isOpenBreak(item)),
      arrival,
    })
  }

  const notIn = []
  for (const [employeeId, shifts] of shiftsByEmployee) {
    if (touchedToday.has(employeeId)) continue
    const sorted = [...shifts].sort((a, b) => (toMinutes(shiftTimes(a).start) ?? 0) - (toMinutes(shiftTimes(b).start) ?? 0))
    const shift = sorted[0]
    const base = personBase(employeesById.get(employeeId), employeeId, labels, shift)
    const startMin = toMinutes(base.shiftStart)
    const lateBy = startMin === null ? 0 : nowMinutes - startMin
    notIn.push({
      ...base,
      id: `shift-${clean(shift?.id) || employeeId}`,
      memberId: '',
      status: lateBy > graceMinutes ? 'late' : 'upcoming',
      lateMinutes: lateBy > graceMinutes ? lateBy : 0,
      startsInMinutes: lateBy < 0 ? -lateBy : 0,
    })
  }

  return {
    inNow,
    notIn,
    counts: {
      inNow: inNow.length,
      onBreak: inNow.filter((row) => row.onBreak).length,
      notIn: notIn.length,
      late: notIn.filter((row) => row.status === 'late').length,
    },
  }
}

function compareShift(a, b) {
  const left = toMinutes(a.shiftStart)
  const right = toMinutes(b.shiftStart)
  if (left === null && right !== null) return 1
  if (right === null && left !== null) return -1
  return (left ?? 0) - (right ?? 0) || a.name.localeCompare(b.name, 'el')
}

/** Groups rows for display: by department then position, by shift time, or a flat A–Z list. */
export function groupOnShiftRows(rows = [], sort = 'shift') {
  if (sort === 'name') {
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'el'))
    return sorted.length ? [{ key: 'all', title: 'Όλοι', subtitle: '', tone: 'gold', rows: sorted }] : []
  }

  const groups = new Map()
  for (const row of rows) {
    const key = sort === 'department'
      ? `${row.department || '—'}|${row.position || '—'}`
      : `${row.shiftStart || 'zz'}|${row.shiftEnd}|${row.position || '—'}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: sort === 'department'
          ? [row.department, row.position].filter(Boolean).join(' · ') || 'Χωρίς τμήμα'
          : row.position || row.department || 'Χωρίς πόστο',
        subtitle: sort === 'department'
          ? ''
          : row.isScheduled ? row.scheduledLabel : 'Χωρίς βάρδια',
        tone: onShiftGroupTone(row.department || row.position),
        rows: [],
      })
    }
    groups.get(key).rows.push(row)
  }

  const list = [...groups.values()]
  list.forEach((group) => group.rows.sort(compareShift))
  if (sort === 'department') {
    return list.sort((a, b) => a.title.localeCompare(b.title, 'el'))
  }
  return list.sort((a, b) => compareShift(a.rows[0], b.rows[0]) || a.title.localeCompare(b.title, 'el'))
}
