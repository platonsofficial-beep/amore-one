import { useState } from 'react'
import { OneFullLogo } from '../brand/OneFullLogo'
import { useAuth } from '../../context/AuthContext'
import { LanguagePicker } from '../../i18n/LanguagePicker'
import { t } from '../../i18n/i18n'

export function VenueStartChoice() {
  const { startOwnVenue, joinVenueWithInvite, signOut } = useAuth()
  const [step, setStep] = useState('choose')
  const [inviteText, setInviteText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function showChoose() {
    setErrorMessage('')
    setStep('choose')
  }

  function showInvite() {
    setErrorMessage('')
    setStep('invite')
  }

  async function createVenue() {
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      await startOwnVenue()
    } catch (error) {
      setErrorMessage(error?.message || t("The venue could not be created."))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function joinInvite(event) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      await joinVenueWithInvite(inviteText)
    } catch (error) {
      setErrorMessage(error?.message || t("Unable to accept workspace invite."))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isInviteStep = step === 'invite'

  return (
    <div className="auth-page">
      <div className="auth-card panel staff-panel venue-start-card">
        <header className="auth-header">
          <OneFullLogo compact />
          <h1 className="auth-title">
            {isInviteStep ? t("I have an invite") : t("How do you want to start?")}
          </h1>
          <p className="auth-subtitle">
            {isInviteStep
              ? t("Paste the invite link or code")
              : t("Create a venue you own, or join one with an invite.")}
          </p>
        </header>
        {errorMessage ? (
          <div className="auth-banner auth-banner-error" role="alert">{errorMessage}</div>
        ) : null}
        {isInviteStep ? (
          <form className="auth-form" onSubmit={joinInvite}>
            <label className="form-field auth-field" htmlFor="venue-start-invite">
              <span>{t("Invite link or code")}</span>
              <input
                id="venue-start-invite"
                name="invite"
                value={inviteText}
                onChange={function updateInvite(event) { setInviteText(event.target.value) }}
                placeholder={t("Invite link or code")}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={isSubmitting}
                required
              />
            </label>
            <button type="submit" className="primary-btn auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? t("Joining your venue…") : t("Join this venue")}
            </button>
            <button type="button" className="secondary-btn auth-submit-btn" onClick={showChoose} disabled={isSubmitting}>
              {t("Back")}
            </button>
          </form>
        ) : (
          <div className="venue-start-actions is-choice">
            <button type="button" className="primary-btn auth-submit-btn" onClick={createVenue} disabled={isSubmitting}>
              {isSubmitting ? t("Creating your venue…") : t("Create my own venue")}
            </button>
            <button type="button" className="secondary-btn auth-submit-btn" onClick={showInvite} disabled={isSubmitting}>
              {t("I have an invite")}
            </button>
          </div>
        )}
        <button type="button" className="ghost-btn venue-start-signout" onClick={function leave() { signOut() }} disabled={isSubmitting}>
          {t("Sign out")}
        </button>
        <LanguagePicker className="auth-language" />
      </div>
    </div>
  )
}
