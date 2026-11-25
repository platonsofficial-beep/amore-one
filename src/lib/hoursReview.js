import { actualWorkedMinutes, dateKeyInZone, entryReviewStatus, formatHoursMinutes } from './attendance'

export function reviewDateKey(value, timeZone = '') {
  const text = `${value ?? ''}`
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  return dateKeyInZone(value, timeZone)
}

export function monthKey(now = new Date(), timeZone = '') {
  return reviewDateKey(now, timeZone).slice(0, 7)
}

export function monthBounds(month = '') {
  const match = /^(\d{4})-(\d{2})$/.exec(`${month ?? ''}`)
  if (!match) return { fromDate: '', toDate: '' }
  const year = Number(match[1])
  const monthIndex = Number(match[2])
  const last = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  const mm = match[2]
  return {
    fromDate: `${year}-${mm}-01`,
    toDate: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  }
}

export function weekBounds(now = new Date(), timeZone = '') {
  const key = reviewDateKey(now, timeZone)
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  const start = new Date(date)
  start.setUTCDate(date.getUTCDate() + mondayOffset)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const format = (value) => value.toISOString().slice(0, 10)
  return { fromDate: format(start), toDate: format(end) }
}

export function reviewRangeBounds({
  range = 'today',
  now = new Date(),
  timeZone = '',
  customFrom = '',
  customTo = '',
  month = '',
} = {}) {
  const today = reviewDateKey(now, timeZone)
  if (range === 'week') return weekBounds(now, timeZone)
  if (range === 'month') return monthBounds(month || monthKey(now, timeZone))
  if (range === 'custom') {
    return {
      fromDate: `${customFrom || today}`.slice(0, 10),
      toDate: `${customTo || customFrom || today}`.slice(0, 10),
    }
  }
  return { fromDate: today, toDate: today }
}

export function entryInReviewRange(entry, fromDate, toDate) {
  const key = `${entry?.work_date ?? entry?.clock_in_at ?? ''}`.slice(0, 10)
  if (!key || !fromDate || !toDate) return false
  return key >= fromDate && key <= toDate
}

export function filterReviewEntries(entries, { status = 'pending', fromDate = '', toDate = '' } = {}) {
  return (entries ?? []).filter((entry) => {
    if (!entryInReviewRange(entry, fromDate, toDate)) return false
    if (status === 'all') return true
    return entryReviewStatus(entry) === status
  })
}

export function groupReviewDays(entries) {
  const groups = new Map()
  for (const entry of entries ?? []) {
    const key = `${entry?.work_date ?? entry?.clock_in_at ?? ''}`.slice(0, 10)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return [...groups.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, rows]) => ({
      date,
      rows,
      pending: rows.filter((entry) => entryReviewStatus(entry) === 'pending').length,
    }))
}

export function pendingReviewCount(entries) {
  return (entries ?? []).filter((entry) => entryReviewStatus(entry) === 'pending').length
}

export function isUnscheduledEntry(entry) {
  if (entry?.is_unscheduled === true) return true
  if (entry?.is_unscheduled === false) return false
  return !entry?.shift_id
}

export function scheduledEntryIds(entries, { actorMemberId = '', isOwner = false } = {}) {
  return (entries ?? []).filter((entry) => {
    if (entryReviewStatus(entry) !== 'pending' || !entry?.clock_out_at) return false
    if (isUnscheduledEntry(entry)) return false
    const own = `${entry?.member_id ?? ''}` && `${entry.member_id}` === `${actorMemberId}`
    if (own && !isOwner) return false
    return true
  }).map((entry) => entry.id)
}

export function monthPersonRows(entries, breaksByEntryId = {}, now = new Date()) {
  const people = new Map()
  for (const entry of entries ?? []) {
    if (!entry?.clock_out_at) continue
    const status = entryReviewStatus(entry)
    if (status === 'declined') continue
    const key = `${entry.employee_id ?? entry.member_id ?? entry.id}`
    const current = people.get(key) ?? {
      id: key,
      name: `${entry.personName ?? entry.member?.display_name ?? ''}`.trim() || 'Team member',
      approved: 0,
      waiting: 0,
    }
    const minutes = actualWorkedMinutes(entry, breaksByEntryId[entry.id] ?? [], now)
    if (status === 'approved') current.approved += minutes
    if (status === 'pending') current.waiting += minutes
    people.set(key, current)
  }
  return [...people.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function approvedHoursCsv(entries, { breaksByEntryId = {}, now = new Date() } = {}) {
  const lines = ['Person,Date,Clock in,Clock out,Hours,Unscheduled']
  for (const entry of entries ?? []) {
    if (entryReviewStatus(entry) !== 'approved' || !entry?.clock_out_at) continue
    const minutes = actualWorkedMinutes(entry, breaksByEntryId[entry.id] ?? [], now)
    const name = `${entry.personName ?? ''}`.replaceAll('"', '""')
    const date = `${entry.work_date ?? ''}`.slice(0, 10)
    const clockIn = entry.clockInLabel || ''
    const clockOut = entry.clockOutLabel || ''
    lines.push(`"${name}",${date},${clockIn},${clockOut},${formatHoursMinutes(minutes)},${entry.is_unscheduled ? 'yes' : 'no'}`)
  }
  return lines.join('\n')
}

export { entryReviewStatus }
