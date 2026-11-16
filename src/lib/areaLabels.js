import { t } from '../i18n/i18n'

const AREA_KEYS = {
  all: 'All',
  bar: 'Bar',
  service: 'Service',
  kitchen: 'Kitchen',
  management: 'Management',
  terrace: 'Terrace',
  vip: 'VIP',
  lounge: 'Lounge',
  'vip lounge': 'VIP Lounge',
  garden: 'Garden',
  reception: 'Reception',
  host: 'Host',
  other: 'Other',
  general: 'General',
}

const CHOICE_KEYS = {
  active: 'Active',
  working: 'Working',
  evening: 'Evening',
  morning: 'Morning',
  night: 'Night',
  break: 'Break',
  leave: 'Leave',
  disabled: 'Disabled',
  'flexible / rotating': 'Flexible / Rotating',
  'day off': 'Day Off',
}

function lookupKey(raw) {
  const normalized = `${raw ?? ''}`.trim().toLowerCase()
  return AREA_KEYS[normalized] || CHOICE_KEYS[normalized] || ''
}

/** Translate a known area, department, or status word. Unknown text stays as stored. */
export function translateKnownLabel(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  const key = lookupKey(raw)
  return key ? t(key) : raw
}

/** Translate "Bar / Beverage" style labels, leaving the stored separators in place. */
export function translatePlaceLabel(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return ''
  const whole = lookupKey(raw)
  if (whole) return t(whole)

  return raw.split(/(\s*\/\s*)/).map((part) => {
    if (!part || part.includes('/')) return part
    return translateKnownLabel(part.trim())
  }).join('')
}
