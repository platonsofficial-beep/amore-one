import {
  formatTimestampDateTime24,
  formatTimestampTime24,
  splitDateTimeLocalValue,
  toDateTimeLocalValue,
} from './timeFormatUtils'
import { getCurrentDateKey } from './currentDateUtils'

export const ANNOUNCEMENT_PRIORITIES = ['normal', 'important', 'urgent']
export const ANNOUNCEMENT_AUDIENCES = ['all', 'bar', 'service', 'kitchen', 'managers']

const PRIORITY_LABELS = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
}

const PRIORITY_TONES = {
  normal: 'default',
  important: 'warning',
  urgent: 'danger',
}

const PRIORITY_WEIGHT = {
  urgent: 3,
  important: 2,
  normal: 1,
}

const AUDIENCE_LABELS = {
  all: 'All staff',
  bar: 'Bar',
  service: 'Service',
  kitchen: 'Kitchen',
  managers: 'Managers',
}

const MANAGER_ROLES = new Set(['owner', 'general_manager', 'manager'])

export function normalizeAnnouncementPriority(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return ANNOUNCEMENT_PRIORITIES.includes(normalized) ? normalized : 'normal'
}

export function normalizeAnnouncementAudience(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return ANNOUNCEMENT_AUDIENCES.includes(normalized) ? normalized : 'all'
}

export function getAnnouncementPriorityLabel(priority) {
  return PRIORITY_LABELS[normalizeAnnouncementPriority(priority)] ?? 'Normal'
}

export function getAnnouncementPriorityTone(priority) {
  return PRIORITY_TONES[normalizeAnnouncementPriority(priority)] ?? 'default'
}

export function getAnnouncementAudienceLabel(audience) {
  return AUDIENCE_LABELS[normalizeAnnouncementAudience(audience)] ?? 'All staff'
}

export function isManagerRole(role) {
  return MANAGER_ROLES.has(`${role ?? ''}`.trim())
}

export function canManageAnnouncements(role) {
  return isManagerRole(role)
}

export function matchesAnnouncementAudience(audience, { role = '', employeeDepartment = '' } = {}) {
  const normalizedAudience = normalizeAnnouncementAudience(audience)
  if (normalizedAudience === 'all') return true
  if (isManagerRole(role)) return true
  if (normalizedAudience === 'managers') return false

  const department = `${employeeDepartment ?? ''}`.trim().toLowerCase()
  if (normalizedAudience === 'bar') return department.includes('bar')
  if (normalizedAudience === 'service') {
    return department.includes('service') || department.includes('waiter') || department.includes('host')
  }
  if (normalizedAudience === 'kitchen') {
    return department.includes('kitchen') || department.includes('chef') || department.includes('cook')
  }
  return true
}

export function isAnnouncementCurrentlyActive(announcement, now = new Date()) {
  if (announcement?.active === false) return false
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (Number.isNaN(currentTime)) return announcement?.active !== false

  const startsAt = announcement?.startsAt ? new Date(announcement.startsAt).getTime() : null
  const endsAt = announcement?.endsAt ? new Date(announcement.endsAt).getTime() : null

  if (startsAt && !Number.isNaN(startsAt) && currentTime < startsAt) return false
  if (endsAt && !Number.isNaN(endsAt) && currentTime > endsAt) return false
  return true
}

export function formatAnnouncementScheduleLabel(announcement) {
  const value = announcement?.startsAt ?? announcement?.endsAt ?? announcement?.createdAt
  return formatTimestampDateTime24(value, { weekday: true })
}

export function formatAnnouncementCardTime(value, todayKey = getCurrentDateKey()) {
  return formatAnnouncementCardDateTime(value, todayKey)
}

export function formatAnnouncementAuthorName(announcement) {
  return `${announcement?.createdByName ?? 'Manager'}`.trim() || 'Manager'
}

export function formatAnnouncementPostedWhen(value, todayKey = getCurrentDateKey()) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const timeLabel = formatTimestampTime24(value, '')
  if (!timeLabel) return '—'

  if (getCurrentDateKey(date) === todayKey) {
    return `Today ${timeLabel}`
  }

  const dayLabel = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date)

  return `${dayLabel} ${timeLabel}`
}

export function formatAnnouncementCardDateTime(value, todayKey = getCurrentDateKey()) {
  return formatAnnouncementPostedWhen(value, todayKey)
}

export function formatAnnouncementCardFooterLine(announcement, todayKey = getCurrentDateKey()) {
  const author = formatAnnouncementAuthorName(announcement)
  const when = formatAnnouncementPostedWhen(announcement?.createdAt, todayKey)
  if (!when || when === '—') return author
  return `${author} · ${when}`
}

export function formatAnnouncementAuthorMeta(announcement, todayKey = getCurrentDateKey()) {
  return formatAnnouncementCardFooterLine(announcement, todayKey)
}

export function truncateAnnouncementMessage(message, maxLength = 120) {
  const value = `${message ?? ''}`.trim()
  if (!value) return ''
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

export function buildEmptyAnnouncementForm() {
  return {
    title: '',
    message: '',
    priority: 'normal',
    audience: 'all',
    active: true,
    startsAtDate: '',
    startsAtTime: '',
    endsAtDate: '',
    endsAtTime: '',
  }
}

export function hasAdvancedAnnouncementOptions(announcement) {
  if (!announcement) return false
  return normalizeAnnouncementAudience(announcement.audience) !== 'all'
    || Boolean(announcement.startsAt)
    || Boolean(announcement.endsAt)
}

function normalizeComparableTitle(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

export function isAnnouncementDuplicateTask(task, announcements = []) {
  const taskTitle = normalizeComparableTitle(task?.title ?? task?.name)
  if (!taskTitle) return false

  return (announcements ?? []).some((announcement) => (
    normalizeComparableTitle(announcement?.title) === taskTitle
  ))
}

export function filterTasksExcludingAnnouncementDuplicates(tasks = [], announcements = []) {
  if (!Array.isArray(tasks) || tasks.length === 0) return []
  if (!Array.isArray(announcements) || announcements.length === 0) return tasks

  return tasks.filter((task) => !isAnnouncementDuplicateTask(task, announcements))
}

export function announcementToForm(announcement) {
  const starts = splitDateTimeLocalValue(toDateTimeLocalValue(announcement?.startsAt))
  const ends = splitDateTimeLocalValue(toDateTimeLocalValue(announcement?.endsAt))

  return {
    title: announcement?.title ?? '',
    message: announcement?.message ?? '',
    priority: normalizeAnnouncementPriority(announcement?.priority),
    audience: normalizeAnnouncementAudience(announcement?.audience),
    active: announcement?.active !== false,
    startsAtDate: starts.date,
    startsAtTime: starts.time,
    endsAtDate: ends.date,
    endsAtTime: ends.time,
  }
}

export function validateAnnouncementForm(form) {
  if (!`${form.title ?? ''}`.trim()) {
    return 'Please enter a title.'
  }
  if (!`${form.message ?? ''}`.trim()) {
    return 'Please enter a message.'
  }
  return ''
}

export function sortAnnouncementsForDisplay(announcements = []) {
  return [...(announcements ?? [])].sort((left, right) => {
    const leftWeight = PRIORITY_WEIGHT[normalizeAnnouncementPriority(left.priority)] ?? 0
    const rightWeight = PRIORITY_WEIGHT[normalizeAnnouncementPriority(right.priority)] ?? 0
    if (leftWeight !== rightWeight) return rightWeight - leftWeight

    const leftTime = new Date(left.startsAt ?? left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.startsAt ?? right.createdAt ?? 0).getTime()
    return rightTime - leftTime
  })
}

export function filterAnnouncementsForUser(
  announcements = [],
  {
    role = '',
    employeeDepartment = '',
    includeInactive = false,
    unreadOnly = false,
    now = new Date(),
  } = {},
) {
  return sortAnnouncementsForDisplay(announcements).filter((announcement) => {
    if (!includeInactive && !isAnnouncementCurrentlyActive(announcement, now)) return false
    if (!matchesAnnouncementAudience(announcement.audience, { role, employeeDepartment })) return false
    if (unreadOnly && announcement.isRead) return false
    return true
  })
}

export function countEligibleAudienceMembers(members = [], audience = 'all') {
  const normalizedAudience = normalizeAnnouncementAudience(audience)
  if (normalizedAudience === 'all') return members.length
  if (normalizedAudience === 'managers') {
    return members.filter((member) => isManagerRole(member.role)).length
  }
  return members.filter((member) => (
    matchesAnnouncementAudience(normalizedAudience, {
      role: member.role,
      employeeDepartment: member.employeeDepartment ?? '',
    })
  )).length
}

export function formatAnnouncementSeenLabel(readCount = 0, eligibleCount = 0) {
  const seen = Number(readCount) || 0
  const eligible = Number(eligibleCount) || 0
  if (eligible > 0) return `Seen ${seen}/${eligible}`
  if (seen > 0) return `Seen ${seen}`
  return 'Not seen yet'
}
