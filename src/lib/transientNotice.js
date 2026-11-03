// 0032: success banners ("Task created.", "Note added.") are transient; errors stay.
const SUCCESS_NOTICE = /\b(created|added|updated|saved|deleted|removed|published|hidden|completed|reopened|generated|duplicated)\b\.?\s*$/i

export function isTransientSuccessNotice(message) {
  const text = `${message ?? ''}`.trim()
  if (!text) return false
  if (/^(unable|could not|failed|error)/i.test(text)) return false
  return SUCCESS_NOTICE.test(text)
}

export const TRANSIENT_NOTICE_MS = 5000
