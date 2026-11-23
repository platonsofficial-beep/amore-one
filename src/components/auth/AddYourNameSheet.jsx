import { useState } from 'react'
import { t } from '../../i18n/i18n'

export function AddYourNameSheet({ onSave, onDismiss }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const first = firstName.trim()
    const last = lastName.trim()
    if (!first || !last) {
      setErrorMessage(t('First and last name are required.'))
      return
    }
    setIsSaving(true)
    setErrorMessage('')
    try {
      await onSave({ firstName: first, lastName: last })
    } catch (error) {
      setErrorMessage(error?.message || t('Unable to save your name right now.'))
      setIsSaving(false)
    }
  }

  return (
    <div className="employee-modal-backdrop add-name-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-name-title">
      <form className="employee-modal add-name-card" onSubmit={handleSubmit}>
        <h2 id="add-name-title">{t('Add your name')}</h2>
        <p>{t('This is the name your team sees.')}</p>
        {errorMessage ? <div className="auth-banner auth-banner-error" role="alert">{errorMessage}</div> : null}
        <label className="form-field auth-field" htmlFor="add-name-first">
          <span>{t('First name')}</span>
          <input
            id="add-name-first"
            name="given-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            disabled={isSaving}
            required
          />
        </label>
        <label className="form-field auth-field" htmlFor="add-name-last">
          <span>{t('Last name')}</span>
          <input
            id="add-name-last"
            name="family-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            disabled={isSaving}
            required
          />
        </label>
        <div className="add-name-actions">
          <button type="button" className="ghost-btn auth-action-btn" onClick={onDismiss} disabled={isSaving}>
            {t('Not now')}
          </button>
          <button type="submit" className="primary-btn auth-submit-btn" disabled={isSaving}>
            {isSaving ? t('Please wait…') : t('Save')}
          </button>
        </div>
      </form>
    </div>
  )
}
