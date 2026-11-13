import { useCallback, useSyncExternalStore } from 'react'
import en from './locales/en.json'
import el from './locales/el.json'

/** Languages ONE will speak. Phase 1 ships English and Greek. */
export const LOCALES = [
  { id: 'en', native: 'English', label: 'English' },
  { id: 'el', native: 'Ελληνικά', label: 'Greek' },
  { id: 'it', native: 'Italiano', label: 'Italian' },
  { id: 'fr', native: 'Français', label: 'French' },
  { id: 'de', native: 'Deutsch', label: 'German' },
  { id: 'ru', native: 'Русский', label: 'Russian' },
]

export const FUTURE_LOCALES = ['bg', 'ro', 'fil']

const CATALOGS = { en, el }

export const ACTIVE_LOCALE_IDS = Object.keys(CATALOGS)

const STORAGE_KEY = 'one.locale'

function normalizeLocale(value) {
  const code = `${value ?? ''}`.trim().toLowerCase().replace('_', '-')
  if (!code) return ''
  const primary = code.split('-')[0]
  return ACTIVE_LOCALE_IDS.includes(primary) ? primary : ''
}

export function detectLocale() {
  try {
    const stored = normalizeLocale(localStorage.getItem(STORAGE_KEY))
    if (stored) return stored
  } catch {
    // Private mode can block storage. Fall through to the device language.
  }
  if (typeof navigator !== 'undefined') {
    const fromDevice = normalizeLocale(navigator.language)
    if (fromDevice) return fromDevice
  }
  return 'en'
}

let locale = detectLocale()
const listeners = new Set()

function emit() {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'el' ? 'el' : 'en'
  }
  listeners.forEach((listener) => listener())
}

export function getLocale() {
  return locale
}

export function localeTag() {
  return locale === 'el' ? 'el-GR' : 'en-GB'
}

/** Display locale. English keeps the tag the screen already used, so existing formatting stays put. */
export function uiLocale(englishTag = 'en-GB') {
  return locale === 'el' ? 'el-GR' : englishTag
}

export function setLocale(next) {
  const normalized = normalizeLocale(next)
  if (!normalized || normalized === locale) return locale
  locale = normalized
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // The in-memory choice still applies for this visit.
  }
  emit()
  return locale
}

export function subscribeLocale(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const pluralRules = new Map()

function pluralCategory(count, localeId) {
  const tag = localeId === 'el' ? 'el' : localeId || 'en'
  let rules = pluralRules.get(tag)
  if (!rules) {
    rules = new Intl.PluralRules(tag)
    pluralRules.set(tag, rules)
  }
  const amount = Number(count)
  if (!Number.isFinite(amount)) return 'other'
  return rules.select(amount)
}

/** i18next-style plurals: `key_one`, `key_other`, and the other CLDR categories. */
function pluralKey(key, vars, localeId) {
  if (!vars || vars.count == null) return key
  return `${key}_${pluralCategory(vars.count, localeId)}`
}

export function translate(key, vars, localeId = locale) {
  const text = `${key ?? ''}`
  const catalog = CATALOGS[localeId] || CATALOGS.en
  const counted = pluralKey(text, vars, localeId)
  let value = catalog[counted] ?? CATALOGS.en[counted] ?? catalog[text] ?? CATALOGS.en[text] ?? text
  if (vars && typeof vars === 'object') {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{{${name}}}`, `${replacement ?? ''}`)
    }
  }
  return value
}

const GREEK_TONOS = {
  ά: 'α', Ά: 'Α', έ: 'ε', Έ: 'Ε', ή: 'η', Ή: 'Η', ί: 'ι', Ί: 'Ι', ϊ: 'ι', ΐ: 'ι',
  ό: 'ο', Ό: 'Ο', ύ: 'υ', Ύ: 'Υ', ϋ: 'υ', ΰ: 'υ', ώ: 'ω', Ώ: 'Ω',
}

/** Uppercase without the tonos Greek capitals keep under CSS text-transform. */
export function upper(value) {
  const stripped = `${value ?? ''}`.replace(/[άΆέΈήΉίΊϊΐόΌύΎϋΰώΏ]/g, (char) => GREEK_TONOS[char] || char)
  return stripped.toLocaleUpperCase('el-GR')
}

const GREEK_LETTERS = /[Α-ωΆ-ώϊϋΐΰ]/

function uppercaseTextNode(node) {
  const parent = node.parentElement
  if (!parent || parent.closest('input, textarea, select, script, style')) return
  const transform = getComputedStyle(parent).textTransform
  if (transform !== 'uppercase' && transform !== 'capitalize') return
  const raw = node.nodeValue
  if (!raw || !GREEK_LETTERS.test(raw)) return
  const next = transform === 'capitalize'
    ? raw.replace(/\S+/g, (word) => `${upper(word.charAt(0))}${word.slice(1)}`)
    : upper(raw)
  if (next !== raw) node.nodeValue = next
}

export function applyGreekUppercase(root = document.body) {
  if (!root || getLocale() !== 'el') return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    uppercaseTextNode(node)
    node = walker.nextNode()
  }
}

export function t(key, vars) {
  return translate(key, vars)
}

export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, () => 'en')
}

export function useT() {
  const current = useLocale()
  return useCallback((key, vars) => translate(key, vars, current), [current])
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = locale === 'el' ? 'el' : 'en'
}
