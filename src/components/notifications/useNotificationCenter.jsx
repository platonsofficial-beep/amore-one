import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isIosDevice, isStandaloneDisplayMode } from '../../lib/pwaUtils'
import {
  dismissReminderForever,
  pushSetupMessage,
  QUIET_HOUR_DEFAULTS,
  readNotifIdFromSearch,
  readReminderDismissState,
  rememberReminderNotNow,
  shouldShowIosHomeScreenGuide,
  shouldShowShiftReminderOffer,
} from '../../lib/pushNotifications'
import {
  enableWebPush,
  fetchNotificationById,
  listNotificationPreferences,
  listNotifications,
  listPushDevices,
  markNotificationsRead,
  readCurrentPushSubscription,
  refreshExistingPushSubscription,
  subscribeToNotificationInserts,
  unregisterCurrentDevice,
  unregisterPushEndpoint,
  upsertNotificationPreference,
} from '../../services/pushNotificationService'
import { isChatNotification } from '../../lib/chat'
import { NotificationBell, NotificationSettingsPanel } from './NotificationCenter'
import { ShiftReminderCard } from './ShiftReminderCard'

function readPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission || 'default'
}

function mergeNotification(items, row) {
  if (!row?.id) return items
  const next = [row, ...items.filter((item) => item.id !== row.id)]
  next.sort((left, right) => `${right.created_at ?? ''}`.localeCompare(`${left.created_at ?? ''}`))
  return next.slice(0, 50)
}

export function useNotificationCenter({
  userId = '',
  workspaceId = '',
  canManageAttendance = false,
  timeZone = '',
  onOpen,
}) {
  const [items, setItems] = useState([])
  const [preferences, setPreferences] = useState([])
  const [devices, setDevices] = useState([])
  const [permission, setPermission] = useState(readPermission)
  const [thisDeviceEndpoint, setThisDeviceEndpoint] = useState('')
  const [offerTick, setOfferTick] = useState(0)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  const refreshLists = useCallback(async () => {
    if (!userId || !workspaceId) {
      setItems([])
      setPreferences([])
      setDevices([])
      setThisDeviceEndpoint('')
      setReady(true)
      return
    }

    const [nextItems, nextPreferences, nextDevices, subscription] = await Promise.all([
      listNotifications(workspaceId),
      listNotificationPreferences(workspaceId, userId),
      listPushDevices(userId),
      readCurrentPushSubscription().catch(() => null),
    ])
    setItems((nextItems ?? []).filter((item) => !isChatNotification(item)))
    setPreferences(nextPreferences)
    setDevices(nextDevices)
    setThisDeviceEndpoint(subscription?.endpoint || '')
    setPermission(readPermission())
    setReady(true)
  }, [userId, workspaceId])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    refreshLists().catch((error) => {
      if (!cancelled) {
        setMessage(error?.message || 'Unable to load notifications right now.')
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [refreshLists])

  useEffect(() => {
    if (!userId || !workspaceId) return undefined
    let cancelled = false
    refreshExistingPushSubscription(workspaceId)
      .then((subscription) => {
        if (!cancelled && subscription?.endpoint) setThisDeviceEndpoint(subscription.endpoint)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, workspaceId])

  useEffect(() => {
    if (!userId || !workspaceId) return undefined
    return subscribeToNotificationInserts(userId, (row) => {
      if (isChatNotification(row)) return
      if (row.workspace_id && row.workspace_id !== workspaceId) return
      setItems((current) => mergeNotification(current, row))
    })
  }, [userId, workspaceId])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
    const onMessage = (event) => {
      const payload = event.data?.type === 'one:notification-open' ? event.data.payload : null
      if (!payload) return
      onOpenRef.current?.(payload)
      if (payload.id) {
        markNotificationsRead([payload.id]).catch(() => {})
        setItems((current) => current.map((item) => (
          item.id === payload.id ? { ...item, read_at: item.read_at || new Date().toISOString() } : item
        )))
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return undefined
    const notificationId = readNotifIdFromSearch(window.location.search)
    if (!notificationId) return undefined
    let cancelled = false
    fetchNotificationById(notificationId)
      .then((row) => {
        if (cancelled || !row) return
        onOpenRef.current?.(row)
        return markNotificationsRead([row.id])
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        const url = new URL(window.location.href)
        url.searchParams.delete('notif')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      })
    return () => {
      cancelled = true
    }
  }, [userId, workspaceId])

  const dismissState = useMemo(() => {
    void offerTick
    return readReminderDismissState(
      typeof window === 'undefined' ? null : window.localStorage,
      userId,
    )
  }, [offerTick, userId])

  const iosGuide = shouldShowIosHomeScreenGuide({
    isIos: isIosDevice(),
    isStandalone: isStandaloneDisplayMode(),
  })
  const showOffer = ready && shouldShowShiftReminderOffer({
    signedIn: Boolean(userId && workspaceId),
    alreadySubscribed: Boolean(thisDeviceEndpoint),
    permission,
    dismissedForever: dismissState.dismissedForever,
    snoozed: dismissState.snoozed,
    iosGuide,
  })

  const remember = (writer) => {
    writer(typeof window === 'undefined' ? null : window.localStorage, userId)
    setOfferTick((value) => value + 1)
  }

  const turnOn = async () => {
    if (!workspaceId || busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await enableWebPush({ workspaceId, requestPermission: true })
      setPermission(result.permission || readPermission())
      if (!result.ok) {
        if (result.permission === 'denied') setMessage('')
        return
      }
      setThisDeviceEndpoint(result.subscription?.endpoint || '')
      await refreshLists()
    } catch (error) {
      setMessage(pushSetupMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const savePreferences = async (rows) => {
    if (!userId || !workspaceId) return
    setBusy(true)
    setMessage('')
    try {
      for (const row of rows) {
        await upsertNotificationPreference({
          user_id: userId,
          workspace_id: workspaceId,
          inapp_enabled: true,
          ...row,
        })
      }
      await refreshLists()
    } catch (error) {
      setMessage(error?.message || 'Unable to save notification settings right now.')
    } finally {
      setBusy(false)
    }
  }

  const onToggleGroup = (group, enabled) => {
    savePreferences(group.types.map((type) => ({ type, push_enabled: enabled })))
  }

  const onToggleMaster = (enabled) => {
    const current = preferences.find((row) => row.type === 'all')
    savePreferences([{
      type: 'all',
      push_enabled: enabled,
      quiet_enabled: current ? current.quiet_enabled !== false : QUIET_HOUR_DEFAULTS.quietEnabled,
      quiet_start: current?.quiet_start || QUIET_HOUR_DEFAULTS.quietStart,
      quiet_end: current?.quiet_end || QUIET_HOUR_DEFAULTS.quietEnd,
      timezone: current?.timezone || timeZone || QUIET_HOUR_DEFAULTS.timezone,
    }])
  }

  const onQuietChange = (next) => {
    const current = preferences.find((row) => row.type === 'all')
    savePreferences([{
      type: 'all',
      push_enabled: current ? current.push_enabled !== false : true,
      quiet_enabled: next.quietEnabled,
      quiet_start: next.quietStart || QUIET_HOUR_DEFAULTS.quietStart,
      quiet_end: next.quietEnd || QUIET_HOUR_DEFAULTS.quietEnd,
      timezone: timeZone || current?.timezone || QUIET_HOUR_DEFAULTS.timezone,
    }])
  }

  const onToggleThisDevice = async (enabled) => {
    if (!workspaceId || busy) return
    setBusy(true)
    setMessage('')
    try {
      if (!enabled) {
        await unregisterCurrentDevice()
        setThisDeviceEndpoint('')
      } else {
        const result = await enableWebPush({ workspaceId, requestPermission: true })
        setPermission(result.permission || readPermission())
        if (result.ok) setThisDeviceEndpoint(result.subscription?.endpoint || '')
      }
      await refreshLists()
    } catch (error) {
      setMessage(pushSetupMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const onDisableDevice = async (endpoint) => {
    setBusy(true)
    setMessage('')
    try {
      await unregisterPushEndpoint(endpoint)
      await refreshLists()
    } catch (error) {
      setMessage(error?.message || 'Unable to turn off that device right now.')
    } finally {
      setBusy(false)
    }
  }

  const markRead = async (ids) => {
    const stamp = new Date().toISOString()
    setItems((current) => current.map((item) => (
      ids?.includes(item.id) ? { ...item, read_at: item.read_at || stamp } : item
    )))
    try {
      await markNotificationsRead(ids)
    } catch (error) {
      setMessage(error?.message || 'Unable to mark that as read right now.')
    }
  }

  const markAll = async () => {
    const stamp = new Date().toISOString()
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || stamp })))
    try {
      await markNotificationsRead(null)
    } catch (error) {
      setMessage(error?.message || 'Unable to mark notifications as read right now.')
    }
  }

  const bell = (
    <NotificationBell
      items={items}
      onMarkRead={markRead}
      onMarkAll={markAll}
      onOpen={(item) => onOpenRef.current?.(item)}
    />
  )

  const reminderCard = showOffer ? (
    <ShiftReminderCard
      mode={iosGuide ? 'ios-guide' : 'opt-in'}
      busy={busy}
      message={message}
      onTurnOn={turnOn}
      onNotNow={() => remember(rememberReminderNotNow)}
      onDismissForever={() => remember(dismissReminderForever)}
    />
  ) : null

  const settingsPanel = (
    <NotificationSettingsPanel
      canManageAttendance={canManageAttendance}
      preferences={preferences}
      permission={permission}
      devices={devices}
      thisDeviceEndpoint={thisDeviceEndpoint}
      thisDeviceOn={Boolean(thisDeviceEndpoint)}
      busy={busy}
      message={message}
      onToggleGroup={onToggleGroup}
      onToggleMaster={onToggleMaster}
      onQuietChange={onQuietChange}
      onToggleThisDevice={onToggleThisDevice}
      onDisableDevice={onDisableDevice}
    />
  )

  return { bell, reminderCard, settingsPanel }
}
