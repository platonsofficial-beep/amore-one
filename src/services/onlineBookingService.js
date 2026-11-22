import { normalizeOnlineBookingSettings, slugifyVenueName } from '../lib/onlineBooking'
import { supabase } from '../lib/supabaseClient'

const TABLE = 'workspace_online_booking'
const STORAGE_KEY = 'one.onlineBooking.v1'

function readAll() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocal(workspaceId, settings) {
  if (typeof localStorage === 'undefined') return
  const all = readAll()
  all[workspaceId] = settings
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

function isMissingTableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find the table')
}

function toRow(workspaceId, settings) {
  return {
    workspace_id: workspaceId,
    enabled: settings.enabled,
    slug: settings.slug,
    confirmation_method: settings.confirmationMethod,
    email_confirm_hours: settings.emailConfirmHours,
    max_party_size: settings.maxPartySize,
    booking_window_days: settings.bookingWindowDays,
    min_notice_minutes: settings.minNoticeMinutes,
    venue_phone: settings.venuePhone,
    daily_online_covers: settings.dailyOnlineCovers,
  }
}

function withoutDaily(row) {
  const next = { ...row }
  delete next.daily_online_covers
  return next
}

function isMissingDailyColumn(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return message.includes('daily_online_covers')
}

export async function loadOnlineBookingSettings(workspaceId, venueName = '') {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const local = readAll()[normalizedWorkspaceId]
  if (!supabase || !normalizedWorkspaceId) {
    return normalizeOnlineBookingSettings(local || {}, { venueName })
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      return normalizeOnlineBookingSettings(local || {}, { venueName })
    }
    throw new Error(error.message || 'Unable to load online reservations.')
  }

  return normalizeOnlineBookingSettings(data || local || {}, { venueName })
}

export async function isOnlineBookingSlugTaken(slug, workspaceId) {
  const normalized = slugifyVenueName(slug)
  const owner = `${workspaceId ?? ''}`.trim()
  const localOwner = Object.entries(readAll()).find(([, value]) => value?.slug === normalized)?.[0]
  if (localOwner && localOwner !== owner) return true
  if (!supabase) return false

  const { data, error } = await supabase
    .from(TABLE)
    .select('workspace_id')
    .eq('slug', normalized)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return Boolean(localOwner && localOwner !== owner)
    throw new Error(error.message || 'Unable to check the link name.')
  }

  return Boolean(data?.workspace_id && data.workspace_id !== owner)
}

export async function saveOnlineBookingSettings(workspaceId, draft, venueName = '') {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) throw new Error('Workspace is required.')
  const settings = normalizeOnlineBookingSettings(draft, { venueName })
  if (await isOnlineBookingSlugTaken(settings.slug, normalizedWorkspaceId)) {
    const error = new Error('This link name is already used.')
    error.code = 'slug-taken'
    throw error
  }

  writeLocal(normalizedWorkspaceId, settings)
  if (!supabase) return settings

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(toRow(normalizedWorkspaceId, settings), { onConflict: 'workspace_id' })
    .select('*')
    .single()

  if (error) {
    if (isMissingTableError(error)) return settings
    if (isMissingDailyColumn(error)) {
      const retry = await supabase
        .from(TABLE)
        .upsert(withoutDaily(toRow(normalizedWorkspaceId, settings)), { onConflict: 'workspace_id' })
        .select('*')
        .single()
      if (retry.error) {
        if (isMissingTableError(retry.error)) return settings
        throw new Error(retry.error.message || 'Unable to save online reservations.')
      }
      return {
        ...normalizeOnlineBookingSettings(retry.data, { venueName }),
        dailyOnlineCovers: settings.dailyOnlineCovers,
      }
    }
    throw new Error(error.message || 'Unable to save online reservations.')
  }

  return normalizeOnlineBookingSettings(data, { venueName })
}
