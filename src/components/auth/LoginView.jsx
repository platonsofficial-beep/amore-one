import { LegalLinks } from '../privacy/PrivacySections'
import { useEffect, useState } from 'react'
import { OneFullLogo } from '../brand/OneFullLogo'
import { useAuth } from '../../context/AuthContext'
import {
  clearSessionEndedNotice,
  formatAuthErrorMessage,
  readSessionEndedNotice,
} from '../../lib/authMessageUtils'
import { buildInvitePreviewSummary } from '../../lib/inviteFlowUtils'
import {
  captureInviteTokenFromLocation,
  readPendingInviteToken,
} from '../../lib/inviteTokenStorage'
import { getInvitePreview } from '../../services/inviteService'
import { PASSWORD_MISMATCH_MESSAGE, passwordsMatch } from '../../lib/passwordConfirm'
import { LanguagePicker } from '../../i18n/LanguagePicker'
import '../../legal/legalGate.css'
import { getLocale, t } from '../../i18n/i18n'
import { writePendingSignup } from '../../legal/acceptance'
import { LEGAL_BUNDLE } from '../../legal/provider'
import { readSignupHandoff, sanitizeSignupEmail, signupAuthMetadata } from '../../lib/signupHandoff'

const PASSWORD_MIN_LENGTH = 8

function PasswordField({
  id,
  label,
  name,
  autoComplete,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
  describedBy,
  error,
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="form-field auth-field" htmlFor={id}>
      <span>{label}</span>
      <span className="auth-password-row">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={visible ? t("Hide password") : t("Show password")}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
        >
          <span aria-hidden="true">{visible ? '🙈' : '👁'}</span>
        </button>
      </span>
      {error}
    </label>
  )
}

const MODES = {
  SIGN_IN: 'sign-in',
  SIGN_UP: 'sign-up',
  RESET: 'reset',
}

export function LoginView() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [handoff] = useState(() => readSignupHandoff())
  const [mode, setMode] = useState(handoff ? MODES.SIGN_UP : MODES.SIGN_IN)
  const [email, setEmail] = useState(handoff?.email || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [inviteBanner, setInviteBanner] = useState(null)
  const [isInvitePreviewLoading, setIsInvitePreviewLoading] = useState(false)
  const [sessionEndedNotice] = useState(() => readSessionEndedNotice())
  const [acceptedLegal, setAcceptedLegal] = useState(false)

  useEffect(() => {
    if (!sessionEndedNotice) return undefined
    clearSessionEndedNotice()
    return undefined
  }, [sessionEndedNotice])

  useEffect(() => {
    captureInviteTokenFromLocation()

    const token = readPendingInviteToken()
    if (!token) {
      setInviteBanner(null)
      return undefined
    }

    let isMounted = true
    setIsInvitePreviewLoading(true)

    getInvitePreview(token)
      .then((preview) => {
        if (!isMounted) return
        setInviteBanner(buildInvitePreviewSummary(preview))
      })
      .catch(() => {
        if (!isMounted) return
        setInviteBanner(buildInvitePreviewSummary({ found: false }))
      })
      .finally(() => {
        if (isMounted) {
          setIsInvitePreviewLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setErrorMessage(t("Email is required."))
      return
    }

    if (!sanitizeSignupEmail(trimmedEmail)) {
      setErrorMessage(t("Enter a valid email address."))
      return
    }

    if (mode !== MODES.RESET && !password) {
      setErrorMessage(t("Password is required."))
      return
    }

    if (mode === MODES.SIGN_UP && password.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage(t("Use at least 8 characters."))
      return
    }

    if (mode === MODES.SIGN_UP && !passwordsMatch(password, confirmPassword)) {
      setErrorMessage(t(PASSWORD_MISMATCH_MESSAGE))
      return
    }

    if (mode === MODES.SIGN_UP && !acceptedLegal) {
      setErrorMessage(t('Accept the Terms and Privacy Policy to create an account.'))
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === MODES.SIGN_IN) {
        await signIn(trimmedEmail, password)
        return
      }

      if (mode === MODES.SIGN_UP) {
        const result = handoff
          ? await signUp(trimmedEmail, password, signupAuthMetadata(handoff))
          : await signUp(trimmedEmail, password)
        writePendingSignup({
          email: trimmedEmail,
          bundleId: LEGAL_BUNDLE.id,
          acceptedAt: new Date().toISOString(),
          locale: getLocale(),
          userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        })
        if (result.session) {
          return
        }
        setSuccessMessage(t("Account created. Check your email to confirm your address, then sign in."))
        setMode(MODES.SIGN_IN)
        setPassword('')
        setConfirmPassword('')
        return
      }

      await resetPassword(trimmedEmail)
      setSuccessMessage(t("Password reset email sent. Check your inbox for the link."))
      setMode(MODES.SIGN_IN)
      setPassword('')
    } catch (error) {
      setErrorMessage(formatAuthErrorMessage(error?.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Inline error once both fields have text and they differ (or after a blocked submit).
  const showMismatch = mode === MODES.SIGN_UP && (
    errorMessage === t(PASSWORD_MISMATCH_MESSAGE)
    || (confirmPassword.length > 0 && !passwordsMatch(password, confirmPassword))
  )

  const title = mode === MODES.SIGN_UP
    ? t('Create account')
    : mode === MODES.RESET
      ? t('Reset password')
      : t('Sign in')

  return (
    <div className="auth-page">
      <div className="auth-card panel staff-panel">
        <header className="auth-header">
          <OneFullLogo />
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{t("Operations platform for hospitality teams.")}</p>
        </header>

        {sessionEndedNotice ? (
          <div className="auth-banner auth-banner-info" role="status">
            {t("Your session ended. Sign in again to continue.")}
          </div>
        ) : null}

        {isInvitePreviewLoading ? (
          <div className="auth-banner auth-banner-info" role="status">{t("Checking invite…")}</div>
        ) : null}

        {!isInvitePreviewLoading && inviteBanner ? (
          <div
            className={`auth-banner auth-banner-${inviteBanner.tone === 'error' ? 'error' : 'info'}`}
            role="status"
          >
            <strong>{inviteBanner.title}</strong>
            <p className="auth-invite-banner-copy">{inviteBanner.message}</p>
          </div>
        ) : null}

        {errorMessage && errorMessage !== PASSWORD_MISMATCH_MESSAGE ? <div className="auth-banner auth-banner-error">{errorMessage}</div> : null}
        {successMessage ? <div className="auth-banner auth-banner-success">{successMessage}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="form-field auth-field" htmlFor="auth-email">
            <span>{t("Email")}</span>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("you@venue.com")}
              disabled={isSubmitting}
              required
            />
          </label>

          {mode !== MODES.RESET ? (
            <PasswordField
              id="auth-password"
              label={t("Password")}
              name="password"
              autoComplete={mode === MODES.SIGN_UP ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("Enter password")}
              disabled={isSubmitting}
            />
          ) : null}

          {mode === MODES.SIGN_UP ? (
            <PasswordField
              id="auth-confirm-password"
              label={t("Confirm password")}
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                if (errorMessage === t(PASSWORD_MISMATCH_MESSAGE)) setErrorMessage('')
              }}
              placeholder={t("Enter password again")}
              disabled={isSubmitting}
              invalid={showMismatch}
              describedBy={showMismatch ? 'auth-confirm-password-error' : undefined}
              error={showMismatch ? (
                <small id="auth-confirm-password-error" className="auth-field-error" role="alert">
                  {t(PASSWORD_MISMATCH_MESSAGE)}
                </small>
              ) : null}
            />
          ) : null}

          {mode === MODES.SIGN_UP ? (
            <p className="auth-signup-offer">
              {handoff?.planSpecified
                ? t("{{plan}} includes 1 free month, with no card.", { plan: handoff.plan === 'pro' ? 'Pro' : 'Start' })
                : t("A new venue includes 1 free month, with no card.")}
            </p>
          ) : null}

          {mode === MODES.SIGN_UP ? (
            <label className="legal-gate-check auth-legal-check">
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(event) => setAcceptedLegal(event.target.checked)}
                disabled={isSubmitting}
              />
              <span>{t('I have read and accept the Terms of Service and Privacy Policy')}</span>
            </label>
          ) : null}

          <button type="submit" className="primary-btn auth-submit-btn" disabled={isSubmitting || (mode === MODES.SIGN_UP && !acceptedLegal)}>
            {isSubmitting
              ? t('Please wait…')
              : mode === MODES.SIGN_UP
                ? t('Create account')
                : mode === MODES.RESET
                  ? t('Send reset link')
                  : t('Sign in')}
          </button>
        </form>

        <div className="auth-actions">
          {mode === MODES.SIGN_IN ? (
            <>
              <button
                type="button"
                className="ghost-btn auth-action-btn"
                onClick={() => {
                  setMode(MODES.SIGN_UP)
                  setErrorMessage('')
                  setSuccessMessage('')
                }}
                disabled={isSubmitting}
              >
                {t("Create account")}
              </button>
              <button
                type="button"
                className="ghost-btn auth-action-btn"
                onClick={() => {
                  setMode(MODES.RESET)
                  setErrorMessage('')
                  setSuccessMessage('')
                }}
                disabled={isSubmitting}
              >
                {t("Reset password")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ghost-btn auth-action-btn"
              onClick={() => {
                setMode(MODES.SIGN_IN)
                setConfirmPassword('')
                setErrorMessage('')
                setSuccessMessage('')
              }}
              disabled={isSubmitting}
            >
              {t("Back to sign in")}
            </button>
          )}
        </div>
        <LanguagePicker className="auth-language" />
        <LegalLinks className="auth-legal-links" />
      </div>
    </div>
  )
}
