const PROFILE_SAVE_MESSAGES = [
  [
    'membership_employee_workspace_mismatch',
    'That employee belongs to a different venue, so the profile was not saved.',
  ],
]

const RAW_CODE = /^[a-z][a-z0-9_]*$/i

function errorText(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return [error.message, error.details, error.hint, error.code]
    .map((part) => `${part ?? ''}`.trim())
    .filter(Boolean)
    .join(' ')
}

/** Plain English for profile save. Raw trigger and RPC codes never reach the screen. */
export function formatProfileSaveError(error, fallback = 'Unable to save profile right now.') {
  const text = errorText(error)
  const folded = text.toLowerCase()
  for (const [code, message] of PROFILE_SAVE_MESSAGES) {
    if (folded.includes(code)) return message
  }

  const message = `${error?.message ?? (typeof error === 'string' ? error : '')}`.trim()
  if (!message || RAW_CODE.test(message)) return fallback
  return message
}
