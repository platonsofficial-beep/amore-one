export const NOTIFICATION_NOT_NOW_MS = 7 * 24 * 60 * 60 * 1000

export const QUIET_HOUR_DEFAULTS = {
  pushEnabled: true,
  quietEnabled: true,
  quietStart: '23:00',
  quietEnd: '08:00',
  timezone: 'Europe/Nicosia',
}

export const NOTIFICATION_GROUPS = [
  {
    id: 'clockin',
    label: 'Clock-in reminders',
    detail: 'A nudge if you have not clocked in.',
    icon: '⏰',
    types: ['clockin_reminder_10', 'clockin_reminder_20'],
    managerOnly: false,
  },
  {
    id: 'timeclock_request',
    label: 'Time clock requests',
    detail: 'When someone asks to fix a clock-in or clock-out.',
    icon: '📋',
    types: ['timeclock_request'],
    managerOnly: true,
  },
  {
    id: 'late_team',
    label: 'Late team members',
    detail: 'When someone is still not clocked in 20 minutes after the shift starts.',
    icon: '⏱️',
    types: ['clockin_reminder_20_manager'],
    managerOnly: true,
  },
  {
    id: 'schedule',
    label: 'Schedule published',
    detail: 'When a new week goes out.',
    icon: '📅',
    types: ['schedule_published'],
    managerOnly: false,
  },
  {
    id: 'tasks',
    label: 'Task assigned',
    detail: 'When a task is assigned to you.',
    icon: '✓',
    types: ['task_assigned'],
    managerOnly: false,
  },
  {
    id: 'chat_message',
    label: 'Team & group chats',
    detail: 'Messages in Team and group channels.',
    icon: '💬',
    types: ['chat_message'],
    managerOnly: false,
  },
  {
    id: 'chat_direct',
    label: 'Direct messages',
    detail: 'Private messages sent to you.',
    icon: '✉️',
    types: ['chat_direct'],
    managerOnly: false,
  },
]

const VIEW_BY_TYPE = {
  clockin_reminder_10: 'clock',
  clockin_reminder_20: 'clock',
  clockin_reminder_20_manager: 'attendance',
  timeclock_request: 'attendance',
  schedule_published: 'schedule',
  task_assigned: 'tasks',
  chat_message: 'chat',
  chat_direct: 'chat',
}

const KNOWN_VIEWS = new Set(['clock', 'attendance', 'schedule', 'tasks', 'home', 'chat'])

function storageKey(prefix, userId) {
  return `${prefix}.${userId}`
}

export function urlBase64ToUint8Array(base64String) {
  const normalized = `${base64String ?? ''}`.trim()
  if (!normalized) return new Uint8Array()
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }
  return output
}

export function normalizeClockTime(value) {
  const match = `${value ?? ''}`.trim().match(/^(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : ''
}

export function readQuietHours(rows) {
  const master = (rows ?? []).find((row) => row?.type === 'all')
  return {
    pushEnabled: master ? master.push_enabled !== false : QUIET_HOUR_DEFAULTS.pushEnabled,
    quietEnabled: master ? master.quiet_enabled !== false : QUIET_HOUR_DEFAULTS.quietEnabled,
    quietStart: normalizeClockTime(master?.quiet_start) || QUIET_HOUR_DEFAULTS.quietStart,
    quietEnd: normalizeClockTime(master?.quiet_end) || QUIET_HOUR_DEFAULTS.quietEnd,
    timezone: `${master?.timezone ?? ''}`.trim() || QUIET_HOUR_DEFAULTS.timezone,
  }
}

export function isGroupPushEnabled(rows, types) {
  return (types ?? []).every((type) => {
    const row = (rows ?? []).find((entry) => entry?.type === type)
    if (!row) return true
    return row.push_enabled !== false
  })
}

export function visibleNotificationGroups(canManageAttendance) {
  return NOTIFICATION_GROUPS.filter((group) => !group.managerOnly || canManageAttendance)
}

export function readReminderDismissState(storage, userId, now = Date.now()) {
  if (!storage || !userId) return { dismissedForever: false, snoozed: false }
  const dismissedForever = storage.getItem(storageKey('one.notifications.dismissed', userId)) === '1'
  const raw = Number(storage.getItem(storageKey('one.notifications.notNowAt', userId)))
  const snoozed = Number.isFinite(raw) && raw > 0 && (now - raw) < NOTIFICATION_NOT_NOW_MS
  return { dismissedForever, snoozed }
}

export function rememberReminderNotNow(storage, userId, now = Date.now()) {
  if (!storage || !userId) return
  storage.setItem(storageKey('one.notifications.notNowAt', userId), String(now))
}

export function dismissReminderForever(storage, userId) {
  if (!storage || !userId) return
  storage.setItem(storageKey('one.notifications.dismissed', userId), '1')
}

export function shouldShowShiftReminderOffer({
  signedIn = false,
  alreadySubscribed = false,
  permission = 'default',
  dismissedForever = false,
  snoozed = false,
  iosGuide = false,
}) {
  if (!signedIn || alreadySubscribed || dismissedForever || snoozed) return false
  if (iosGuide) return true
  if (permission === 'denied' || permission === 'unsupported') return false
  return true
}

export function shouldShowIosHomeScreenGuide({ isIos = false, isStandalone = false } = {}) {
  return Boolean(isIos) && !isStandalone
}

export function notificationIcon(type) {
  if (type === 'schedule_published') return '📅'
  if (type === 'task_assigned') return '✓'
  if (type === 'timeclock_request') return '📋'
  if (type === 'clockin_reminder_20_manager') return '⏱️'
  return '⏰'
}

export function formatNotificationTimeAgo(iso, now = Date.now()) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 min ago' : `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hr ago`
  const days = Math.round(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

export function deviceLabelFromAgent(userAgent = '', deviceLabel = '') {
  const named = `${deviceLabel ?? ''}`.trim()
  if (named) return named
  const agent = `${userAgent ?? ''}`
  if (/iPhone|iPad|iPod/i.test(agent)) return 'iPhone'
  if (/Android/i.test(agent)) return 'Android'
  if (/Mac/i.test(agent)) return 'Mac'
  if (/Windows/i.test(agent)) return 'Windows'
  return 'Browser'
}

export function resolveNotificationTarget(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {}
  const requested = `${data.view || row?.view || VIEW_BY_TYPE[row?.type] || 'home'}`.trim()
  return {
    view: KNOWN_VIEWS.has(requested) ? requested : 'home',
    weekStartDate: `${data.week_start_date ?? ''}`.trim(),
    taskId: `${data.task_id ?? ''}`.trim(),
    conversationId: `${data.conversation_id ?? row?.conversation_id ?? ''}`.trim(),
    messageId: `${data.message_id ?? row?.message_id ?? ''}`.trim(),
    notificationId: `${row?.id ?? ''}`.trim(),
  }
}

export function planNotificationOpen(target, { useMobileExperience = false, isManagerMobile = false } = {}) {
  const view = target?.view || 'home'
  const weekStartDate = `${target?.weekStartDate ?? ''}`.trim()
  const taskId = `${target?.taskId ?? ''}`.trim()

  if (view === 'chat') {
    return {
      action: 'chat',
      conversationId: `${target?.conversationId ?? ''}`.trim(),
    }
  }

  if (view === 'clock') {
    if (useMobileExperience && !isManagerMobile) return { action: 'staff-clock' }
    if (useMobileExperience && isManagerMobile) return { action: 'manager-home' }
    return { action: 'today' }
  }

  if (view === 'attendance') return { action: 'attendance' }

  if (view === 'schedule') {
    return {
      action: useMobileExperience && !isManagerMobile ? 'staff-schedule' : 'workspace-schedule',
      weekStartDate,
    }
  }

  if (view === 'tasks') {
    if (useMobileExperience && !isManagerMobile) return { action: 'staff-tasks', taskId }
    if (useMobileExperience && isManagerMobile) return { action: 'manager-tasks', taskId }
    return { action: 'workspace-tasks', taskId }
  }

  if (useMobileExperience && isManagerMobile) return { action: 'manager-home' }
  if (useMobileExperience) return { action: 'staff-home' }
  return { action: 'today' }
}

export function buildNotificationOpenUrl(url, notificationId) {
  const base = `${url || '/'}`.trim() || '/'
  if (!notificationId) return base
  try {
    const parsed = new URL(base, 'https://one.local')
    parsed.searchParams.set('notif', notificationId)
    if (/^https?:/i.test(base)) return parsed.toString()
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    const joiner = base.includes('?') ? '&' : '?'
    return `${base}${joiner}notif=${encodeURIComponent(notificationId)}`
  }
}

export function readNotifIdFromSearch(search = '') {
  const params = new URLSearchParams(`${search ?? ''}`.replace(/^\?/, ''))
  return `${params.get('notif') ?? ''}`.trim()
}

export function pushSetupMessage(error) {
  const text = `${error?.message ?? ''}`.toLowerCase()
  if (!text) return 'Unable to turn on reminders right now.'
  if (text.includes('not configured') || text.includes('vapid')) {
    return 'Reminders are not ready on this app yet. You can still see them in the bell.'
  }
  if (text.includes('service worker') || text.includes('not supported') || text.includes('not active')) {
    return 'Turn reminders on from the installed ONE app. The bell still works here.'
  }
  return error.message
}

export function deniedNotificationHelp() {
  return 'Notifications are blocked in your phone settings. On iPhone, open Settings, then Notifications, then ONE, and allow them. On Android or a computer, allow notifications for this site in the browser settings.'
}
