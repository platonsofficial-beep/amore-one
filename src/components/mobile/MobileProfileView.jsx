import { useEffect, useState } from 'react'

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
          ‹ Back
        </button>
        <h1>Profile</h1>
      </header>

      <section className="mobile-card mobile-profile-readonly" aria-label="Account details">
        <dl className="mobile-profile-details">
          <div className="mobile-profile-detail-row">
            <dt>Email</dt>
            <dd>{email || '—'}</dd>
          </div>
          <div className="mobile-profile-detail-row">
            <dt>Role</dt>
            <dd>{roleLabel || '—'}</dd>
          </div>
          <div className="mobile-profile-detail-row">
            <dt>Venue</dt>
            <dd>{venueName || '—'}</dd>
          </div>
          <div className="mobile-profile-detail-row">
            <dt>Linked employee</dt>
            <dd>{linkedEmployeeName || 'Not linked'}</dd>
          </div>
        </dl>
      </section>

      <form className="mobile-profile-form" onSubmit={handleSubmit}>
        <section className="mobile-card" aria-label="Editable profile fields">
          <p className="mobile-card-label">Editable</p>

          <label className="form-field full-width">
            <span>Display name</span>
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
              <span>Phone</span>
              <input
                type="tel"
                value={phoneDraft}
                onChange={(event) => setPhoneDraft(event.target.value)}
                autoComplete="tel"
                placeholder="Add phone number"
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
    </div>
  )
}
