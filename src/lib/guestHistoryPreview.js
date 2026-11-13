const PREVIEW_MODES = new Set(['card', 'list', 'history', 'warning', 'walkin', 'blacklist'])

export function readGuestPreview(search, env = import.meta.env) {
  if (env?.VITE_AUTH_DISABLED !== 'true') return null
  const query = typeof search === 'string'
    ? search
    : (typeof window !== 'undefined' ? window.location.search : '')
  const mode = new URLSearchParams(query).get('guestPreview')
  return PREVIEW_MODES.has(mode) ? mode : null
}

export function buildGuestPreviewReservations() {
  const maria = { phone: '+35799111222', guestName: 'Maria Costa', area: 'Main Dining' }
  const andreas = { phone: '+35799222333', guestName: 'Andreas Petrou', area: 'Bar' }
  return [
    { id: 'g1', ...maria, date: '2026-08-01', time: '20:00', guests: 4, tableNumber: 'T4', status: 'Checked Out' },
    { id: 'g2', ...maria, date: '2026-09-12', time: '20:30', guests: 4, tableNumber: 'T4', status: 'Checked Out' },
    { id: 'g3', ...maria, date: '2026-10-02', time: '19:00', guests: 2, tableNumber: 'T2', status: 'Not Shown' },
    { id: 'g4', ...maria, date: '2026-10-20', time: '21:00', guests: 4, tableNumber: 'T4', status: 'Cancelled' },
    { id: 'g5', ...maria, date: '2026-11-01', time: '20:00', guests: 6, tableNumber: 'T4', status: 'Checked Out' },
    { id: 'g6', ...andreas, date: '2026-07-04', time: '21:00', guests: 2, tableNumber: 'T1', status: 'Not Shown' },
    { id: 'g7', ...andreas, date: '2026-09-01', time: '19:30', guests: 2, tableNumber: 'T1', status: 'Checked Out' },
  ]
}

export function buildGuestPreviewProfiles() {
  return [
    {
      phone: '+35799111222',
      displayName: 'Maria Costa',
      notes: 'Window seat. Allergic to shellfish.',
      blacklisted: false,
      blacklistReason: '',
    },
    {
      phone: '+35799222333',
      displayName: 'Andreas Petrou',
      notes: '',
      blacklisted: true,
      blacklistReason: 'No-show without calling, twice',
    },
  ]
}

let guestPreviewClaimed = false

export function claimGuestPreview(allow = true) {
  if (!allow || guestPreviewClaimed) return null
  const mode = readGuestPreview()
  if (!mode) return null
  guestPreviewClaimed = true
  return mode
}

export function guestPreviewPhone(mode = readGuestPreview()) {
  if (mode === 'warning' || mode === 'walkin') return '+35799222333'
  if (mode === 'card') return '+35799111222'
  return ''
}
