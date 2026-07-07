import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getSession,
  onAuthStateChange,
  resetPasswordForEmail,
  signInWithPassword,
  signOut as authSignOut,
  signUp as authSignUp,
} from '../services/authService'
import { acceptInvite } from '../services/inviteService'
import { createOwnerMembershipIfMissing, getCurrentMembershipContext } from '../services/membershipService'
import { getWorkspaceRoleLabel, isOwnerRole, normalizeWorkspaceRole } from '../lib/membershipRoles'
import {
  captureInviteTokenFromLocation,
  clearPendingInviteToken,
  readPendingInviteToken,
} from '../lib/inviteTokenStorage'
import {
  isCompleteWorkspace,
  normalizeAuthWorkspace,
  resolveWorkspaceForMembership,
} from '../services/workspaceService'

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

const DEV_MOCK_WORKSPACE = {
  id: 'dev-workspace-id',
  name: 'AMORE.NICOSIA',
  slug: 'amore-nicosia',
  createdAt: null,
  updatedAt: null,
}

function buildDevMembership(displayName = '') {
  const trimmedName = `${displayName ?? ''}`.trim()

  return {
    id: 'dev-membership-id',
    workspaceId: DEV_MOCK_WORKSPACE.id,
    authUserId: DEV_MOCK_USER.id,
    employeeId: null,
    displayName: trimmedName || 'Development user',
    email: DEV_MOCK_USER.email,
    role: 'owner',
    createdAt: null,
    lastSeenAt: null,
  }
}

function normalizeMembershipForContext(membership) {
  if (!membership) return null

  const employeeId = `${membership.employeeId ?? membership.employee_id ?? ''}`.trim() || null

  if (employeeId === membership.employeeId) {
    return membership
  }

  return {
    ...membership,
    employeeId,
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const isAuthDisabled = import.meta.env.VITE_AUTH_DISABLED === 'true'
  const [session, setSession] = useState(isAuthDisabled ? DEV_MOCK_SESSION : null)
  const [user, setUser] = useState(isAuthDisabled ? DEV_MOCK_USER : null)
  const [workspace, setWorkspace] = useState(isAuthDisabled ? DEV_MOCK_WORKSPACE : null)
  const [membership, setMembership] = useState(isAuthDisabled ? buildDevMembership() : null)
  const [membershipLoadError, setMembershipLoadError] = useState(null)
  const [workspaceLoadError, setWorkspaceLoadError] = useState(null)
  const [devProfileDisplayName, setDevProfileDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(!isAuthDisabled)
  const [isBootstrapping, setIsBootstrapping] = useState(!isAuthDisabled)
  const authLoadSeqRef = useRef(0)
  const hasBootstrappedRef = useRef(isAuthDisabled)
  const activeUserIdRef = useRef(isAuthDisabled ? DEV_MOCK_USER.id : '')

  const syncDevMembershipProfile = useCallback(({ displayName = '' } = {}) => {
    setDevProfileDisplayName(`${displayName ?? ''}`.trim())
  }, [])

  const finishBootstrapping = useCallback(() => {
    hasBootstrappedRef.current = true
    setIsBootstrapping(false)
    setIsLoading(false)
  }, [])

  const syncSessionOnly = useCallback((nextSession) => {
    const nextUser = nextSession?.user ?? null
    setSession(nextSession)
    setUser(nextUser)
    activeUserIdRef.current = `${nextUser?.id ?? ''}`.trim()
  }, [])

  const clearAuthenticatedState = useCallback(() => {
    activeUserIdRef.current = ''
    setSession(null)
    setUser(null)
    setWorkspace(null)
    setMembership(null)
    setMembershipLoadError(null)
    setWorkspaceLoadError(null)
  }, [])

  const loadWorkspaceContext = useCallback(async (nextUser) => {
    const loadSeq = ++authLoadSeqRef.current
    const userId = `${nextUser?.id ?? ''}`.trim()
    if (!userId) {
      setWorkspace(null)
      setMembership(null)
      setMembershipLoadError(null)
      return
    }

    setMembershipLoadError(null)
    setWorkspaceLoadError(null)

    const activeSession = await getSession()
    const sessionUserId = `${activeSession?.user?.id ?? ''}`.trim()
    const membershipUserId = sessionUserId || userId

    let resolvedMembership = null
    let joinedWorkspaceRecord = null
    let skipDefaultBootstrap = false

    const pendingInviteToken = readPendingInviteToken()
    if (pendingInviteToken) {
      try {
        await acceptInvite(pendingInviteToken)
        clearPendingInviteToken()
        skipDefaultBootstrap = true
      } catch (inviteError) {
        const message = inviteError?.message || 'Unable to accept workspace invite.'
        console.error('[AuthContext] acceptInvite error:', inviteError)

        if (/not found|expired|revoked|already been accepted/i.test(message)) {
          clearPendingInviteToken()
        }

        setMembershipLoadError(message)
      }
    }

    try {
      const membershipContext = await getCurrentMembershipContext(membershipUserId)
      if (loadSeq !== authLoadSeqRef.current) return

      resolvedMembership = membershipContext.membership
      joinedWorkspaceRecord = membershipContext.joinedWorkspaceRecord ?? membershipContext.workspace
    } catch (membershipQueryError) {
      const message = membershipQueryError?.message || 'Unable to load workspace membership.'
      console.error('[AuthContext] membership query error:', membershipQueryError)
      setMembershipLoadError(message)
    }

    if (!resolvedMembership && !skipDefaultBootstrap) {
      try {
        const createdMembership = await createOwnerMembershipIfMissing(activeSession?.user ?? nextUser)
        if (loadSeq !== authLoadSeqRef.current) return

        if (createdMembership) {
          resolvedMembership = createdMembership
        }
      } catch (createMembershipError) {
        const message = createMembershipError?.message || 'Unable to create workspace membership.'
        console.error('[AuthContext] createOwnerMembershipIfMissing error:', createMembershipError)
        setMembershipLoadError((current) => current || message)
      }
    }

    if (loadSeq !== authLoadSeqRef.current) return

    setMembership(normalizeMembershipForContext(resolvedMembership))

    let resolvedWorkspace = normalizeAuthWorkspace({
      membership: resolvedMembership,
      joinedWorkspace: joinedWorkspaceRecord,
    })

    if (!isCompleteWorkspace(resolvedWorkspace)) {
      try {
        const fetchedWorkspace = await resolveWorkspaceForMembership(resolvedMembership?.workspaceId)
        if (loadSeq !== authLoadSeqRef.current) return

        resolvedWorkspace = normalizeAuthWorkspace({
          membership: resolvedMembership,
          joinedWorkspace: joinedWorkspaceRecord,
          fetchedWorkspace,
        })
      } catch (workspaceError) {
        const message = workspaceError?.message || 'Unable to load workspace.'
        console.error('[AuthContext] workspace load error:', workspaceError)
        setWorkspaceLoadError(message)
      }
    }

    if (!isCompleteWorkspace(resolvedWorkspace)) {
      setWorkspaceLoadError('No workspace found in public.workspaces. Add a workspace row to continue.')
    }

    if (loadSeq !== authLoadSeqRef.current) return

    setWorkspace(isCompleteWorkspace(resolvedWorkspace) ? resolvedWorkspace : null)
  }, [])

  const refreshMembership = useCallback(async () => {
    const userId = `${user?.id ?? activeUserIdRef.current ?? ''}`.trim()
    if (!userId) return null

    try {
      const membershipContext = await getCurrentMembershipContext(userId)
      const nextMembership = normalizeMembershipForContext(membershipContext.membership)
      setMembership(nextMembership)
      return nextMembership
    } catch (error) {
      console.error('[AuthContext] refreshMembership error:', error)
      throw error
    }
  }, [user?.id])

  useEffect(() => {
    if (isAuthDisabled) {
      setMembership(buildDevMembership(devProfileDisplayName))
      setWorkspace(DEV_MOCK_WORKSPACE)
      setMembershipLoadError(null)
      setWorkspaceLoadError(null)
      hasBootstrappedRef.current = true
      activeUserIdRef.current = DEV_MOCK_USER.id
      setIsBootstrapping(false)
      setIsLoading(false)
    }
  }, [isAuthDisabled, devProfileDisplayName])

  useEffect(() => {
    if (isAuthDisabled) {
      return undefined
    }

    captureInviteTokenFromLocation()

    let isMounted = true

    const hydrateAuthenticatedSession = async (nextSession, { blockUi = false } = {}) => {
      const nextUser = nextSession?.user ?? null
      const nextUserId = `${nextUser?.id ?? ''}`.trim()

      syncSessionOnly(nextSession)

      if (!nextUserId) {
        if (!isMounted) return
        clearAuthenticatedState()
        finishBootstrapping()
        return
      }

      if (blockUi) {
        setIsLoading(true)
      }

      try {
        await loadWorkspaceContext(nextUser)
      } catch (error) {
        console.error('[AuthContext] loadWorkspaceContext error:', error)
      } finally {
        if (isMounted) {
          finishBootstrapping()
        }
      }
    }

    const bootstrapAuth = async () => {
      setIsBootstrapping(true)
      setIsLoading(true)

      try {
        const nextSession = await getSession()
        if (!isMounted) return
        await hydrateAuthenticatedSession(nextSession, { blockUi: false })
      } catch (error) {
        console.error('[AuthContext] bootstrapAuth error:', error)
        if (!isMounted) return
        clearAuthenticatedState()
        finishBootstrapping()
      }
    }

    bootstrapAuth()

    const unsubscribe = onAuthStateChange((event, nextSession) => {
      if (!isMounted) return

      const nextUserId = `${nextSession?.user?.id ?? ''}`.trim()
      const currentUserId = activeUserIdRef.current

      if (event === 'INITIAL_SESSION' && hasBootstrappedRef.current) {
        return
      }

      if (event === 'TOKEN_REFRESHED') {
        if (!nextUserId) return
        syncSessionOnly(nextSession)
        return
      }

      if (event === 'SIGNED_OUT' || !nextUserId) {
        clearAuthenticatedState()
        finishBootstrapping()
        return
      }

      const isSameUser = Boolean(nextUserId && currentUserId && nextUserId === currentUserId)

      if (hasBootstrappedRef.current && isSameUser) {
        syncSessionOnly(nextSession)
        loadWorkspaceContext(nextSession.user).catch((error) => {
          console.error('[AuthContext] background workspace refresh error:', error)
        })
        return
      }

      if (hasBootstrappedRef.current) {
        hydrateAuthenticatedSession(nextSession, { blockUi: true })
        return
      }

      hydrateAuthenticatedSession(nextSession, { blockUi: false })
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [isAuthDisabled, clearAuthenticatedState, finishBootstrapping, loadWorkspaceContext, syncSessionOnly])

  const signIn = useCallback(async (email, password) => {
    const data = await signInWithPassword(email, password)
    const nextUser = data.user ?? data.session?.user ?? null
    setSession(data.session)
    setUser(nextUser)
    setIsLoading(true)

    try {
      if (nextUser) {
        activeUserIdRef.current = `${nextUser.id ?? ''}`.trim()
        await loadWorkspaceContext(nextUser)
      }
    } finally {
      hasBootstrappedRef.current = true
      setIsLoading(false)
    }

    return data
  }, [loadWorkspaceContext])

  const signUp = useCallback(async (email, password) => {
    const data = await authSignUp(email, password)
    const nextUser = data.user ?? data.session?.user ?? null

    if (data.session && nextUser) {
      setSession(data.session)
      setUser(nextUser)
      setIsLoading(true)

      try {
        activeUserIdRef.current = `${nextUser.id ?? ''}`.trim()
        await loadWorkspaceContext(nextUser)
      } finally {
        hasBootstrappedRef.current = true
        setIsLoading(false)
      }
    }

    return data
  }, [loadWorkspaceContext])

  const signOut = useCallback(async () => {
    await authSignOut()
    hasBootstrappedRef.current = true
    clearAuthenticatedState()
    setIsLoading(false)
  }, [clearAuthenticatedState])

  const resetPassword = useCallback(async (email) => {
    return resetPasswordForEmail(email)
  }, [])

  const role = useMemo(() => {
    if (membership?.role) {
      return normalizeWorkspaceRole(membership.role, membership.role)
    }
    if (isAuthDisabled) {
      return 'owner'
    }
    return ''
  }, [membership?.role, isAuthDisabled])

  const roleLabel = useMemo(() => {
    if (membership?.role) {
      return getWorkspaceRoleLabel(normalizeWorkspaceRole(membership.role, membership.role))
    }
    if (isAuthDisabled) {
      return 'Owner'
    }
    if (isLoading) {
      return 'Loading…'
    }
    return 'Unassigned'
  }, [membership?.role, isAuthDisabled, isLoading])

  const isOwner = useMemo(
    () => isOwnerRole(role),
    [role],
  )

  const value = useMemo(() => ({
    user,
    session,
    membership,
    workspace,
    role,
    roleLabel,
    isOwner,
    isLoading,
    isBootstrapping,
    isAuthDisabled,
    membershipLoadError,
    workspaceLoadError,
    signIn,
    signUp,
    signOut,
    resetPassword,
    syncDevMembershipProfile,
    refreshMembership,
  }), [
    user,
    session,
    membership,
    workspace,
    role,
    roleLabel,
    isOwner,
    isLoading,
    isBootstrapping,
    isAuthDisabled,
    membershipLoadError,
    workspaceLoadError,
    signIn,
    signUp,
    signOut,
    resetPassword,
    syncDevMembershipProfile,
    refreshMembership,
  ])

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
