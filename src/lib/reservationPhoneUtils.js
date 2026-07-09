import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRY_CODES_BY_LENGTH,
  PRIORITY_PHONE_COUNTRIES,
  detectDefaultPhoneCountryCode,
  findPhoneCountryByCode,
} from './phoneCountries'

export { DEFAULT_PHONE_COUNTRY_CODE as DEFAULT_RESERVATION_PHONE_COUNTRY_CODE }
export { PRIORITY_PHONE_COUNTRIES as RESERVATION_PHONE_COUNTRIES }
export {
  detectDefaultPhoneCountryCode,
  findPhoneCountryByCode,
  filterPhoneCountries,
  findPhoneCountryByIso2,
  isoToFlagEmoji,
  PHONE_COUNTRIES,
} from './phoneCountries'

function normalizeLocalDigits(value = '') {
  return `${value ?? ''}`.replace(/\D/g, '')
}

export function getDefaultReservationPhoneCountryCode() {
  return detectDefaultPhoneCountryCode({ fallbackCode: DEFAULT_PHONE_COUNTRY_CODE })
}

export function parseReservationPhone(phone = '', options = {}) {
  const fallbackCode = options.fallbackCode ?? getDefaultReservationPhoneCountryCode()
  const normalized = `${phone ?? ''}`.trim()

  if (!normalized) {
    return {
      countryCode: fallbackCode,
      localNumber: '',
      fullPhone: '',
    }
  }

  for (const countryCode of PHONE_COUNTRY_CODES_BY_LENGTH) {
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
    countryCode: fallbackCode,
    localNumber,
    fullPhone: localNumber ? `${fallbackCode}${localNumber}` : '',
  }
}

export function formatReservationPhone(countryCode, localNumber) {
  const code = `${countryCode ?? DEFAULT_PHONE_COUNTRY_CODE}`.trim()
  const local = normalizeLocalDigits(localNumber)
  if (!local) return ''
  return `${code}${local}`
}

export function resolvePhoneCountryFromStoredValue(phone = '') {
  const normalized = `${phone ?? ''}`.trim()
  if (!normalized) return findPhoneCountryByCode(getDefaultReservationPhoneCountryCode())

  const parsed = parseReservationPhone(normalized, {
    fallbackCode: DEFAULT_PHONE_COUNTRY_CODE,
  })

  return findPhoneCountryByCode(parsed.countryCode)
    ?? findPhoneCountryByCode(DEFAULT_PHONE_COUNTRY_CODE)
}
