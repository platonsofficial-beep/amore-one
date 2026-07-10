export const WORKSPACE_PROFILE_TIMEZONES = [
  { value: 'Europe/Nicosia', label: 'Nicosia' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Rome', label: 'Rome' },
  { value: 'Europe/Madrid', label: 'Madrid' },
  { value: 'Europe/Athens', label: 'Athens' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
]

export const WORKSPACE_PROFILE_CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
]

export const MAX_WORKSPACE_LOGO_BYTES = 256 * 1024

export function getDefaultWorkspaceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

export function getDefaultWorkspaceCurrency() {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
      .formatToParts(0)
    const currency = parts.find((part) => part.type === 'currency')?.value
    if (currency === '$') return 'USD'
    if (currency === '€') return 'EUR'
    if (currency === '£') return 'GBP'
    return ''
  } catch {
    return ''
  }
}
