import { supabase } from '../lib/supabaseClient'

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message || 'Unable to load session.')
  }

  return data.session
}

export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    // Defer async membership work to avoid Supabase auth deadlocks.
    setTimeout(() => {
      callback(event, session)
    }, 0)
  })

  return () => subscription.unsubscribe()
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${email ?? ''}`.trim(),
    password: `${password ?? ''}`,
  })

  if (error) {
    throw error
  }

  return data
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: `${email ?? ''}`.trim(),
    password: `${password ?? ''}`,
  })

  if (error) {
    throw error
  }

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

export async function resetPasswordForEmail(email) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`

  const { data, error } = await supabase.auth.resetPasswordForEmail(
    `${email ?? ''}`.trim(),
    { redirectTo },
  )

  if (error) {
    throw error
  }

  return data
}
