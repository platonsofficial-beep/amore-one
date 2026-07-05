import { useAuth } from '../../context/AuthContext'
import { LoginView } from './LoginView'

export function AuthGate({ children }) {
  const { session, isLoading, isAuthDisabled } = useAuth()

  if (isAuthDisabled) {
    return children
  }

  if (isLoading) {
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

  return children
}
