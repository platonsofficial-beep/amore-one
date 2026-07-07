import { useAuth } from '../../context/AuthContext'
import { LoginView } from './LoginView'

export function AuthGate({ children }) {
  const {
    session,
    isBootstrapping,
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

  if (!membership && membershipLoadError) {
    return (
      <div className="auth-page">
        <div className="auth-card panel staff-panel">
          <header className="auth-header">
            <p className="auth-brand">ONE</p>
            <h1 className="auth-title">Unable to join workspace</h1>
          </header>
          <div className="auth-banner auth-banner-error" role="alert">
            {membershipLoadError}
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
