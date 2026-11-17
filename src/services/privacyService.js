import { getLocale, t } from '../i18n/i18n'
import { supabase } from '../lib/supabaseClient'

/** Greek confirmation. The live RPC still requires this exact token. */
export const DELETE_ACCOUNT_CONFIRM_WORD = 'ΔΙΑΓΡΑΦΗ'
export const DELETE_ACCOUNT_CONFIRM_WORD_EN = 'DELETE'

/** The word the open language asks the person to type. */
export function deleteConfirmWord(locale = getLocale()) {
  return locale === 'el' ? DELETE_ACCOUNT_CONFIRM_WORD : DELETE_ACCOUNT_CONFIRM_WORD_EN
}

/** Either language's word. DELETE ignores case; both ignore surrounding spaces. */
export function acceptsDeleteConfirmation(word) {
  const trimmed = `${word ?? ''}`.trim()
  if (!trimmed) return false
  if (trimmed.toUpperCase() === DELETE_ACCOUNT_CONFIRM_WORD_EN) return true
  return trimmed.toLocaleUpperCase('el-GR') === DELETE_ACCOUNT_CONFIRM_WORD
}

const ERROR_MESSAGES = {
  sole_owner: 'You are the only owner of an open venue. Assign another owner or close the venue first.',
  confirmation_mismatch: 'That name does not match the venue name.',
  already_closed: 'This venue is already closed.',
  not_reopenable: 'The reopen period has ended.',
  not_allowed: 'You do not have permission for this action.',
  not_authenticated: 'Sign in again and try once more.',
}

function confirmationRequiredMessage() {
  return t('Type {{word}} to confirm', { word: deleteConfirmWord() })
}

export function formatPrivacyError(error, fallback = 'Something went wrong. Try again.') {
  const message = `${error?.message ?? ''}`
  if (message.includes('confirmation_required')) return confirmationRequiredMessage()
  const code = Object.keys(ERROR_MESSAGES).find((key) => message.includes(key))
  if (!code) return message || fallback
  if (code === 'sole_owner' && error?.details) {
    return `${ERROR_MESSAGES.sole_owner} (${error.details})`
  }
  return ERROR_MESSAGES[code]
}

async function callRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    console.error(`[privacyService] ${name} error:`, error)
    const wrapped = new Error(formatPrivacyError(error))
    wrapped.code = error.code
    throw wrapped
  }
  return data
}

export function buildExportFilename(prefix, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10)
  const safe = `${prefix ?? 'one'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'one'
  return `${safe}-${stamp}.json`
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportMyData() {
  return callRpc('export_my_data')
}

export function exportWorkspaceData(workspaceId) {
  return callRpc('export_workspace_data', { p_workspace_id: workspaceId })
}

export function closeVenue(workspaceId, confirmName) {
  return callRpc('close_workspace_venue', { p_workspace_id: workspaceId, p_confirm_name: confirmName })
}

export function reopenVenue(workspaceId) {
  return callRpc('reopen_workspace_venue', { p_workspace_id: workspaceId })
}

/** Anonymises + locks the account, then removes the user's avatar file (best effort). */
export async function deleteMyAccount(confirmWord, { avatarPath = '' } = {}) {
  if (!acceptsDeleteConfirmation(confirmWord)) {
    throw new Error(confirmationRequiredMessage())
  }
  // Production delete_my_account still checks for ΔΙΑΓΡΑΦΗ only.
  // The app accepts DELETE in English, then sends that existing token.
  // supabase/privacy_03_delete_confirm_word.sql teaches the function itself
  // to accept either word. It is not applied from this change.
  const result = await callRpc('delete_my_account', { p_confirm: DELETE_ACCOUNT_CONFIRM_WORD })
  if (avatarPath) {
    try {
      await supabase.storage.from('avatars').remove([avatarPath])
    } catch (error) {
      console.warn('[privacyService] avatar cleanup skipped:', error)
    }
  }
  return result
}
