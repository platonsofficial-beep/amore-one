import { createClient } from '@supabase/supabase-js'
import { getSupabaseSetupError, readSupabaseEnv } from './supabaseEnv'

export { getSupabaseSetupError, readSupabaseEnv } from './supabaseEnv'

const { url: supabaseUrl, anonKey: supabaseAnonKey, isConfigured: isSupabaseConfigured } = readSupabaseEnv()

export const supabaseConfigError = getSupabaseSetupError()

if (!isSupabaseConfigured) {
  console.error(`[supabase] ${supabaseConfigError}`)
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export default supabase
