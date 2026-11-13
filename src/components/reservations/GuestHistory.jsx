import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  blacklistConfirmState,
  buildGuestDirectory,
  canBlacklistGuest,
  canEditGuestNotes,
  countLabel,
  findGuestByPhone,
  formatGuestDate,
  formatGuestFavourite,
  searchGuests,
} from '../../lib/guestHistory'
import { getHostListCompactStatusLabel, getHostStatusMeta } from '../../lib/reservationHostStatus'
import {
  buildGuestPreviewProfiles,
  buildGuestPreviewReservations,
  readGuestPreview,
} from '../../lib/guestHistoryPreview'
import { loadGuestProfiles, saveGuestProfile, setGuestBlacklist } from '../../services/guestProfileService'
import { t } from '../../i18n/i18n'
import './guestHistory.css'

function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useGuestDirectory({
  workspaceId = '',
  reservations = [],
  countryCode = '+357',
  enabled = true,
  profiles: seedProfiles = [],
} = {}) {
  const preview = readGuestPreview()
  const [remote, setRemote] = useState({ available: false, profiles: [] })
  const [localProfiles, setLocalProfiles] = useState([])

  useEffect(() => {
    if (!enabled || preview || !workspaceId) return undefined
    let cancelled = false
    loadGuestProfiles(workspaceId).then((result) => {
      if (!cancelled) setRemote(result)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, preview, workspaceId])

  const profiles = preview
    ? buildGuestPreviewProfiles()
    : [...remote.profiles, ...localProfiles, ...seedProfiles]
  const sourceReservations = preview ? buildGuestPreviewReservations() : reservations
  const directory = useMemo(
    () => buildGuestDirectory(sourceReservations, profiles, countryCode),
    [sourceReservations, profiles, countryCode],
  )
  const available = Boolean(preview) || remote.available || localProfiles.length > 0

  const remember = (profile) => {
    if (!profile) return
    setLocalProfiles((current) => {
      const rest = current.filter((entry) => entry.phone !== profile.phone)
      return [...rest, profile]
    })
  }

  return {
    directory,
    available,
    preview: Boolean(preview),
    countryCode,
    remember,
    sourceReservations,
  }
}

function GuestStats({ guest }) {
  return (
    <dl className="guest-card-stats">
      <div><dt>{guest.visits === 1 ? 'Visit' : 'Visits'}</dt><dd>{guest.visits}</dd></div>
      <div><dt>{guest.noShows === 1 ? 'No-show' : 'No-shows'}</dt><dd>{guest.noShows}</dd></div>
      <div><dt>{guest.cancellations === 1 ? 'Cancellation' : 'Cancellations'}</dt><dd>{guest.cancellations}</dd></div>
      <div><dt>{t("Last visit")}</dt><dd className="guest-date">{formatGuestDate(guest.lastVisit)}</dd></div>
      <div><dt>{t("Usual party")}</dt><dd>{guest.usualPartySize || '—'}</dd></div>
      <div><dt>{t("Favourite")}</dt><dd>{formatGuestFavourite(guest)}</dd></div>
    </dl>
  )
}

function StatusChip({ status }) {
  const meta = getHostStatusMeta(status)
  return (
    <span className={`host-reservation-card-status-pill tone-${meta.tone} is-compact`}>
      {getHostListCompactStatusLabel(status)}
    </span>
  )
}

export function GuestPhoneInsight({
  phone = '',
  reservations = [],
  workspaceId = '',
  role = '',
  countryCode = '+357',
  profiles = [],
  lookupDelay = 400,
  onBlockedChange,
}) {
  const debouncedPhone = useDebounced(phone, lookupDelay)
  const directoryState = useGuestDirectory({
    workspaceId,
    reservations,
    countryCode,
    profiles,
    enabled: Boolean(debouncedPhone),
  })
  const guest = findGuestByPhone(directoryState.directory, debouncedPhone, countryCode)
  const confirm = blacklistConfirmState({ ...(guest || {}), role })
  const [notes, setNotes] = useState(guest?.notes || '')
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setNotes(guest?.notes || '')
  }, [guest?.phone, guest?.notes])

  useEffect(() => {
    onBlockedChange?.(confirm.blocked)
  }, [confirm.blocked, onBlockedChange])

  if (!guest || (guest.visits + guest.noShows + guest.cancellations === 0 && !guest.blacklisted && !guest.notes)) {
    return null
  }

  const saveNotes = async () => {
    setNotice('')
    try {
      if (directoryState.preview) {
        directoryState.remember({ ...guest, displayName: guest.guestName, notes, phone: guest.phone })
        setNotice('Notes saved.')
        return
      }
      const saved = await saveGuestProfile({
        workspaceId,
        phone: guest.phone,
        notes,
        displayName: guest.guestName,
      })
      directoryState.remember(saved)
      setNotice('Notes saved.')
    } catch (error) {
      setNotice(error?.message || 'Could not save the guest notes.')
    }
  }

  const noShowLabel = countLabel(guest.noShows, 'no-show', 'no-shows')
  return (
    <section className="guest-card" data-testid="guest-card" aria-label={t("Guest history")}>
      {confirm.warning ? <p className="guest-blacklist-warning" role="alert">{confirm.warning}</p> : null}
      {confirm.blocked ? <p>{t("Ask a manager before booking this guest.")}</p> : null}
      <button
        type="button"
        className="guest-card-summary"
        data-testid="guest-card-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <strong>{guest.guestName || guest.phone}</strong>
        <span>{countLabel(guest.visits, 'visit', 'visits')}</span>
        <span>{noShowLabel}</span>
        {guest.blacklisted ? <span className="guest-blacklist-badge">{t("Blacklisted")}</span> : null}
      </button>
      {expanded ? (
        <>
          <GuestStats guest={guest} />
          {guest.notes && !(canEditGuestNotes(role) && directoryState.available) ? (
            <p><span className="guest-notes-label">{t("Notes")}</span> {guest.notes}</p>
          ) : null}
          {canEditGuestNotes(role) && directoryState.available ? (
            <label className="guest-notes-field">
              <span className="guest-notes-label">{t("Notes")}</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
            </label>
          ) : null}
          <div className="guest-actions">
            {canEditGuestNotes(role) && directoryState.available ? (
              <button type="button" className="secondary-btn" onClick={saveNotes}>{t("Save notes")}</button>
            ) : null}
            {canBlacklistGuest(role) && directoryState.available && !guest.blacklisted ? (
              <button type="button" className="ghost-btn danger-text" onClick={() => setDialogOpen(true)}>{t("Blacklist")}</button>
            ) : null}
            {canBlacklistGuest(role) && directoryState.available && guest.blacklisted ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={async () => {
                  const saved = directoryState.preview
                    ? { ...guest, blacklisted: false, blacklistReason: '', displayName: guest.guestName }
                    : await setGuestBlacklist({ workspaceId, phone: guest.phone, displayName: guest.guestName, blacklisted: false, reason: '' })
                  directoryState.remember(saved)
                }}
              >
                {t("Remove blacklist")}
              </button>
            ) : null}
          </div>
          {notice ? <p role="status">{notice}</p> : null}
          {!directoryState.available ? <p>{t("Notes and blacklist turn on when guest profiles are saved.")}</p> : null}
        </>
      ) : null}
      {dialogOpen ? (
        <BlacklistDialog
          guestName={guest.guestName}
          reason={reason}
          onReason={setReason}
          onClose={() => setDialogOpen(false)}
          onSave={async () => {
            const saved = directoryState.preview
              ? { ...guest, phone: guest.phone, displayName: guest.guestName, blacklisted: true, blacklistReason: reason }
              : await setGuestBlacklist({
                workspaceId,
                phone: guest.phone,
                displayName: guest.guestName,
                blacklisted: true,
                reason,
              })
            directoryState.remember(saved)
            setDialogOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}

export function BlacklistDialog({ guestName, reason, onReason, onClose, onSave }) {
  const dialog = (
    <div className="guest-blacklist-dialog-backdrop" role="presentation">
      <div className="guest-blacklist-dialog" role="dialog" aria-modal="true" aria-labelledby="guest-blacklist-title" data-testid="guest-blacklist-dialog">
        <h3 id="guest-blacklist-title">Blacklist {guestName || 'guest'}</h3>
        <label>
          {t("Reason")}
          <textarea value={reason} onChange={(event) => onReason(event.target.value)} rows={3} />
        </label>
        <div className="guest-actions">
          <button type="button" className="primary-btn" onClick={onSave}>{t("Save blacklist")}</button>
          <button type="button" className="secondary-btn" onClick={onClose}>{t("Cancel")}</button>
        </div>
      </div>
    </div>
  )
  return createPortal(dialog, document.body)
}

export function GuestDirectory({
  workspaceId = '',
  reservations = [],
  profiles = [],
  role = '',
  countryCode = '+357',
  initialPhone = '',
  startWithBlacklist = false,
  onClose,
}) {
  const directoryState = useGuestDirectory({ workspaceId, reservations, profiles, countryCode })
  const [query, setQuery] = useState('')
  const [selectedPhone, setSelectedPhone] = useState(initialPhone)
  const [dialogOpen, setDialogOpen] = useState(startWithBlacklist)
  const [reason, setReason] = useState('')
  const results = searchGuests(directoryState.directory, query, countryCode)
  const selected = directoryState.directory.find((guest) => guest.phone === selectedPhone) || null

  const sheet = (
    <div className="guest-directory" role="dialog" aria-modal="true" aria-label={t("Guests")} data-testid="guest-directory">
      <div className="guest-directory-sheet">
        <header className="mobile-host-reservation-panel-header">
          <div className="guest-directory-heading">
            {selected ? (
              <button
                type="button"
                className="mobile-sheet-close-btn"
                aria-label={t("Back to guest list")}
                onClick={() => setSelectedPhone('')}
              >
                ‹
              </button>
            ) : null}
            <div className="mobile-host-reservation-panel-header-copy">
              <p className="mobile-screen-eyebrow">{t("Reservations")}</p>
              <h2 className="mobile-host-reservation-panel-title">{selected ? (selected.guestName || 'Guest') : 'Guests'}</h2>
            </div>
          </div>
          <button type="button" className="mobile-sheet-close-btn" aria-label={t("Close")} onClick={onClose}>✕</button>
        </header>
        <div className="guest-directory-body">
        {selected ? null : (
          <label className="guest-notes-field">
            <span className="guest-notes-label">{t("Search name or phone")}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Name or phone")} />
          </label>
        )}
        {selected ? (
          <article className="guest-history-detail">
            <p>{selected.phone}</p>
            {selected.blacklisted ? <span className="guest-blacklist-badge">{t("Blacklisted")}</span> : null}
            {selected.blacklistReason ? <p className="guest-blacklist-warning">{`Blacklisted guest — ${selected.blacklistReason}`}</p> : null}
            <GuestStats guest={selected} />
            {selected.notes ? (
              <p><span className="guest-notes-label">{t("Notes")}</span> {selected.notes}</p>
            ) : null}
            <h3>{t("Bookings")}</h3>
            <ul className="guest-booking-list">
              {selected.bookings.map((booking) => (
                <li key={booking.id} className="guest-booking-row">
                  <span className="guest-date">{formatGuestDate(booking.date)} · {booking.guests} guests · {booking.tableNumber || 'No table'}</span>
                  <StatusChip status={booking.status} />
                </li>
              ))}
            </ul>
            {canBlacklistGuest(role) && !selected.blacklisted ? (
              <button type="button" className="ghost-btn danger-text" onClick={() => setDialogOpen(true)}>{t("Blacklist")}</button>
            ) : null}
          </article>
        ) : (
          <div className="guest-directory-list">
            {results.map((guest) => (
              <button key={guest.phone} type="button" className="guest-directory-row" onClick={() => setSelectedPhone(guest.phone)}>
                <span>
                  <strong>{guest.guestName || guest.phone}</strong>
                  <br />
                  {guest.phone} · {countLabel(guest.visits, 'visit', 'visits')}
                </span>
                {guest.blacklisted ? <span className="guest-blacklist-badge">{t("Blacklisted")}</span> : null}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>
      {dialogOpen && selected ? (
        <BlacklistDialog
          guestName={selected.guestName}
          reason={reason}
          onReason={setReason}
          onClose={() => setDialogOpen(false)}
          onSave={() => {
            directoryState.remember({
              ...selected,
              displayName: selected.guestName,
              blacklisted: true,
              blacklistReason: reason || 'No reason given',
            })
            setDialogOpen(false)
          }}
        />
      ) : null}
    </div>
  )
  return createPortal(sheet, document.body)
}

export function GuestsButton({ onClick }) {
  return (
    <button type="button" className="ghost-btn guest-history-open" onClick={onClick} data-testid="guests-open">
      {t("Guests")}
    </button>
  )
}
