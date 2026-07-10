import { getDefaultWorkspaceTimezone } from './workspaceProfileOptions'

export const BROWSER_DEFAULT_TIMEZONE_VALUE = ''

const CURATED_TIMEZONE_GROUPS = [
  {
    id: 'europe',
    label: 'Europe',
    options: [
      {
        value: 'Europe/Nicosia',
        cityLabel: 'Nicosia',
        aliases: ['cyprus', 'cy', 'eet'],
      },
      {
        value: 'Europe/Athens',
        cityLabel: 'Athens',
        aliases: ['greece', 'gr', 'hellas', 'eet'],
      },
      {
        value: 'Europe/London',
        cityLabel: 'London',
        aliases: ['united kingdom', 'uk', 'gb', 'great britain', 'england', 'gmt', 'bst'],
      },
      {
        value: 'Europe/Paris',
        cityLabel: 'Paris',
        aliases: ['france', 'fr', 'cet'],
      },
      {
        value: 'Europe/Berlin',
        cityLabel: 'Berlin',
        aliases: ['germany', 'de', 'cet'],
      },
      {
        value: 'Europe/Rome',
        cityLabel: 'Rome',
        aliases: ['italy', 'it', 'cet'],
      },
      {
        value: 'Europe/Madrid',
        cityLabel: 'Madrid',
        aliases: ['spain', 'es', 'cet'],
      },
    ],
  },
  {
    id: 'north-america',
    label: 'North America',
    options: [
      {
        value: 'America/New_York',
        cityLabel: 'New York',
        subtitle: 'Eastern',
        aliases: ['eastern', 'est', 'edt', 'us east', 'new york'],
      },
      {
        value: 'America/Chicago',
        cityLabel: 'Chicago',
        subtitle: 'Central',
        aliases: ['central', 'cst', 'cdt', 'us central', 'chicago'],
      },
      {
        value: 'America/Denver',
        cityLabel: 'Denver',
        subtitle: 'Mountain',
        aliases: ['mountain', 'mst', 'mdt', 'denver'],
      },
      {
        value: 'America/Los_Angeles',
        cityLabel: 'Los Angeles',
        subtitle: 'Pacific',
        aliases: ['pacific', 'pst', 'pdt', 'los angeles', 'la'],
      },
      {
        value: 'America/Toronto',
        cityLabel: 'Toronto',
        aliases: ['canada', 'ca', 'ontario', 'toronto', 'eastern canada'],
      },
      {
        value: 'America/Vancouver',
        cityLabel: 'Vancouver',
        aliases: ['british columbia', 'vancouver', 'pacific canada'],
      },
    ],
  },
  {
    id: 'middle-east-asia',
    label: 'Middle East & Asia',
    options: [
      {
        value: 'Asia/Dubai',
        cityLabel: 'Dubai',
        aliases: ['united arab emirates', 'uae', 'ae', 'dubai', 'gulf'],
      },
      {
        value: 'Asia/Singapore',
        cityLabel: 'Singapore',
        aliases: ['singapore', 'sg'],
      },
      {
        value: 'Asia/Tokyo',
        cityLabel: 'Tokyo',
        aliases: ['japan', 'jp', 'tokyo', 'jst'],
      },
    ],
  },
  {
    id: 'oceania',
    label: 'Oceania',
    options: [
      {
        value: 'Australia/Sydney',
        cityLabel: 'Sydney',
        aliases: ['australia', 'au', 'sydney', 'aest'],
      },
    ],
  },
]

const EXTENDED_SEARCH_TIMEZONES = [
  { value: 'America/Phoenix', cityLabel: 'Phoenix', aliases: ['arizona', 'mst'] },
  { value: 'America/Anchorage', cityLabel: 'Anchorage', aliases: ['alaska', 'akst'] },
  { value: 'Pacific/Honolulu', cityLabel: 'Honolulu', aliases: ['hawaii', 'hst'] },
  { value: 'Europe/Amsterdam', cityLabel: 'Amsterdam', aliases: ['netherlands', 'nl'] },
  { value: 'Europe/Zurich', cityLabel: 'Zurich', aliases: ['switzerland', 'ch'] },
  { value: 'Asia/Hong_Kong', cityLabel: 'Hong Kong', aliases: ['hong kong', 'hk'] },
  { value: 'Asia/Seoul', cityLabel: 'Seoul', aliases: ['korea', 'kr', 'kst'] },
  { value: 'Asia/Kolkata', cityLabel: 'Kolkata', aliases: ['india', 'in', 'ist'] },
]

const VENUE_TIMEZONE_RULES = [
  { timeZone: 'Europe/Nicosia', countries: ['cyprus', 'cy'], cities: ['nicosia'] },
  { timeZone: 'Europe/Athens', countries: ['greece', 'gr', 'hellas'], cities: ['athens'] },
  { timeZone: 'Europe/London', countries: ['united kingdom', 'uk', 'gb', 'great britain', 'england'], cities: ['london'] },
  { timeZone: 'Europe/Paris', countries: ['france', 'fr'], cities: ['paris'] },
  { timeZone: 'Europe/Berlin', countries: ['germany', 'de'], cities: ['berlin'] },
  { timeZone: 'Europe/Rome', countries: ['italy', 'it'], cities: ['rome'] },
  { timeZone: 'Europe/Madrid', countries: ['spain', 'es'], cities: ['madrid'] },
  { timeZone: 'Asia/Dubai', countries: ['united arab emirates', 'uae', 'ae'], cities: ['dubai'] },
  { timeZone: 'Asia/Singapore', countries: ['singapore', 'sg'], cities: ['singapore'] },
  { timeZone: 'Asia/Tokyo', countries: ['japan', 'jp'], cities: ['tokyo'] },
  { timeZone: 'Australia/Sydney', countries: ['australia', 'au'], cities: ['sydney'] },
  { timeZone: 'America/Toronto', countries: ['canada', 'ca'], cities: ['toronto'] },
  { timeZone: 'America/Vancouver', countries: ['canada', 'ca'], cities: ['vancouver'] },
]

function normalizeLocationToken(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

function normalizeSearchToken(value) {
  return normalizeLocationToken(value).replace(/\s+/g, ' ')
}

export function isValidIanaTimezone(timeZone) {
  const trimmed = `${timeZone ?? ''}`.trim()
  if (!trimmed) return false

  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed })
    return true
  } catch {
    return false
  }
}

export function formatIanaCityLabel(timeZone) {
  const trimmed = `${timeZone ?? ''}`.trim()
  if (!trimmed) return 'Timezone'

  const segment = trimmed.split('/').pop() ?? trimmed
  return segment
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatTimezoneOffsetLabel(timeZone, date = new Date()) {
  const trimmed = `${timeZone ?? ''}`.trim()
  if (!trimmed || !isValidIanaTimezone(trimmed)) return ''

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: trimmed,
      timeZoneName: 'shortOffset',
    }).formatToParts(date)

    const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
    return offset.replace(/^UTC/i, 'GMT')
  } catch {
    return ''
  }
}

function buildOptionMeta(option, date = new Date()) {
  const offsetLabel = formatTimezoneOffsetLabel(option.value, date)
  const secondaryLabel = `${option.value}${offsetLabel ? ` · ${offsetLabel}` : ''}`

  return {
    value: option.value,
    cityLabel: option.cityLabel,
    subtitle: option.subtitle ?? '',
    iana: option.value,
    offsetLabel,
    secondaryLabel,
    aliases: option.aliases ?? [],
    searchText: [
      option.cityLabel,
      option.subtitle,
      option.value,
      ...(option.aliases ?? []),
    ].filter(Boolean).join(' ').toLowerCase(),
  }
}

let curatedOptionCache = null

function getCuratedTimezoneOptions() {
  if (curatedOptionCache) return curatedOptionCache

  curatedOptionCache = CURATED_TIMEZONE_GROUPS.flatMap((group) => (
    group.options.map((option) => ({
      ...buildOptionMeta(option),
      groupId: group.id,
      groupLabel: group.label,
    }))
  ))

  return curatedOptionCache
}

function getExtendedTimezoneOptions() {
  return EXTENDED_SEARCH_TIMEZONES.map((option) => buildOptionMeta(option))
}

export function getCuratedTimezoneOption(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed) return null
  return getCuratedTimezoneOptions().find((option) => option.value === trimmed) ?? null
}

export function getAllSearchableTimezoneOptions(date = new Date()) {
  const seen = new Set()
  const options = []

  getCuratedTimezoneOptions().forEach((option) => {
    if (seen.has(option.value)) return
    seen.add(option.value)
    options.push(option)
  })

  getExtendedTimezoneOptions().forEach((option) => {
    if (seen.has(option.value)) return
    seen.add(option.value)
    options.push(option)
  })

  return options.map((option) => buildOptionMeta({
    value: option.value,
    cityLabel: option.cityLabel,
    subtitle: option.subtitle,
    aliases: option.aliases,
  }, date))
}

export function inferVenueTimezone({
  countryCode = '',
  countryName = '',
  city = '',
} = {}) {
  const code = normalizeLocationToken(countryCode)
  const country = normalizeLocationToken(countryName)
  const cityToken = normalizeLocationToken(city)

  for (const rule of VENUE_TIMEZONE_RULES) {
    const countryMatch = rule.countries.some((entry) => (
      entry === code || entry === country || country.includes(entry)
    ))
    const cityMatch = rule.cities.some((entry) => (
      entry === cityToken || cityToken.includes(entry)
    ))

    if (cityMatch && (countryMatch || !country)) {
      return rule.timeZone
    }

    if (countryMatch && !cityToken && rule.cities.length === 1) {
      return rule.timeZone
    }
  }

  return ''
}

export function resolveTimezoneDisplay(value, date = new Date()) {
  const trimmed = `${value ?? ''}`.trim()

  if (!trimmed) {
    const browserTimeZone = getDefaultWorkspaceTimezone()
    const browserOffset = browserTimeZone
      ? formatTimezoneOffsetLabel(browserTimeZone, date)
      : ''

    return {
      value: BROWSER_DEFAULT_TIMEZONE_VALUE,
      cityLabel: 'Browser default',
      iana: browserTimeZone,
      offsetLabel: browserOffset,
      secondaryLabel: browserTimeZone
        ? `${browserTimeZone}${browserOffset ? ` · ${browserOffset}` : ''}`
        : 'Uses this device\'s local time',
      isBrowserDefault: true,
      isValid: true,
    }
  }

  const curated = getCuratedTimezoneOption(trimmed)
  const isValid = isValidIanaTimezone(trimmed)
  const cityLabel = curated?.cityLabel ?? formatIanaCityLabel(trimmed)
  const offsetLabel = isValid ? formatTimezoneOffsetLabel(trimmed, date) : ''

  return {
    value: trimmed,
    cityLabel,
    iana: trimmed,
    offsetLabel,
    secondaryLabel: `${trimmed}${offsetLabel ? ` · ${offsetLabel}` : ''}`,
    isBrowserDefault: false,
    isValid,
  }
}

export function buildBrowserDefaultOption(date = new Date()) {
  const display = resolveTimezoneDisplay(BROWSER_DEFAULT_TIMEZONE_VALUE, date)
  return {
    ...display,
    kind: 'browser-default',
    searchText: 'browser default local device',
  }
}

export function buildVenueRecommendedOption(profile = {}, date = new Date()) {
  const timeZone = inferVenueTimezone(profile)
  if (!timeZone) return null

  const curated = getCuratedTimezoneOption(timeZone)
  const display = resolveTimezoneDisplay(timeZone, date)

  return {
    ...display,
    kind: 'venue',
    cityLabel: curated?.cityLabel ?? display.cityLabel,
    searchText: [
      display.cityLabel,
      display.iana,
      profile.countryName,
      profile.countryCode,
      profile.city,
      'venue recommended',
    ].join(' ').toLowerCase(),
  }
}

export function buildTimezonePickerSections({
  savedValue = '',
  countryCode = '',
  countryName = '',
  city = '',
  date = new Date(),
} = {}) {
  const sections = []
  const recommended = [buildBrowserDefaultOption(date)]

  const venueOption = buildVenueRecommendedOption({
    countryCode,
    countryName,
    city,
  }, date)

  if (venueOption && !`${savedValue ?? ''}`.trim()) {
    recommended.push(venueOption)
  }

  sections.push({
    id: 'recommended',
    label: 'Recommended',
    options: recommended,
  })

  CURATED_TIMEZONE_GROUPS.forEach((group) => {
    sections.push({
      id: group.id,
      label: group.label,
      options: group.options.map((option) => ({
        ...buildOptionMeta(option, date),
        kind: 'curated',
      })),
    })
  })

  return sections
}

export function searchTimezoneOptions(query, date = new Date()) {
  const normalizedQuery = normalizeSearchToken(query)
  if (!normalizedQuery) return []

  return getAllSearchableTimezoneOptions(date).filter((option) => (
    option.searchText.includes(normalizedQuery)
      || option.value.toLowerCase().includes(normalizedQuery)
      || option.cityLabel.toLowerCase().includes(normalizedQuery)
  ))
}

export function flattenTimezonePickerSections(sections = []) {
  return sections.flatMap((section) => (
    section.options.map((option) => ({
      ...option,
      sectionId: section.id,
      sectionLabel: section.label,
    }))
  ))
}

export function getTimezoneOptionLabel(option) {
  if (!option) return ''
  if (option.kind === 'browser-default') return 'Browser default'
  return option.cityLabel || option.iana || option.value
}

export function getTimezonePickerValueForSelection(option) {
  if (!option) return BROWSER_DEFAULT_TIMEZONE_VALUE
  if (option.kind === 'browser-default') return BROWSER_DEFAULT_TIMEZONE_VALUE
  return option.value ?? BROWSER_DEFAULT_TIMEZONE_VALUE
}
