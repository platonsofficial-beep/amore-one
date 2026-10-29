import App from '../../App.jsx'
import { useAuth } from '../../context/AuthContext'
import { VenueSwitcher } from './VenueManager'
import { LegalLinks } from '../privacy/PrivacySections'

export function isVenueClosedForMember(workspace, membership) {
  return Boolean(workspace?.closedAt) && `${membership?.role ?? ''}` !== 'owner'
}

/** Remounts the app when the active venue changes so every module reloads its data cleanly. */
export function WorkspaceKeyedApp() {
  const { membership, workspace, signOut } = useAuth()
  const workspaceKey = `${membership?.workspaceId ?? workspace?.id ?? 'none'}`

  if (isVenueClosedForMember(workspace, membership)) {
    return (
      <div className="auth-page">
        <div className="auth-card panel staff-panel">
          <h1 className="auth-title">Το venue έχει κλείσει</h1>
          <p>Ο ιδιοκτήτης έκλεισε το «{workspace?.name}». Αν έχεις πρόσβαση σε άλλο venue, διάλεξέ το παρακάτω.</p>
          <VenueSwitcher />
          <button type="button" className="ghost-btn auth-action-btn" onClick={() => signOut?.()}>Αποσύνδεση</button>
          <LegalLinks className="auth-legal-links" />
        </div>
      </div>
    )
  }

  return <App key={workspaceKey} />
}
