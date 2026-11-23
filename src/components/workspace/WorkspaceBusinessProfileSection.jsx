import {
  MAX_WORKSPACE_LOGO_BYTES,
  WORKSPACE_PROFILE_CURRENCIES,
} from '../../lib/workspaceProfileOptions'
import { isWorkspaceProfileConfigured } from '../../lib/workspaceProfileUtils'
import { useState } from 'react'
import { LoadingButton } from '../LoadingButton'
import { WorkspaceTimezonePicker } from './WorkspaceTimezonePicker'
import { t } from '../../i18n/i18n'
import { PhoneCountryPicker } from '../reservations/PhoneCountryPicker'
import { resolveWorkspaceDefaultPhoneCountryCode } from '../../lib/reservationPhoneUtils'
import { LoadFailureBanner } from '../shell/LoadFailureBanner'
import { isLoadFailureMessage } from '../../lib/userFacingLoadError'

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
  onRetry,
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
          <p className="eyebrow">{t("Venue")}</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🏢</span>
            {t("Business Profile")}
          </h3>
          <p className="workspace-section-subtitle">
            {t("Configure your business identity for the Operations Dashboard.")}
          </p>
        </div>
      </div>

      {isLoadFailureMessage(noticeMessage) ? (
        <LoadFailureBanner message={noticeMessage} subject="the business profile" onRetry={onRetry} />
      ) : noticeMessage ? (
        <div className={`staff-status-banner${noticeIsError ? ' auth-banner-error' : ' auth-banner-success'}`} role="status">
          {noticeMessage}
        </div>
      ) : null}
      {isLoading && !isLoadFailureMessage(noticeMessage) ? <div className="staff-status-banner">{t("Loading business profile…")}</div> : null}
      {!isLoading && !isWorkspaceProfileConfigured(workspaceProfile) ? (
        <div className="staff-status-banner">
          {t("Set your business details so ONE can personalize dashboards and reports.")}
        </div>
      ) : null}

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("Business identity")}</p>
            <h3>{t("Profile details")}</h3>
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
              <span>{t("Business Name")}</span>
              <input
                data-help="setup.profile-name"
                value={workspaceProfile.businessName}
                onChange={(event) => onChange({ ...workspaceProfile, businessName: event.target.value })}
                placeholder={t("e.g. The Harbour Bar")}
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>{t("Time zone")}</span>
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
              <span>{t("Currency")}</span>
              <select
                value={workspaceProfile.currency}
                onChange={(event) => onChange({ ...workspaceProfile, currency: event.target.value })}
                disabled={isLoading || isSavePending}
              >
                <option value="">{t("Not set")}</option>
                {WORKSPACE_PROFILE_CURRENCIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>{t("Country code")}</span>
              <input
                value={workspaceProfile.countryCode}
                onChange={(event) => onChange({ ...workspaceProfile, countryCode: event.target.value.toUpperCase() })}
                placeholder={t("CY")}
                maxLength={2}
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>{t("Country")}</span>
              <input
                value={workspaceProfile.countryName}
                onChange={(event) => onChange({ ...workspaceProfile, countryName: event.target.value })}
                placeholder={t("Cyprus")}
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>{t("City")}</span>
              <input
                value={workspaceProfile.city}
                onChange={(event) => onChange({ ...workspaceProfile, city: event.target.value })}
                placeholder={t("Nicosia")}
                disabled={isLoading || isSavePending}
              />
            </label>
            <label className="form-field">
              <span>{t("Default phone country")}</span>
              <PhoneCountryPicker
                className="workspace-default-phone-country"
                value={resolveWorkspaceDefaultPhoneCountryCode(workspaceProfile)}
                onChange={(code) => onChange({ ...workspaceProfile, defaultPhoneCountryCode: code })}
                disabled={isLoading || isSavePending}
                ariaLabel={t("Default phone country")}
              />
            </label>
            <label className="form-field full-width">
              <span>{t("Logo")}</span>
              <div className="workspace-logo-field">
                {workspaceProfile.logoUrl ? (
                  <div className="workspace-logo-preview">
                    <img src={workspaceProfile.logoUrl} alt={t("Business logo preview")} />
                  </div>
                ) : (
                  <div className="workspace-logo-placeholder">{t("No logo uploaded")}</div>
                )}
                <div className="workspace-logo-actions">
                  <label className="ghost-btn small workspace-logo-upload-btn">
                    {t("Upload logo")}
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
                      {t("Remove logo")}
                    </button>
                  ) : null}
                </div>
                <small className="workspace-logo-hint">{t("PNG, JPG, WEBP, or SVG up to {{size}} KB.", { size: Math.round(MAX_WORKSPACE_LOGO_BYTES / 1024) })}</small>
              </div>
            </label>
          </div>

          <div className="modal-actions">
            <LoadingButton
              type="submit"
              className="workspace-action-btn"
              loading={isSavePending}
              loadingLabel={t("Saving…")}
              disabled={isLoading || !isDirty}
            >
              {t("Save Profile")}
            </LoadingButton>
          </div>
        </form>
      </div>
    </>
  )
}
