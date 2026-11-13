import { supabase } from '../lib/supabaseClient'

function isMissingTable(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01' || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find the table')
}

function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    phone: row.phone_e164,
    displayName: row.display_name || '',
    notes: row.notes || '',
    blacklisted: row.blacklisted === true,
    blacklistReason: row.blacklist_reason || '',
  }
}

export async function loadGuestProfiles(workspaceId) {
  const id = `${workspaceId ?? ''}`.trim()
  if (!id || !supabase) return { available: false, profiles: [] }
  const { data, error } = await supabase
    .from('guest_profiles')
    .select('id, workspace_id, phone_e164, display_name, notes, blacklisted, blacklist_reason')
    .eq('workspace_id', id)
  if (error) return { available: !isMissingTable(error) ? false : false, profiles: [] }
  return { available: true, profiles: (data ?? []).map(mapProfile).filter(Boolean) }
}

export async function saveGuestProfile({ workspaceId, phone, notes, displayName }) {
  if (!supabase) {
    const error = new Error('Guest notes are not turned on yet.')
    error.code = 'unavailable'
    throw error
  }
  const { data, error } = await supabase.from('guest_profiles').upsert([{
    workspace_id: workspaceId,
    phone_e164: phone,
    display_name: displayName || '',
    notes: notes || '',
  }], { onConflict: 'workspace_id,phone_e164' }).select('id, workspace_id, phone_e164, display_name, notes, blacklisted, blacklist_reason').single()
  if (error) {
    if (isMissingTable(error)) {
      const missing = new Error('Guest notes are not turned on yet.')
      missing.code = 'unavailable'
      throw missing
    }
    throw new Error('Could not save the guest notes.')
  }
  return mapProfile(data)
}

export async function setGuestBlacklist({ workspaceId, phone, displayName, blacklisted, reason }) {
  if (!supabase) {
    const error = new Error('Blacklist is not turned on yet.')
    error.code = 'unavailable'
    throw error
  }
  const { data, error } = await supabase.from('guest_profiles').upsert([{
    workspace_id: workspaceId,
    phone_e164: phone,
    display_name: displayName || '',
    blacklisted: blacklisted === true,
    blacklist_reason: blacklisted ? (reason || '') : '',
  }], { onConflict: 'workspace_id,phone_e164' }).select('id, workspace_id, phone_e164, display_name, notes, blacklisted, blacklist_reason').single()
  if (error) {
    if (isMissingTable(error)) {
      const missing = new Error('Blacklist is not turned on yet.')
      missing.code = 'unavailable'
      throw missing
    }
    throw new Error('Could not update the blacklist.')
  }
  return mapProfile(data)
}
