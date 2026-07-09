import { PHONE_COUNTRY_RECORDS } from './phoneCountryRecords'

export const DEFAULT_PHONE_COUNTRY_CODE = '+357'
export const DEFAULT_PHONE_COUNTRY_ISO2 = 'CY'

export const PRIORITY_PHONE_COUNTRY_ISO2 = [
  'CY', 'GR', 'GB', 'DE', 'FR', 'IT', 'US', 'AE', 'RU', 'TR', 'IL', 'LB',
]

const SEARCH_ALIASES = {
  GB: ['uk', 'united kingdom', 'britain', 'great britain'],
  US: ['usa', 'america', 'united states'],
  AE: ['uae', 'emirates'],
  CI: ['ivory coast', 'cote d ivoire'],
  CZ: ['czech republic'],
  KR: ['south korea', 'korea'],
  MK: ['macedonia'],
  CD: ['drc', 'democratic republic of congo'],
  CG: ['congo brazzaville'],
  VI: ['us virgin islands', 'u.s. virgin islands'],
  VA: ['vatican'],
  XK: ['kosovo'],
}

export function isoToFlagEmoji(iso2 = '') {
  const normalized = `${iso2 ?? ''}`.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return '🏳️'

  return normalized
    .split('')
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('')
}

function buildPhoneCountry([iso2, name, dialDigits]) {
  const code = `+${dialDigits}`
  const aliases = SEARCH_ALIASES[iso2] ?? []

  return {
    iso2,
    name,
    dialDigits: `${dialDigits}`,
    code,
    flag: isoToFlagEmoji(iso2),
    searchText: [
      iso2,
      name,
      code,
      dialDigits,
      ...aliases,
    ].join(' ').toLowerCase(),
  }
}

const PHONE_COUNTRY_MAP = new Map()
const PHONE_COUNTRIES_BY_CODE = new Map()

export const PHONE_COUNTRIES = PHONE_COUNTRY_RECORDS
  .map(buildPhoneCountry)
  .sort((left, right) => left.name.localeCompare(right.name))

PHONE_COUNTRIES.forEach((country) => {
  PHONE_COUNTRY_MAP.set(country.iso2, country)
})

PRIORITY_PHONE_COUNTRY_ISO2.forEach((iso2) => {
  const country = PHONE_COUNTRY_MAP.get(iso2)
  if (country) {
    PHONE_COUNTRIES_BY_CODE.set(country.code, country)
  }
})

PHONE_COUNTRIES.forEach((country) => {
  if (!PHONE_COUNTRIES_BY_CODE.has(country.code)) {
    PHONE_COUNTRIES_BY_CODE.set(country.code, country)
  }
})

export const PHONE_COUNTRY_CODES_BY_LENGTH = [...new Set(PHONE_COUNTRIES.map((entry) => entry.code))]
  .sort((left, right) => right.length - left.length)

export const PRIORITY_PHONE_COUNTRIES = PRIORITY_PHONE_COUNTRY_ISO2
  .map((iso2) => PHONE_COUNTRY_MAP.get(iso2))
  .filter(Boolean)

export function findPhoneCountryByCode(code = '') {
  const normalized = `${code ?? ''}`.trim()
  if (!normalized) return null

  if (PHONE_COUNTRIES_BY_CODE.has(normalized)) {
    return PHONE_COUNTRIES_BY_CODE.get(normalized)
  }

  for (const countryCode of PHONE_COUNTRY_CODES_BY_LENGTH) {
    if (normalized.startsWith(countryCode)) {
      return PHONE_COUNTRIES_BY_CODE.get(countryCode) ?? null
    }
  }

  return null
}

export function findPhoneCountryByIso2(iso2 = '') {
  const normalized = `${iso2 ?? ''}`.trim().toUpperCase()
  return PHONE_COUNTRY_MAP.get(normalized) ?? null
}

export function detectDefaultPhoneCountryCode(options = {}) {
  const fallbackCode = options.fallbackCode ?? DEFAULT_PHONE_COUNTRY_CODE
  const localeCandidates = []

  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) {
      localeCandidates.push(...navigator.languages)
    }
    if (navigator.language) {
      localeCandidates.push(navigator.language)
    }
  }

  for (const locale of localeCandidates) {
    const region = `${locale ?? ''}`.split('-')[1]?.trim().toUpperCase()
    if (!region) continue

    const country = findPhoneCountryByIso2(region)
    if (country) return country.code
  }

  return fallbackCode
}

export function filterPhoneCountries(query = '', countries = PHONE_COUNTRIES) {
  const normalized = `${query ?? ''}`.trim().toLowerCase().replace(/^\+/, '')
  if (!normalized) return countries

  return countries.filter((country) => country.searchText.includes(normalized))
}

export function sortPhoneCountriesForDisplay(countries, selectedCode = '') {
  const selected = findPhoneCountryByCode(selectedCode)
  const priorityIso = new Set(PRIORITY_PHONE_COUNTRY_ISO2)
  const priority = []
  const regular = []

  countries.forEach((country) => {
    if (selected && country.iso2 === selected.iso2) return
    if (priorityIso.has(country.iso2)) {
      priority.push(country)
    } else {
      regular.push(country)
    }
  })

  const orderedPriority = PRIORITY_PHONE_COUNTRY_ISO2
    .map((iso2) => priority.find((country) => country.iso2 === iso2))
    .filter(Boolean)

  return [
    ...(selected ? [selected] : []),
    ...orderedPriority,
    ...regular,
  ]
}
