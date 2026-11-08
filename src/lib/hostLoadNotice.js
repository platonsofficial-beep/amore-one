export const HOST_LOAD_FAILED_COPY = "Couldn't load"
export const HOST_LOAD_RETRY_LABEL = 'Retry'

const TECHNICAL_LOAD_ERROR = /failed to fetch|typeerror|networkerror|network request failed|load failed|fetch failed/i

export function formatHostLoadError(message = '') {
  const raw = `${message ?? ''}`.trim()
  const text = raw.replace(/^(TypeError|Error):\s*/i, '').trim()
  if (!text) return ''
  if (TECHNICAL_LOAD_ERROR.test(raw) || TECHNICAL_LOAD_ERROR.test(text)) {
    return HOST_LOAD_FAILED_COPY
  }
  return text.length > 160 ? HOST_LOAD_FAILED_COPY : text
}

export function isHostLoadFailureMessage(message = '') {
  const text = `${message ?? ''}`.trim()
  if (!text) return false
  if (text === HOST_LOAD_FAILED_COPY) return true
  return TECHNICAL_LOAD_ERROR.test(text)
}
