export const DEFAULT_RESERVATION_PHONE_COUNTRY_CODE = '+357'

export const RESERVATION_PHONE_COUNTRIES = [
  { code: '+357', shortLabel: 'CY', name: 'Cyprus' },
  { code: '+30', shortLabel: 'GR', name: 'Greece' },
  { code: '+44', shortLabel: 'UK', name: 'United Kingdom' },
  { code: '+49', shortLabel: 'DE', name: 'Germany' },
  { code: '+33', shortLabel: 'FR', name: 'France' },
  { code: '+39', shortLabel: 'IT', name: 'Italy' },
  { code: '+1', shortLabel: 'US', name: 'United States' },
]

const COUNTRY_CODES_BY_LENGTH = [...RESERVATION_PHONE_COUNTRIES]
  .map((entry) => entry.code)
  .sort((left, right) => right.length - left.length)

function normalizeLocalDigits(value = '') {
  return `${value ?? ''}`.replace(/\D/g, '')
}

export function parseReservationPhone(phone = '') {
  const normalized = `${phone ?? ''}`.trim()

  if (!normalized) {
    return {
      countryCode: DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
      localNumber: '',
      fullPhone: '',
    }
  }

  for (const countryCode of COUNTRY_CODES_BY_LENGTH) {
    if (normalized.startsWith(countryCode)) {
      const localNumber = normalizeLocalDigits(normalized.slice(countryCode.length))
      return {
        countryCode,
        localNumber,
        fullPhone: localNumber ? `${countryCode}${localNumber}` : '',
      }
    }
  }

  const localNumber = normalizeLocalDigits(normalized)
  return {
    countryCode: DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
    localNumber,
    fullPhone: localNumber
      ? `${DEFAULT_RESERVATION_PHONE_COUNTRY_CODE}${localNumber}`
      : '',
  }
}

export function formatReservationPhone(countryCode, localNumber) {
  const code = `${countryCode ?? DEFAULT_RESERVATION_PHONE_COUNTRY_CODE}`.trim()
  const local = normalizeLocalDigits(localNumber)
  if (!local) return ''
  return `${code}${local}`
}
