export const ONLINE_BOOKING_ORIGIN = 'https://app.onehospitality.app'
export const DEFAULT_ONLINE_MAX_PARTY = 8
export const DEFAULT_ONLINE_WINDOW_DAYS = 30
export const DEFAULT_ONLINE_NOTICE_MINUTES = 120

function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

export function slugifyVenueName(name) {
  const base = `${name ?? ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return base || 'venue'
}

export function onlineBookingUrl(slug) {
  return `${ONLINE_BOOKING_ORIGIN}/book/${slugifyVenueName(slug)}`
}

export function normalizeOnlineBookingSettings(record, { venueName = '' } = {}) {
  const storedSlug = `${record?.slug ?? record?.public_slug ?? ''}`.trim()
  return {
    enabled: Boolean(record?.enabled),
    slug: slugifyVenueName(storedSlug || venueName),
    autoConfirm: record?.autoConfirm ?? record?.auto_confirm ?? true,
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
  }
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

export function readAreaBooking(floor) {
  return {
    smoking: Boolean(floor?.smoking),
    onlineBookingVisible: Boolean(floor?.onlineBookingVisible),
  }
}
