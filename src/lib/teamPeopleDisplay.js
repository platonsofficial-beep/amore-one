import { parseReservationPhone } from './reservationPhoneUtils'

export function formatStoredPhoneForDisplay(phone = '') {
  const normalized = `${phone ?? ''}`.trim()
  if (!normalized.startsWith('+')) return normalized

  const parsed = parseReservationPhone(normalized)
  if (!parsed.countryCode || !parsed.localNumber) return normalized
  if (!normalized.startsWith(parsed.countryCode)) return normalized
  return `${parsed.countryCode} ${parsed.localNumber}`
}

export function formatEmployeeSalaryDisplay(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw || ['not provided', 'n/a', 'tbd', '—'].includes(raw.toLowerCase())) return '—'
  if (raw.includes('€')) return raw

  const numeric = Number(raw.replace(/[,\s]/g, ''))
  if (!Number.isFinite(numeric)) return raw
  return `€${raw}`
}

export function formatEmployeeWeeklyHoursDisplay(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw || ['not provided', 'n/a', 'tbd', '—'].includes(raw.toLowerCase())) return '—'
  if (/h\s*$/i.test(raw)) return raw
  return `${raw}h`
}
