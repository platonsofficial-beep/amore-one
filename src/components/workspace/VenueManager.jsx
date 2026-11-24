import { useState } from 'react'
import { useOptionalAuth } from '../../context/AuthContext'
import { createVenue } from '../../services/workspaceService'
import { t } from '../../i18n/i18n'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'
import './venueManager.css'

const DEFAULT_TIMEZONE = 'Europe/Nicosia'
const FALLBACK_TIMEZONES = ['Europe/Nicosia', 'Europe/Athens', 'Europe/London', 'Europe/Berlin', 'UTC']
const CURRENCIES = ['EUR', 'USD', 'GBP']
const MANAGER_ROLES = new Set(['owner', 'general_manager'])

export const EMPTY_VENUE_FORM = {
  name: '',
  city: '',
  countryName: 'Cyprus',
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
export function TodayVenueControl({
  venueName = '',
  roleLabel = '',
  memberships = [],
  activeWorkspaceId = '',
  onSwitch,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const label = [venueName, roleLabel].filter(Boolean).join(' · ')
  if (!label) return null
  if (!shouldShowVenueSwitcher(memberships)) {
    return <span className="mobile-manager-command-workspace">{label}</span>
  }

  function close() {
    setIsOpen(false)
  }
  function openSheet() {
    setIsOpen(true)
  }
  async function chooseVenue(workspaceId, selected) {
    if (!selected) await onSwitch?.(workspaceId)
    close()
  }
  return (
    <>
      <button
        type="button"
        className="mobile-today-venue-switch"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={openSheet}
      >
        <span className="mobile-today-venue-switch-label">{label}</span>
        <span className="mobile-today-venue-chevron" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="venue-sheet-backdrop is-today-venue" role="presentation" onClick={close}>
          <div
            className="venue-sheet panel staff-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="today-venue-switch-title"
            onClick={function stopSheetClick(event) { event.stopPropagation() }}
          >
            <header className="venue-sheet-header">
              <h3 id="today-venue-switch-title">{t("Switch venue")}</h3>
              <button type="button" className="venue-sheet-close" aria-label={t("Close")} onClick={close}>✕</button>
            </header>
            <div className="mobile-today-venue-options">
              {memberships.map((item) => {
                const selected = `${item.workspaceId}` === `${activeWorkspaceId}`
                const role = item.role ? getWorkspaceRoleLabel(item.role) : ''
                return (
                  <button
                    key={item.workspaceId}
                    type="button"
                    className={`mobile-today-venue-option${selected ? ' is-selected' : ''}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={function pickVenue() { chooseVenue(item.workspaceId, selected) }}
                  >
                    <span className="mobile-today-venue-option-copy">
                      <span className="mobile-today-venue-option-name">{item.workspaceName || t("Venue")}</span>
                      {role ? <span className="mobile-today-venue-option-role">{role}</span> : null}
                    </span>
                    {selected ? <span className="mobile-today-venue-check" aria-hidden="true" /> : null}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function VenueSwitcher({ className = '' }) {
  const { memberships, membership, switchWorkspace } = useOptionalAuth() ?? {}
  const [isSwitching, setIsSwitching] = useState(false)
  if (!shouldShowVenueSwitcher(memberships)) return null

  const activeId = `${membership?.workspaceId ?? ''}`
  return (
    <label className={`venue-switcher ${className}`.trim()}>
      <span className="venue-switcher-label">{t("Venue")}</span>
      <select
        className="venue-switcher-select"
        value={activeId}
        disabled={isSwitching}
        aria-label={t("Switch venue")}
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
      setError(createError?.message || t("The venue could not be created."))
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
          <h3 id="venue-sheet-title">{t("New venue")}</h3>
          <button type="button" className="venue-sheet-close" aria-label={t("Close")} disabled={isSaving} onClick={onClose}>✕</button>
        </header>
        <div className="venue-sheet-place">
          <label className="venue-field">
            <span>{t("Name")}</span>
            <input value={form.name} onChange={update('name')} maxLength={80} required autoFocus placeholder={t("e.g. The Harbour Bar")} />
          </label>
          <label className="venue-field">
            <span>{t("City")}</span>
            <input value={form.city} onChange={update('city')} maxLength={80} />
          </label>
        </div>
        <div className="venue-field-row">
          <label className="venue-field">
            <span>{t("Country")}</span>
            <input value={form.countryName} onChange={update('countryName')} maxLength={80} />
          </label>
          <label className="venue-field venue-field-short">
            <span>{t("Code")}</span>
            <input value={form.countryCode} onChange={update('countryCode')} maxLength={2} />
          </label>
        </div>
        <div className="venue-field-row">
          <label className="venue-field">
            <span>{t("Time zone")}</span>
            <select value={form.timezone} onChange={update('timezone')}>
              {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label className="venue-field venue-field-short">
            <span>{t("Currency")}</span>
            <select value={form.currency} onChange={update('currency')}>
              {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="venue-sheet-error" role="alert">{error}</p> : null}
        <footer className="venue-sheet-actions">
          <button type="button" className="ghost-btn" disabled={isSaving} onClick={onClose}>{t("Cancel")}</button>
          <button type="submit" className="primary-btn" disabled={isSaving || form.name.trim().length < 2}>
            {isSaving ? t("Creating…") : t("Create")}
          </button>
        </footer>
      </form>
    </div>
  )
}

/** Settings → Venue: switcher (2+ venues) and "New venue" for owners/GMs. */
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
      <button type="button" className="primary-btn venue-manager-new" onClick={() => setIsSheetOpen(true)}>
        + {t("New venue")}
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
