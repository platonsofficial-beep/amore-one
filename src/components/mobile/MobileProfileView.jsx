import { useEffect, useState } from 'react'
import { ProfilePhotoBlock } from '../profile/ProfilePhotoBlock'
import { VenueSwitcher } from '../workspace/VenueManager'
import { PrivacyAccountSection } from '../privacy/PrivacySections'
import { LanguagePicker } from '../../i18n/LanguagePicker'
import { t } from '../../i18n/i18n'

export function MobileProfileView({
  displayName = '',
  email = '',
  phone = '',
  roleLabel = '',
  venueName = '',
  linkedEmployeeName = '',
  canEditPhone = false,
  isSaving = false,
  errorMessage = '',
  onBack,
  onSave,
}) {
  const [nameDraft, setNameDraft] = useState(displayName)
  const [phoneDraft, setPhoneDraft] = useState(phone)
  const [localError, setLocalError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')

  useEffect(() => {
    setNameDraft(displayName)
    setPhoneDraft(phone)
    setLocalError('')
    setSaveNotice('')
  }, [displayName, phone])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLocalError('')
    setSaveNotice('')

    const trimmedName = `${nameDraft ?? ''}`.trim()
    if (!trimmedName) {
      setLocalError('Display name is required.')
      return
    }

    try {
      await onSave?.({
        displayName: trimmedName,
        phone: canEditPhone ? `${phoneDraft ?? ''}`.trim() : undefined,
      })
      setSaveNotice('Profile updated.')
    } catch (error) {
      setLocalError(error?.message || 'Unable to save profile right now.')
    }
  }

  const resolvedError = localError || errorMessage

  return (
    <div className="mobile-screen mobile-profile">
      <header className="mobile-profile-header">
        <button type="button" className="mobile-back-btn" onClick={onBack}>
          {t("‹ Back")}
        </button>
        <h1>{t("Profile")}</h1>
      </header>

      <ProfilePhotoBlock displayName={displayName} />

      <LanguagePicker className="mobile-profile-language" />

      <section className="mobile-card mobile-profile-readonly" aria-label={t("Account details")}>
        <dl className="mobile-profile-details">
          <div className="mobile-profile-detail-row">
            <dt>{t("Email")}</dt>
            <dd>{email || '—'}</dd>
          </div>
          <div className="mobile-profile-detail-row">
            <dt>{t("Role")}</dt>
            <dd>{roleLabel || '—'}</dd>
          </div>
          <div className="mobile-profile-detail-row">
            <dt>{t("Venue")}</dt>
            <dd>{venueName || '—'}</dd>
          </div>
          <div className="mobile-profile-detail-row">
            <dt>{t("Linked employee")}</dt>
            <dd>{linkedEmployeeName || 'Not linked'}</dd>
          </div>
        </dl>
      </section>

      <VenueSwitcher className="account-venue-switcher mobile-card" />

      <form className="mobile-profile-form" onSubmit={handleSubmit}>
        <section className="mobile-card" aria-label={t("Editable profile fields")}>
          <p className="mobile-card-label">{t("Editable")}</p>

          <label className="form-field full-width">
            <span>{t("Display name")}</span>
            <input
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              autoComplete="name"
              required
              disabled={isSaving}
            />
          </label>

          {canEditPhone ? (
            <label className="form-field full-width">
              <span>{t("Phone")}</span>
              <input
                type="tel"
                value={phoneDraft}
                onChange={(event) => setPhoneDraft(event.target.value)}
                autoComplete="tel"
                placeholder={t("Add phone number")}
                disabled={isSaving}
              />
            </label>
          ) : null}
        </section>

        {resolvedError ? (
          <p className="mobile-profile-error" role="alert">{resolvedError}</p>
        ) : null}
        {saveNotice ? <p className="mobile-profile-notice">{saveNotice}</p> : null}

        <button type="submit" className="mobile-primary-btn" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <PrivacyAccountSection />
    </div>
  )
}
