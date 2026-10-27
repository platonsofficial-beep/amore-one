import { supabase } from '../lib/supabaseClient'

export const AVATARS_BUCKET = 'avatars'
export const AVATAR_SIGNED_URL_SECONDS = 3600
const REFRESH_BEFORE_MS = 60 * 1000

const signedUrlCache = new Map()

export function clearAvatarUrlCache() {
  signedUrlCache.clear()
}

export function buildAvatarPath(authUserId, fileId = crypto.randomUUID()) {
  const owner = `${authUserId ?? ''}`.trim()
  const id = `${fileId ?? ''}`.trim()
  return `${owner}/${id}.jpg`
}

export function isOwnAvatarPath(authUserId, path) {
  const owner = `${authUserId ?? ''}`.trim()
  const value = `${path ?? ''}`.trim()
  if (!owner || !value) return false
  return value.startsWith(`${owner}/`) && value.endsWith('.jpg') && !value.slice(owner.length + 1).includes('/')
}

export function avatarErrorMessage(error) {
  const parts = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].map((part) => `${part ?? ''}`.toLowerCase()).join(' ')
  if (parts.includes('bad_avatar_path')) {
    return 'That photo could not be saved to your profile. Try again.'
  }
  if (parts.includes('payload too large') || parts.includes('exceeded the maximum') || parts.includes('file size')) {
    return 'That photo is too large. Try another one.'
  }
  return 'Could not update your photo. Try again.'
}

function requireClient() {
  if (!supabase) throw new Error('Photo upload is unavailable right now.')
  return supabase
}

export function mapAvatarRecord(record) {
  if (!record) return null
  const avatarPath = `${record.avatar_path ?? record.avatarPath ?? ''}`.trim()
  return {
    memberId: `${record.id ?? record.memberId ?? ''}`.trim(),
    employeeId: `${record.employee_id ?? record.employeeId ?? ''}`.trim(),
    authUserId: `${record.auth_user_id ?? record.authUserId ?? ''}`.trim(),
    avatarPath,
    avatarUpdatedAt: record.avatar_updated_at ?? record.avatarUpdatedAt ?? null,
  }
}

export async function fetchWorkspaceAvatarRecords(workspaceId) {
  const id = `${workspaceId ?? ''}`.trim()
  if (!id || !supabase) return []
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, employee_id, auth_user_id, avatar_path, avatar_updated_at')
    .eq('workspace_id', id)
  if (error) throw error
  return (data ?? []).map(mapAvatarRecord).filter(Boolean)
}

export async function resolveAvatarUrls(paths = []) {
  const unique = [...new Set(paths.map((path) => `${path ?? ''}`.trim()).filter(Boolean))]
  const result = new Map()
  if (unique.length === 0) return result

  const now = Date.now()
  const missing = []
  unique.forEach((path) => {
    const cached = signedUrlCache.get(path)
    if (cached && cached.expiresAt > now + REFRESH_BEFORE_MS) {
      result.set(path, cached.url)
      return
    }
    missing.push(path)
  })

  if (missing.length === 0 || !supabase) return result

  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .createSignedUrls(missing, AVATAR_SIGNED_URL_SECONDS)
  if (error) throw error

  const expiresAt = now + (AVATAR_SIGNED_URL_SECONDS * 1000)
  ;(data ?? []).forEach((row) => {
    const path = `${row?.path ?? ''}`.trim()
    const url = `${row?.signedUrl ?? ''}`.trim()
    if (!path || !url || row?.error) return
    signedUrlCache.set(path, { url, expiresAt })
    result.set(path, url)
  })
  return result
}

async function removeOwnAvatarFile(authUserId, path) {
  if (!isOwnAvatarPath(authUserId, path) || !supabase) return
  try {
    await supabase.storage.from(AVATARS_BUCKET).remove([path])
  } catch {
    // Removing the old file is optional. The profile row is already updated.
  }
}

export async function uploadMyAvatar({ authUserId, blob, previousPath = '' }) {
  const owner = `${authUserId ?? ''}`.trim()
  if (!owner) throw new Error('Sign in to update your photo.')
  if (!blob) throw new Error('Choose a photo first.')
  const client = requireClient()
  const path = buildAvatarPath(owner)
  const { error } = await client.storage.from(AVATARS_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw new Error(avatarErrorMessage(error))

  const { data, error: rpcError } = await client.rpc('set_my_avatar', { p_path: path })
  if (rpcError) {
    await removeOwnAvatarFile(owner, path)
    throw new Error(avatarErrorMessage(rpcError))
  }

  if (previousPath && previousPath !== path) {
    await removeOwnAvatarFile(owner, previousPath)
  }

  return {
    path,
    updatedCount: data,
    updatedAt: new Date().toISOString(),
  }
}

export async function removeMyAvatar({ authUserId, previousPath = '' } = {}) {
  const owner = `${authUserId ?? ''}`.trim()
  const client = requireClient()
  const { data, error } = await client.rpc('set_my_avatar', { p_path: null })
  if (error) throw new Error(avatarErrorMessage(error))
  if (previousPath) await removeOwnAvatarFile(owner, previousPath)
  return data
}
