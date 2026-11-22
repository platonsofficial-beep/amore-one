import {
  normalizeReservationSeating,
  serializeReservationSeatingRow,
} from '../lib/reservationSeatings'
import { supabase } from '../lib/supabaseClient'

const SEATINGS_TABLE = 'reservation_seatings'
const VIEWPORT_SEATING_FIXTURE_KEY = 'amore-viewport-seatings-v1'
const ONLINE_CAP_KEY = 'one.onlineSeatingCaps.v1'

function readOnlineCaps(workspaceId) {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(ONLINE_CAP_KEY) || '{}')
    return parsed?.[workspaceId] && typeof parsed[workspaceId] === 'object' ? parsed[workspaceId] : {}
  } catch {
    return {}
  }
}

function writeOnlineCap(workspaceId, id, seating) {
  if (typeof localStorage === 'undefined' || !id) return
  const all = (() => {
    try { return JSON.parse(localStorage.getItem(ONLINE_CAP_KEY) || '{}') } catch { return {} }
  })()
  all[workspaceId] = {
    ...(all[workspaceId] || {}),
    [id]: {
      onlineCapacity: seating.onlineCapacity ?? seating.online_capacity ?? null,
      onlineAreaCaps: seating.onlineAreaCaps ?? seating.online_area_caps ?? {},
    },
  }
  localStorage.setItem(ONLINE_CAP_KEY, JSON.stringify(all))
}

function mergeOnlineCaps(workspaceId, seatings) {
  const caps = readOnlineCaps(workspaceId)
  return seatings.map((seating) => {
    const extra = caps[seating.id]
    if (!extra) return seating
    return mapSeating({ ...seating, ...extra, id: seating.id })
  })
}

function isMissingOnlineColumnError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  return message.includes('online_capacity') || message.includes('online_area_caps') || message.includes('day_hours')
}

function rowWithoutOnline(row) {
  const next = { ...row }
  delete next.online_capacity
  delete next.online_area_caps
  delete next.day_hours
  return next
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function requireWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required for reservation seatings.')
  }
  return normalizedWorkspaceId
}

function mapSeating(record) {
  return normalizeReservationSeating({
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId,
    name: record.name,
    startTime: record.start_time ?? record.startTime,
    durationMinutes: record.duration_minutes ?? record.durationMinutes,
    daysOfWeek: record.days_of_week ?? record.daysOfWeek,
    sortOrder: record.sort_order ?? record.sortOrder,
    isActive: record.is_active ?? record.isActive,
    onlineCapacity: record.online_capacity ?? record.onlineCapacity,
    onlineAreaCaps: record.online_area_caps ?? record.onlineAreaCaps,
    createdAt: record.created_at ?? record.createdAt,
    updatedAt: record.updated_at ?? record.updatedAt,
  })
}

function readViewportSeatingFixture() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(VIEWPORT_SEATING_FIXTURE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map(mapSeating).filter(Boolean)
  } catch {
    return null
  }
}

export async function getReservationSeatings(workspaceId, { includeInactive = false } = {}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  if (!supabase) {
    const seeded = readViewportSeatingFixture()
    if (seeded) {
      return includeInactive ? seeded : seeded.filter((seating) => seating.isActive)
    }
    throw new Error('Unable to load reservation seatings right now.')
  }

  let query = supabase
    .from(SEATINGS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('sort_order', { ascending: true })
    .order('start_time', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[reservationSeatingService] getReservationSeatings error:', error)

    if (isTableUnavailableError(error)) {
      return []
    }

    throw new Error(error.message || 'Unable to load reservation seatings right now.')
  }

  return mergeOnlineCaps(normalizedWorkspaceId, (data ?? []).map(mapSeating).filter(Boolean))
}

export async function createReservationSeating({ workspaceId, seating }) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  if (!seating || typeof seating !== 'object') {
    throw new Error('Seating details are required.')
  }

  const row = serializeReservationSeatingRow(seating, normalizedWorkspaceId)
  let { data, error } = await supabase
    .from(SEATINGS_TABLE)
    .insert([row])
    .select('*')
    .single()

  if (error && isMissingOnlineColumnError(error)) {
    const retry = await supabase
      .from(SEATINGS_TABLE)
      .insert([rowWithoutOnline(row)])
      .select('*')
      .single()
    data = retry.data
    error = retry.error
    if (!error && data?.id) writeOnlineCap(normalizedWorkspaceId, data.id, seating)
  }

  if (error) {
    console.error('[reservationSeatingService] createReservationSeating error:', error)
    throw new Error(error.message || 'Unable to create seating right now.')
  }

  return mapSeating({ ...data, ...seating, id: data.id })
}

export async function updateReservationSeating({ workspaceId, id, seating }) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedId = `${id ?? ''}`.trim()
  if (!normalizedId) {
    throw new Error('Seating id is required.')
  }
  if (!seating || typeof seating !== 'object') {
    throw new Error('Seating details are required.')
  }

  const row = serializeReservationSeatingRow(seating, normalizedWorkspaceId)
  let { data, error } = await supabase
    .from(SEATINGS_TABLE)
    .update(row)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedId)
    .select('*')
    .single()

  if (error && isMissingOnlineColumnError(error)) {
    const retry = await supabase
      .from(SEATINGS_TABLE)
      .update(rowWithoutOnline(row))
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('id', normalizedId)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
    if (!error) writeOnlineCap(normalizedWorkspaceId, normalizedId, seating)
  }

  if (error) {
    console.error('[reservationSeatingService] updateReservationSeating error:', error)
    throw new Error(error.message || 'Unable to update seating right now.')
  }

  return mapSeating({ ...data, ...seating, id: data.id })
}

export async function deleteReservationSeating({ workspaceId, id }) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedId = `${id ?? ''}`.trim()
  if (!normalizedId) {
    throw new Error('Seating id is required.')
  }

  const { error } = await supabase
    .from(SEATINGS_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedId)

  if (error) {
    console.error('[reservationSeatingService] deleteReservationSeating error:', error)
    throw new Error(error.message || 'Unable to delete seating right now.')
  }
}

export async function reorderReservationSeatings({ workspaceId, orderedIds = [] }) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const ids = orderedIds.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean)
  if (!ids.length) return []

  const updates = ids.map((entryId, index) => (
    supabase
      .from(SEATINGS_TABLE)
      .update({ sort_order: index })
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('id', entryId)
  ))

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error('[reservationSeatingService] reorderReservationSeatings error:', failed.error)
    throw new Error(failed.error.message || 'Unable to reorder seatings right now.')
  }

  return getReservationSeatings(normalizedWorkspaceId, { includeInactive: true })
}
