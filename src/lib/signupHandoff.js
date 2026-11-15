import { setLocale } from '../i18n/i18n'

export const SIGNUP_HANDOFF_KEY = 'one.signupHandoff.v1'
const LOCALE_KEY = 'one.locale'
const NAME_MAX = 80
const VENUE_MAX = 120
const EMAIL_MAX = 254
const HANDOFF_PARAMS = ['signup', 'email', 'name', 'venue', 'plan', 'lang']

export function sanitizeSignupText(value, max) {
  return `${value ?? ''}`
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function sanitizeSignupEmail(value) {
  const email = sanitizeSignupText(value, EMAIL_MAX).toLowerCase()
  if (!email || email.includes(' ') || !email.includes('@')) return ''
  const [local, domain, extra] = email.split('@')
  if (!local || !domain || extra !== undefined || !domain.includes('.')) return ''
  return email
}

/** Only start and pro are accepted. Anything else becomes start. */
export function sanitizeSignupPlan(value) {
  return `${value ?? ''}`.trim().toLowerCase() === 'pro' ? 'pro' : 'start'
}

export function parseSignupHandoff(search = '') {
  const params = new URLSearchParams(`${search ?? ''}`.replace(/^\?/, ''))
  if (params.get('signup') !== '1') return null
  const lang = `${params.get('lang') ?? ''}`.trim().toLowerCase()
  return {
    email: sanitizeSignupEmail(params.get('email')),
    name: sanitizeSignupText(params.get('name'), NAME_MAX),
    venue: sanitizeSignupText(params.get('venue'), VENUE_MAX),
    plan: sanitizeSignupPlan(params.get('plan')),
    lang: lang === 'el' || lang === 'en' ? lang : '',
  }
}

export function signupAuthMetadata(handoff) {
  if (!handoff) return null
  const data = { plan: sanitizeSignupPlan(handoff.plan) }
  const name = sanitizeSignupText(handoff.name, NAME_MAX)
  const venue = sanitizeSignupText(handoff.venue, VENUE_MAX)
  if (name) data.full_name = name
  if (venue) data.venue_name = venue
  return data
}

function readStored(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SIGNUP_HANDOFF_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    return parseSignupHandoff(`?signup=1&email=${encodeURIComponent(parsed.email || '')}&name=${encodeURIComponent(parsed.name || '')}&venue=${encodeURIComponent(parsed.venue || '')}&plan=${encodeURIComponent(parsed.plan || '')}&lang=${encodeURIComponent(parsed.lang || '')}`)
  } catch {
    return null
  }
}

export function readSignupHandoff() {
  if (typeof sessionStorage !== 'undefined') {
    const fromSession = readStored(sessionStorage)
    if (fromSession) return fromSession
  }
  if (typeof localStorage !== 'undefined') return readStored(localStorage)
  return null
}

export function writeSignupHandoff(handoff) {
  if (!handoff) return
  const payload = JSON.stringify({
    email: handoff.email || '',
    name: handoff.name || '',
    venue: handoff.venue || '',
    plan: sanitizeSignupPlan(handoff.plan),
    lang: handoff.lang || '',
  })
  try { sessionStorage.setItem(SIGNUP_HANDOFF_KEY, payload) } catch { /* private mode */ }
  try { localStorage.setItem(SIGNUP_HANDOFF_KEY, payload) } catch { /* private mode */ }
}

function hasSavedLocale() {
  try {
    const stored = `${localStorage.getItem(LOCALE_KEY) ?? ''}`.trim().toLowerCase()
    return stored === 'el' || stored === 'en'
  } catch {
    return false
  }
}

function stripHandoffParams(win) {
  const url = new URL(win.location.href)
  let changed = false
  for (const key of HANDOFF_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  if (!changed) return
  const next = `${url.pathname}${url.search}${url.hash}`
  win.history.replaceState(win.history.state, '', next)
}

/** Read the marketing link once. Saved language wins over lang=. */
export function applySignupHandoff(win = typeof window === 'undefined' ? undefined : window) {
  if (!win?.location) return null
  const parsed = parseSignupHandoff(win.location.search)
  if (!parsed) return readSignupHandoff()
  writeSignupHandoff(parsed)
  if (parsed.lang && !hasSavedLocale()) setLocale(parsed.lang)
  stripHandoffParams(win)
  return parsed
}

export function signupVenueChoice(user) {
  const meta = user?.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}
  const stored = readSignupHandoff()
  const venue = sanitizeSignupText(meta.venue_name || stored?.venue || '', VENUE_MAX)
  const name = sanitizeSignupText(meta.full_name || meta.name || stored?.name || '', NAME_MAX)
  const plan = sanitizeSignupPlan(meta.plan || stored?.plan)
  return { venue, name, plan }
}
