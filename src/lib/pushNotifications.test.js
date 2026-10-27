import { describe, expect, it } from 'vitest'
import {
  buildNotificationOpenUrl,
  deviceLabelFromAgent,
  formatNotificationTimeAgo,
  isGroupPushEnabled,
  NOTIFICATION_NOT_NOW_MS,
  planNotificationOpen,
  readNotifIdFromSearch,
  readQuietHours,
  readReminderDismissState,
  rememberReminderNotNow,
  resolveNotificationTarget,
  shouldShowIosHomeScreenGuide,
  shouldShowShiftReminderOffer,
  urlBase64ToUint8Array,
  visibleNotificationGroups,
} from './pushNotifications'

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  }
}

describe('push notification helpers', () => {
  it('converts a base64url VAPID key into bytes', () => {
    const bytes = urlBase64ToUint8Array('AQIDBA')
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4])
  })

  it('treats a missing preference row as on, and reads quiet hours only from type all', () => {
    expect(readQuietHours([])).toMatchObject({
      pushEnabled: true,
      quietEnabled: true,
      quietStart: '23:00',
      quietEnd: '08:00',
      timezone: 'Europe/Nicosia',
    })
    expect(readQuietHours([
      { type: 'all', push_enabled: false, quiet_enabled: true, quiet_start: '22:15:00', quiet_end: '07:00:00', timezone: 'Asia/Nicosia' },
      { type: 'task_assigned', quiet_start: '01:00' },
    ])).toMatchObject({
      pushEnabled: false,
      quietStart: '22:15',
      quietEnd: '07:00',
      timezone: 'Asia/Nicosia',
    })
  })

  it('groups clock-in reminders and hides manager types from staff', () => {
    const rows = [{ type: 'clockin_reminder_10', push_enabled: false }]
    const clockin = visibleNotificationGroups(false).find((group) => group.id === 'clockin')
    expect(clockin.types).toEqual(['clockin_reminder_10', 'clockin_reminder_20'])
    expect(isGroupPushEnabled(rows, clockin.types)).toBe(false)
    expect(isGroupPushEnabled([], clockin.types)).toBe(true)
    expect(visibleNotificationGroups(false).map((group) => group.id)).toEqual([
      'clockin',
      'schedule',
      'tasks',
      'chat_message',
      'chat_direct',
    ])
    expect(visibleNotificationGroups(true).map((group) => group.id)).toContain('timeclock_request')
    expect(visibleNotificationGroups(true).map((group) => group.id)).toContain('late_team')
  })

  it('remembers Not now for 7 days and can dismiss the card for good', () => {
    const storage = memoryStorage()
    const now = Date.parse('2026-10-27T10:00:00Z')
    rememberReminderNotNow(storage, 'user-1', now)
    expect(readReminderDismissState(storage, 'user-1', now + NOTIFICATION_NOT_NOW_MS - 1000).snoozed).toBe(true)
    expect(readReminderDismissState(storage, 'user-1', now + NOTIFICATION_NOT_NOW_MS + 1000).snoozed).toBe(false)
    expect(readReminderDismissState(storage, 'user-2', now).snoozed).toBe(false)
    storage.setItem('one.notifications.dismissed.user-1', '1')
    expect(readReminderDismissState(storage, 'user-1', now).dismissedForever).toBe(true)
  })

  it('offers the card only before permission, and the iPhone guide when the app is not installed', () => {
    expect(shouldShowShiftReminderOffer({ signedIn: true, permission: 'default' })).toBe(true)
    expect(shouldShowShiftReminderOffer({ signedIn: true, permission: 'denied' })).toBe(false)
    expect(shouldShowShiftReminderOffer({ signedIn: true, alreadySubscribed: true })).toBe(false)
    expect(shouldShowShiftReminderOffer({ signedIn: true, snoozed: true })).toBe(false)
    expect(shouldShowShiftReminderOffer({
      signedIn: true,
      permission: 'unsupported',
      iosGuide: true,
    })).toBe(true)
    expect(shouldShowIosHomeScreenGuide({ isIos: true, isStandalone: false })).toBe(true)
    expect(shouldShowIosHomeScreenGuide({ isIos: true, isStandalone: true })).toBe(false)
    expect(shouldShowIosHomeScreenGuide({ isIos: false, isStandalone: false })).toBe(false)
  })

  it('maps payload views, including attendance to the manager time clock plan', () => {
    expect(resolveNotificationTarget({
      id: 'n1',
      type: 'clockin_reminder_10',
      data: { view: 'clock', shift_id: 's1' },
    })).toMatchObject({ view: 'clock', notificationId: 'n1' })

    expect(resolveNotificationTarget({
      type: 'schedule_published',
      data: { view: 'schedule', week_start_date: '2026-10-26' },
    })).toMatchObject({ view: 'schedule', weekStartDate: '2026-10-26' })

    expect(resolveNotificationTarget({
      type: 'task_assigned',
      data: { view: 'tasks', task_id: 'task-1' },
    }).taskId).toBe('task-1')

    expect(resolveNotificationTarget({ type: 'timeclock_request', data: { view: 'attendance' } }).view).toBe('attendance')
    expect(resolveNotificationTarget({ type: 'clockin_reminder_20' }).view).toBe('clock')
    expect(resolveNotificationTarget({ type: 'clockin_reminder_20_manager' }).view).toBe('attendance')

    expect(planNotificationOpen({ view: 'attendance' }, { useMobileExperience: true, isManagerMobile: true }).action).toBe('attendance')
    expect(planNotificationOpen({ view: 'clock' }, { useMobileExperience: true, isManagerMobile: false }).action).toBe('staff-clock')
    expect(planNotificationOpen({ view: 'clock' }, { useMobileExperience: false }).action).toBe('today')
    expect(planNotificationOpen({ view: 'schedule', weekStartDate: '2026-10-26' }, { useMobileExperience: true, isManagerMobile: true })).toMatchObject({
      action: 'workspace-schedule',
      weekStartDate: '2026-10-26',
    })
    expect(planNotificationOpen({ view: 'tasks', taskId: 'task-1' }, { useMobileExperience: true, isManagerMobile: false }).action).toBe('staff-tasks')
    expect(planNotificationOpen({ view: 'home' }, { useMobileExperience: true, isManagerMobile: true }).action).toBe('manager-home')
    expect(resolveNotificationTarget({
      type: 'chat_direct',
      data: { view: 'chat', conversation_id: 'conv-1', message_id: 'msg-1' },
    })).toMatchObject({ view: 'chat', conversationId: 'conv-1', messageId: 'msg-1' })
    expect(planNotificationOpen({ view: 'chat', conversationId: 'conv-1' }).action).toBe('chat')
    expect(visibleNotificationGroups(false).find((group) => group.id === 'chat_message').label).toBe('Team & group chats')
    expect(visibleNotificationGroups(false).find((group) => group.id === 'chat_direct').label).toBe('Direct messages')
  })

  it('builds the open url and reads the notif id', () => {
    expect(buildNotificationOpenUrl('/', 'abc')).toBe('/?notif=abc')
    expect(buildNotificationOpenUrl('/team?week=1', 'abc')).toBe('/team?week=1&notif=abc')
    expect(readNotifIdFromSearch('?notif=abc&x=1')).toBe('abc')
    expect(deviceLabelFromAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('iPhone')
    expect(formatNotificationTimeAgo('2026-10-27T09:00:00Z', Date.parse('2026-10-27T10:00:00Z'))).toBe('1 hr ago')
  })
})
