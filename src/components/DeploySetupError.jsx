import { OneFullLogo } from './brand/OneFullLogo'
import { t } from '../i18n/i18n'

export function DeploySetupError({ message }) {
  return (
    <div className="auth-page auth-loading-page" role="alert">
      <div className="auth-card panel staff-panel">
        <header className="auth-header">
          <OneFullLogo compact />
          <h1 className="auth-title">{t("Deployment setup required")}</h1>
        </header>
        <div className="auth-banner auth-banner-error">
          {message}
        </div>
        <p className="auth-loading-text">
          {t("Configure Supabase environment variables in Vercel, redeploy, then reload this page.")}
        </p>
      </div>
    </div>
  )
}
