import { supabase } from '../lib/supabaseClient'

const CLIENT_KEY = 'one.publicBooking.client'

function clientKey() {
  if (typeof localStorage === 'undefined') return ''
  try {
    const existing = localStorage.getItem(CLIENT_KEY)
    if (existing) return existing
    const next = crypto.randomUUID?.() || `${Date.now()}`
    localStorage.setItem(CLIENT_KEY, next)
    return next
  } catch {
    return ''
  }
}

function fail(error) {
  const message = error?.message || 'Online reservations are not available right now.'
  const wrapped = new Error(message)
  wrapped.reason = 'unavailable'
  throw wrapped
}

export async function fetchPublicBookingInfo(slug) {
  if (!supabase) {
    return { ok: false, reason: 'unavailable' }
  }
  const { data, error } = await supabase.rpc('get_public_booking_info', { p_slug: slug })
  if (error) fail(error)
  return data
}

export async function fetchPublicAvailability(slug, date, party) {
  if (!supabase) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('get_public_availability', {
    p_slug: slug,
    p_date: date,
    p_party: party,
  })
  if (error) fail(error)
  return data
}

export async function createPublicReservation(slug, input) {
  if (!supabase) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('create_public_reservation', {
    p_slug: slug,
    p_date: input.date,
    p_party: input.party,
    p_seating_id: input.seatingId,
    p_area_id: input.areaId,
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email || '',
    p_note: input.note || '',
    p_consent: Boolean(input.consent),
    p_honeypot: input.honeypot || '',
    p_client_key: clientKey(),
  })
  if (error) fail(error)
  if (data?.ok && data.confirmToken && data.id) {
    fetch('/api/online-booking-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data.id, token: data.confirmToken }),
    }).catch(() => {})
  }
  return data
}

export async function confirmPublicReservation(slug, token, action) {
  if (!supabase) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('confirm_public_reservation', {
    p_slug: slug,
    p_token: token,
    p_action: action === 'cancel' ? 'cancel' : 'confirm',
  })
  if (error) fail(error)
  return data
}
