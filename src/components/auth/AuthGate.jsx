import { OneFullLogo } from '../brand/OneFullLogo'
import { BOOTSTRAP_TIMEOUT_MESSAGE, useAuth } from '../../context/AuthContext'
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
          <OneFullLogo compact />
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
          <OneFullLogo compact />
          <p className="auth-loading-text">
            {isJoiningWorkspace || readPendingInviteToken()
              ? 'Joining your venue…'
              : 'Loading your venue…'}
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
            <OneFullLogo compact />
            <h1 className="auth-title">
              {membershipLoadError === BOOTSTRAP_TIMEOUT_MESSAGE ? 'Πρόβλημα σύνδεσης' : 'Unable to join this venue'}
            </h1>
          </header>
          <div className="auth-banner auth-banner-error" role="alert">
            {inviteErrorMessage}
          </div>
          <button type="button" className="primary-btn auth-submit-btn" onClick={() => window.location.reload()}>
            Try again
          </button>
          <button type="button" className="secondary-btn auth-submit-btn" onClick={() => signOut()}>
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
            <OneFullLogo compact />
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
