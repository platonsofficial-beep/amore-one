export function DeploySetupError({ message }) {
  return (
    <div className="auth-page auth-loading-page" role="alert">
      <div className="auth-card panel staff-panel">
        <header className="auth-header">
          <p className="auth-brand">ONE</p>
          <h1 className="auth-title">Deployment setup required</h1>
        </header>
        <div className="auth-banner auth-banner-error">
          {message}
        </div>
        <p className="auth-loading-text">
          Configure Supabase environment variables in Vercel, redeploy, then reload this page.
        </p>
      </div>
    </div>
  )
}
