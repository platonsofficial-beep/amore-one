import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const MODES = {
  SIGN_IN: 'sign-in',
  SIGN_UP: 'sign-up',
  RESET: 'reset',
}

export function LoginView() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [mode, setMode] = useState(MODES.SIGN_IN)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setErrorMessage('Email is required.')
      return
    }

    if (mode !== MODES.RESET && !password) {
      setErrorMessage('Password is required.')
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === MODES.SIGN_IN) {
        await signIn(trimmedEmail, password)
        return
      }

      if (mode === MODES.SIGN_UP) {
        const result = await signUp(trimmedEmail, password)
        if (result.session) {
          return
        }
        setSuccessMessage('Account created. Check your email to confirm your address, then sign in.')
        setMode(MODES.SIGN_IN)
        setPassword('')
        return
      }

      await resetPassword(trimmedEmail)
      setSuccessMessage('Password reset email sent. Check your inbox for the link.')
      setMode(MODES.SIGN_IN)
      setPassword('')
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to complete this request right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = mode === MODES.SIGN_UP
    ? 'Create account'
    : mode === MODES.RESET
      ? 'Reset password'
      : 'Sign in'

  return (
    <div className="auth-page">
      <div className="auth-card panel staff-panel">
        <header className="auth-header">
          <p className="auth-brand">ONE</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">Operations platform for hospitality teams.</p>
        </header>

        {errorMessage ? <div className="auth-banner auth-banner-error">{errorMessage}</div> : null}
        {successMessage ? <div className="auth-banner auth-banner-success">{successMessage}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@venue.com"
              disabled={isSubmitting}
              required
            />
          </label>

          {mode !== MODES.RESET ? (
            <label className="form-field auth-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === MODES.SIGN_UP ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                disabled={isSubmitting}
                required
              />
            </label>
          ) : null}

          <button type="submit" className="primary-btn auth-submit-btn" disabled={isSubmitting}>
            {isSubmitting
              ? 'Please wait…'
              : mode === MODES.SIGN_UP
                ? 'Create account'
                : mode === MODES.RESET
                  ? 'Send reset link'
                  : 'Sign in'}
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
                Create account
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
                Reset password
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ghost-btn auth-action-btn"
              onClick={() => {
                setMode(MODES.SIGN_IN)
                setErrorMessage('')
                setSuccessMessage('')
              }}
              disabled={isSubmitting}
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
