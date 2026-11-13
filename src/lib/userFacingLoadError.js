import { t } from '../i18n/i18n'

const TECHNICAL_ERROR = /cannot read propert|typeerror|referenceerror|syntaxerror|is not a function|is not defined|failed to fetch|networkerror|network request failed|load failed|fetch failed|jwt|pgrst|permission denied for|does not exist|of null|of undefined|reading ['"]/i

export const LOAD_RETRY_LABEL = 'Retry'

export function isTechnicalErrorText(value) {
  const text = `${value?.message ?? value ?? ''}`.trim()
  if (!text) return false
  return TECHNICAL_ERROR.test(text)
}

export function isPlainLoadFailure(value) {
  return /^couldn't load\b/i.test(`${value ?? ''}`.trim())
}

export function isLoadFailureMessage(value) {
  return isTechnicalErrorText(value) || isPlainLoadFailure(value)
}

export function formatUserFacingLoadError(subject = 'this') {
  const name = `${subject ?? ''}`.trim() || 'this'
  return t("Couldn't load {{name}}. Check your connection and try again.", { name })
}

export function logLoadFailure(subject, error) {
  console.error(`[load] Couldn't load ${subject}`, error)
}

export function presentLoadFailure(error, subject = 'this') {
  logLoadFailure(subject, error)
  return formatUserFacingLoadError(subject)
}

export function presentUserError(error, fallback) {
  const raw = `${error?.message ?? error ?? ''}`.trim()
  if (!raw || isTechnicalErrorText(raw)) {
    if (raw) console.error('[ui]', error)
    return fallback
  }
  return raw
}

export function unavailableFigure(loadFailed, value) {
  if (loadFailed) return '—'
  return value
}
