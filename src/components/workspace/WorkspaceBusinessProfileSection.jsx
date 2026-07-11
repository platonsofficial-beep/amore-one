import {
  MAX_WORKSPACE_LOGO_BYTES,
  WORKSPACE_PROFILE_CURRENCIES,
} from '../../lib/workspaceProfileOptions'
import { isWorkspaceProfileConfigured } from '../../lib/workspaceProfileUtils'
import { useState } from 'react'
import { LoadingButton } from '../LoadingButton'
import { WorkspaceTimezonePicker } from './WorkspaceTimezonePicker'

export function WorkspaceBusinessProfileSection({
  workspaceProfile,
  noticeMessage,
  isLoading,
  isSaving,
  isDirty = true,
  onChange,
  onSubmit,
  onLogoFileChange,
  onClearLogo,
}) {
  const noticeIsError = Boolean(
    noticeMessage && !/saved|updated|success/i.test(noticeMessage),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSave = async () => {
    if (isLoading || isSaving || isSubmitting || !isDirty) return

    setIsSubmitting(true)
    try {
      await onSubmit?.()
    } finally {
      setIsSubmitting(false)
    }
  }

  const isSavePending = isSaving || isSubmitting

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

      {noticeMessage ? (
        <div className={`staff-status-banner${noticeIsError ? ' auth-banner-error' : ' auth-banner-success'}`} role="status">
          {noticeMessage}
        </div>
      ) : null}
      {isLoading ? <div className="staff-status-banner">Loading workspace profile…</div> : null}
      {!isLoading && !isWorkspaceProfileConfigured(workspaceProfile) ? (
        <div className="staff-status-banner">
          Set your business name and manager details so ONE can personalize dashboards and reports.
        </div>
      ) : null}

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
            void handleSave()
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span>Business Name</span>
              <input
                value={workspaceProfile.businessName}
                onChange={(event) => onChange({ ...workspaceProfile, businessName: event.target.value })}
                placeholder="e.g. Amore Nicosia"
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>Manager Full Name</span>
              <input
                value={workspaceProfile.managerName}
                onChange={(event) => onChange({ ...workspaceProfile, managerName: event.target.value })}
                placeholder="Full name"
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>Manager Role</span>
              <input
                value={workspaceProfile.managerRole}
                onChange={(event) => onChange({ ...workspaceProfile, managerRole: event.target.value })}
                placeholder="e.g. General Manager"
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>Time zone</span>
              <WorkspaceTimezonePicker
                value={workspaceProfile.timezone}
                onChange={(timezone) => onChange({ ...workspaceProfile, timezone })}
                disabled={isLoading || isSavePending}
                countryCode={workspaceProfile.countryCode}
                countryName={workspaceProfile.countryName}
                city={workspaceProfile.city}
              />
            </label>
            <label className="form-field">
              <span>Currency</span>
              <select
                value={workspaceProfile.currency}
                onChange={(event) => onChange({ ...workspaceProfile, currency: event.target.value })}
                disabled={isLoading || isSavePending}
              >
                <option value="">Not set</option>
                {WORKSPACE_PROFILE_CURRENCIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Country code</span>
              <input
                value={workspaceProfile.countryCode}
                onChange={(event) => onChange({ ...workspaceProfile, countryCode: event.target.value.toUpperCase() })}
                placeholder="CY"
                maxLength={2}
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>Country</span>
              <input
                value={workspaceProfile.countryName}
                onChange={(event) => onChange({ ...workspaceProfile, countryName: event.target.value })}
                placeholder="Cyprus"
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>City</span>
              <input
                value={workspaceProfile.city}
                onChange={(event) => onChange({ ...workspaceProfile, city: event.target.value })}
                placeholder="Nicosia"
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>Default phone country</span>
              <input
                value={workspaceProfile.defaultPhoneCountryCode}
                onChange={(event) => onChange({ ...workspaceProfile, defaultPhoneCountryCode: event.target.value })}
                placeholder="+357"
                disabled={isLoading || isSavePending}
              />
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
                      disabled={isLoading || isSavePending}
                      hidden
                    />
                  </label>
                  {workspaceProfile.logoUrl ? (
                    <button type="button" className="ghost-btn small" onClick={onClearLogo} disabled={isLoading || isSavePending}>
                      Remove logo
                    </button>
                  ) : null}
                </div>
                <small className="workspace-logo-hint">PNG, JPG, WEBP, or SVG up to {Math.round(MAX_WORKSPACE_LOGO_BYTES / 1024)} KB.</small>
              </div>
            </label>
          </div>

          <div className="modal-actions">
            <LoadingButton
              type="submit"
              className="workspace-action-btn"
              loading={isSavePending}
              loadingLabel="Saving..."
              disabled={isLoading || !isDirty}
            >
              Save Profile
            </LoadingButton>
          </div>
        </form>
      </div>
    </>
  )
}
