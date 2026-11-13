import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useOptionalAuth } from '../../context/AuthContext'
import {
  DELETE_ACCOUNT_CONFIRM_WORD,
  buildExportFilename,
  closeVenue,
  deleteMyAccount,
  downloadJson,
  exportMyData,
  exportWorkspaceData,
  reopenVenue,
} from '../../services/privacyService'
import { t } from '../../i18n/i18n'
import '../workspace/venueManager.css'
import './privacy.css'

export function LegalLinks({ className = '' }) {
  return (
    <nav className={`legal-links ${className}`.trim()} aria-label={t("Legal")}>
      <a href="/privacy?lang=en" target="_blank" rel="noopener">{t("Privacy policy")}</a>
      <span aria-hidden="true">·</span>
      <a href="/terms?lang=en" target="_blank" rel="noopener">{t("Terms of use")}</a>
    </nav>
  )
}

export function ConfirmSheet({ title, children, confirmLabel, expected, danger = true, onConfirm, onClose }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = !expected || value.trim().toLowerCase() === `${expected}`.trim().toLowerCase()

  const submit = async (event) => {
    event.preventDefault()
    if (!matches) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(value.trim())
    } catch (confirmError) {
      setError(confirmError?.message || t("Something went wrong."))
      setBusy(false)
    }
  }

  const sheet = (
    <div className="venue-sheet-backdrop" role="presentation" onClick={() => !busy && onClose?.()}>
      <form className="venue-sheet panel staff-panel" role="dialog" aria-modal="true" aria-label={title}
        onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header className="venue-sheet-header">
          <h3>{title}</h3>
          <button type="button" className="venue-sheet-close" aria-label={t("Close")} disabled={busy} onClick={onClose}>✕</button>
        </header>
        <div className="privacy-sheet-body">{children}</div>
        {expected ? (
          <label className="venue-field">
            <span>Type “{expected}” to confirm</span>
            <input value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" autoCapitalize="characters" />
          </label>
        ) : null}
        {error ? <p className="venue-sheet-error" role="alert">{error}</p> : null}
        <footer className="venue-sheet-actions">
          <button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>{t("Cancel")}</button>
          <button type="submit" className={danger ? 'privacy-danger' : 'primary-btn'} disabled={busy || !matches}>
            {busy ? t("Please wait…") : confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}

/** Profile/Settings: export my data, delete my account, legal links. */
export function PrivacyAccountSection() {
  const auth = useOptionalAuth()
  const [notice, setNotice] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    setNotice('')
    try {
      const data = await exportMyData()
      downloadJson(data, buildExportFilename('one-my-data'))
      setNotice('Your data downloaded as a JSON file.')
    } catch (error) {
      setNotice(error?.message || t("The download failed."))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="privacy-section mobile-card" aria-label={t("Privacy and account")}>
      <p className="mobile-card-label">{t("Privacy")}</p>
      <div className="privacy-actions">
        <button type="button" className="ghost-btn" onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Preparing…' : t("Download my data")}
        </button>
        <button type="button" className="ghost-btn privacy-danger-text" onClick={() => setIsDeleteOpen(true)}>
          {t("Delete account")}
        </button>
      </div>
      {notice ? <p className="privacy-notice" role="status">{notice}</p> : null}
      <LegalLinks />
      {isDeleteOpen ? (
        <ConfirmSheet
          title={t("Delete account")}
          confirmLabel="Delete permanently"
          expected={DELETE_ACCOUNT_CONFIRM_WORD}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={async () => {
            await deleteMyAccount(DELETE_ACCOUNT_CONFIRM_WORD, { avatarPath: auth?.membership?.avatarPath ?? '' })
            try { localStorage.removeItem('one.activeWorkspaceId') } catch { /* ignore */ }
            await auth?.signOut?.().catch(() => null)
            window.location.assign('/delete-account?done=1')
          }}
        >
          <p>{t("Your account will be deleted permanently and you will not be able to sign in again.")}</p>
          <ul>
            <li>{t("Your name, email, and photo are removed.")}</li>
            <li>{t("Notifications and push devices are deleted.")}</li>
            <li>{t("History that belongs to the venue (shifts, attendance, messages) stays, without your name.")}</li>
          </ul>
          <p>{t("You can download your data before you continue.")}</p>
        </ConfirmSheet>
      ) : null}
    </section>
  )
}

/** Settings → Privacy (owners): venue export, close / reopen venue. */
export function VenuePrivacySection() {
  const auth = useOptionalAuth()
  const [notice, setNotice] = useState('')
  const [isCloseOpen, setIsCloseOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const workspace = auth?.workspace
  const workspaceId = auth?.membership?.workspaceId ?? workspace?.id
  if (!workspaceId || `${auth?.membership?.role ?? ''}` !== 'owner') return null
  const closedAt = workspace?.closedAt

  const run = async (task, done) => {
    setIsBusy(true)
    setNotice('')
    try {
      await task()
      if (done) setNotice(done)
    } catch (error) {
      setNotice(error?.message || t("Something went wrong."))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="privacy-section mobile-card" aria-label={t("Venue data")}>
      <p className="mobile-card-label">{t("Venue data")}</p>
      {closedAt ? (
        <p className="privacy-warning" role="status">
          This venue is closed and will be deleted permanently on{' '}
          {new Date(workspace.purgeAfter).toLocaleDateString('en-GB')}.
        </p>
      ) : null}
      <div className="privacy-actions">
        <button type="button" className="ghost-btn" disabled={isBusy}
          onClick={() => run(async () => {
            const data = await exportWorkspaceData(workspaceId)
            downloadJson(data, buildExportFilename(`one-venue-${workspace?.slug || 'export'}`))
          }, 'The venue export downloaded.')}>
          {t("Download all venue data")}
        </button>
        {closedAt ? (
          <button type="button" className="primary-btn" disabled={isBusy}
            onClick={() => run(async () => {
              await reopenVenue(workspaceId)
              await auth?.switchWorkspace?.(workspaceId)
            }, 'The venue is open again.')}>
            {t("Reopen venue")}
          </button>
        ) : (
          <button type="button" className="ghost-btn privacy-danger-text" disabled={isBusy} onClick={() => setIsCloseOpen(true)}>
            {t("Close venue")}
          </button>
        )}
      </div>
      {notice ? <p className="privacy-notice" role="status">{notice}</p> : null}
      {isCloseOpen ? (
        <ConfirmSheet
          title={t("Close venue")}
          confirmLabel="Close venue"
          expected={workspace?.name || ''}
          onClose={() => setIsCloseOpen(false)}
          onConfirm={async (typed) => {
            await closeVenue(workspaceId, typed)
            setIsCloseOpen(false)
            await auth?.switchWorkspace?.(workspaceId)
          }}
        >
          <p>The venue “{workspace?.name}” will close for the whole team.</p>
          <p>{t("You can reopen it within")} <strong>{t("30 days")}</strong>. After that, all of its data is deleted permanently.</p>
          <p>{t("Download the export first if you need it.")}</p>
        </ConfirmSheet>
      ) : null}
    </section>
  )
}

export function PrivacySettingsSection() {
  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">{t("Privacy")}</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🔒</span>
            {t("Privacy & data")}
          </h3>
        </div>
      </div>
      <PrivacyAccountSection />
      <VenuePrivacySection />
    </>
  )
}
