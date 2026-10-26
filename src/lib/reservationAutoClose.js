import { normalizeReservationStatus } from './reservationHostStatus'

export const DEFAULT_RESERVATION_AUTO_CLOSE_TIME = '05:00'
export const AUTO_CLOSED_BADGE_LABEL = 'κλείστηκε αυτόματα / Auto-closed'
export const RESERVATION_AUTO_CLOSE_TIMEZONE = 'Europe/Nicosia'

export function normalizeReservationAutoCloseTime(value) {
  const match = `${value ?? ''}`.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return DEFAULT_RESERVATION_AUTO_CLOSE_TIME

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return DEFAULT_RESERVATION_AUTO_CLOSE_TIME
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function isAutoClosedReservation(reservation) {
  const closedAt = reservation?.autoClosedAt ?? reservation?.auto_closed_at ?? null
  if (!closedAt) return false
  return normalizeReservationStatus(reservation?.status) === 'Checked Out'
}

export function isMissingAutoClosedColumnError(error) {
  const message = `${error?.message ?? error ?? ''}`.toLowerCase()
  return message.includes('auto_closed_at')
    && (
      message.includes('schema cache')
      || message.includes('column')
      || message.includes('does not exist')
    )
}
