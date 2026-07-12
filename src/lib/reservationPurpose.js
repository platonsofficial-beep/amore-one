export const PURPOSE_MARKER = '\n@@PURPOSE@@'

export const RESERVATION_PURPOSES = ['dinner', 'drinks']

export const RESERVATION_PURPOSE_OPTIONS = [
  { value: 'dinner', label: '🍽️ Dinner' },
  { value: 'drinks', label: '🍸 Drinks' },
]

export function normalizeStoredReservationPurpose(reservationPurpose) {
  const value = `${reservationPurpose ?? ''}`.trim().toLowerCase()
  if (value === 'drinks') return 'drinks'
  return 'dinner'
}

function readStoredReservationPurposeValue(rawValue = '') {
  const firstLine = `${rawValue ?? ''}`.trim().split('\n')[0]?.trim().toLowerCase() ?? ''
  if (firstLine === 'drinks') return 'drinks'
  return 'dinner'
}

export function parsePurposeFromNotes(notes) {
  const value = `${notes ?? ''}`
  const markerIndex = value.indexOf(PURPOSE_MARKER)
  if (markerIndex < 0) return 'dinner'

  const raw = value.slice(markerIndex + PURPOSE_MARKER.length)
  return readStoredReservationPurposeValue(raw)
}

export function stripPurposeFromNotes(notes) {
  const value = `${notes ?? ''}`
  const markerIndex = value.indexOf(PURPOSE_MARKER)
  if (markerIndex < 0) return value.trim()

  const before = value.slice(0, markerIndex).trimEnd()
  const afterMarker = value.slice(markerIndex + PURPOSE_MARKER.length)
  const afterLines = afterMarker.split('\n')
  const remainder = afterLines.slice(1).join('\n').trim()

  if (!remainder) return before.trim()
  if (!before) return remainder
  return `${before}\n${remainder}`.trim()
}

export function encodePurposeInNotes(notes, reservationPurpose) {
  const userNotes = stripPurposeFromNotes(notes)
  const purpose = normalizeStoredReservationPurpose(reservationPurpose)
  if (purpose === 'dinner') return userNotes
  return userNotes
    ? `${userNotes}${PURPOSE_MARKER}${purpose}`
    : `${PURPOSE_MARKER}${purpose}`
}

export function getReservationPurposeLabel(reservationPurpose) {
  const normalized = normalizeStoredReservationPurpose(reservationPurpose)
  const option = RESERVATION_PURPOSE_OPTIONS.find((entry) => entry.value === normalized)
  return option?.label ?? RESERVATION_PURPOSE_OPTIONS[0].label
}

export function getReservationPurpose(reservation) {
  const fromField = `${reservation?.reservationPurpose ?? ''}`.trim().toLowerCase()
  if (fromField === 'drinks') return 'drinks'
  return parsePurposeFromNotes(reservation?.notes ?? '')
}
