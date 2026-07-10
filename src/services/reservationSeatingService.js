import { supabase } from '../lib/supabaseClient'
import { normalizeReservationSeating } from '../lib/reservationSeatings'

const SEATINGS_TABLE = 'reservation_seatings'

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
    createdAt: record.created_at ?? record.createdAt,
    updatedAt: record.updated_at ?? record.updatedAt,
  })
}

function serializeSeating(seating, workspaceId) {
  const normalized = normalizeReservationSeating({ ...seating, workspaceId })
  if (!normalized) {
    throw new Error('Seating is required.')
  }

  return {
    workspace_id: workspaceId,
    name: normalized.name,
    start_time: normalized.startTime,
    duration_minutes: normalized.durationMinutes,
    days_of_week: normalized.daysOfWeek,
    sort_order: normalized.sortOrder,
    is_active: normalized.isActive,
  }
}

export async function getReservationSeatings(workspaceId, { includeInactive = false } = {}) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

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

  return (data ?? []).map(mapSeating).filter(Boolean)
}

export async function createReservationSeating(workspaceId, seating) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const { data, error } = await supabase
    .from(SEATINGS_TABLE)
    .insert([serializeSeating(seating, normalizedWorkspaceId)])
    .select('*')
    .single()

  if (error) {
    console.error('[reservationSeatingService] createReservationSeating error:', error)
    throw new Error(error.message || 'Unable to create seating right now.')
  }

  return mapSeating(data)
}

export async function updateReservationSeating(workspaceId, id, seating) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedId = `${id ?? ''}`.trim()
  if (!normalizedId) {
    throw new Error('Seating is required.')
  }

  const { data, error } = await supabase
    .from(SEATINGS_TABLE)
    .update(serializeSeating(seating, normalizedWorkspaceId))
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedId)
    .select('*')
    .single()

  if (error) {
    console.error('[reservationSeatingService] updateReservationSeating error:', error)
    throw new Error(error.message || 'Unable to update seating right now.')
  }

  return mapSeating(data)
}

export async function deleteReservationSeating(workspaceId, id) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedId = `${id ?? ''}`.trim()
  if (!normalizedId) {
    throw new Error('Seating is required.')
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

export async function reorderReservationSeatings(workspaceId, orderedIds = []) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const ids = orderedIds.map((id) => `${id ?? ''}`.trim()).filter(Boolean)
  if (!ids.length) return []

  const updates = ids.map((id, index) => (
    supabase
      .from(SEATINGS_TABLE)
      .update({ sort_order: index })
      .eq('workspace_id', normalizedWorkspaceId)
      .eq('id', id)
  ))

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    throw new Error(failed.error.message || 'Unable to reorder seatings right now.')
  }

  return getReservationSeatings(normalizedWorkspaceId, { includeInactive: true })
}
