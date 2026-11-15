/**
 * Locale-aware cast for auth-disabled demo sessions only.
 * Real venues never read this: every helper returns null unless login is bypassed.
 */

import cast from './demoMediaCast.json'

const EL = cast.el
const EN = cast.en

export function isDemoMode(env = import.meta.env) {
  return env?.VITE_AUTH_DISABLED === 'true'
}

export function demoMediaCast(localeId = 'en') {
  return localeId === 'el' ? EL : EN
}

/** Venue label for a demo session. Null when auth is on, so live venues are unchanged. */
export function demoVenueName(localeId = 'en', env = import.meta.env) {
  if (!isDemoMode(env)) return null
  return demoMediaCast(localeId).venue
}

/** Signed-in demo person. Null when auth is on. */
export function demoManagerName(localeId = 'en', env = import.meta.env) {
  if (!isDemoMode(env)) return null
  return demoMediaCast(localeId).managerName
}

/**
 * Overlay the demo venue and manager onto a loaded profile.
 * Returns the profile unchanged outside demo mode.
 */
export function applyDemoProfile(profile, localeId = 'en', env = import.meta.env) {
  if (!isDemoMode(env) || !profile) return profile
  const cast = demoMediaCast(localeId)
  return {
    ...profile,
    businessName: cast.venue,
    managerName: cast.managerName,
    city: cast.city,
    countryName: cast.country,
    countryCode: cast.countryCode,
  }
}
