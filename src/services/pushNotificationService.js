import { supabase } from '../lib/supabaseClient'
import { urlBase64ToUint8Array } from '../lib/pushNotifications'

const NOTIFICATION_COLUMNS = 'id,type,title,body,url,data,created_at,read_at'
const PREFERENCE_COLUMNS = 'type,push_enabled,inapp_enabled,quiet_enabled,quiet_start,quiet_end,timezone'
const DEVICE_COLUMNS = 'id,endpoint,user_agent,device_label,kind,created_at,last_seen_at,disabled_at'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function getActivePushRegistration(timeoutMs = 8000) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    throw new Error('Push is not supported in this browser.')
  }

  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Service worker is not active yet.')), timeoutMs)
  })

  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function readCurrentPushSubscription() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistration) return null
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.pushManager) return null
  return registration.pushManager.getSubscription()
}

export async function registerPushSubscription({ workspaceId, subscription }) {
  const client = requireClient()
  const json = subscription?.toJSON?.() ?? {}
  const endpoint = `${json.endpoint ?? subscription?.endpoint ?? ''}`.trim()
  const keys = json.keys ?? {}
  if (!workspaceId || !endpoint || !keys.p256dh || !keys.auth) {
    throw new Error('This device could not create a push subscription.')
  }

  const { data, error } = await client.rpc('register_push_subscription', {
    p_workspace_id: workspaceId,
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    p_device_label: null,
    p_kind: 'webpush',
  })

  if (error) throw error
  return data
}

export async function enableWebPush({ workspaceId, requestPermission = true }) {
  const publicKey = `${import.meta.env?.VITE_VAPID_PUBLIC_KEY ?? ''}`.trim()
  if (!publicKey) throw new Error('Push is not configured on this app yet.')
  if (typeof Notification === 'undefined' || typeof window === 'undefined' || !('PushManager' in window)) {
    throw new Error('Push is not supported in this browser.')
  }

  let permission = Notification.permission
  if (permission === 'denied') return { ok: false, permission: 'denied', subscription: null }
  if (permission !== 'granted') {
    if (!requestPermission) return { ok: false, permission, subscription: null }
    permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, permission, subscription: null }
  }

  const registration = await getActivePushRegistration()
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const id = await registerPushSubscription({ workspaceId, subscription })
  return { ok: true, permission: 'granted', subscription, id }
}

export async function refreshExistingPushSubscription(workspaceId) {
  const subscription = await readCurrentPushSubscription()
  if (!subscription || !workspaceId) return null
  await registerPushSubscription({ workspaceId, subscription })
  return subscription
}

export async function unregisterPushEndpoint(endpoint) {
  const normalized = `${endpoint ?? ''}`.trim()
  if (!normalized || !supabase) return
  const { error } = await supabase.rpc('unregister_push_subscription', { p_endpoint: normalized })
  if (error) throw error
}

export async function unregisterCurrentDevice() {
  try {
    const subscription = await readCurrentPushSubscription()
    if (!subscription) return
    const endpoint = subscription.endpoint
    if (endpoint) {
      try {
        await unregisterPushEndpoint(endpoint)
      } catch (error) {
        console.warn('[push] unregister failed:', error)
      }
    }
    await subscription.unsubscribe()
  } catch (error) {
    console.warn('[push] device unsubscribe failed:', error)
  }
}

export async function listNotifications(workspaceId) {
  const client = requireClient()
  const { data, error } = await client
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data ?? []
}

export async function fetchNotificationById(notificationId) {
  const client = requireClient()
  const { data, error } = await client
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('id', notificationId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function markNotificationsRead(ids) {
  const client = requireClient()
  const { data, error } = await client.rpc('mark_notifications_read', {
    p_ids: ids ?? null,
  })
  if (error) throw error
  return data
}

export async function listNotificationPreferences(workspaceId, userId) {
  const client = requireClient()
  const { data, error } = await client
    .from('notification_preferences')
    .select(PREFERENCE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  if (error) throw error
  return data ?? []
}

export async function upsertNotificationPreference(row) {
  const client = requireClient()
  const { error } = await client.from('notification_preferences').upsert(row)
  if (error) throw error
}

export async function listPushDevices(userId) {
  const client = requireClient()
  const { data, error } = await client
    .from('push_subscriptions')
    .select(DEVICE_COLUMNS)
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export function subscribeToNotificationInserts(userId, onInsert) {
  if (!supabase || !userId || typeof onInsert !== 'function') return () => {}

  const channel = supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (payload?.new) onInsert(payload.new)
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
