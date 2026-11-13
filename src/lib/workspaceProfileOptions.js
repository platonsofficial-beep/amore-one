import { t } from '../i18n/i18n'
export const WORKSPACE_PROFILE_TIMEZONES = [
  { value: 'Europe/Nicosia', label: 'Nicosia' },
  { value: 'America/New_York', label: t("Eastern Time (US & Canada)") },
  { value: 'America/Chicago', label: t("Central Time (US & Canada)") },
  { value: 'America/Denver', label: t("Mountain Time (US & Canada)") },
  { value: 'America/Los_Angeles', label: t("Pacific Time (US & Canada)") },
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
  { value: 'USD', label: t("USD — US Dollar") },
  { value: 'EUR', label: t("EUR — Euro") },
  { value: 'GBP', label: t("GBP — British Pound") },
  { value: 'CAD', label: t("CAD — Canadian Dollar") },
  { value: 'AUD', label: t("AUD — Australian Dollar") },
  { value: 'CHF', label: t("CHF — Swiss Franc") },
  { value: 'AED', label: t("AED — UAE Dirham") },
  { value: 'SGD', label: t("SGD — Singapore Dollar") },
  { value: 'JPY', label: t("JPY — Japanese Yen") },
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
