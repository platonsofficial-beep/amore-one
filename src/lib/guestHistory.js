import { normalizeWorkspaceRole } from './membershipRoles'
import { isManagerRole } from './permissions'
import { parseReservationPhone } from './reservationPhoneUtils'
import { normalizeReservationStatus } from './reservationHostStatus'

export function formatGuestDate(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(`${dateKey ?? ''}`.trim())
  if (!match) return `${dateKey ?? ''}`.trim() || '—'
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatGuestFavourite(guest) {
  const tables = (guest?.favouriteTables || []).filter(Boolean).join(', ')
  const area = `${guest?.favouriteArea ?? ''}`.trim()
  if (tables && area) return `${tables} · ${area}`
  return tables || area || '—'
}

export function guestPhoneKey(phone, fallbackCode) {
  return parseReservationPhone(phone, { fallbackCode }).fullPhone
}

export function canEditGuestNotes(role) {
  const normalized = normalizeWorkspaceRole(role, '')
  return normalized === 'host' || isManagerRole(normalized)
}

export function canBlacklistGuest(role) {
  return isManagerRole(role)
}

export function blacklistConfirmState(guest) {
  if (!guest?.blacklisted) return { warning: '', blocked: false }
  const reason = `${guest.blacklistReason ?? ''}`.trim()
  return {
    warning: reason ? `Blacklisted guest — ${reason}` : 'Blacklisted guest',
    blocked: !canBlacklistGuest(guest.role),
  }
}

function partyMode(values) {
  const counts = new Map()
  values.forEach((value) => {
    const size = Math.trunc(Number(value))
    if (!Number.isFinite(size) || size <= 0) return
    counts.set(size, (counts.get(size) || 0) + 1)
  })
  let best = null
  let bestCount = 0
  counts.forEach((count, size) => {
    if (count > bestCount || (count === bestCount && (best == null || size < best))) {
      best = size
      bestCount = count
    }
  })
  return best
}

function favouriteLabel(values) {
  const counts = new Map()
  values.forEach((value) => {
    const label = `${value ?? ''}`.trim()
    if (!label) return
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  let best = ''
  let bestCount = 0
  counts.forEach((count, label) => {
    if (count > bestCount) {
      best = label
      bestCount = count
    }
  })
  return best
}

function tableLabels(reservation) {
  const raw = `${reservation?.tableNumber ?? reservation?.table_number ?? ''}`.trim()
  if (!raw) return []
  return raw.split(/[,/]/).map((part) => part.trim()).filter(Boolean)
}

export function summarizeGuest(reservations = [], phone, fallbackCode) {
  const key = guestPhoneKey(phone, fallbackCode)
  if (!key) return null
  const bookings = (reservations ?? [])
    .filter((reservation) => guestPhoneKey(reservation?.phone, fallbackCode) === key)
    .map((reservation) => ({
      id: reservation.id,
      guestName: `${reservation.guestName ?? reservation.guest_name ?? ''}`.trim(),
      date: `${reservation.date ?? reservation.reservation_date ?? ''}`.trim(),
      time: `${reservation.time ?? reservation.reservation_time ?? ''}`.trim(),
      guests: Number(reservation.guests ?? reservation.party_size) || 0,
      tableNumber: `${reservation.tableNumber ?? reservation.table_number ?? ''}`.trim(),
      area: `${reservation.area ?? ''}`.trim(),
      status: normalizeReservationStatus(reservation.status),
    }))
    .sort((left, right) => `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`))

  const visits = bookings.filter((booking) => booking.status === 'Checked Out')
  const noShows = bookings.filter((booking) => booking.status === 'Not Shown')
  const cancellations = bookings.filter((booking) => booking.status === 'Cancelled')
  const nameSource = bookings.find((booking) => booking.guestName)
  const partySource = visits.length ? visits : bookings
  const tableSource = visits.length ? visits : bookings
  return {
    phone: key,
    guestName: nameSource?.guestName || '',
    visits: visits.length,
    noShows: noShows.length,
    cancellations: cancellations.length,
    lastVisit: visits[0]?.date || '',
    favouriteTables: [...new Set(tableSource.flatMap((booking) => tableLabels(booking)))].slice(0, 3),
    favouriteArea: favouriteLabel(tableSource.map((booking) => booking.area)),
    usualPartySize: partyMode(partySource.map((booking) => booking.guests)),
    bookings,
  }
}

export function mergeGuestProfile(summary, profile) {
  if (!summary && !profile) return null
  const phone = summary?.phone || profile?.phone || ''
  return {
    phone,
    guestName: `${profile?.displayName ?? ''}`.trim() || summary?.guestName || '',
    visits: summary?.visits || 0,
    noShows: summary?.noShows || 0,
    cancellations: summary?.cancellations || 0,
    lastVisit: summary?.lastVisit || '',
    favouriteTables: summary?.favouriteTables || [],
    favouriteArea: summary?.favouriteArea || '',
    usualPartySize: summary?.usualPartySize ?? null,
    bookings: summary?.bookings || [],
    notes: `${profile?.notes ?? ''}`.trim(),
    blacklisted: profile?.blacklisted === true,
    blacklistReason: `${profile?.blacklistReason ?? ''}`.trim(),
    hasProfile: Boolean(profile),
  }
}

export function buildGuestDirectory(reservations = [], profiles = [], fallbackCode) {
  const phones = new Set()
  ;(reservations ?? []).forEach((reservation) => {
    const key = guestPhoneKey(reservation?.phone, fallbackCode)
    if (key) phones.add(key)
  })
  ;(profiles ?? []).forEach((profile) => {
    const key = guestPhoneKey(profile?.phone, fallbackCode)
    if (key) phones.add(key)
  })
  const profileByPhone = new Map((profiles ?? []).map((profile) => [guestPhoneKey(profile.phone, fallbackCode), profile]))
  return [...phones].map((phone) => mergeGuestProfile(
    summarizeGuest(reservations, phone, fallbackCode),
    profileByPhone.get(phone) || null,
  )).filter(Boolean).sort((left, right) => left.guestName.localeCompare(right.guestName) || left.phone.localeCompare(right.phone))
}

export function searchGuests(directory, query, fallbackCode) {
  const term = `${query ?? ''}`.trim().toLowerCase()
  if (!term) return directory
  const phoneQuery = guestPhoneKey(query, fallbackCode)
  return directory.filter((guest) => {
    if (guest.guestName.toLowerCase().includes(term)) return true
    if (guest.phone.includes(term.replace(/\s/g, ''))) return true
    if (phoneQuery && guest.phone === phoneQuery) return true
    return false
  })
}

export function findGuestByPhone(directory, phone, fallbackCode) {
  const key = guestPhoneKey(phone, fallbackCode)
  if (!key) return null
  return directory.find((guest) => guest.phone === key) || null
}
