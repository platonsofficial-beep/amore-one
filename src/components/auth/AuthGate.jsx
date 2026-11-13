import { OneFullLogo } from '../brand/OneFullLogo'
import { BOOTSTRAP_TIMEOUT_MESSAGE, useAuth } from '../../context/AuthContext'
import { formatInviteErrorMessage, shouldShowJoiningWorkspaceMessage } from '../../lib/inviteFlowUtils'
import { readPendingInviteToken } from '../../lib/inviteTokenStorage'
import { LoginView } from './LoginView'
import { t } from '../../i18n/i18n'

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
          <p className="auth-loading-text">{t("Loading session…")}</p>
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
              ? t("Joining your venue…")
              : t("Loading your venue…")}
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
              {membershipLoadError === BOOTSTRAP_TIMEOUT_MESSAGE ? t('Connection problem') : t('Unable to join this venue')}
            </h1>
          </header>
          <div className="auth-banner auth-banner-error" role="alert">
            {inviteErrorMessage}
          </div>
          <button type="button" className="primary-btn auth-submit-btn" onClick={() => window.location.reload()}>
            {t("Try again")}
          </button>
          <button type="button" className="secondary-btn auth-submit-btn" onClick={() => signOut()}>
            {t("Sign out")}
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
            <h1 className="auth-title">{t("Workspace unavailable")}</h1>
          </header>
          <div className="auth-banner auth-banner-error" role="alert">
            {t("No workspace membership was found for this account.")}
          </div>
          <button type="button" className="primary-btn auth-submit-btn" onClick={() => signOut()}>
            {t("Sign out")}
          </button>
        </div>
      </div>
    )
  }

  return children
}
