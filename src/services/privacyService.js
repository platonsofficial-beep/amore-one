import { supabase } from '../lib/supabaseClient'

export const DELETE_ACCOUNT_CONFIRM_WORD = 'ΔΙΑΓΡΑΦΗ'

const ERROR_MESSAGES = {
  sole_owner: 'Είσαι ο μοναδικός ιδιοκτήτης σε ανοιχτό venue. Όρισε άλλον ιδιοκτήτη ή κλείσε το venue πρώτα.',
  confirmation_required: `Γράψε ${DELETE_ACCOUNT_CONFIRM_WORD} για επιβεβαίωση.`,
  confirmation_mismatch: 'Το όνομα δεν ταιριάζει με το όνομα του venue.',
  already_closed: 'Το venue είναι ήδη κλειστό.',
  not_reopenable: 'Η περίοδος επαναφοράς έχει λήξει.',
  not_allowed: 'Δεν έχεις δικαίωμα για αυτή την ενέργεια.',
  not_authenticated: 'Συνδέσου ξανά και δοκίμασε πάλι.',
}

export function formatPrivacyError(error, fallback = 'Κάτι πήγε στραβά. Δοκίμασε ξανά.') {
  const message = `${error?.message ?? ''}`
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
  if (`${confirmWord ?? ''}`.trim() !== DELETE_ACCOUNT_CONFIRM_WORD) {
    throw new Error(ERROR_MESSAGES.confirmation_required)
  }
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
