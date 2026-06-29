import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(url) {
  if (!url) return ''

  return url
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/rest\/v1\//i, '/')
    .replace(/\/$/, '')
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export default supabase
