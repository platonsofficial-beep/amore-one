import { CANONICAL_APP_ORIGIN, publicShareOrigin } from './publicAppUrl.js'

export const ONLINE_BOOKING_ORIGIN = CANONICAL_APP_ORIGIN
export const DEFAULT_ONLINE_MAX_PARTY = 8
export const DEFAULT_ONLINE_WINDOW_DAYS = 30
export const DEFAULT_ONLINE_NOTICE_MINUTES = 120
export const DEFAULT_EMAIL_CONFIRM_HOURS = 12
export const CONFIRMATION_METHODS = ['instant', 'venue_call', 'email']

function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

const GREEK_TO_LATIN = {
  α: 'a', ά: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z',
  η: 'i', ή: 'i', θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', ό: 'o',
  π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't',
  υ: 'y', ύ: 'y', ϋ: 'y', ΰ: 'y',
  φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
}

const GREEK_VOICED = new Set(['β', 'γ', 'δ', 'ζ', 'λ', 'μ', 'ν', 'ρ'])

function latinizeSlug(value) {
  const lower = `${value ?? ''}`.toLowerCase().normalize('NFC')
  let mapped = ''
  for (let index = 0; index < lower.length; index += 1) {
    const char = lower[index]
    const next = lower[index + 1] || ''
    const after = lower[index + 2] || ''
    if ((char === 'α' || char === 'ά') && (next === 'υ' || next === 'ύ')) {
      mapped += GREEK_VOICED.has(after) ? 'av' : 'af'
      index += 1
      continue
    }
    if ((char === 'ε' || char === 'έ') && (next === 'υ' || next === 'ύ')) {
      mapped += GREEK_VOICED.has(after) ? 'ev' : 'ef'
      index += 1
      continue
    }
    if ((char === 'ο' || char === 'ό') && (next === 'υ' || next === 'ύ')) {
      mapped += 'ou'
      index += 1
      continue
    }
    mapped += GREEK_TO_LATIN[char] ?? char
  }
  return mapped.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Live typing. Empty is allowed. Trailing hyphens stay until blur. */
export function draftPublicSlug(value) {
  return latinizeSlug(value)
    .replace(/[.\s_]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 48)
}

/** Blur and save. Empty string means keep the last saved slug. */
export function commitPublicSlug(value) {
  const collapsed = draftPublicSlug(value).replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  if (collapsed.length < 3) return ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collapsed)) return ''
  return collapsed
}

export function slugifyVenueName(name) {
  const collapsed = draftPublicSlug(name).replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return collapsed || 'venue'
}

export function onlineBookingUrl(slug, origin = publicShareOrigin()) {
  return `${origin}/book/${slugifyVenueName(slug)}`
}

/** Link for a slug that is already valid. Empty stays empty — never "venue". */
export function publicBookingLink(slug, origin = publicShareOrigin()) {
  const committed = commitPublicSlug(slug)
  return committed ? `${origin}/book/${committed}` : ''
}

export function normalizeConfirmationMethod(value, autoConfirm) {
  const method = `${value ?? ''}`.trim()
  if (CONFIRMATION_METHODS.includes(method)) return method
  if (autoConfirm === false) return 'venue_call'
  return 'instant'
}

export function normalizeOnlineBookingSettings(record, { venueName = '' } = {}) {
  const storedSlug = `${record?.slug ?? record?.public_slug ?? ''}`.trim()
  return {
    enabled: Boolean(record?.enabled),
    slug: commitPublicSlug(storedSlug || venueName),
    confirmationMethod: normalizeConfirmationMethod(
      record?.confirmationMethod ?? record?.confirmation_method,
      record?.autoConfirm ?? record?.auto_confirm,
    ),
    emailConfirmHours: clampInt(
      record?.emailConfirmHours ?? record?.email_confirm_hours,
      1,
      168,
      DEFAULT_EMAIL_CONFIRM_HOURS,
    ),
    maxPartySize: clampInt(
      record?.maxPartySize ?? record?.max_party_size,
      1,
      100,
      DEFAULT_ONLINE_MAX_PARTY,
    ),
    bookingWindowDays: clampInt(
      record?.bookingWindowDays ?? record?.booking_window_days,
      1,
      365,
      DEFAULT_ONLINE_WINDOW_DAYS,
    ),
    minNoticeMinutes: clampInt(
      record?.minNoticeMinutes ?? record?.min_notice_minutes,
      0,
      72 * 60,
      DEFAULT_ONLINE_NOTICE_MINUTES,
    ),
    venuePhone: `${record?.venuePhone ?? record?.venue_phone ?? ''}`.trim(),
    dailyOnlineCovers: normalizeDailyOnlineCovers(
      record?.dailyOnlineCovers ?? record?.daily_online_covers,
    ),
  }
}

export function normalizeDailyOnlineCovers(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number) || number < 1) return null
  return Math.min(number, 9999)
}

export function allocatedOnlineCovers(capacities = []) {
  return (capacities ?? []).reduce((sum, value) => {
    const cap = normalizeOnlineCapacity(
      value && typeof value === 'object'
        ? (value.onlineCapacity ?? value.online_capacity)
        : value,
    )
    return sum + (cap ?? 0)
  }, 0)
}

export function splitExceedsDailyTotal(capacities, dailyTotal) {
  const total = normalizeDailyOnlineCovers(dailyTotal)
  if (total == null) return false
  return allocatedOnlineCovers(capacities) > total
}

export function normalizeOnlineCapacity(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number) || number < 1) return null
  return Math.min(number, 9999)
}

export function normalizeAreaCaps(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next = {}
  Object.entries(value).forEach(([key, raw]) => {
    const id = `${key}`.trim()
    const cap = normalizeOnlineCapacity(raw)
    if (id && cap) next[id] = cap
  })
  return next
}

export function sumVenueCovers(objects = []) {
  return (objects ?? []).reduce((sum, object) => {
    if (object?.type && object.type !== 'table') return sum
    const props = object?.properties ?? object ?? {}
    const max = Number(props.maxGuests ?? props.max_guests ?? props.capacity)
    if (!Number.isFinite(max) || max <= 0) return sum
    return sum + max
  }, 0)
}

export function isOnlineReservation(reservation) {
  return `${reservation?.source ?? ''}`.trim().toLowerCase() === 'online'
}

export function reservationConfirmationMethod(reservation) {
  return normalizeConfirmationMethod(reservation?.confirmationMethod ?? reservation?.confirmation_method)
}

export function needsVenueCallConfirm(reservation) {
  const status = `${reservation?.status ?? 'Pending'}`.trim()
  return isOnlineReservation(reservation)
    && reservationConfirmationMethod(reservation) === 'venue_call'
    && (status === 'Pending' || status === 'Not Confirmed')
}

export function guestCallHref(reservation) {
  const phone = `${reservation?.phone ?? ''}`.replace(/[^\d+]/g, '')
  return phone ? `tel:${phone}` : ''
}

export function readAreaBooking(floor) {
  return {
    smoking: Boolean(floor?.smoking),
    onlineBookingVisible: Boolean(floor?.onlineBookingVisible),
  }
}
