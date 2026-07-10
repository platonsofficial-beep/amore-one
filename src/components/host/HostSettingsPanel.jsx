import { findPhoneCountryByIso2 } from '../../lib/phoneCountries'

export function HostSettingsPanel({
  profile = {},
  workspaceProfile = {},
  membership = null,
  onClose,
  onSignOut,
}) {
  const country = findPhoneCountryByIso2(workspaceProfile.countryCode)
  const phoneDefault = workspaceProfile.defaultPhoneCountryCode || country?.code || ''

  return (
    <div className="host-settings-panel" role="dialog" aria-modal="true" aria-labelledby="host-settings-title">
      <header className="host-settings-header">
        <h2 id="host-settings-title">Host settings</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>

      <div className="host-settings-scroll">
        <section className="host-settings-section">
          <h3>Profile</h3>
          <p><strong>{profile.name || 'Host user'}</strong></p>
          {profile.email ? <p>{profile.email}</p> : null}
          {profile.phone ? <p>{profile.phone}</p> : null}
          {membership?.employeeName ? <p>Linked employee: {membership.employeeName}</p> : null}
        </section>

        <section className="host-settings-section">
          <h3>Venue</h3>
          <p>{workspaceProfile.businessName || 'Workspace'}</p>
          {workspaceProfile.city || workspaceProfile.countryName ? (
            <p>
              {[workspaceProfile.city, workspaceProfile.countryName].filter(Boolean).join(', ')}
            </p>
          ) : null}
          {workspaceProfile.timezone ? <p>Timezone: {workspaceProfile.timezone}</p> : null}
          {phoneDefault ? <p>Default phone: {phoneDefault}</p> : null}
        </section>
      </div>

      <footer className="host-settings-footer">
        <button type="button" className="host-settings-signout" onClick={onSignOut}>
          Sign out
        </button>
      </footer>
    </div>
  )
}
