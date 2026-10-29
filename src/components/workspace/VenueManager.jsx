import { useState } from 'react'
import { useOptionalAuth } from '../../context/AuthContext'
import { createVenue } from '../../services/workspaceService'
import './venueManager.css'

const DEFAULT_TIMEZONE = 'Europe/Nicosia'
const FALLBACK_TIMEZONES = ['Europe/Nicosia', 'Europe/Athens', 'Europe/London', 'Europe/Berlin', 'UTC']
const CURRENCIES = ['EUR', 'USD', 'GBP']
const MANAGER_ROLES = new Set(['owner', 'general_manager'])

export const EMPTY_VENUE_FORM = {
  name: '',
  city: '',
  countryName: 'Κύπρος',
  countryCode: 'CY',
  timezone: DEFAULT_TIMEZONE,
  currency: 'EUR',
}

function listTimezones() {
  try {
    const zones = Intl.supportedValuesOf?.('timeZone')
    if (Array.isArray(zones) && zones.length > 0) {
      return zones.includes(DEFAULT_TIMEZONE) ? zones : [DEFAULT_TIMEZONE, ...zones]
    }
  } catch {
    // older engines
  }
  return FALLBACK_TIMEZONES
}

export function canCreateVenue(role) {
  return MANAGER_ROLES.has(`${role ?? ''}`.trim().toLowerCase())
}

export function shouldShowVenueSwitcher(memberships) {
  return Array.isArray(memberships) && memberships.length >= 2
}

/** Compact venue switcher; renders only when the user belongs to 2+ venues. */
export function VenueSwitcher({ className = '' }) {
  const { memberships, membership, switchWorkspace } = useOptionalAuth() ?? {}
  const [isSwitching, setIsSwitching] = useState(false)
  if (!shouldShowVenueSwitcher(memberships)) return null

  const activeId = `${membership?.workspaceId ?? ''}`
  return (
    <label className={`venue-switcher ${className}`.trim()}>
      <span className="venue-switcher-label">Venue</span>
      <select
        className="venue-switcher-select"
        value={activeId}
        disabled={isSwitching}
        aria-label="Αλλαγή venue"
        onChange={async (event) => {
          const nextId = event.target.value
          if (!nextId || nextId === activeId) return
          setIsSwitching(true)
          try {
            await switchWorkspace(nextId)
          } finally {
            setIsSwitching(false)
          }
        }}
      >
        {memberships.map((item) => (
          <option key={item.workspaceId} value={item.workspaceId}>
            {item.workspaceName || 'Venue'}
          </option>
        ))}
      </select>
    </label>
  )
}

export function NewVenueSheet({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_VENUE_FORM)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [timezones] = useState(listTimezones)
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSaving(true)
    try {
      const workspaceId = await createVenue(form)
      await onCreated?.(workspaceId)
    } catch (createError) {
      setError(createError?.message || 'Δεν ήταν δυνατή η δημιουργία venue.')
      setIsSaving(false)
    }
  }

  return (
    <div className="venue-sheet-backdrop" role="presentation" onClick={() => !isSaving && onClose?.()}>
      <form
        className="venue-sheet panel staff-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="venue-sheet-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="venue-sheet-header">
          <h3 id="venue-sheet-title">Νέο venue</h3>
          <button type="button" className="venue-sheet-close" aria-label="Κλείσιμο" disabled={isSaving} onClick={onClose}>✕</button>
        </header>
        <label className="venue-field">
          <span>Όνομα</span>
          <input value={form.name} onChange={update('name')} maxLength={80} required autoFocus placeholder="π.χ. SENTIO.LIMASSOL" />
        </label>
        <label className="venue-field">
          <span>Πόλη</span>
          <input value={form.city} onChange={update('city')} maxLength={80} />
        </label>
        <div className="venue-field-row">
          <label className="venue-field">
            <span>Χώρα</span>
            <input value={form.countryName} onChange={update('countryName')} maxLength={80} />
          </label>
          <label className="venue-field venue-field-short">
            <span>Κωδικός</span>
            <input value={form.countryCode} onChange={update('countryCode')} maxLength={2} />
          </label>
        </div>
        <div className="venue-field-row">
          <label className="venue-field">
            <span>Ζώνη ώρας</span>
            <select value={form.timezone} onChange={update('timezone')}>
              {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label className="venue-field venue-field-short">
            <span>Νόμισμα</span>
            <select value={form.currency} onChange={update('currency')}>
              {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="venue-sheet-error" role="alert">{error}</p> : null}
        <footer className="venue-sheet-actions">
          <button type="button" className="ghost-button" disabled={isSaving} onClick={onClose}>Ακύρωση</button>
          <button type="submit" className="primary-button" disabled={isSaving || form.name.trim().length < 2}>
            {isSaving ? 'Δημιουργία…' : 'Δημιουργία'}
          </button>
        </footer>
      </form>
    </div>
  )
}

/** Settings → Venue: switcher (2+ venues) and "Νέο venue" for owners/GMs. */
export function VenueManager() {
  const { membership, switchWorkspace, refreshMembership } = useOptionalAuth() ?? {}
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const canCreate = canCreateVenue(membership?.role)

  if (!canCreate) {
    return <VenueSwitcher className="venue-manager-switcher" />
  }

  return (
    <div className="venue-manager">
      <VenueSwitcher className="venue-manager-switcher" />
      <button type="button" className="primary-button venue-manager-new" onClick={() => setIsSheetOpen(true)}>
        ＋ Νέο venue
      </button>
      {isSheetOpen ? (
        <NewVenueSheet
          onClose={() => setIsSheetOpen(false)}
          onCreated={async (workspaceId) => {
            await refreshMembership?.().catch(() => null)
            await switchWorkspace?.(workspaceId)
            setIsSheetOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
