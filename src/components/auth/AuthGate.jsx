import { useAuth } from '../../context/AuthContext'
import { formatInviteErrorMessage, shouldShowJoiningWorkspaceMessage } from '../../lib/inviteFlowUtils'
import { readPendingInviteToken } from '../../lib/inviteTokenStorage'
import { LoginView } from './LoginView'

export function AuthGate({ children }) {
  const {
    session,
    isBootstrapping,
    isLoading,
    isJoiningWorkspace,
    isAuthDisabled,
    membership,
    membershipLoadError,
    signOut,
  } = useAuth()

  if (isAuthDisabled) {
    return children
  }

  if (isBootstrapping) {
    return (
      <div className="auth-page auth-loading-page" aria-busy="true" aria-live="polite">
        <div className="auth-loading-card panel staff-panel">
          <p className="auth-brand">ONE</p>
          <p className="auth-loading-text">Loading session…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginView />
  }

  const showJoiningWorkspace = shouldShowJoiningWorkspaceMessage({
    isLoading,
    isJoiningWorkspace,
    hasPendingInviteToken: Boolean(readPendingInviteToken()),
    membershipLoadError,
  })

  if (!membership && showJoiningWorkspace) {
    return (
      <div className="auth-page auth-loading-page" aria-busy="true" aria-live="polite">
        <div className="auth-loading-card panel staff-panel">
          <p className="auth-brand">ONE</p>
          <p className="auth-loading-text">
            {isJoiningWorkspace || readPendingInviteToken()
              ? 'Joining your workspace…'
              : 'Loading workspace…'}
          </p>
        </div>
      </div>
    )
  }

  if (!membership && membershipLoadError) {
    const inviteErrorMessage = formatInviteErrorMessage(membershipLoadError)

    return (
      <div className="auth-page">
        <div className="auth-card panel staff-panel">
          <header className="auth-header">
            <p className="auth-brand">ONE</p>
            <h1 className="auth-title">Unable to join workspace</h1>
          </header>
          <div className="auth-banner auth-banner-error" role="alert">
            {inviteErrorMessage}
          </div>
          <button type="button" className="primary-btn auth-submit-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (!membership) {
    return (
      <div className="auth-page">
        <div className="auth-card panel staff-panel">
          <header className="auth-header">
            <p className="auth-brand">ONE</p>
            <h1 className="auth-title">Workspace unavailable</h1>
          </header>
          <div className="auth-banner auth-banner-error" role="alert">
            No workspace membership was found for this account.
          </div>
          <button type="button" className="primary-btn auth-submit-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return children
}
