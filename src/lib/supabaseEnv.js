function normalizeSupabaseUrl(url) {
  if (!url) return ''

  return url
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/rest\/v1\//i, '/')
    .replace(/\/$/, '')
}

function readSupabaseAnonKey() {
  return import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? import.meta.env?.VITE_SUPABASE_ANON_KEY
    ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.VITE_SUPABASE_ANON_KEY
    ?? ''
}

export function readSupabaseEnv() {
  const url = normalizeSupabaseUrl(
    import.meta.env?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  )
  const anonKey = `${readSupabaseAnonKey()}`.trim()

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  }
}

export function getSupabaseSetupError() {
  const { url, anonKey } = readSupabaseEnv()

  if (!url && !anonKey) {
    return 'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
  }

  if (!url) {
    return 'Missing VITE_SUPABASE_URL. Add your Supabase project URL to the deployment environment.'
  }

  if (!anonKey) {
    return 'Missing Supabase anon key. Set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY in the deployment environment.'
  }

  return null
}
