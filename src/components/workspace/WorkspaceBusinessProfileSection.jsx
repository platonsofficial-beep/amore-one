import {
  MAX_WORKSPACE_LOGO_BYTES,
  WORKSPACE_PROFILE_CURRENCIES,
  WORKSPACE_PROFILE_TIMEZONES,
} from '../../lib/workspaceProfileOptions'

export function WorkspaceBusinessProfileSection({
  workspaceProfile,
  noticeMessage,
  isLoading,
  isSaving,
  onChange,
  onSubmit,
  onLogoFileChange,
  onClearLogo,
}) {
  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🏢</span>
            Business Profile
          </h3>
          <p className="workspace-section-subtitle">
            Configure your business identity and manager details for the Operations Dashboard.
          </p>
        </div>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading workspace profile…</div> : null}

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Business identity</p>
            <h3>Profile details</h3>
          </div>
        </div>

        <form
          className="employee-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span>Business Name</span>
              <input
                value={workspaceProfile.businessName}
                onChange={(event) => onChange({ ...workspaceProfile, businessName: event.target.value })}
                placeholder="e.g. Amore Nicosia"
                disabled={isLoading || isSaving}
              />
            </label>
            <label className="form-field">
              <span>Manager Full Name</span>
              <input
                value={workspaceProfile.managerName}
                onChange={(event) => onChange({ ...workspaceProfile, managerName: event.target.value })}
                placeholder="Full name"
                disabled={isLoading || isSaving}
              />
            </label>
            <label className="form-field">
              <span>Manager Role</span>
              <input
                value={workspaceProfile.managerRole}
                onChange={(event) => onChange({ ...workspaceProfile, managerRole: event.target.value })}
                placeholder="e.g. General Manager"
                disabled={isLoading || isSaving}
              />
            </label>
            <label className="form-field">
              <span>Timezone</span>
              <select
                value={workspaceProfile.timezone}
                onChange={(event) => onChange({ ...workspaceProfile, timezone: event.target.value })}
                disabled={isLoading || isSaving}
              >
                <option value="">Browser default</option>
                {WORKSPACE_PROFILE_TIMEZONES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Currency</span>
              <select
                value={workspaceProfile.currency}
                onChange={(event) => onChange({ ...workspaceProfile, currency: event.target.value })}
                disabled={isLoading || isSaving}
              >
                <option value="">Not set</option>
                {WORKSPACE_PROFILE_CURRENCIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field full-width">
              <span>Logo</span>
              <div className="workspace-logo-field">
                {workspaceProfile.logoUrl ? (
                  <div className="workspace-logo-preview">
                    <img src={workspaceProfile.logoUrl} alt="Workspace logo preview" />
                  </div>
                ) : (
                  <div className="workspace-logo-placeholder">No logo uploaded</div>
                )}
                <div className="workspace-logo-actions">
                  <label className="ghost-btn small workspace-logo-upload-btn">
                    Upload logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={onLogoFileChange}
                      disabled={isLoading || isSaving}
                      hidden
                    />
                  </label>
                  {workspaceProfile.logoUrl ? (
                    <button type="button" className="ghost-btn small" onClick={onClearLogo} disabled={isLoading || isSaving}>
                      Remove logo
                    </button>
                  ) : null}
                </div>
                <small className="workspace-logo-hint">PNG, JPG, WEBP, or SVG up to {Math.round(MAX_WORKSPACE_LOGO_BYTES / 1024)} KB.</small>
              </div>
            </label>
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary-btn workspace-action-btn" disabled={isLoading || isSaving}>
              {isSaving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
