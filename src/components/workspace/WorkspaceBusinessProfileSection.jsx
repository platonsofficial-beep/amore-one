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
import { ReservationPhoneField } from '../reservations/ReservationPhoneField'
import { resolveWorkspaceDefaultPhoneCountryCode } from '../../lib/reservationPhoneUtils'
import { venueContactEmailError, venueContactPhoneError } from '../../lib/venueContact'
import { captureVenueLocation, coordinateIsSet } from '../../lib/venueLocation'
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
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ phone: '', email: '' })
  const locationSaved = coordinateIsSet(workspaceProfile.venueLat)
    && coordinateIsSet(workspaceProfile.venueLng)

  const handleSave = async () => {
    if (isLoading || isSaving || isSubmitting || !isDirty) return
    const phone = venueContactPhoneError(workspaceProfile.venuePhone)
    const email = venueContactEmailError(workspaceProfile.contactEmail)
    setFieldErrors({ phone, email })
    if (phone || email) return

    setIsSubmitting(true)
    try {
      await onSubmit?.()
    } finally {
      setIsSubmitting(false)
    }
  }

  const isSavePending = isSaving || isSubmitting

  const locateVenue = async () => {
    if (isLoading || isSavePending || locating) return
    setLocating(true)
    setLocationError('')
    try {
      const result = await captureVenueLocation()
      if (result.errorKey) {
        setLocationError(result.errorKey)
        return
      }
      onChange({
        ...workspaceProfile,
        venueLat: result.lat,
        venueLng: result.lng,
        venueAddress: result.geocodeFailed
          ? workspaceProfile.venueAddress
          : (result.address || workspaceProfile.venueAddress),
        city: result.city || workspaceProfile.city,
      })
    } finally {
      setLocating(false)
    }
  }

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
          noValidate
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
            <label className="form-field full-width" htmlFor="workspace-venue-phone">
              <span>{t("Venue phone")}</span>
              <ReservationPhoneField
                id="workspace-venue-phone"
                value={workspaceProfile.venuePhone || ''}
                workspaceProfile={workspaceProfile}
                disabled={isLoading || isSavePending}
                placeholder={t("Local number")}
                onChange={(venuePhone) => {
                  setFieldErrors((current) => ({ ...current, phone: '' }))
                  onChange({ ...workspaceProfile, venuePhone })
                }}
              />
              {fieldErrors.phone ? <small className="workspace-field-error">{t(fieldErrors.phone)}</small> : null}
            </label>
            <label className="form-field full-width">
              <span>{t("Address")}</span>
              <input
                value={workspaceProfile.venueAddress || ''}
                onChange={(event) => onChange({
                  ...workspaceProfile,
                  venueAddress: event.target.value,
                  venueLat: null,
                  venueLng: null,
                })}
                placeholder={t("Street and number")}
                disabled={isLoading || isSavePending}
                autoComplete="street-address"
              />
            </label>
            <div className="workspace-location-row" id="workspace-venue-location">
              <button
                type="button"
                className="ghost-btn workspace-location-btn"
                onClick={() => { void locateVenue() }}
                disabled={isLoading || isSavePending || locating}
                aria-busy={locating}
              >
                <svg className="workspace-location-pin" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
                </svg>
                {locating ? t("Finding location…") : t("Use current location")}
              </button>
              {locationSaved ? <small className="workspace-location-note">{t("Location saved")}</small> : null}
            </div>
            {locationError ? <small className="workspace-field-error">{t(locationError)}</small> : null}
            <label className="form-field full-width">
              <span>{t("Contact email")}</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={workspaceProfile.contactEmail || ''}
                onChange={(event) => {
                  setFieldErrors((current) => ({ ...current, email: '' }))
                  onChange({ ...workspaceProfile, contactEmail: event.target.value })
                }}
                disabled={isLoading || isSavePending}
              />
              {fieldErrors.email ? <small className="workspace-field-error">{t(fieldErrors.email)}</small> : null}
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
