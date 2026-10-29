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
import '../workspace/venueManager.css'
import './privacy.css'

export function LegalLinks({ className = '' }) {
  return (
    <nav className={`legal-links ${className}`.trim()} aria-label="Νομικά">
      <a href="/privacy" target="_blank" rel="noopener">Πολιτική Απορρήτου</a>
      <span aria-hidden="true">·</span>
      <a href="/terms" target="_blank" rel="noopener">Όροι Χρήσης</a>
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
      setError(confirmError?.message || 'Κάτι πήγε στραβά.')
      setBusy(false)
    }
  }

  const sheet = (
    <div className="venue-sheet-backdrop" role="presentation" onClick={() => !busy && onClose?.()}>
      <form className="venue-sheet panel staff-panel" role="dialog" aria-modal="true" aria-label={title}
        onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header className="venue-sheet-header">
          <h3>{title}</h3>
          <button type="button" className="venue-sheet-close" aria-label="Κλείσιμο" disabled={busy} onClick={onClose}>✕</button>
        </header>
        <div className="privacy-sheet-body">{children}</div>
        {expected ? (
          <label className="venue-field">
            <span>Γράψε «{expected}» για επιβεβαίωση</span>
            <input value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" autoCapitalize="characters" />
          </label>
        ) : null}
        {error ? <p className="venue-sheet-error" role="alert">{error}</p> : null}
        <footer className="venue-sheet-actions">
          <button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Ακύρωση</button>
          <button type="submit" className={danger ? 'privacy-danger' : 'primary-btn'} disabled={busy || !matches}>
            {busy ? 'Παρακαλώ περίμενε…' : confirmLabel}
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
      setNotice('Τα δεδομένα σου κατέβηκαν σε αρχείο JSON.')
    } catch (error) {
      setNotice(error?.message || 'Η λήψη απέτυχε.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="privacy-section mobile-card" aria-label="Απόρρητο και λογαριασμός">
      <p className="mobile-card-label">Απόρρητο</p>
      <div className="privacy-actions">
        <button type="button" className="ghost-btn" onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Ετοιμάζεται…' : '⬇︎ Λήψη των δεδομένων μου'}
        </button>
        <button type="button" className="ghost-btn privacy-danger-text" onClick={() => setIsDeleteOpen(true)}>
          Διαγραφή λογαριασμού
        </button>
      </div>
      {notice ? <p className="privacy-notice" role="status">{notice}</p> : null}
      <LegalLinks />
      {isDeleteOpen ? (
        <ConfirmSheet
          title="Διαγραφή λογαριασμού"
          confirmLabel="Οριστική διαγραφή"
          expected={DELETE_ACCOUNT_CONFIRM_WORD}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={async () => {
            await deleteMyAccount(DELETE_ACCOUNT_CONFIRM_WORD, { avatarPath: auth?.membership?.avatarPath ?? '' })
            try { localStorage.removeItem('one.activeWorkspaceId') } catch { /* ignore */ }
            await auth?.signOut?.().catch(() => null)
            window.location.assign('/delete-account?done=1')
          }}
        >
          <p>Ο λογαριασμός σου θα διαγραφεί οριστικά και δεν θα μπορείς να συνδεθείς ξανά.</p>
          <ul>
            <li>Το όνομα, το email και η φωτογραφία σου αφαιρούνται.</li>
            <li>Ειδοποιήσεις και συσκευές push διαγράφονται.</li>
            <li>Ιστορικό που ανήκει στο venue (βάρδιες, παρουσίες, μηνύματα) μένει ανώνυμο.</li>
          </ul>
          <p>Πριν συνεχίσεις μπορείς να κατεβάσεις τα δεδομένα σου.</p>
        </ConfirmSheet>
      ) : null}
    </section>
  )
}

/** Settings → Απόρρητο (owners): venue export, close / reopen venue. */
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
      setNotice(error?.message || 'Κάτι πήγε στραβά.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="privacy-section mobile-card" aria-label="Δεδομένα venue">
      <p className="mobile-card-label">Δεδομένα venue</p>
      {closedAt ? (
        <p className="privacy-warning" role="status">
          Το venue έχει κλείσει και θα διαγραφεί οριστικά στις{' '}
          {new Date(workspace.purgeAfter).toLocaleDateString('el-GR')}.
        </p>
      ) : null}
      <div className="privacy-actions">
        <button type="button" className="ghost-btn" disabled={isBusy}
          onClick={() => run(async () => {
            const data = await exportWorkspaceData(workspaceId)
            downloadJson(data, buildExportFilename(`one-venue-${workspace?.slug || 'export'}`))
          }, 'Η εξαγωγή του venue κατέβηκε.')}>
          ⬇︎ Εξαγωγή όλων των δεδομένων του venue
        </button>
        {closedAt ? (
          <button type="button" className="primary-btn" disabled={isBusy}
            onClick={() => run(async () => {
              await reopenVenue(workspaceId)
              await auth?.switchWorkspace?.(workspaceId)
            }, 'Το venue άνοιξε ξανά.')}>
            Επαναφορά venue
          </button>
        ) : (
          <button type="button" className="ghost-btn privacy-danger-text" disabled={isBusy} onClick={() => setIsCloseOpen(true)}>
            Κλείσιμο venue
          </button>
        )}
      </div>
      {notice ? <p className="privacy-notice" role="status">{notice}</p> : null}
      {isCloseOpen ? (
        <ConfirmSheet
          title="Κλείσιμο venue"
          confirmLabel="Κλείσιμο venue"
          expected={workspace?.name || ''}
          onClose={() => setIsCloseOpen(false)}
          onConfirm={async (typed) => {
            await closeVenue(workspaceId, typed)
            setIsCloseOpen(false)
            await auth?.switchWorkspace?.(workspaceId)
          }}
        >
          <p>Το venue «{workspace?.name}» θα κλείσει για όλη την ομάδα.</p>
          <p>Μπορείς να το επαναφέρεις μέσα σε <strong>30 ημέρες</strong>. Μετά διαγράφονται οριστικά όλα τα δεδομένα του.</p>
          <p>Κατέβασε πρώτα την εξαγωγή αν τη χρειάζεσαι.</p>
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
          <p className="eyebrow">Απόρρητο</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🔒</span>
            Απόρρητο & δεδομένα
          </h3>
        </div>
      </div>
      <PrivacyAccountSection />
      <VenuePrivacySection />
    </>
  )
}
