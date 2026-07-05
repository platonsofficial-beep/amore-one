import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  getSession,
  onAuthStateChange,
  resetPasswordForEmail,
  signInWithPassword,
  signOut as authSignOut,
  signUp as authSignUp,
} from '../services/authService'

const DEV_MOCK_USER = {
  id: 'dev-local-user',
  email: 'development@local.one',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date(0).toISOString(),
}

const DEV_MOCK_SESSION = {
  access_token: 'dev-local-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'dev-local-refresh',
  user: DEV_MOCK_USER,
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const isAuthDisabled = import.meta.env.VITE_AUTH_DISABLED === 'true'
  const [session, setSession] = useState(isAuthDisabled ? DEV_MOCK_SESSION : null)
  const [user, setUser] = useState(isAuthDisabled ? DEV_MOCK_USER : null)
  const [isLoading, setIsLoading] = useState(!isAuthDisabled)

  useEffect(() => {
    if (isAuthDisabled) {
      return undefined
    }

    let isMounted = true

    getSession()
      .then((nextSession) => {
        if (!isMounted) return
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
      })
      .catch(() => {
        if (!isMounted) return
        setSession(null)
        setUser(null)
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    const unsubscribe = onAuthStateChange((nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [isAuthDisabled])

  const signIn = useCallback(async (email, password) => {
    const data = await signInWithPassword(email, password)
    setSession(data.session)
    setUser(data.user ?? data.session?.user ?? null)
    return data
  }, [])

  const signUp = useCallback(async (email, password) => {
    const data = await authSignUp(email, password)
    if (data.session) {
      setSession(data.session)
      setUser(data.user ?? data.session?.user ?? null)
    }
    return data
  }, [])

  const signOut = useCallback(async () => {
    await authSignOut()
    setSession(null)
    setUser(null)
  }, [])

  const resetPassword = useCallback(async (email) => {
    return resetPasswordForEmail(email)
  }, [])

  const value = useMemo(() => ({
    user,
    session,
    isLoading,
    isAuthDisabled,
    signIn,
    signUp,
    signOut,
    resetPassword,
  }), [user, session, isLoading, isAuthDisabled, signIn, signUp, signOut, resetPassword])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.')
  }

  return context
}
